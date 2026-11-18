import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-process-test-${process.pid}-${randomUUID()}`
);

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
    __setTestCookie: (name: string, value: string | undefined) => {
      if (value === undefined) store.delete(name);
      else store.set(name, value);
    },
  };
});

const nextHeaders = (await import("next/headers")) as unknown as {
  __setTestCookie: (name: string, value: string | undefined) => void;
};
const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET } = await import("../src/app/api/process-mining/route");
const { mineProcess } = await import("../src/lib/process-mining");

describe("Süreç madenciliği motoru", () => {
  it("boş olayda sıfır sonuç verir", () => {
    const r = mineProcess([]);
    expect(r.subjects).toBe(0);
    expect(r.events).toBe(0);
    expect(r.transitions).toEqual([]);
    expect(r.bottlenecks).toEqual([]);
    expect(r.medianCaseSeconds).toBeNull();
  });

  it("olayları özne bazında sıralayıp geçişleri sayar", () => {
    const r = mineProcess([
      { subject: "s1", type: "lead.created", at: 3000 },
      { subject: "s1", type: "call.completed", at: 1000 },
      { subject: "s1", type: "deal.won", at: 5000 },
    ]);
    expect(r.subjects).toBe(1);
    expect(r.events).toBe(3);
    expect(r.transitions.map((t) => `${t.from}→${t.to}`)).toEqual([
      "call.completed→lead.created",
      "lead.created→deal.won",
    ]);
    expect(r.startEvents[0]).toEqual({ type: "call.completed", count: 1 });
    expect(r.medianCaseSeconds).toBe(4);
  });

  it("en yavaş geçişi darboğaz olarak işaretler", () => {
    const events = [
      { subject: "a", type: "x", at: 0 },
      { subject: "a", type: "y", at: 1000 },
      { subject: "b", type: "x", at: 0 },
      { subject: "b", type: "y", at: 9000 },
      { subject: "c", type: "y", at: 0 },
      { subject: "c", type: "z", at: 500 },
    ];
    const r = mineProcess(events);
    expect(r.bottlenecks[0].from).toBe("x");
    expect(r.bottlenecks[0].to).toBe("y");
    expect(r.bottlenecks[0].p90Seconds).toBeGreaterThanOrEqual(8);
  });

  it("geçersiz olayları dikkate almaz", () => {
    const r = mineProcess([
      { subject: "", type: "x", at: 1 },
      { subject: "s", type: "", at: 1 },
      { subject: "s", type: "x", at: Number.NaN },
    ]);
    expect(r.events).toBe(0);
  });
});

const ORG_A = "org-pm-a";
const ORG_B = "org-pm-b";

async function seedEvents(orgId: string, prefix: string, rows: Array<[string | null, string, string]>) {
  const db = getDb();
  for (let i = 0; i < rows.length; i++) {
    const [subject, type, at] = rows[i];
    await db.query(
      `INSERT INTO integration_events (id, org_id, event_type, subject_ref, occurred_at, payload, source)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, 'test')`,
      [`${prefix}-${i}`, orgId, type, subject, at]
    );
  }
}

describe("GET /api/process-mining", () => {
  let ceoA: string;
  let guestA: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A"],
      [ORG_B, "B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [id, name]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, role] of [
      ["pm-ceo", "ceo"],
      ["pm-guest", "guest"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG_A, `${id}@pm.test`, id, role, pw]
      );
    }
    const now = Date.now();
    const iso = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString();
    await seedEvents(ORG_A, "a", [
      ["s1", "lead.created", iso(100)],
      ["s1", "call.completed", iso(90)],
      ["s1", "deal.won", iso(10)],
      ["s2", "lead.created", iso(80)],
      ["s2", "call.completed", iso(70)],
      [null, "system.ping", iso(50)],
    ]);
    await seedEvents(ORG_B, "b", [
      ["z1", "other.flow", iso(60)],
      ["z1", "other.done", iso(30)],
    ]);
    ceoA = await createSession("pm-ceo", ORG_A);
    guestA = await createSession("pm-guest", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function req(url = "http://localhost/api/process-mining") {
    return GET({ nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0]);
  }

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await req()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await req()).status).toBe(403);
  });

  it("yalnızca kendi org'unun olaylarını işler, öznesizleri raporlar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await req("http://localhost/api/process-mining?days=30");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subjects: number;
      events: number;
      coverage: { read: number; used: number; withoutSubject: number };
      transitions: { from: string; to: string }[];
    };
    expect(body.subjects).toBe(2);
    expect(body.events).toBe(5);
    expect(body.coverage.withoutSubject).toBe(1);
    expect(body.transitions.some((t) => t.from === "other.flow")).toBe(false);
  });
});
