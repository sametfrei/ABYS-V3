import { createHash, randomUUID } from "node:crypto";
import { migrate, getDb } from "../client";
import { hasPermission } from "@/lib/auth/permissions";
import { recordAuditEventInTransaction } from "./audit";

export interface ExternalContextInput {
  source: {
    provider: string;
    category: string;
    name: string;
    sourceUri: string;
    licenseId: string;
    licenseUrl?: string | null;
    termsUrl?: string | null;
    attributionText: string;
    accessMode: "api" | "manual" | "connector";
  };
  observation: {
    externalId: string;
    topic: string;
    geography: string;
    summary: string;
    publishedAt: string;
    observedAt: string;
    validFrom?: string | null;
    validTo?: string | null;
    relevanceScore: number;
    confidence: number;
    sourceUri?: string;
    payload?: Record<string, unknown>;
  };
}

export interface ExternalContextObservation {
  id: string;
  provider: string;
  category: string;
  sourceName: string;
  sourceUri: string;
  licenseId: string;
  licenseUrl: string | null;
  termsUrl: string | null;
  attributionText: string;
  externalId: string;
  topic: string;
  geography: string;
  summary: string;
  publishedAt: string;
  observedAt: string;
  retrievedAt: string;
  validFrom: string | null;
  validTo: string | null;
  relevanceScore: number;
  confidence: number;
  sourceObservationUri: string;
  reviewStatus: "candidate" | "accepted" | "rejected";
  reviewNote: string | null;
}

function validHttpsUrl(value: string | null | undefined, field: string, required = false): string | null {
  if (!value && !required) return null;
  if (!value) throw new Error(`${field} is required.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${field} must be a valid HTTPS URL.`); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${field} must be HTTPS and must not contain credentials.`);
  }
  return url.toString();
}

function requiredText(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`${field} is required and must be at most ${max} characters.`);
  return normalized;
}

function isoDate(value: string, field: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${field} must be a valid timestamp.`);
  return parsed.toISOString();
}

export async function ingestExternalContext(params: {
  orgId: string;
  actorId: string;
  actorName: string;
  role: string;
  input: ExternalContextInput;
}): Promise<{ id: string; duplicate: boolean }> {
  await migrate();
  if (!hasPermission(params.role, "ingest_data")) throw new Error("Role is not permitted to ingest external context.");
  const source = params.input.source;
  const observation = params.input.observation;
  const provider = requiredText(source.provider, "provider", 120);
  const category = requiredText(source.category, "category", 80);
  const sourceName = requiredText(source.name, "source name", 160);
  const sourceUri = validHttpsUrl(source.sourceUri, "sourceUri", true)!;
  const licenseId = requiredText(source.licenseId, "licenseId", 120);
  const licenseUrl = validHttpsUrl(source.licenseUrl, "licenseUrl");
  const termsUrl = validHttpsUrl(source.termsUrl, "termsUrl");
  const attributionText = requiredText(source.attributionText, "attributionText", 1000);
  const externalId = requiredText(observation.externalId, "externalId", 240);
  const topic = requiredText(observation.topic, "topic", 160);
  const geography = requiredText(observation.geography, "geography", 160);
  const summary = requiredText(observation.summary, "summary", 4000);
  const publishedAt = isoDate(observation.publishedAt, "publishedAt");
  const observedAt = isoDate(observation.observedAt, "observedAt");
  const validFrom = observation.validFrom ? isoDate(observation.validFrom, "validFrom") : null;
  const validTo = observation.validTo ? isoDate(observation.validTo, "validTo") : null;
  if (validFrom && validTo && new Date(validTo) < new Date(validFrom)) throw new Error("validTo must not be earlier than validFrom.");
  if (!Number.isFinite(observation.relevanceScore) || observation.relevanceScore < 0 || observation.relevanceScore > 1) throw new Error("relevanceScore must be between 0 and 1.");
  if (!Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1) throw new Error("confidence must be between 0 and 1.");
  const observationUri = validHttpsUrl(observation.sourceUri ?? sourceUri, "observation.sourceUri", true)!;
  const payload = observation.payload ?? {};
  const payloadText = JSON.stringify(payload);
  if (payloadText.length > 32_000) throw new Error("payload must not exceed 32 KB.");
  const contentHash = createHash("sha256").update(JSON.stringify({
    provider, category, sourceName, sourceUri, licenseId, attributionText, externalId, topic,
    geography, summary, publishedAt, observedAt, validFrom, validTo,
    relevanceScore: observation.relevanceScore, confidence: observation.confidence,
    observationUri, payload,
  })).digest("hex");

  return getDb().transaction(async (tx) => {
    const proposedSourceId = randomUUID();
    await tx.query(
      `INSERT INTO external_context_sources
        (id,org_id,provider,category,name,source_uri,license_id,license_url,terms_url,attribution_text,access_mode,created_by_id,created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (org_id,provider,source_uri,license_id) DO NOTHING`,
      [proposedSourceId, params.orgId, provider, category, sourceName, sourceUri, licenseId, licenseUrl, termsUrl, attributionText, source.accessMode, params.actorId, params.actorName]
    );
    const sourceResult = await tx.query<{
      id: string; category: string; name: string; license_url: string | null;
      terms_url: string | null; attribution_text: string; access_mode: string;
    }>(
      `SELECT id,category,name,license_url,terms_url,attribution_text,access_mode
         FROM external_context_sources
        WHERE org_id=$1 AND provider=$2 AND source_uri=$3 AND license_id=$4`,
      [params.orgId, provider, sourceUri, licenseId]
    );
    const sourceRow = sourceResult.rows[0];
    if (!sourceRow) throw new Error("External context source could not be registered.");
    if (sourceRow.category !== category || sourceRow.name !== sourceName || sourceRow.license_url !== licenseUrl || sourceRow.terms_url !== termsUrl || sourceRow.attribution_text !== attributionText || sourceRow.access_mode !== source.accessMode) {
      throw new Error("Source metadata conflicts with the existing registered license/source record.");
    }

    const existing = await tx.query<{ id: string; content_hash: string }>(
      "SELECT id,content_hash FROM external_context_observations WHERE org_id=$1 AND source_id=$2 AND external_id=$3",
      [params.orgId, sourceRow.id, externalId]
    );
    if (existing.rows[0]) {
      if (existing.rows[0].content_hash !== contentHash) throw new Error("External observation ID already exists with different content.");
      return { id: existing.rows[0].id, duplicate: true };
    }

    const id = randomUUID();
    await tx.query(
      `INSERT INTO external_context_observations
        (id,org_id,source_id,external_id,topic,geography,summary,published_at,observed_at,valid_from,valid_to,relevance_score,confidence,source_uri,attribution_text,license_id,payload,content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)`,
      [id, params.orgId, sourceRow.id, externalId, topic, geography, summary, publishedAt, observedAt, validFrom, validTo, observation.relevanceScore, observation.confidence, observationUri, attributionText, licenseId, payloadText, contentHash]
    );
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.actorName, type: "external_context_ingested",
      summary: `External context observation ingested: ${topic}`,
      detail: JSON.stringify({ observationId: id, sourceId: sourceRow.id, provider, licenseId, publishedAt, observedAt, retrievedAt: "database-now", relevanceScore: observation.relevanceScore, confidence: observation.confidence, contentHash }),
    });
    return { id, duplicate: false };
  });
}

