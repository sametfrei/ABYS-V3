import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isVerificationCommand, verificationCommandLabel } = require(
  "../scripts/command-classification.cjs"
) as {
  isVerificationCommand: (command: string) => boolean;
  verificationCommandLabel: (command: string) => string;
};

describe("Agent Command Center komut sınıflandırması", () => {
  it("gerçek doğrulama komutlarını tanır", () => {
    expect(isVerificationCommand("npm test")).toBe(true);
    expect(isVerificationCommand("cd /tmp && npx tsc --noEmit")).toBe(true);
    expect(isVerificationCommand("CI=1 npm run build")).toBe(true);
    expect(isVerificationCommand("npx vitest run tests/api-auth.test.ts")).toBe(true);
    expect(isVerificationCommand("bash scripts/agent-verify.sh")).toBe(true);
    expect(isVerificationCommand("git diff --check")).toBe(true);
    expect(isVerificationCommand("/bin/zsh -lc \"npm run lint\"")).toBe(true);
  });

  it("yama gövdesindeki test metnini çalıştırma saymaz", () => {
    expect(
      isVerificationCommand("apply_patch <<'PATCH'\n*** Begin Patch\n+// npm test\n*** End Patch\nPATCH")
    ).toBe(false);
    expect(
      isVerificationCommand("*** Begin Patch\n*** Update File: README.md\n+npm run build\n*** End Patch")
    ).toBe(false);
  });

  it("doğrulama etiketinde yalnızca gerçek test komutunu gösterir", () => {
    const command = "cat > tests/example.test.ts <<'EOF'\nconst x = 1;\nEOF\nnpx vitest run tests/example.test.ts";
    expect(verificationCommandLabel(command)).toBe("npx vitest run tests/example.test.ts");
  });

  it("yalnızca argümanda geçen test adını çalıştırma saymaz", () => {
    expect(isVerificationCommand("rg \"npm test\" docs")).toBe(false);
    expect(isVerificationCommand("echo 'npx tsc --noEmit'")).toBe(false);
    expect(isVerificationCommand("npm run agent:center")).toBe(false);
    expect(
      isVerificationCommand("cat > tests/example.test.ts <<'EOF'\nnpx vitest run tests/example.test.ts\nEOF")
    ).toBe(false);
    expect(isVerificationCommand("cat <<'EOF' > README.md\nnpm run build\nEOF")).toBe(false);
  });
});
