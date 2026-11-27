import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-draft-profile-${process.pid}-${randomUUID()}`
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
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const { GET, POST: CONFIRM } = await import("../src/app/api/discovery/route");
const { POST: CREATE_DRAFT } = await import("../src/app/api/discovery/draft/route");
const { getConfirmedBusinessProfile, getLatestDraftBusinessProfile } = await import(
  "../src/lib/db/repos/business-context"
);

const ORG_UNKNOWN = "org-draft-unknown";
const ORG_CONFIDENT = "org-draft-confident";
const ORG_EMPTY = "org-draft-empty";
const ORG_MODERATE = "org-draft-moderate";

let unknownCeo = "";
let unknownGuest = "";
let confidentCeo = "";
let emptyCeo = "";
let moderateCeo = "";

function draftRequest(body: unknown) {
  return new Request("http://localhost/api/discovery/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof CREATE_DRAFT>[0];
}

function confirmRequest(body: unknown) {
  return new Request("http://localhost/api/discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof CONFIRM>[0];
}

const CONFIDENT_FIELDS = {
  machine_id: "M-1",
  work_order: "WO-1",
  bom: "BOM-1",
  yield: 98,
  scrap: 2,
  downtime_minutes: 30,
  planned_production_time: 600,
  good_units: 490,
  defect_units: 10,
  production_cost: 9800,
  wip: 40,
};

const MODERATE_FIELDS = {
  machine_id: "M-2",
  work_order: "WO-2",
  downtime_minutes: 30,
  good_units: 90,
  total_units: 100,
};

async function seedRecords(orgId: string, configId: string, fields: Record<string, unknown>) {
  const db = getDb();
  await db.query(
    `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
     VALUES ($1, $2, 'rest-generic', $3, '{}'::jsonb, 'test')`,
    [configId, orgId, configId]
  );
  await db.query(
    `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data, source_updated_at)
     VALUES ($1, $2, $3, 'product', 'P-1', $4, '2026-01-01T00:00:00Z')`,
    [`rec-${configId}`, orgId, configId, JSON.stringify({ fields })]
  );
}

beforeAll(async () => {
  await migrate();
  const db = getDb();
  for (const [id, name] of [
    [ORG_UNKNOWN, "Unknown"],
    [ORG_CONFIDENT, "Confident"],
    [ORG_EMPTY, "Empty"],
    [ORG_MODERATE, "Moderate"],
  ]) {
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [
      id,
      name,
    ]);
  }

  const password = hashPassword("mevcut-parola-123");
  const users: Array<[string, string, string]> = [
    ["draft-ceo-unknown", ORG_UNKNOWN, "ceo"],
    ["draft-guest-unknown", ORG_UNKNOWN, "guest"],
    ["draft-ceo-confident", ORG_CONFIDENT, "ceo"],
    ["draft-ceo-empty", ORG_EMPTY, "ceo"],
    ["draft-ceo-moderate", ORG_MODERATE, "ceo"],
  ];
  for (const [id, org, role] of users) {
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, org, `${id}@draft.test`, id, role, password]
    );
  }

  await seedRecords(ORG_UNKNOWN, "cfg-draft-unknown", {
    zorblax_qx: 12,
    glorp_count: 4,
    flim_flam: 9,
  });
  await seedRecords(ORG_CONFIDENT, "cfg-draft-confident", CONFIDENT_FIELDS);
  // İkinci varlık, güvenilir keşif için yapısal kanıtı tamamlar.
  await db.query(
    `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data, source_updated_at)
     VALUES ('rec-cfg-draft-confident-inv', $1, 'cfg-draft-confident', 'inventory', 'I-1', $2, '2026-01-01T00:00:00Z')`,
    [ORG_CONFIDENT, JSON.stringify({ fields: { quantity: 100 } })]
  );
  await seedRecords(ORG_MODERATE, "cfg-draft-moderate", MODERATE_FIELDS);

  unknownCeo = await createSession("draft-ceo-unknown", ORG_UNKNOWN);
  unknownGuest = await createSession("draft-guest-unknown", ORG_UNKNOWN);
  confidentCeo = await createSession("draft-ceo-confident", ORG_CONFIDENT);
  emptyCeo = await createSession("draft-ceo-empty", ORG_EMPTY);
  moderateCeo = await createSession("draft-ceo-moderate", ORG_MODERATE);
});

afterAll(async () => {
  nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  await getDb().close();
});

describe("bilinmeyen sektör için taslak iş profili", () => {
  it("oturum ve izin olmadan taslak oluşturulamaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await CREATE_DRAFT(draftRequest({ acknowledgeEvidence: true }))).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, unknownGuest);
    expect((await CREATE_DRAFT(draftRequest({ acknowledgeEvidence: true }))).status).toBe(403);
  });

  it("kısmi kanıt açıkça onaylanmadan taslak oluşturmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, unknownCeo);
    const res = await CREATE_DRAFT(draftRequest({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("bilinmeyen işletme verisi için sürümlü taslak ve denetim kaydı oluşturur", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, unknownCeo);
    const res = await CREATE_DRAFT(draftRequest({ acknowledgeEvidence: true }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      profile: {
        id: string;
        version: number;
        status: string;
        industryPackId: string;
        confidence: number;
        snapshot: {
          kind: string;
          proposal: { conceptIds: string[]; businessModelHintIds: string[]; fieldCount: number };
        };
      };
      idempotent: boolean;
    };
    expect(body.idempotent).toBe(false);
    expect(body.profile.status).toBe("draft");
    expect(body.profile.industryPackId).toBe("unrecognized");
    expect(body.profile.version).toBe(1);
    expect(body.profile.snapshot.kind).toBe("draft");
    expect(body.profile.snapshot.proposal.fieldCount).toBe(3);
    // Varlık adı "product" gerçek bir yapısal kanıttır; iş modeli ipucu için
    // tek başına yeterli değildir.
    expect(body.profile.snapshot.proposal.conceptIds).toEqual(["product"]);
    expect(body.profile.snapshot.proposal.businessModelHintIds).toEqual([]);

    const audit = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = 'business_profile_draft_created'",
      [ORG_UNKNOWN]
    );
    expect(audit.rows).toHaveLength(1);

    // Taslak onaylanmış profil sayılmaz ve otomatik KPI için kullanılmaz.
    expect(await getConfirmedBusinessProfile(ORG_UNKNOWN)).toBeNull();
    expect((await getLatestDraftBusinessProfile(ORG_UNKNOWN))?.status).toBe("draft");
  });

  it("aynı veri için ikinci taslak isteği idempotenttir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, unknownCeo);
    const res = await CREATE_DRAFT(draftRequest({ acknowledgeEvidence: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { idempotent: boolean; profile: { version: number } };
    expect(body.idempotent).toBe(true);
    expect(body.profile.version).toBe(1);
    const audit = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = 'business_profile_draft_created'",
      [ORG_UNKNOWN]
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("keşif ekranı taslağı onaylı profilden ayrı döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, unknownCeo);
    const body = (await (await GET()).json()) as {
      confirmedProfile: unknown;
      draftProfile: { status?: string; version: number; proposal: { fieldCount: number } } | null;
      draftIsStale: boolean;
    };
    expect(body.confirmedProfile).toBeNull();
    expect(body.draftProfile?.version).toBe(1);
    expect(body.draftProfile?.proposal.fieldCount).toBe(3);
    expect(body.draftIsStale).toBe(false);
  });

  it("güvenilir keşifte taslak yerine paket onayı ister", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, confidentCeo);
    const res = await CREATE_DRAFT(draftRequest({ acknowledgeEvidence: true }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PACK_ALREADY_DETECTED");
  });

  it("hiç gözlenmiş alan yoksa taslak oluşturmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, emptyCeo);
    const res = await CREATE_DRAFT(draftRequest({ acknowledgeEvidence: true }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NO_DISCOVERY_EVIDENCE");
  });

  it("paket onaylandığında bekleyen taslak geçersiz kılınır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, moderateCeo);
    expect((await CREATE_DRAFT(draftRequest({ acknowledgeEvidence: true }))).status).toBe(201);

    const confirm = await CONFIRM(
      confirmRequest({ packId: "manufacturing", acknowledgeConfidence: true })
    );
    expect(confirm.status).toBe(201);

    const profile = await getConfirmedBusinessProfile(ORG_MODERATE);
    expect(profile?.industryPackId).toBe("manufacturing");
    expect(profile?.status).toBe("confirmed");
    expect(await getLatestDraftBusinessProfile(ORG_MODERATE)).toBeNull();

    const superseded = await getDb().query<{ status: string }>(
      "SELECT status FROM business_profiles WHERE org_id = $1 AND industry_pack_id = 'unrecognized'",
      [ORG_MODERATE]
    );
    expect(superseded.rows[0]?.status).toBe("superseded");
  });
});
