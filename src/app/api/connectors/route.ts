import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import { getAdapter, getDefinition, listDefinitions } from "@/lib/connectors/registry";
import { createConnectorConfig, listConnectorConfigs } from "@/lib/db/repos/connectors";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError, localizedErrorWith } from "@/lib/api-i18n";

const restConfigSchema = z.object({
  kind: z.literal("rest"),
  baseUrl: z.string().trim().min(1).max(2000),
  path: z.string().trim().min(1).max(2000),
  method: z.literal("GET").optional(),
  headers: z.record(z.string().max(300), z.string().max(2000)).optional(),
  secretEnvVar: z.string().trim().max(200).optional(),
  authType: z.enum(["none", "api_key", "bearer_token", "basic", "oauth2_client_credentials"]),
  oauth2TokenUrl: z.string().trim().url().max(2000).optional(),
  oauth2ClientIdEnvVar: z.string().trim().max(200).optional(),
  oauth2Scope: z.string().trim().max(1000).optional(),
  oauth2Audience: z.string().trim().max(1000).optional(),
  oauth2Resource: z.string().trim().max(1000).optional(),
  apiKeyHeader: z.string().trim().max(200).optional(),
  entity: z.enum([
    "customer",
    "supplier",
    "employee",
    "product",
    "order",
    "invoice",
    "payment",
    "account",
    "project",
    "inventory",
    "event",
  ]),
  recordsPath: z.string().trim().max(300).optional(),
  idField: z.string().trim().min(1).max(300),
  updatedAtField: z.string().trim().max(300).optional(),
  fieldMap: z.record(z.string().max(100), z.string().max(300)),
  kpiFieldMap: z.record(z.string().max(100), z.string().trim().min(1).max(100)).optional(),
  computedKpiMap: z.record(z.string().max(120), z.string().trim().min(1).max(100)).optional(),
  kpiObservedAtField: z.string().trim().max(100).optional(),
  eventTypeField: z.string().trim().max(100).optional(),
  eventSubjectField: z.string().trim().max(100).optional(),
  eventTimeField: z.string().trim().max(100).optional(),
  pagination: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.literal("page"),
      pageParam: z.string().trim().min(1).max(100),
      limitParam: z.string().trim().max(100).optional(),
      pageSize: z.number().int().positive().max(10_000),
      startPage: z.number().int().positive().optional(),
    }),
    z.object({
      type: z.literal("cursor"),
      cursorParam: z.string().trim().min(1).max(100),
      cursorPath: z.string().trim().min(1).max(300),
    }),
  ]),
  updatedSinceParam: z.string().trim().max(100).optional(),
  maxPages: z.number().int().positive().max(100).optional(),
  pageSize: z.number().int().positive().max(10_000).optional(),
});

const postSchema = z.object({
  connectorId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  config: restConfigSchema,
  scheduleIntervalMinutes: z.number().int().min(5).max(525_600).nullable().optional(),
});

/** GET — kayıt defteri tanımları + org'un kayıtlı konfigürasyonları. */
export async function GET(req?: NextRequest) {
  const localeRequest = req ?? new Request("http://localhost/api/connectors");
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(localeRequest, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const configs = await listConnectorConfigs(session.orgId);
  return NextResponse.json({
    definitions: listDefinitions(),
    configs: configs.map((c) => ({
      id: c.id,
      connectorId: c.connectorId,
      name: c.name,
      configVersion: c.configVersion,
      enabled: c.enabled,
      scheduleIntervalMinutes: c.scheduleIntervalMinutes,
      nextRunAt: c.nextRunAt,
      lastScheduledAt: c.lastScheduledAt,
      createdAt: c.createdAt,
      config: c.config,
    })),
  });
}

/** POST — yeni konnektör konfigürasyonu (sır değeri değil, ortam değişkeni adı). */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;

  const definition = getDefinition(parsed.data.connectorId);
  if (!definition) return localizedError(req, "api.connectors.unknown", 400);
  if (definition.status === "planned") {
    return localizedErrorWith(req, "api.connectors.notImplemented", 400, {
      adapter: definition.label,
    });
  }
  const adapter = getAdapter(definition.id);
  if (!adapter) return localizedError(req, "api.connectors.adapterNotFound", 400);

  const errors = adapter.validate(parsed.data.config);
  if (errors.length > 0) {
    return localizedErrorWith(req, "api.connectors.invalidConfig", 400, {
      details: errors.join("; "),
    });
  }

  const id = await createConnectorConfig({
    orgId: session.orgId,
    connectorId: definition.id,
    name: parsed.data.name,
    config: parsed.data.config,
    createdBy: session.displayName,
    scheduleIntervalMinutes: parsed.data.scheduleIntervalMinutes,
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "connector_config_created",
    summary: `Konnektör tanımlandı: ${definition.label} / ${parsed.data.name}`,
    detail: id,
  });

  return NextResponse.json({ id });
}
