import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(os.tmpdir(), `abys-initial-admin-${process.pid}-${randomUUID()}`);
process.env.ABYS_MIGRATION_18_APPROVED = "true";
process.env.ABYS_BOOTSTRAP_TOKEN = "initial-admin-test-token-".repeat(2);

const { migrate, getDb } = await import("../src/lib/db/client");
const { verifyPassword } = await import("../src/lib/auth/core");
const { GET, POST } = await import("../src/app/api/auth/bootstrap/route");

const token = process.env.ABYS_BOOTSTRAP_TOKEN;

function request(body: unknown) {
  return new NextRequest("http://localhost/api/auth/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" },
    body: JSON.stringify(body),
  });
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    token,
    organizationName: "ABYS Bootstrap Test",
    sectorId: "manufacturing",
    adminDisplayName: "Initial Admin",
    adminEmail: "initial-admin@example.test",
    password: "not-a-real-password-123",
    passwordConfirmation: "not-a-real-password-123",
    ...overrides,
  };
}

describe("tek kullanımlık ilk kurum yöneticisi kurulumu", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("boş veritabanında kurulum anahtarı etkinse kullanılabilir görünür", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  });

  it("yanlış anahtar kurumu veya kullanıcıyı oluşturmaz", async () => {
    const response = await POST(request(payload({ token: "wrong-bootstrap-token".repeat(2) })));
    expect(response.status).toBe(404);

    const counts = await getDb().query(
      "SELECT (SELECT count(*)::int FROM organizations) AS organizations, (SELECT count(*)::int FROM users) AS users"
    );
    expect(counts.rows[0]).toEqual({ organizations: 0, users: 0 });
  });

  it("eşzamanlı kurulum isteklerinden yalnızca biri kurum ve sys_admin oluşturur", async () => {
    const [first, second] = await Promise.all([
      POST(request(payload())),
      POST(request(payload())),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const db = getDb();
    const result = await db.query<{
      organization_name: string;
      kind: string;
      currency: string;
      email: string;
      role: string;
      display_name: string;
      password_hash: string;
    }>(`
      SELECT o.name AS organization_name, o.kind, o.currency,
             u.email, u.role, u.display_name, u.password_hash
        FROM organizations o
        JOIN users u ON u.org_id = o.id
    `);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      organization_name: "ABYS Bootstrap Test",
      kind: "company",
      currency: "TRY",
      email: "initial-admin@example.test",
      role: "sys_admin",
      display_name: "Initial Admin",
    });
    expect(verifyPassword("not-a-real-password-123", result.rows[0].password_hash)).toBe(true);
    expect(result.rows[0].password_hash).not.toContain("not-a-real-password-123");

    const audit = await db.query(
      "SELECT type, summary FROM audit_events WHERE org_id = (SELECT org_id FROM users WHERE email = $1)",
      ["initial-admin@example.test"]
    );
    expect(audit.rows).toEqual([{
      type: "initial_admin_bootstrap",
      summary: "İlk kurum ve sistem yöneticisi oluşturuldu.",
    }]);
  });

  it("kurulum tamamlandıktan sonra durum kapanır ve ikinci kayıt reddedilir", async () => {
    const status = await GET();
    expect(await status.json()).toEqual({ available: false });

    const response = await POST(request(payload({ adminEmail: "second@example.test" })));
    expect(response.status).toBe(409);

    const users = await getDb().query("SELECT email, role FROM users");
    expect(users.rows).toEqual([{ email: "initial-admin@example.test", role: "sys_admin" }]);
  });

  it("tamamlanmış kurulum kilidi doğrudan silinemez veya yeniden açılamaz", async () => {
    const db = getDb();
    await expect(db.query("DELETE FROM initial_admin_bootstrap WHERE id = 1")).rejects.toThrow();
    await expect(db.query(
      "UPDATE initial_admin_bootstrap SET claimed_at = NULL, completed_at = NULL, organization_id = NULL, user_id = NULL WHERE id = 1"
    )).rejects.toThrow();

    const state = await db.query<{ completed_at: string | Date | null }>(
      "SELECT completed_at FROM initial_admin_bootstrap WHERE id = 1"
    );
    expect(state.rows[0]?.completed_at).not.toBeNull();
  });
});