export async function reviewExternalContext(params: {
  orgId: string; observationId: string; reviewerId: string; reviewerName: string;
  role: string; decision: "accepted" | "rejected"; note?: string | null;
}): Promise<boolean> {
  await migrate();
  if (!hasPermission(params.role, "approve_external_context")) throw new Error("Role is not permitted to review external context.");
  const note = params.note ? requiredText(params.note, "note", 1000) : null;
  return getDb().transaction(async (tx) => {
    const observation = await tx.query<{ id: string }>(
      "SELECT id FROM external_context_observations WHERE org_id=$1 AND id=$2",
      [params.orgId, params.observationId]
    );
    if (!observation.rows[0]) return false;
    const auditEventId = await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.reviewerName, type: "external_context_reviewed",
      summary: `External context ${params.decision}: ${params.observationId}`,
      detail: JSON.stringify({ observationId: params.observationId, decision: params.decision, reviewerId: params.reviewerId, role: params.role, permission: "approve_external_context" }),
    });
    await tx.query(
      `INSERT INTO external_context_reviews (id,org_id,observation_id,decision,reviewer_id,reviewer_name,reviewer_role,permission,note,audit_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'approve_external_context',$8,$9)`,
      [randomUUID(), params.orgId, params.observationId, params.decision, params.reviewerId, params.reviewerName, params.role, note, auditEventId]
    );
    return true;
  });
}

