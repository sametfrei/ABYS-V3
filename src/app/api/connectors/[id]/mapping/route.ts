import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createHash } from "crypto";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { getAdapter } from "@/lib/connectors/registry";
import type { CanonicalEntity, ConnectorConfig } from "@/lib/connectors/types";
import type { MappingSuggestion } from "@/lib/connectors/contracts";
import {
  ConnectorMappingConflictError,
  approveConnectorMapping,
  getConnectorConfig,
  listConnectorConfigVersions,
  listSyncRuns,
} from "@/lib/db/repos/connectors";

const mappingSchema = z.record(
  z.string().trim().min(1).max(100),
  z.string().trim().min(1).max(300)
).refine((map) => Object.keys(map).length <= 200, {
  message: "Bir eşleme en fazla 200 alan içerebilir.",
});

const postSchema = z.object({
  expectedVersion: z.number().int().positive(),
  fieldMap: mappingSchema.refine((map) => Object.keys(map).length > 0, {
    message: "En az bir alan eşlemesi gerekli.",
  }),
  kpiFieldMap: mappingSchema.optional(),
  sourceRunId: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().min(3).max(500).optional(),
});

function stableMap(map: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(map)
      .sort()
      .map((key) => [key, map[key]])
  );
}

function suggestionsFromRun(
  suggestions: MappingSuggestion[],
  current: Record<string, string>
): MappingSuggestion[] {
  return suggestions.filter((suggestion) => current[suggestion.canonicalField] === suggestion.sourcePath);
}

