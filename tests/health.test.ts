import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
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
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      service: "abys",
      db: "up",
      schemaReady: false,
      pendingMigrations: [expect.objectContaining({ id: 18 })],
    });
  });

  it("dağıtım doğrulaması için derleme commit'ini döner", async () => {
    const res = await health();
    const body = await res.json();
    expect(typeof body.build?.commit).toBe("string");
    expect(body.build.commit.length).toBeGreaterThan(0);
    expect(typeof body.build?.builtAt).toBe("string");
  });
});