export async function linkExternalContextToCase(params: {
  orgId: string; caseId: string; observationId: string; actorId: string; actorName: string;
  role: string; reason: string;
}): Promise<boolean> {
  await migrate();
  if (!hasPermission(params.role, "record_decision")) throw new Error("Role is not permitted to link decision evidence.");
  const reason = requiredText(params.reason, "reason", 1000);
  return getDb().transaction(async (tx) => {
    const accepted = await tx.query<{ id: string }>(
      `SELECT o.id
         FROM external_context_observations o
         JOIN LATERAL (
           SELECT r.decision FROM external_context_reviews r
            WHERE r.org_id=o.org_id AND r.observation_id=o.id
            ORDER BY r.created_at DESC, r.id DESC LIMIT 1
         ) latest ON latest.decision='accepted'
        WHERE o.org_id=$1 AND o.id=$2`,
      [params.orgId, params.observationId]
    );
    if (!accepted.rows[0]) return false;
    const existingLink = await tx.query<{ id: string }>(
      "SELECT id FROM decision_case_external_context WHERE org_id=$1 AND case_id=$2 AND observation_id=$3",
      [params.orgId, params.caseId, params.observationId]
    );
    if (existingLink.rows[0]) return true;
    const decisionCase = await tx.query<{ id: string }>(
      "SELECT id FROM decision_cases WHERE org_id=$1 AND id=$2",
      [params.orgId, params.caseId]
    );
    if (!decisionCase.rows[0]) return false;
    const id = randomUUID();
    await tx.query(
      `INSERT INTO decision_case_external_context (id,org_id,case_id,observation_id,linked_by_id,linked_by_name,link_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, params.orgId, params.caseId, params.observationId, params.actorId, params.actorName, reason]
    );
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.actorName, type: "external_context_linked_to_case",
      summary: `External context linked to decision case: ${params.caseId}`,
      detail: JSON.stringify({ caseId: params.caseId, observationId: params.observationId, reason }),
    });
    return true;
  });
}

const OBSERVATION_SELECT = `
  SELECT o.id,o.external_id,o.topic,o.geography,o.summary,o.published_at,o.observed_at,o.retrieved_at,
         o.valid_from,o.valid_to,o.relevance_score,o.confidence,o.source_uri AS observation_uri,
         COALESCE(latest.decision,'candidate') AS review_status, latest.note AS review_note,
         s.provider,s.category,s.name AS source_name,s.source_uri,s.license_id,s.license_url,s.terms_url,s.attribution_text
    FROM external_context_observations o
    JOIN external_context_sources s ON s.id=o.source_id AND s.org_id=o.org_id
    LEFT JOIN LATERAL (
      SELECT r.decision,r.note FROM external_context_reviews r
       WHERE r.org_id=o.org_id AND r.observation_id=o.id
       ORDER BY r.created_at DESC, r.id DESC LIMIT 1
    ) latest ON true`;

function mapObservation(row: Record<string, unknown>): ExternalContextObservation {
  return {
    id: String(row.id), provider: String(row.provider), category: String(row.category), sourceName: String(row.source_name),
    sourceUri: String(row.source_uri), licenseId: String(row.license_id), licenseUrl: row.license_url ? String(row.license_url) : null,
    termsUrl: row.terms_url ? String(row.terms_url) : null, attributionText: String(row.attribution_text),
    externalId: String(row.external_id), topic: String(row.topic), geography: String(row.geography), summary: String(row.summary),
    publishedAt: new Date(String(row.published_at)).toISOString(), observedAt: new Date(String(row.observed_at)).toISOString(),
    retrievedAt: new Date(String(row.retrieved_at)).toISOString(), validFrom: row.valid_from ? new Date(String(row.valid_from)).toISOString() : null,
    validTo: row.valid_to ? new Date(String(row.valid_to)).toISOString() : null, relevanceScore: Number(row.relevance_score),
    confidence: Number(row.confidence), sourceObservationUri: String(row.observation_uri),
    reviewStatus: row.review_status as ExternalContextObservation["reviewStatus"], reviewNote: row.review_note ? String(row.review_note) : null,
  };
}

export async function listExternalContext(orgId: string, status?: string, limit = 50): Promise<ExternalContextObservation[]> {
  await migrate();
  const result = await getDb().query(
    `${OBSERVATION_SELECT} WHERE o.org_id=$1 ${status ? "AND COALESCE(latest.decision,'candidate')=$2" : ""} ORDER BY o.observed_at DESC LIMIT $${status ? 3 : 2}`,
    status ? [orgId, status, Math.max(1, Math.min(100, limit))] : [orgId, Math.max(1, Math.min(100, limit))]
  );
  return result.rows.map((row) => mapObservation(row as Record<string, unknown>));
}

export async function listLinkedExternalContext(orgId: string, caseId: string): Promise<ExternalContextObservation[]> {
  await migrate();
  const result = await getDb().query(
    `${OBSERVATION_SELECT}
      JOIN decision_case_external_context link ON link.observation_id=o.id AND link.org_id=o.org_id
      WHERE o.org_id=$1 AND link.case_id=$2 AND latest.decision='accepted'
      ORDER BY o.relevance_score DESC, o.observed_at DESC LIMIT 20`,
    [orgId, caseId]
  );
  return result.rows.map((row) => mapObservation(row as Record<string, unknown>));
}
