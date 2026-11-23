/**
 * Demo/doğrulama ortamı için idempotent rol aracı (yalnızca yerel demo DB).
 *
 *   ABYS_DB_DIR=/tmp/abys-verify-db npx tsx scripts/ensure-demo-role.ts \
 *     --email=veri.yoneticisi@tais.demo --role=data_admin --password=abys-demo-2026
 *
 * Üretim verisine karşı çalıştırılmamalıdır. Kullanıcı varsa rolü ve parolası
 * bilinçli olarak güncellenir; yoksa oluşturulur. Parola hiçbir zaman yazdırılmaz.
 */
import { getDb, migrate } from "../src/lib/db/client";
import { hashPassword } from "../src/lib/auth/core";
import { createUser, findUserByEmail, setUserPassword, updateUser } from "../src/lib/db/repos/users";
import type { Role } from "../src/lib/auth/permissions";

const ROLES: Role[] = [
  "board",
  "ceo",
  "clevel",
  "dept_manager",
  "risk_manager",
  "analyst",
  "auditor",
  "data_admin",
  "sys_admin",
];

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const email = flag("email");
  const role = flag("role") ?? "data_admin";
  const password = flag("password") ?? "abys-demo-2026";
  const orgCode = flag("org") ?? "tais-ikf-demo";
  if (!email) throw new Error("--email gerekli");
  if (!ROLES.includes(role as Role)) throw new Error(`Geçersiz rol: ${role}`);

  await migrate();
  const db = getDb();
  try {
    const org = await db.query<{ id: string }>("SELECT id FROM organizations WHERE code = $1", [orgCode]);
    const orgId = org.rows[0]?.id;
    if (!orgId) throw new Error(`Organizasyon bulunamadı: ${orgCode}`);

    const existing = await findUserByEmail(orgId, email);
    if (existing) {
      await updateUser({ orgId, id: existing.id, role: role as Role, status: "active" });
      await setUserPassword({ orgId, id: existing.id, passwordHash: hashPassword(password) });
      console.log(`güncellendi: ${email} · rol ${role} · org ${orgCode}`);
    } else {
      const created = await createUser({
        orgId,
        email,
        displayName: "TAIS Veri Yöneticisi",
        role: role as Role,
        passwordHash: hashPassword(password),
      });
      console.log(`oluşturuldu: ${created.email} · rol ${role} · org ${orgCode}`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
