import { createHash } from "node:crypto";
import { getDb, migrate } from "../client";
import type { CanonicalEntity, CanonicalRecord } from "@/lib/connectors/types";

/**
 * Kanonik konnektör kayıtlarından türetilen ilk semantik grafik projeksiyonu.
 * Kalıcı düğüm tablosu bilinçli olarak yok: kaynak gerçeği connector_records,
 * ilişkiler ise kayıt alanlarındaki açık referanslardır. Böylece grafik,
 * kaynak veriyle çelişen ikinci bir kopya üretmez.
 */

export interface SemanticNode {
  id: string;
  entity: CanonicalEntity;
  ref: string;
  label: string;
  resolved: boolean;
  sourceConfigIds: string[];
}

export interface SemanticEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  sourceConfigId: string;
  sourceRef: string;
}

export interface SemanticGraph {
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  coverage: {
    recordsRead: number;
    nodeCount: number;
    edgeCount: number;
    unresolvedNodeCount: number;
    truncated: boolean;
    linkedRecordCount: number;
    multiSourceNodeCount: number;
  };
  resolution: {
    linkStrategy: string;
    strongLinkRecords: number;
    sourceScopedRecords: number;
  };
  entities: Array<{ entity: string; count: number }>;
  provenance: {
    source: string;
    note: string;
  };
}

interface RecordRow {
  entity: CanonicalEntity;
  external_id: string;
  config_id: string;
  canonical_entity_id: string | null;
  match_strategy: string | null;
  data: { fields?: CanonicalRecord["fields"]; [key: string]: unknown };
}

const REFERENCE_FIELDS: Record<string, CanonicalEntity> = {
  customerId: "customer",
  customer_id: "customer",
  supplierId: "supplier",
  supplier_id: "supplier",
  employeeId: "employee",
  employee_id: "employee",
  productId: "product",
  product_id: "product",
  orderId: "order",
  order_id: "order",
  invoiceId: "invoice",
  invoice_id: "invoice",
  paymentId: "payment",
  payment_id: "payment",
  accountId: "account",
  account_id: "account",
  projectId: "project",
  project_id: "project",
  inventoryId: "inventory",
  inventory_id: "inventory",
};

const LABEL_FIELDS = [
  "name",
  "displayName",
  "display_name",
  "title",
  "subject",
  "code",
  "sku",
  "email",
];

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function nodeId(entity: CanonicalEntity, ref: string): string {
  return stableId("semantic-node", entity, ref);
}

