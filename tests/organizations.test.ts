import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-organizations-test-${process.pid}-${randomUUID()}`
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
const { migrate, getDb, getPendingMigrationApprovals } = await import("../src/lib/db/client");
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const {
  getOrganization,
  listOrganizationSubtree,
  getOrganizationConsolidation,
} = await import("../src/lib/db/repos/organizations");
const { GET: listOrgs } = await import("../src/app/api/organizations/route");
const { GET: consolidation } = await import(
  "../src/app/api/organizations/consolidation/route"
);

const GROUP = "org-group";
const COMPANY_1 = "org-company-1";
const BRANCH_1 = "org-branch-1";
const COMPANY_2 = "org-company-2";
const OTHER_ROOT = "org-other-root";

await migrate();
const migration18Applied = !getPendingMigrationApprovals().some((migration) => migration.id === 18);
const hierarchyDescribe = migration18Applied ? describe : describe.skip;

hierarchyDescribe("organizasyon hiyerarşisi (migration 18 onay durumuna bağlı)", () => {
  let groupSession: string;
  let branchSession: string;
  let guestSession: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query(
      `INSERT INTO organizations (id, name, sector_id, kind, parent_id, country, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [GROUP, "Holding", "other", "group", null, "TR", "TRY"]
    );
    await db.query(
      `INSERT INTO organizations (id, name, sector_id, kind, parent_id, country, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [COMPANY_1, "Şirket 1", "aviation", "company", GROUP, "TR", "TRY"]
    );
    await db.query(
      `INSERT INTO organizations (id, name, sector_id, kind, parent_id, country, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [BRANCH_1, "Şube 1", "aviation", "branch", COMPANY_1, "DE", "EUR"]
    );
    await db.query(
      `INSERT INTO organizations (id, name, sector_id, kind, parent_id, country, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [COMPANY_2, "Şirket 2", "aviation", "company", GROUP, "TR", "TRY"]
    );
    await db.query(
      `INSERT INTO organizations (id, name, sector_id, kind, parent_id, country, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [OTHER_ROOT, "Bağımsız", "aviation", "company", null, "TR", "TRY"]
    );

    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, email, role] of [
      ["grp-user", GROUP, "grp@org.test", "ceo"],
      ["brn-user", BRANCH_1, "brn@org.test", "ceo"],
      ["guest-user", GROUP, "guest@org.test", "guest"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, id, role, pw]
      );
    }
    groupSession = await createSession("grp-user", GROUP);
    branchSession = await createSession("brn-user", BRANCH_1);
    guestSession = await createSession("guest-user", GROUP);

    // Konsolidasyon verisi: grup 2 açık risk, şube 1 açık risk + gecikmiş aksiyon.
    for (const [id, org] of [
      ["sig-g1", GROUP],
      ["sig-g2", GROUP],
      ["sig-b1", BRANCH_1],
      ["sig-x1", OTHER_ROOT],
      ["sig-x2", OTHER_ROOT],
      ["sig-x3", OTHER_ROOT],
    ] as const) {
      await db.query(
        `INSERT INTO signals (id, org_id, sector_id, category_id, severity, title, status, payload)
         VALUES ($1, $2, 'aviation', 'risk', 'high', $3, 'open', '{}'::jsonb)`,
        [id, org, `sinyal ${id}`]
      );
    }

    for (const [caseId, recordId, actionId, org, dueAt] of [
      ["case-g1", "rec-g1", "act-g1", GROUP, "2030-01-01T00:00:00Z"],
      ["case-b1", "rec-b1", "act-b1", BRANCH_1, "2020-01-01T00:00:00Z"],
      ["case-x1", "rec-x1", "act-x1", OTHER_ROOT, "2020-01-01T00:00:00Z"],
    ] as const) {
      await db.query(
        `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
         VALUES ($1, $2, 'aviation', 'risk', 'high', 'open', $3, 80, '{}'::jsonb)`,
        [caseId, org, `vaka ${caseId}`]
      );
      await db.query(
        `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload)
         VALUES ($1, $2, $3, 'aviation', 'accepted', 'test', '{}'::jsonb)`,
        [recordId, org, caseId]
      );
      await db.query(
        `INSERT INTO actions (id, org_id, decision_id, case_id, title, owner, due_at, status)
         VALUES ($1, $2, $3, $4, $5, 'test', $6, 'open')`,
        [actionId, org, recordId, caseId, `aksiyon ${actionId}`, dueAt]
      );
    }

    // Öncelik sıralaması için ek açık kararlar (kritik olan önce gelmeli).
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ('case-b2', $1, 'aviation', 'risk', 'critical', 'open', 'Kritik şube kararı', 90, '{}'::jsonb)`,
      [BRANCH_1]
    );
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ('case-x2', $1, 'aviation', 'risk', 'critical', 'open', 'Başka holding kararı', 99, '{}'::jsonb)`,
      [OTHER_ROOT]
    );
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("alt ağaç yalnızca kökün altındakileri döner", async () => {
    const ids = (await listOrganizationSubtree(GROUP)).map((o) => o.id).sort();
    expect(ids).toEqual([GROUP, COMPANY_1, COMPANY_2, BRANCH_1].sort());
    const ids2 = (await listOrganizationSubtree(COMPANY_1)).map((o) => o.id).sort();
    expect(ids2).toEqual([COMPANY_1, BRANCH_1].sort());
  });

  it("ülke ve para birimi metadata'sı okunur", async () => {
    const branch = await getOrganization(BRANCH_1);
    expect(branch).toMatchObject({ kind: "branch", country: "DE", currency: "EUR", depth: 0 });
  });

  it("oturum org'u kök alınır; kardeş şirket görünmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, branchSession);
    const res = await listOrgs();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rootOrgId: string; organizations: Array<{ id: string }> };
    expect(body.rootOrgId).toBe(BRANCH_1);
    expect(body.organizations.map((o) => o.id)).toEqual([BRANCH_1]);
  });

  it("holding kullanıcısı tüm alt ağacı görür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, groupSession);
    const body = (await (await listOrgs()).json()) as { organizations: Array<{ id: string }> };
    const ids = body.organizations.map((o) => o.id).sort();
    expect(ids).toEqual([GROUP, COMPANY_1, COMPANY_2, BRANCH_1].sort());
    expect(ids).not.toContain(OTHER_ROOT);
  });

  it("oturum yoksa 401, tanımsız rolde 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await listOrgs()).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, guestSession);
    expect((await listOrgs()).status).toBe(403);
  });

  it("holding konsolidasyonu alt ağaç toplamlarını verir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, groupSession);
    const res = await consolidation();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totals: Record<string, number>;
      organizations: Array<{ id: string; openSignals: number; overdueActions: number }>;
    };
    expect(body.totals).toEqual({
      openSignals: 3,
      openDecisions: 3,
      openActions: 2,
      overdueActions: 1,
    });
    expect(body.organizations.find((o) => o.id === GROUP)).toMatchObject({
      openSignals: 2,
      overdueActions: 0,
    });
    expect(body.organizations.find((o) => o.id === BRANCH_1)).toMatchObject({
      openSignals: 1,
      overdueActions: 1,
    });
    expect(body.organizations.map((o) => o.id)).not.toContain(OTHER_ROOT);
  });

  it("şube kullanıcısı yalnızca kendi konsolidasyonunu görür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, branchSession);
    const body = (await (await consolidation()).json()) as {
      totals: Record<string, number>;
      organizations: Array<{ id: string }>;
    };
    expect(body.totals).toEqual({
      openSignals: 1,
      openDecisions: 2,
      openActions: 1,
      overdueActions: 1,
    });
    expect(body.organizations.map((o) => o.id)).toEqual([BRANCH_1]);
  });

  it("repo konsolidasyonu kardeş şubeyi dışlar", async () => {
    const rows = await getOrganizationConsolidation(COMPANY_1);
    expect(rows.map((r) => r.id)).toEqual([COMPANY_1, BRANCH_1]);
  });

  it("bugünün öncelikli kararları kritik→güven sırasıyla döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, groupSession);
    const body = (await (await consolidation()).json()) as {
      topDecisions: Array<{ id: string; orgName: string; severity: string; confidence: number }>;
    };
    expect(body.topDecisions).toHaveLength(3);
    expect(body.topDecisions[0]).toMatchObject({
      id: "case-b2",
      severity: "critical",
      confidence: 90,
    });
    expect(body.topDecisions.map((d) => d.id)).not.toContain("case-x2");
  });
});
