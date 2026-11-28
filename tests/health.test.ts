import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { realpathSync, symlinkSync, unlinkSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-health-test-${process.pid}-${randomUUID()}`
);

const { getDb } = await import("../src/lib/db/client");
const { GET: health } = await import("../src/app/api/health/route");

describe("GET /api/health", () => {
  afterAll(async () => {
    await getDb().close();
  });

  it("veritabanı erişilebilirse 200 ve db:up döner", async () => {
    const res = await health(new NextRequest("http://127.0.0.1/api/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("smokeDatabase");
    expect(body).toMatchObject({
      ok: true,
      service: "abys",
      db: "up",
      schemaReady: false,
      pendingMigrations: [expect.objectContaining({ id: 18 })],
    });
  });

  it("dağıtım doğrulaması için derleme commit'ini döner", async () => {
    const res = await health(new NextRequest("http://127.0.0.1/api/health"));
    const body = await res.json();
    expect(typeof body.build?.commit).toBe("string");
    expect(body.build.commit.length).toBeGreaterThan(0);
    expect(typeof body.build?.builtAt).toBe("string");
  });

  it("yalnızca eşleşen smoke token ile atılabilir PGlite yolunu kanıtlar", async () => {
    const token = `health-test-${randomUUID()}`;
    process.env.ABYS_SMOKE_DB_TOKEN = token;
    const req = new NextRequest("http://127.0.0.1/api/health", {
      headers: { "x-abys-smoke-db-token": token },
    });
    const res = await health(req);
    expect(res.status).toBe(200);
    expect((await res.json()).smokeDatabase).toEqual({
      disposable: true,
      backend: "pglite",
      dir: realpathSync(process.env.ABYS_DB_DIR!),
      missingMigrationIds: [],
      pendingMigrationIds: [18],
      enabledApprovalMigrationIds: [],
      migration18ApprovalEnabled: false,
    });
    const wrongToken = new NextRequest("http://127.0.0.1/api/health", {
      headers: { "x-abys-smoke-db-token": "wrong-token" },
    });
    const rejected = await health(wrongToken);
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).not.toHaveProperty("smokeDatabase");
    const validDir = process.env.ABYS_DB_DIR;
    process.env.ABYS_DB_DIR = "/private/tmp";
    expect((await health(req)).status).toBe(409);
    process.env.ABYS_DB_DIR = "relative/abys-health-test";
    expect((await health(req)).status).toBe(409);
    const linkPath = path.join(os.tmpdir(), `abys-health-link-${process.pid}-${randomUUID()}`);
    symlinkSync(os.tmpdir(), linkPath, "dir");
    process.env.ABYS_DB_DIR = linkPath;
    expect((await health(req)).status).toBe(409);
    unlinkSync(linkPath);
    const originalBackend = process.env.ABYS_DB_BACKEND;
    process.env.ABYS_DB_BACKEND = "postgres";
    expect((await health(req)).status).toBe(409);
    if (originalBackend === undefined) delete process.env.ABYS_DB_BACKEND;
    else process.env.ABYS_DB_BACKEND = originalBackend;
    process.env.ABYS_DB_DIR = validDir;

    const originalApproval = process.env.ABYS_MIGRATION_18_APPROVED;
    process.env.ABYS_MIGRATION_18_APPROVED = "true";
    const approvalEnabled = await health(req);
    expect(approvalEnabled.status).toBe(409);
    expect((await getDb().query("SELECT id FROM _migrations WHERE id = 18")).rows).toHaveLength(0);
    if (originalApproval === undefined) delete process.env.ABYS_MIGRATION_18_APPROVED;
    else process.env.ABYS_MIGRATION_18_APPROVED = originalApproval;
    delete process.env.ABYS_SMOKE_DB_TOKEN;
  });

  it("üretim dışında bellek ölçümü döner", async () => {
    const res = await health(new NextRequest("http://127.0.0.1/api/health"));
    const body = await res.json();
    expect(body.memory).toMatchObject({
      rss: expect.any(Number),
      heapUsed: expect.any(Number),
      heapTotal: expect.any(Number),
      external: expect.any(Number),
    });
    expect(typeof body.memory.at).toBe("string");
  });
});