/** GET — onaylı eşleme, son gözlenen şema ve sürüm geçmişi. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const { id } = await params;
  const config = await getConnectorConfig(session.orgId, id);
  if (!config) return NextResponse.json({ error: "Konnektör bulunamadı." }, { status: 404 });

  const [latestRuns, versions] = await Promise.all([
    listSyncRuns(session.orgId, id, 1),
    listConnectorConfigVersions(session.orgId, id, 25),
  ]);
  const latestRun = latestRuns[0] ?? null;
  const observedFields = latestRun?.sourceSchema.map((field) => field.path) ?? [];
  const suggestions = latestRun?.mappingSuggestions ?? [];
  const currentMap = config.config.fieldMap;
  const accepted = suggestionsFromRun(suggestions, currentMap);

  const byCanonical = new Map<string, MappingSuggestion[]>();
  for (const suggestion of suggestions) {
    const list = byCanonical.get(suggestion.canonicalField) ?? [];
    list.push(suggestion);
    byCanonical.set(suggestion.canonicalField, list);
  }
  const conflicts = [...byCanonical.entries()]
    .filter(([, list]) => new Set(list.map((item) => item.sourcePath)).size > 1)
    .map(([canonicalField, list]) => ({
      canonicalField,
      candidates: list.map((item) => ({ sourcePath: item.sourcePath, confidence: item.confidence })),
    }));

  const proposedFieldMap: Record<string, string> = { ...currentMap };
  const conflictFields = new Set(conflicts.map((conflict) => conflict.canonicalField));
  for (const suggestion of suggestions) {
    if (!(suggestion.canonicalField in proposedFieldMap) && !conflictFields.has(suggestion.canonicalField)) {
      proposedFieldMap[suggestion.canonicalField] = suggestion.sourcePath;
    }
  }

  return NextResponse.json({
    configId: config.id,
    name: config.name,
    entity: config.config.entity,
    currentVersion: config.configVersion,
    currentFieldMap: currentMap,
    currentKpiFieldMap: config.config.kpiFieldMap ?? {},
    latestRun: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          finishedAt: latestRun.finishedAt,
          sourceFieldCount: observedFields.length,
        }
      : null,
    observedFields,
    suggestions,
    acceptedSuggestionCount: accepted.length,
    suggestedSuggestionCount: suggestions.length,
    conflicts,
    proposedFieldMap,
    unmappedObservedFields: observedFields.filter((path) => !Object.values(currentMap).includes(path)),
    versions: versions.map((version) => ({
      id: version.id,
      version: version.version,
      changeSummary: version.changeSummary,
      sourceRunId: version.sourceRunId,
      approvedSuggestionCount: version.approvedSuggestions.length,
      createdBy: version.createdBy,
      createdAt: version.createdAt,
    })),
  });
}

/** POST — insan onayıyla yeni, değiştirilemez bir eşleme sürümü oluşturur. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema, { maxBytes: 256_000 });
  if (!parsed.ok) return parsed.response;
  const { id } = await params;
  const config = await getConnectorConfig(session.orgId, id);
  if (!config) return NextResponse.json({ error: "Konnektör bulunamadı." }, { status: 404 });
  if (config.configVersion !== parsed.data.expectedVersion) {
    return NextResponse.json(
      {
        error: "Konnektör konfigürasyonu bu sırada değişti. Güncel eşlemeyi yeniden yükleyin.",
        code: "CONNECTOR_MAPPING_CONFLICT",
        currentVersion: config.configVersion,
      },
      { status: 409 }
    );
  }

  const adapter = getAdapter(config.connectorId);
  if (!adapter) return NextResponse.json({ error: "Adaptör bulunamadı." }, { status: 400 });

  const runs = parsed.data.sourceRunId ? await listSyncRuns(session.orgId, id, 50) : [];
  const sourceRun = parsed.data.sourceRunId
    ? runs.find((run) => run.id === parsed.data.sourceRunId)
    : null;
  if (parsed.data.sourceRunId && !sourceRun) {
    return NextResponse.json(
      { error: "Kaynak çalıştırma bu konnektöre ait değil." },
      { status: 400 }
    );
  }

  const nextConfig: ConnectorConfig = {
    ...config.config,
    fieldMap: parsed.data.fieldMap,
    ...(parsed.data.kpiFieldMap === undefined ? {} : { kpiFieldMap: parsed.data.kpiFieldMap }),
  };
  if (
    stableMap(nextConfig.fieldMap) === stableMap(config.config.fieldMap) &&
    stableMap(nextConfig.kpiFieldMap ?? {}) === stableMap(config.config.kpiFieldMap ?? {})
  ) {
    return NextResponse.json({ error: "Eşleme değişmedi." }, { status: 400 });
  }

  const errors = adapter.validate(nextConfig);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: `Geçersiz eşleme: ${errors.join("; ")}` },
      { status: 400 }
    );
  }

  const approvedSuggestions = suggestionsFromRun(
    sourceRun?.mappingSuggestions ?? [],
    nextConfig.fieldMap
  );
  const mappingHash = createHash("sha256")
    .update(stableMap(nextConfig.fieldMap))
    .update("\0")
    .update(stableMap(nextConfig.kpiFieldMap ?? {}))
    .digest("hex");
  try {
    const updated = await approveConnectorMapping({
      orgId: session.orgId,
      configId: id,
      expectedVersion: parsed.data.expectedVersion,
      config: nextConfig,
      changeSummary:
        parsed.data.note ??
        `Alan eşlemesi onaylandı: ${Object.keys(nextConfig.fieldMap).length} alan, ${approvedSuggestions.length} şema önerisi.`,
      sourceRunId: sourceRun?.id ?? null,
      approvedSuggestions,
      actor: session.userId,
      audit: {
        type: "connector_mapping_approved",
        summary: `Konnektör eşlemesi v${parsed.data.expectedVersion + 1} onaylandı: ${config.name}`,
        detail: JSON.stringify({
          configId: id,
          sourceRunId: sourceRun?.id ?? null,
          fields: Object.keys(nextConfig.fieldMap).length,
          entity: nextConfig.entity as CanonicalEntity,
          mappingHash,
          approvedBy: session.displayName,
          actorRef: session.userId,
        }),
      },
    });
    if (!updated) return NextResponse.json({ error: "Konnektör bulunamadı." }, { status: 404 });

    return NextResponse.json({
      configVersion: updated.configVersion,
      fieldMap: updated.config.fieldMap,
      kpiFieldMap: updated.config.kpiFieldMap ?? {},
      approvedSuggestionCount: approvedSuggestions.length,
    });
  } catch (err) {
    if (err instanceof ConnectorMappingConflictError) {
      return NextResponse.json(
        { error: err.message, code: err.code, currentVersion: err.currentVersion },
        { status: 409 }
      );
    }
    throw err;
  }
}
