import { seedTaisDemo } from "@/lib/demo/tais/seed";
import { TAIS_DEMO_EMAIL, TAIS_DEMO_PASSWORD } from "@/lib/demo/tais/constants";

/**
 * A fresh install always receives the single deterministic TAIS demo tenant
 * and account. Login calls this idempotent initializer before authentication.
 */
export async function ensureSeeded(): Promise<void> {
  await seedTaisDemo({
    adminEmail: process.env.TAIS_DEMO_ADMIN_EMAIL?.trim().toLowerCase() || TAIS_DEMO_EMAIL,
    adminPassword: process.env.TAIS_DEMO_ADMIN_PASSWORD?.trim() || TAIS_DEMO_PASSWORD,
  });
}
