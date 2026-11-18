import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * client.ts DB_DIR'i modül üst seviyesinde okur. Kendi geçici dizinini
 * kullanır ki dev sunucunun .data/abys-db kilidiyle veya diğer test
 * dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-users-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const {
  listUsers,
  getUser,
  findUserByEmail,
  createUser,
  updateUser,
  setUserPassword,
  countActiveSysAdmins,
} = await import("../src/lib/db/repos/users");
const { hashPassword, verifyPassword } = await import("../src/lib/auth/core");

describe("users repository (org-kapsamlı)", () => {
  const orgA = randomBytes(8).toString("hex");
  const orgB = randomBytes(8).toString("hex");

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgA,
      "Kullanıcı Test Org A",
      "aviation",
    ]);
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgB,
      "Kullanıcı Test Org B",
      "aviation",
    ]);
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("org izolasyonu: A org'u B kullanıcısını hiçbir sorguda görmez", async () => {
    const userB = await createUser({
      orgId: orgB,
      email: `iso-b-${randomUUID()}@example.com`,
      displayName: "Org B Kullanıcısı",
      role: "analyst",
      passwordHash: "hash-b",
    });

    const listA = await listUsers(orgA);
    expect(listA.some((u) => u.id === userB.id)).toBe(false);

    expect(await getUser(orgA, userB.id)).toBeNull();
    expect(await findUserByEmail(orgA, userB.email)).toBeNull();

    // B org'u kendi kaydını görür — izolasyon simetrik.
    expect((await getUser(orgB, userB.id))?.id).toBe(userB.id);
  });

  it("createUser + listUsers + getUser alan eşlemesi ve password_hash sızmaması", async () => {
    const email = `  Mapping-User-${randomUUID()}@Example.COM  `;
    const created = await createUser({
      orgId: orgA,
      email,
      displayName: "Eşleme Kullanıcısı",
      role: "dept_manager",
      passwordHash: "gizli-hash",
    });

    expect(created.id).toMatch(/^[0-9a-f]{16}$/);
    expect(created.orgId).toBe(orgA);
    expect(created.email).toBe(email.trim().toLowerCase());
    expect(created.displayName).toBe("Eşleme Kullanıcısı");
    expect(created.role).toBe("dept_manager");
    expect(created.status).toBe("active");
    expect(typeof created.createdAt).toBe("string");
    expect(created.createdAt.length).toBeGreaterThan(0);
    expect("passwordHash" in created).toBe(false);

    const listed = (await listUsers(orgA)).find((u) => u.id === created.id);
    expect(listed).toEqual(created);

    expect(await getUser(orgA, created.id)).toEqual(created);
  });

  it("updateUser yalnızca verilen alanları günceller; yoksa/başka org'daysa null döner", async () => {
    const user = await createUser({
      orgId: orgA,
      email: `update-${randomUUID()}@example.com`,
      displayName: "Güncellenecek",
      role: "analyst",
      passwordHash: "hash",
    });

    // Boş güncelleme mevcut kaydı döndürür.
    const unchanged = await updateUser({ orgId: orgA, id: user.id });
    expect(unchanged).toEqual(user);

    const updated = await updateUser({ orgId: orgA, id: user.id, role: "risk_manager" });
    expect(updated?.role).toBe("risk_manager");
    expect(updated?.status).toBe("active");
    expect(updated?.displayName).toBe("Güncellenecek");

    const disabled = await updateUser({ orgId: orgA, id: user.id, status: "disabled" });
    expect(disabled?.status).toBe("disabled");
    expect(disabled?.role).toBe("risk_manager");

    // Olmayan kayıt.
    expect(await updateUser({ orgId: orgA, id: "yok-boyle-bir-id", role: "ceo" })).toBeNull();

    // Başka org'un kaydı güncellenemez ve değişmez.
    const crossTenant = await updateUser({ orgId: orgB, id: user.id, role: "sys_admin" });
    expect(crossTenant).toBeNull();
    expect((await getUser(orgA, user.id))?.role).toBe("risk_manager");
  });

  it("setUserPassword parola hash'ini günceller; eski parola artık geçersizdir", async () => {
    const user = await createUser({
      orgId: orgA,
      email: `set-password-${randomUUID()}@example.com`,
      displayName: "Parola Kullanıcısı",
      role: "analyst",
      passwordHash: hashPassword("eski-parola"),
    });

    const newHash = hashPassword("yeni-parola");
    const updated = await setUserPassword({ orgId: orgA, id: user.id, passwordHash: newHash });
    expect(updated?.id).toBe(user.id);

    const r = await getDb().query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE org_id = $1 AND id = $2",
      [orgA, user.id]
    );
    const stored = r.rows[0]!.password_hash;

    expect(verifyPassword("yeni-parola", stored)).toBe(true);
    expect(verifyPassword("eski-parola", stored)).toBe(false);
  });

  it("setUserPassword başka org'un id'si için null döner ve kaydı değiştirmez", async () => {
    const user = await createUser({
      orgId: orgA,
      email: `cross-org-password-${randomUUID()}@example.com`,
      displayName: "Çapraz Org",
      role: "analyst",
      passwordHash: hashPassword("orijinal-parola"),
    });

    const result = await setUserPassword({
      orgId: orgB,
      id: user.id,
      passwordHash: hashPassword("saldirgan-parola"),
    });
    expect(result).toBeNull();

    const r = await getDb().query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE org_id = $1 AND id = $2",
      [orgA, user.id]
    );
    expect(verifyPassword("orijinal-parola", r.rows[0]!.password_hash)).toBe(true);
    expect(verifyPassword("saldirgan-parola", r.rows[0]!.password_hash)).toBe(false);
  });

  it("setUserPassword dönen UserRow'da parola alanı içermez", async () => {
    const user = await createUser({
      orgId: orgA,
      email: `no-password-field-${randomUUID()}@example.com`,
      displayName: "Alan Kontrolü",
      role: "auditor",
      passwordHash: hashPassword("bir-parola"),
    });

    const returned = await setUserPassword({
      orgId: orgA,
      id: user.id,
      passwordHash: hashPassword("baska-parola"),
    });

    expect(returned).not.toBeNull();
    expect("passwordHash" in returned!).toBe(false);
    expect("password_hash" in returned!).toBe(false);
    expect("password" in returned!).toBe(false);
  });

  it("countActiveSysAdmins yalnızca active sys_admin sayar", async () => {
    const orgC = randomBytes(8).toString("hex");
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgC,
      "Sayaç Org",
      "aviation",
    ]);

    await createUser({
      orgId: orgC,
      email: `admin1-${randomUUID()}@example.com`,
      displayName: "Aktif Yönetici 1",
      role: "sys_admin",
      passwordHash: "hash",
    });
    await createUser({
      orgId: orgC,
      email: `admin2-${randomUUID()}@example.com`,
      displayName: "Aktif Yönetici 2",
      role: "sys_admin",
      passwordHash: "hash",
    });
    await createUser({
      orgId: orgC,
      email: `admin-disabled-${randomUUID()}@example.com`,
      displayName: "Pasif Yönetici",
      role: "sys_admin",
      passwordHash: "hash",
      status: "disabled",
    });
    await createUser({
      orgId: orgC,
      email: `ceo-${randomUUID()}@example.com`,
      displayName: "CEO",
      role: "ceo",
      passwordHash: "hash",
    });

    expect(await countActiveSysAdmins(orgC)).toBe(2);
    // Başka org'da bu sayım etkilenmez.
    expect(await countActiveSysAdmins(orgA)).toBe(0);
  });

  it("findUserByEmail büyük/küçük harf ve boşluğa duyarsızdır", async () => {
    const email = `Case-Insensitive-${randomUUID()}@Example.COM`;
    const created = await createUser({
      orgId: orgA,
      email,
      displayName: "Büyük Harf",
      role: "auditor",
      passwordHash: "hash",
    });

    expect((await findUserByEmail(orgA, email))?.id).toBe(created.id);
    expect((await findUserByEmail(orgA, email.toUpperCase()))?.id).toBe(created.id);
    expect((await findUserByEmail(orgA, `  ${email.toLowerCase()}  `))?.id).toBe(created.id);
  });
});
