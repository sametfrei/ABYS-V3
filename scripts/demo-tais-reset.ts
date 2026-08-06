import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();
if (process.env.NODE_ENV === "production" && process.env.ALLOW_TAIS_DEMO_RESET !== "true") {
  throw new Error("TAIS demo reset üretim ortamında kapalıdır. Yalnızca yerel demo için ALLOW_TAIS_DEMO_RESET=true kullanın.");
}

async function main() {
  const { getDb } = await import("../src/lib/db/client");
  const { resetTaisDemo } = await import("../src/lib/demo/tais/seed");
  try {
    const result = await resetTaisDemo();
    console.log(`TAIS demo verisi sıfırlandı: ${result.orgId}`);
  } finally {
    await getDb().close();
  }
}

main().catch((err) => {
  console.error("TAIS demo reset BASARISIZ:", err instanceof Error ? err.message : err);
  process.exit(1);
});
