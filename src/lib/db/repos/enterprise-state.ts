import { getDb, migrate } from "../client";
import type { CanonicalEntity, CanonicalRecord } from "@/lib/connectors/types";
import {
  selectGoldenRecord,
  type GoldenRecordSource,
} from "@/lib/canonical-survivorship";
import { getSemanticGraph } from "./semantic-graph";
import { getConnectorHealthSnapshot } from "@/lib/connectors/health";
import { evaluateAgainstThresholds } from "./kpi-registry";

const DEFAULT_RECORD_LIMIT = 5_000;
const STALE_DATA_MS = 24 * 60 * 60 * 1000;

export interface CurrencyState {
  currency: string;
  orderValue: number;
  invoiceValue: number;
  paymentValue: number;
  accountBalance: number;
  projectBudget: number;
}

export interface EnterpriseState {
  orgId: string;
  asOf: string;
  entityCounts: Array<{ entity: CanonicalEntity; count: number }>;
  financials: {
    byCurrency: CurrencyState[];
    unclassifiedValueCount: number;
    policy: string;
  };
  operations: {
    inventoryQuantity: number;
    projectCount: number;
    orderCount: number;
    invoiceCount: number;
    paymentCount: number;
    eventCount: number;
  };
  kpis: Array<{
    label: string;
    value: number | null;
    observedAt: string;
    thresholdStatus: string;
    target: number | null;
    unit: string | null;
  }>;
  dependencies: Array<{ relation: string; count: number; from: string | null; to: string | null }>;
  risks: Array<{ code: string; severity: "critical" | "warning" | "info"; title: string; evidence: string }>;
  freshness: {
    lastSyncedAt: string | null;
    ageMinutes: number | null;
    stale: boolean;
    thresholdHours: number;
  };
  coverage: {
    mode: "current" | "historical";
    asOf: string;
    recordsRead: number;
    canonicalEntities: number;
    multiSourceEntities: number;
    sourceCount: number;
    truncated: boolean;
    graphNodeCount: number;
    graphEdgeCount: number;
    unresolvedReferenceCount: number;
  };
  provenance: {
    source: string;
    note: string;
  };
}

