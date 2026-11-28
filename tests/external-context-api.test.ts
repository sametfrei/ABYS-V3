import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.ABYS_DB_DIR = path.join(os.tmpdir(), "abys-external-context-api-" + process.pid + "-" + randomUUID());

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => store.set(name, value),
      delete: (name: string) => store.delete(name),
    }),
    __setCookie: (name: string, value: string | undefined) => {
      if (value === undefined) store.delete(name);
      else store.set(name, value);
    },
  };
});

const nextHeaders = (await import("next/headers")) as unknown as {
  __setCookie: (name: string, value: string | undefined) => void;
};
const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession, hashPassword, SESSION_COOKIE } = await import("../src/lib/auth/core");
const { POST: ingest, GET: list } = await import("../src/app/api/external-context/route");
const { POST: review } = await import("../src/app/api/external-context/[id]/review/route");
const { GET: getLinked, POST: link } = await import("../src/app/api/decision-cases/[id]/external-context/route");

const ORG_A = "external-api-a";
const ORG_B = "external-api-b";
const CASE_A = "external-api-case";
const BODY = {
  source: {
    provider: "synthetic-api",
    category: "market",
    name: "Synthetic market feed",
    sourceUri: "https://example.com/market",
    licenseId: "TEST-LICENSE",
    attributionText: "Synthetic data; test attribution.",
    accessMode: "manual",
  },
  observation: {
    externalId: "market-2026-11-01",
    topic: "input-cost",
    geography: "Türkiye",
    summary: "Synthetic input costs increased.",
    publishedAt: "2026-11-01T08:00:00.000Z",
    observedAt: "2026-11-01T07:00:00.000Z",
    relevanceScore: 0.8,
    confidence: 0.75,
    payload: { delta: 0.12 },
  },
};

describe("external context API", () => {
  let dataAdmin: string;
  let ceo: string;
  let otherTenant: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id,name,sector_id) VALUES ($1,'External API A','other'),($2,'External API B','other')", [ORG_A, ORG_B]);
    await db.query(
      "INSERT INTO decision_cases (id,org_id,sector_id,category_id,severity,status,title,confidence,payload) VALUES ($1,$2,'other','risk','warning','open','External API case',50,'{}'::jsonb)",
      [CASE_A, ORG_A]
    );
    const passwordHash = hashPassword("external-api-password");
    for (const [id, org, role] of [
      ["external-data", ORG_A, "data_admin"],
      ["external-ceo", ORG_A, "ceo"],
      ["external-other", ORG_B, "ceo"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id,org_id,email,display_name,role,password_hash) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, org, id + "@test.local", id, role, passwordHash]
      );
    }
    dataAdmin = await createSession("external-data", ORG_A);
    ceo = await createSession("external-ceo", ORG_A);
    otherTenant = await createSession("external-other", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("enforces session and role boundaries across ingest, review and case linking", async () => {
    nextHeaders.__setCookie(SESSION_COOKIE, undefined);
    expect((await list(new NextRequest("http://localhost/api/external-context"))).status).toBe(401);

    nextHeaders.__setCookie(SESSION_COOKIE, dataAdmin);
    const createdResponse = await ingest(new NextRequest("http://localhost/api/external-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(BODY),
    }));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string };

    const deniedReview = await review(new NextRequest("http://localhost/api/external-context", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "accepted" }),
    }), { params: Promise.resolve({ id: created.id }) });
    expect(deniedReview.status).toBe(403);

    nextHeaders.__setCookie(SESSION_COOKIE, ceo);
    const accepted = await review(new NextRequest("http://localhost/api/external-context", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "accepted", note: "Reviewed" }),
    }), { params: Promise.resolve({ id: created.id }) });
    expect(accepted.status).toBe(200);

    const linked = await link(new NextRequest("http://localhost/api/decision-cases", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ observationId: created.id, reason: "Relevant to the case." }),
    }), { params: Promise.resolve({ id: CASE_A }) });
    expect(linked.status).toBe(200);

    const linkedList = await getLinked(new NextRequest("http://localhost/api/decision-cases/" + CASE_A + "/external-context"), { params: Promise.resolve({ id: CASE_A }) });
    expect(linkedList.status).toBe(200);
    expect((await linkedList.json() as { observations: unknown[] }).observations).toHaveLength(1);

    nextHeaders.__setCookie(SESSION_COOKIE, otherTenant);
    const otherList = await list(new NextRequest("http://localhost/api/external-context?status=accepted"));
    expect(otherList.status).toBe(200);
    expect((await otherList.json() as { observations: unknown[] }).observations).toHaveLength(0);
  });
});
