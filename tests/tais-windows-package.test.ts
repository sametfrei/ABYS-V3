import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("TAIS Windows demo teslim dosyaları", () => {
  it("zorunlu launcher ve giriş bilgi dosyaları doludur", () => {
    for (const file of [
      ".env.example",
      "TAIS-ABYS-ILK-KURULUM.cmd",
      "TAIS-ABYS-BASLAT.cmd",
      "TAIS-ABYS-DURDUR.cmd",
      "TAIS-ABYS-DEMO-RESET.cmd",
      "KURULUM-VE-GIRIS-BILGILERI.txt",
    ]) {
      expect(read(file).trim().length, file).toBeGreaterThan(20);
    }
  });

  it("örnek ortam açıkça deterministik demo ve Bitrix24 demo modunda başlar", () => {
    const env = read(".env.example");
    expect(env).toContain("AI_POLICY=DEMO_DETERMINISTIC");
    expect(env).toContain("BITRIX24_MODE=demo");
    expect(env).toContain("TAIS_DEMO_ADMIN_PASSWORD=abys-demo-2026");
    expect(env).not.toMatch(/GEMINI_API_KEY=\S+/);
    expect(env).not.toMatch(/BITRIX24_(?:WEBHOOK_TOKEN|CLIENT_SECRET|REFRESH_TOKEN)=\S+/);
  });

  it("ilk kurulum bootstrap'tan önce .env.local değerlerini yükler", () => {
    const bootstrap = read("scripts/demo-tais-bootstrap.ts");
    const setup = read("scripts/windows/first-setup.ps1");
    expect(bootstrap.indexOf("loadLocalEnv();")).toBeGreaterThanOrEqual(0);
    expect(bootstrap.indexOf("await import(\"../src/lib/demo/tais/bootstrap\")")).toBeGreaterThan(
      bootstrap.indexOf("loadLocalEnv();")
    );
    expect(setup).toContain('"ALLOW_TAIS_DEMO_BOOTSTRAP", "ALLOW_TAIS_DEMO_RESET"');
  });

  it("kullanıcı belgesi gerçek bağlantı iddiası yerine demo sınırını açıklar", () => {
    const guide = read("KURULUM-VE-GIRIS-BILGILERI.txt");
    expect(guide).toContain("Bitrix24 uyumlu sentetik verilerle");
    expect(guide).toContain("connected=false");
    expect(guide).toContain("connected=false");
    expect(guide).toContain("node_modules, .git, önbellek, günlük ve eski ZIP bulunmaz");
  });

  it("gerçek Electron masaüstü paketi yerel hizmet, tek örnek ve child cleanup içerir", () => {
    const pkg = JSON.parse(read("package.json")) as {
      main: string;
      scripts: Record<string, string>;
      build: { nsis: Record<string, unknown> };
    };
    const electronMain = read("desktop/main.cjs");
    expect(pkg.main).toBe("desktop/main.cjs");
    expect(pkg.scripts["desktop:package"]).toContain("electron-builder");
    expect(pkg.build.nsis.createDesktopShortcut).toBe(true);
    expect(electronMain).toContain("requestSingleInstanceLock");
    expect(electronMain).toContain("nodeExecutable");
    expect(electronMain).toContain('"node", "node.exe"');
    expect(electronMain).toContain("taskkill.exe");
    expect(electronMain).toContain('path.join(app.getPath("userData"), "logs")');
  });

  it("özgün logo tam tuval, object-contain ve Windows ikonu olarak kullanılır", () => {
    const logo = read("src/components/Logo.tsx");
    expect(logo).toContain("/logo-abys-original-transparent.png");
    expect(logo).toContain("object-contain");
    expect(read("desktop/main.cjs")).toContain("abys.ico");
  });
});