function labelFor(entity: CanonicalEntity, ref: string, fields: CanonicalRecord["fields"]): string {
  for (const key of LABEL_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return `${entity}:${ref}`;
}

export async function getSemanticGraph(orgId: string, maxRecords = 2_000): Promise<SemanticGraph> {
  await migrate();
  const effectiveLimit = Math.max(1, Math.min(10_000, maxRecords));
  const r = await getDb().query<RecordRow>(
    `SELECT r.entity, r.external_id, r.config_id, r.data,
            l.canonical_entity_id, l.match_strategy
       FROM connector_records r
       LEFT JOIN canonical_entity_links l
         ON l.org_id = r.org_id
        AND l.source_config_id = r.config_id
        AND l.entity = r.entity
        AND l.source_external_id = r.external_id
      WHERE r.org_id = $1
      ORDER BY r.synced_at DESC
      LIMIT $2`,
    [orgId, effectiveLimit + 1]
  );
  const rows = r.rows.slice(0, effectiveLimit);

  const nodes = new Map<string, SemanticNode>();
  const edges = new Map<string, SemanticEdge>();
  const entityCounts = new Map<string, number>();
  const linkedIds = new Map<string, string>();
  for (const row of rows) {
    if (row.canonical_entity_id) {
      linkedIds.set(sourceKey(row.config_id, row.entity, row.external_id), row.canonical_entity_id);
    }
  }
  const globalReferenceTargets = new Map<string, Set<string>>();
  const linkRows = await getDb().query<{
    entity: CanonicalEntity;
    source_external_id: string;
    canonical_entity_id: string;
  }>(
    `SELECT entity, source_external_id, canonical_entity_id
       FROM canonical_entity_links WHERE org_id = $1`,
    [orgId]
  );
  for (const link of linkRows.rows) {
    const key = referenceKey(link.entity, link.source_external_id);
    const ids = globalReferenceTargets.get(key) ?? new Set<string>();
    ids.add(link.canonical_entity_id);
    globalReferenceTargets.set(key, ids);
  }

  function resolveReference(
    configId: string,
    entity: CanonicalEntity,
    externalId: string
  ): string {
    const sameSource = linkedIds.get(sourceKey(configId, entity, externalId));
    if (sameSource) return sameSource;
    const candidates = globalReferenceTargets.get(referenceKey(entity, externalId));
    // Aynı dış kimlik birden fazla kaynakta farklı kanonik varlıklara çıkıyorsa
    // tahmin yürütmeyiz; kenar unresolved hedef düğümde kalır.
    if (candidates?.size === 1) return [...candidates][0];
    return stableId("semantic-node", entity, externalId);
  }

  function ensureNode(
    id: string,
    entity: CanonicalEntity,
    ref: string,
    label: string,
    configId: string
  ): string {
    const existing = nodes.get(id);
    if (existing) {
      if (!existing.sourceConfigIds.includes(configId) && existing.sourceConfigIds.length < 10) {
        existing.sourceConfigIds.push(configId);
      }
      if (!existing.resolved) {
        existing.resolved = true;
        existing.label = label;
        existing.entity = entity;
        existing.ref = ref;
      }
      return id;
    }
    nodes.set(id, {
      id,
      entity,
      ref,
      label,
      resolved: true,
      sourceConfigIds: [configId],
    });
    return id;
  }

  for (const row of rows) {
    const fields = row.data?.fields ?? {};
    const sourceNode = ensureNode(
      row.canonical_entity_id ?? nodeId(row.entity, row.external_id),
      row.entity,
      row.external_id,
      labelFor(row.entity, row.external_id, fields),
      row.config_id
    );
    entityCounts.set(row.entity, (entityCounts.get(row.entity) ?? 0) + 1);

    for (const [field, raw] of Object.entries(fields)) {
      const targetEntity = REFERENCE_FIELDS[field];
      if (!targetEntity || raw === null || raw === undefined || raw === "") continue;
      if (typeof raw !== "string" && typeof raw !== "number") continue;
      const targetRef = String(raw);
      if (!targetRef || targetRef === row.external_id) continue;
      const targetId = resolveReference(row.config_id, targetEntity, targetRef);
      if (!nodes.has(targetId)) {
        nodes.set(targetId, {
          id: targetId,
          entity: targetEntity,
          ref: targetRef,
          label: `${targetEntity}:${targetRef}`,
          resolved: false,
          sourceConfigIds: [],
        });
      }
      const relation = field.replace(/_?id$/i, "").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
      const id = stableId("semantic-edge", row.config_id, sourceNode, targetId, relation, row.external_id);
      edges.set(id, {
        id,
        from: sourceNode,
        to: targetId,
        relation: relation || "references",
        sourceConfigId: row.config_id,
        sourceRef: `${row.entity}:${row.external_id}`,
      });
    }
  }

  const unresolvedNodeCount = [...nodes.values()].filter((node) => !node.resolved).length;
  const strongLinkRecords = rows.filter(
    (row) => row.match_strategy === "email" || row.match_strategy === "sku"
  ).length;
  const sourceScopedRecords = rows.filter(
    (row) => row.match_strategy === "source-identity"
  ).length;
  return {
    nodes: [...nodes.values()].sort((a, b) => a.entity.localeCompare(b.entity) || a.ref.localeCompare(b.ref)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    coverage: {
      recordsRead: rows.length,
      nodeCount: nodes.size,
      edgeCount: edges.size,
      unresolvedNodeCount,
      truncated: r.rows.length > effectiveLimit,
      linkedRecordCount: rows.filter((row) => row.canonical_entity_id !== null).length,
      multiSourceNodeCount: [...nodes.values()].filter((node) => node.sourceConfigIds.length > 1).length,
    },
    entities: [...entityCounts.entries()]
      .map(([entity, count]) => ({ entity, count }))
      .sort((a, b) => b.count - a.count || a.entity.localeCompare(b.entity)),
    resolution: {
      linkStrategy: "e-posta/SKU güçlü kimlik; diğerleri kaynak-kapsamlı",
      strongLinkRecords,
      sourceScopedRecords,
    },
    provenance: {
      source: "connector_records.data.fields + canonical_entity_links",
      note:
        "İlişkiler açık kanonik referans alanlarından türetilir. Güçlü kaynaklar-arası kimlikler tek düğümde birleşir; çözülemeyen hedefler unresolved kalır.",
    },
  };
}

function sourceKey(configId: string, entity: string, externalId: string): string {
  return `${configId}\u001f${entity}\u001f${externalId}`;
}

function referenceKey(entity: string, externalId: string): string {
  return `${entity}\u001f${externalId}`;
}
