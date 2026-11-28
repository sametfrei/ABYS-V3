import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(os.tmpdir(), `abys-external-context-${process.pid}-${randomUUID()}`);

const { migrate, getDb } = await import("../src/lib/db/client");
const {
  ingestExternalContext,
  reviewExternalContext,
  linkExternalContextToCase,
  listExternalContext,
  listLinkedExternalContext,
} = await import("../src/lib/db/repos/external-context");

const ORG_A = "external-context-org-a";
const ORG_B = "external-context-org-b";
const CASE_A = "external-context-case-a";
const CASE_B = "external-context-case-b";

const input = {
  source: {
    provider: "test-public-feed",
    category: "weather",
    name: "Synthetic climate feed",
    sourceUri: "https://example.com/feed",
    licenseId: "TEST-CC-BY",
    licenseUrl: "https://example.com/license",
    termsUrl: "https://example.com/terms",
    attributionText: "Synthetic test data; attribution required.",
    accessMode: "api" as const,
  },
  observation: {
    externalId: "weather-ankara-2026-11-01",
    topic: "precipitation",
    geography: "Ankara, Türkiye",
    summary: "Rainfall is above the synthetic seasonal baseline.",
    publishedAt: "2026-11-01T06:00:00.000Z",
    observedAt: "2026-11-01T05:00:00.000Z",
    validFrom: "2026-11-01T00:00:00.000Z",
    validTo: "2026-11-02T00:00:00.000Z",
    relevanceScore: 0.92,
    confidence: 0.84,
    sourceUri: "https://example.com/feed/ankara/2026-11-01",
    payload: { precipitationMm: 24, synthetic: true },
  },
};

describe("external context governance", () => {
  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query(
      "INSERT INTO organizations (id,name,sector_id) VALUES ($1,'External A','other'),($2,'External B','other')",
      [ORG_A, ORG_B]
    );
    for (const [id, org] of [[CASE_A, ORG_A], [CASE_B, ORG_B]]) {
      await db.query(
        "INSERT INTO decision_cases (id,org_id,sector_id,category_id,severity,status,title,confidence,payload) VALUES ($1,$2,'other','risk','warning','open','External context case',50,'{}'::jsonb)",
        [id, org]
      );
    }
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("requires HTTPS source, license and attribution metadata", async () => {
    await expect(ingestExternalContext({
      orgId: ORG_A, actorId: "data", actorName: "Data Admin", role: "data_admin",
      input: { ...input, source: { ...input.source, sourceUri: "http://example.com/feed" } },
    })).rejects.toThrow(/HTTPS/i);
    await expect(ingestExternalContext({
      orgId: ORG_A, actorId: "data", actorName: "Data Admin", role: "data_admin",
      input: { ...input, source: { ...input.source, licenseId: "" } },
    })).rejects.toThrow(/licenseId/i);
  });

  it("ingests idempotently while preserving published, observed and retrieved times separately", async () => {
    const created = await ingestExternalContext({
      orgId: ORG_A, actorId: "data", actorName: "Data Admin", role: "data_admin", input,
    });
    expect(created.duplicate).toBe(false);
    const duplicate = await ingestExternalContext({
      orgId: ORG_A, actorId: "data", actorName: "Data Admin", role: "data_admin", input,
    });
    expect(duplicate).toEqual({ id: created.id, duplicate: true });

    const candidates = await listExternalContext(ORG_A, "candidate");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: created.id,
      provider: "test-public-feed",
      licenseId: "TEST-CC-BY",
      publishedAt: "2026-11-01T06:00:00.000Z",
      observedAt: "2026-11-01T05:00:00.000Z",
      reviewStatus: "candidate",
      relevanceScore: 0.92,
      confidence: 0.84,
    });
    expect(new Date(candidates[0].retrievedAt).getTime()).toBeGreaterThan(new Date(candidates[0].observedAt).getTime());
    await expect(ingestExternalContext({
      orgId: ORG_A, actorId: "data", actorName: "Data Admin", role: "data_admin",
      input: { ...input, observation: { ...input.observation, summary: "Changed content under the same external ID." } },
    })).rejects.toThrow(/different content/i);
  });

  it("requires authorized human review and links only accepted observations to same-tenant cases", async () => {
    const created = await ingestExternalContext({
      orgId: ORG_A, actorId: "data", actorName: "Data Admin", role: "data_admin", input,
    });
    await expect(reviewExternalContext({
      orgId: ORG_A, observationId: created.id, reviewerId: "data", reviewerName: "Data Admin",
      role: "data_admin", decision: "accepted",
    })).rejects.toThrow(/not permitted/i);

    await expect(linkExternalContextToCase({
      orgId: ORG_A, caseId: CASE_A, observationId: created.id, actorId: "ceo", actorName: "CEO",
      role: "ceo", reason: "Context evidence",
    })).resolves.toBe(false);

    await expect(reviewExternalContext({
      orgId: ORG_A, observationId: created.id, reviewerId: "ceo", reviewerName: "CEO",
      role: "ceo", decision: "accepted", note: "License and scope reviewed.",
    })).resolves.toBe(true);

    await expect(linkExternalContextToCase({
      orgId: ORG_A, caseId: CASE_A, observationId: created.id, actorId: "ceo", actorName: "CEO",
      role: "ceo", reason: "Relevant external weather context for this case.",
    })).resolves.toBe(true);

    await expect(linkExternalContextToCase({
      orgId: ORG_A, caseId: CASE_B, observationId: created.id, actorId: "ceo", actorName: "CEO",
      role: "ceo", reason: "Cross tenant attempt.",
    })).resolves.toBe(false);

    const linked = await listLinkedExternalContext(ORG_A, CASE_A);
    expect(linked).toHaveLength(1);
    expect(linked[0].licenseId).toBe("TEST-CC-BY");
    await expect(listLinkedExternalContext(ORG_B, CASE_B)).resolves.toEqual([]);

    await expect(getDb().query(
      "UPDATE external_context_observations SET summary='tampered' WHERE org_id=$1 AND id=$2",
      [ORG_A, created.id]
    )).rejects.toThrow(/append-only/i);
  });

  it("removes rejected observations from accepted context even if previously linked", async () => {
    const created = await ingestExternalContext({
      orgId: ORG_A, actorId: "data", actorName: "Data Admin", role: "data_admin",
      input: { ...input, observation: { ...input.observation, externalId: "weather-ankara-revoked" } },
    });
    await reviewExternalContext({
      orgId: ORG_A, observationId: created.id, reviewerId: "ceo", reviewerName: "CEO",
      role: "ceo", decision: "accepted",
    });
    await linkExternalContextToCase({
      orgId: ORG_A, caseId: CASE_A, observationId: created.id, actorId: "ceo", actorName: "CEO",
      role: "ceo", reason: "Initially accepted context.",
    });
    await reviewExternalContext({
      orgId: ORG_A, observationId: created.id, reviewerId: "risk", reviewerName: "Risk Manager",
      role: "risk_manager", decision: "rejected", note: "License review withdrawn.",
    });
    await expect(listLinkedExternalContext(ORG_A, CASE_A)).resolves.toHaveLength(1);
    await expect(listExternalContext(ORG_A, "rejected")).resolves.toHaveLength(1);
  });
});