interface StateRecordRow {
  entity: CanonicalEntity;
  canonical_entity_id: string;
  source_config_id: string;
  source_external_id: string;
  source_updated_at: string | Date | null;
  synced_at: string | Date;
  data: { fields?: CanonicalRecord["fields"] };
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function numberValue(value: CanonicalRecord["fields"][string]): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function currencyValue(value: CanonicalRecord["fields"][string]): string | null {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function currencyState(map: Map<string, CurrencyState>, currency: string): CurrencyState {
  const current = map.get(currency);
  if (current) return current;
  const created: CurrencyState = {
    currency,
    orderValue: 0,
    invoiceValue: 0,
    paymentValue: 0,
    accountBalance: 0,
    projectBudget: 0,
  };
  map.set(currency, created);
  return created;
}

/** Gerçek kanonik kayıtlardan org-kapsamlı mevcut işletme durumunu üretir. */
export async function getEnterpriseState(
  orgId: string,
  options: { now?: Date; asOf?: Date; recordLimit?: number } = {}
): Promise<EnterpriseState> {
  await migrate();
  const now = options.now ?? new Date();
  const projectionTime = options.asOf ?? now;
  const historical = options.asOf !== undefined;
  const limit = Math.max(1, Math.min(20_000, Math.trunc(options.recordLimit ?? DEFAULT_RECORD_LIMIT)));
  const recordsQuery = historical
    ? getDb().query<StateRecordRow>(
        `SELECT entity, canonical_entity_id, source_config_id, source_external_id,
                source_updated_at, synced_at, data
           FROM (
             SELECT h.entity, h.canonical_entity_id, h.config_id AS source_config_id,
                    h.external_id AS source_external_id, h.source_updated_at,
                    h.captured_at AS synced_at, h.data,
                    row_number() OVER (
                      PARTITION BY h.config_id, h.entity, h.external_id
                      ORDER BY h.captured_at DESC, h.id DESC
                    ) AS rn
               FROM connector_record_history h
              WHERE h.org_id = $1 AND h.captured_at <= $2
           ) ranked
          WHERE rn = 1
          ORDER BY synced_at DESC
          LIMIT $3`,
        [orgId, projectionTime.toISOString(), limit + 1]
      )
    : getDb().query<StateRecordRow>(
        `SELECT l.entity, l.canonical_entity_id, l.source_config_id, l.source_external_id,
                r.source_updated_at, r.synced_at, r.data
           FROM canonical_entity_links l
           JOIN connector_records r
             ON r.org_id = l.org_id
            AND r.config_id = l.source_config_id
            AND r.entity = l.entity
            AND r.external_id = l.source_external_id
          WHERE l.org_id = $1
          ORDER BY r.synced_at DESC
          LIMIT $2`,
        [orgId, limit + 1]
      );
  const [recordsResult, latestKpis, pendingIdentity, graph, health] = await Promise.all([
    recordsQuery,
    getDb().query<{ label: string; value: string; created_at: string | Date }>(
      `SELECT DISTINCT ON (label) label, value, created_at
         FROM kpi_values
        WHERE org_id = $1 AND ($2::timestamptz IS NULL OR created_at <= $2)
        ORDER BY label, created_at DESC`,
      [orgId, historical ? projectionTime.toISOString() : null]
    ),
    getDb().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM data_quality_issues
        WHERE org_id = $1 AND code = 'IDENTITY_LINK_CONFLICT' AND status = 'pending'`,
      [orgId]
    ),
    historical ? Promise.resolve(null) : getSemanticGraph(orgId, 5_000),
    historical ? Promise.resolve(null) : getConnectorHealthSnapshot(orgId, now),
  ]);

  const rows = recordsResult.rows.slice(0, limit);
  const grouped = new Map<string, { entity: CanonicalEntity; canonicalId: string; sources: GoldenRecordSource[] }>();
  for (const row of rows) {
    const key = `${row.entity}\u001f${row.canonical_entity_id}`;
    const group = grouped.get(key) ?? {
      entity: row.entity,
      canonicalId: row.canonical_entity_id,
      sources: [],
    };
    group.sources.push({
      sourceConfigId: row.source_config_id,
      sourceExternalId: row.source_external_id,
      sourceUpdatedAt: iso(row.source_updated_at),
      syncedAt: iso(row.synced_at) ?? "",
      priority: null,
      fields: row.data?.fields ?? {},
    });
    grouped.set(key, group);
  }

  const entityCounts = new Map<CanonicalEntity, number>();
  const financialByCurrency = new Map<string, CurrencyState>();
  let unclassifiedValueCount = 0;
  let inventoryQuantity = 0;
  let projectCount = 0;
  let orderCount = 0;
  let invoiceCount = 0;
  let paymentCount = 0;
  let eventCount = 0;
  let multiSourceEntities = 0;
  const sourceIds = new Set<string>();

  for (const group of grouped.values()) {
    const selected = selectGoldenRecord(group.entity, group.sources);
    if (!selected) continue;
    entityCounts.set(group.entity, (entityCounts.get(group.entity) ?? 0) + 1);
    const configIds = new Set(group.sources.map((source) => source.sourceConfigId));
    for (const id of configIds) sourceIds.add(id);
    if (configIds.size > 1) multiSourceEntities += 1;

    const currency = currencyValue(selected.fields.currency);
    if (group.entity === "order") {
      orderCount += 1;
      const amount = numberValue(selected.fields.total_amount);
      if (amount !== null) {
        if (currency) currencyState(financialByCurrency, currency).orderValue += amount;
        else unclassifiedValueCount += 1;
      }
    } else if (group.entity === "invoice") {
      invoiceCount += 1;
      const amount = numberValue(selected.fields.amount);
      if (amount !== null) {
        if (currency) currencyState(financialByCurrency, currency).invoiceValue += amount;
        else unclassifiedValueCount += 1;
      }
    } else if (group.entity === "payment") {
      paymentCount += 1;
      const amount = numberValue(selected.fields.amount);
      if (amount !== null) {
        if (currency) currencyState(financialByCurrency, currency).paymentValue += amount;
        else unclassifiedValueCount += 1;
      }
    } else if (group.entity === "account") {
      const balance = numberValue(selected.fields.balance);
      if (balance !== null) {
        if (currency) currencyState(financialByCurrency, currency).accountBalance += balance;
        else unclassifiedValueCount += 1;
      }
    } else if (group.entity === "project") {
      projectCount += 1;
      const budget = numberValue(selected.fields.budget);
      if (budget !== null) {
        if (currency) currencyState(financialByCurrency, currency).projectBudget += budget;
        else unclassifiedValueCount += 1;
      }
    } else if (group.entity === "inventory") {
      const quantity = numberValue(selected.fields.quantity);
      if (quantity !== null) inventoryQuantity += quantity;
    } else if (group.entity === "event") {
      eventCount += 1;
    }
  }

  const kpis = await Promise.all(
    latestKpis.rows.map(async (row) => {
      const parsed = Number(row.value);
      const value = Number.isFinite(parsed) ? parsed : null;
      const threshold =
        value === null
          ? { status: "unknown", definition: null }
          : await evaluateAgainstThresholds(orgId, row.label, value);
      return {
        label: row.label,
        value,
        observedAt: iso(row.created_at) ?? "",
        thresholdStatus: threshold.status,
        target: threshold.definition?.target ?? null,
        unit: threshold.definition?.unit ?? null,
      };
    })
  );

  const dependencyCounts = new Map<string, { count: number; from: Set<string>; to: Set<string> }>();
  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  for (const edge of graph?.edges ?? []) {
    const current = dependencyCounts.get(edge.relation) ?? { count: 0, from: new Set(), to: new Set() };
    current.count += 1;
    current.from.add(nodeById.get(edge.from)?.entity ?? "unknown");
    current.to.add(nodeById.get(edge.to)?.entity ?? "unknown");
    dependencyCounts.set(edge.relation, current);
  }
  const dependencies = [...dependencyCounts.entries()]
    .map(([relation, value]) => ({
      relation,
      count: value.count,
      from: value.from.size === 1 ? [...value.from][0] : null,
      to: value.to.size === 1 ? [...value.to][0] : null,
    }))
    .sort((a, b) => b.count - a.count || a.relation.localeCompare(b.relation));

  const lastSyncedAt =
    rows
      .map((row) => iso(row.synced_at))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const ageMinutes = lastSyncedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(lastSyncedAt).getTime()) / 60_000))
    : null;
  const stale = ageMinutes !== null && ageMinutes * 60_000 > STALE_DATA_MS;

  const risks: EnterpriseState["risks"] = [];
  if (stale) {
    risks.push({
      code: "DATA_FRESHNESS",
      severity: "warning",
      title: "Kurumsal durum verisi eski",
      evidence: `Son senkron ${ageMinutes} dakika önce; eşik ${STALE_DATA_MS / 3_600_000} saat.`,
    });
  }
  if (health && health.summary.failingCount > 0) {
    risks.push({
      code: "CONNECTOR_FAILURE",
      severity: "critical",
      title: "Ardışık başarısız konnektör çalıştırmaları",
      evidence: `${health.summary.failingCount} konnektör art arda hata veriyor.`,
    });
  }
  if (health && health.summary.staleRunningCount > 0) {
    risks.push({
      code: "CONNECTOR_STALE_RUN",
      severity: "critical",
      title: "Takılı kalmış senkron çalıştırması",
      evidence: `${health.summary.staleRunningCount} çalıştırma ${health.staleAfterMinutes} dakikadan uzun süredir açık.`,
    });
  }
  if (health && health.summary.overdueCount > 0) {
    risks.push({
      code: "CONNECTOR_OVERDUE",
      severity: "warning",
      title: "Gecikmiş zamanlanmış senkron",
      evidence: `${health.summary.overdueCount} konnektör planlanan pencereden sonra çalışmadı.`,
    });
  }
  if (graph && graph.coverage.unresolvedNodeCount > 0) {
    risks.push({
      code: "UNRESOLVED_REFERENCE",
      severity: "warning",
      title: "Çözülemeyen iş nesnesi referansları",
      evidence: `${graph.coverage.unresolvedNodeCount} referans hedefi kaynakta bulunamadı.`,
    });
  }
  if (Number(pendingIdentity.rows[0]?.count ?? 0) > 0) {
    risks.push({
      code: "IDENTITY_CONFLICT",
      severity: "warning",
      title: "Onay bekleyen kimlik çakışmaları",
      evidence: `${Number(pendingIdentity.rows[0].count)} kanonik kimlik çakışması inceleme bekliyor.`,
    });
  }
  for (const kpi of kpis.filter((item) => item.thresholdStatus === "critical")) {
    risks.push({
      code: "KPI_CRITICAL",
      severity: "critical",
      title: `${kpi.label} kritik eşikte`,
      evidence: `Son değer ${kpi.value}; hedef ${kpi.target ?? "tanımsız"}.`,
    });
  }
  if (rows.length === 0) {
    risks.push({
      code: historical ? "NO_HISTORICAL_DATA" : "NO_BUSINESS_DATA",
      severity: "info",
      title: historical ? "Bu zaman noktasında kayıtlı kurumsal durum yok" : "Kanıtlanmış kurumsal durum verisi yok",
      evidence: historical
        ? "Seçilen zamandan önce yakalanmış kaynak kayıt geçmişi bulunmuyor."
        : "Bağlı kaynaklardan kanonik varlık kaydı gelmedi.",
    });
  }

  return {
    orgId,
    asOf: projectionTime.toISOString(),
    entityCounts: [...entityCounts.entries()]
      .map(([entity, count]) => ({ entity, count }))
      .sort((a, b) => b.count - a.count || a.entity.localeCompare(b.entity)),
    financials: {
      byCurrency: [...financialByCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
      unclassifiedValueCount,
      policy: "Para birimleri asla birleştirilmez; para birimi olmayan tutarlar yalnızca sayılır.",
    },
    operations: {
      inventoryQuantity,
      projectCount,
      orderCount,
      invoiceCount,
      paymentCount,
      eventCount,
    },
    kpis,
    dependencies,
    risks,
    freshness: {
      lastSyncedAt,
      ageMinutes,
      stale,
      thresholdHours: STALE_DATA_MS / 3_600_000,
    },
    coverage: {
      mode: historical ? "historical" : "current",
      asOf: projectionTime.toISOString(),
      recordsRead: rows.length,
      canonicalEntities: grouped.size,
      multiSourceEntities,
      sourceCount: sourceIds.size,
      truncated: recordsResult.rows.length > limit,
      graphNodeCount: graph?.coverage.nodeCount ?? 0,
      graphEdgeCount: graph?.coverage.edgeCount ?? 0,
      unresolvedReferenceCount: graph?.coverage.unresolvedNodeCount ?? 0,
    },
    provenance: {
      source: historical
        ? "connector_record_history + kpi_values"
        : "canonical_entity_links + connector_records + semantic graph + kpi_values + scheduler health",
      note: historical
        ? "As-of görünümü yalnızca seçilen zamandan önce yakalanmış kaynak geçmişinden üretilir; güncel kimlik veya konnektör sağlığı geriye yazılmaz."
        : "Mevcut durum projeksiyonu; geçmiş için asOf parametresi kullanılır. Senaryo sonrası durum karşılaştırması henüz ayrı katmandır.",
    },
  };
}
