"use strict";

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+/;
const SHELL_WRAPPER = /^(?:\/(?:usr\/)?bin\/)?(?:ba|z|da|k)?sh\s+(?:-[A-Za-z]*c|--command)\s+(.+)$/s;

/** Dosyaya yazılan heredoc gövdesini ayıklar; gövde kabuk komutu değildir. */
function stripHeredocBodies(text) {
  const lines = text.split("\n");
  const kept = [];
  let delimiter = null;
  for (const line of lines) {
    if (delimiter !== null) {
      if (line.trim() === delimiter || line.trim() === `${delimiter};`) delimiter = null;
      continue;
    }
    kept.push(line);
    const match = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (match) delimiter = match[2];
  }
  return kept.join("\n");
}

/**
 * Bir kabuk komutunun doğrulama komutu olup olmadığını belirler.
 * Yalnızca segment başındaki gerçek çalıştırılabilir komut dikkate alınır;
 * apply_patch gövdesi, dosya içeriği veya argüman metni test sanılmaz.
 */
function verificationCommands(command) {
  if (typeof command !== "string") return [];
  const text = command.trim();
  if (!text || /(?:^|\n)\s*apply_patch\b|^\s*\*\*\* Begin Patch\b/m.test(text)) return [];

  const segments = stripHeredocBodies(text)
    .split(/\n|&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !segment.startsWith("#"));

  const matches = [];
  for (const original of segments) {
    let segment = original;
    const wrapper = segment.match(SHELL_WRAPPER);
    if (wrapper) segment = wrapper[1].trim().replace(/^(['"])(.*)\1$/s, "$2").trim();

    // Ön ekteki ortam atamalarını ve `command`/`time` sarmalayıcılarını atla.
    let changed = true;
    while (changed) {
      changed = false;
      const env = segment.match(ENV_ASSIGNMENT);
      if (env) {
        segment = segment.slice(env[0].length).trim();
        changed = true;
      }
      const prefix = segment.match(/^(?:command|time)\s+/);
      if (prefix) {
        segment = segment.slice(prefix[0].length).trim();
        changed = true;
      }
    }

    if (
      /^(?:npm\s+(?:run\s+)?(?:test|build|verify|lint|eval)\b|pnpm\s+(?:run\s+)?(?:test|build|verify|lint|eval)\b|yarn\s+(?:run\s+)?(?:test|build|verify|lint|eval)\b)/.test(segment) ||
      /^(?:npx\s+(?:--no-install\s+)?(?:vitest|tsc|eslint|next\s+build)\b|(?:\.\/)?node_modules\/\.bin\/(?:vitest|tsc|eslint)\b|vitest\b|tsc\b|eslint\b)/.test(segment) ||
      /^(?:bash|sh)\s+scripts\/agent-verify\.sh\b/.test(segment) ||
      /^git\s+diff\s+--check\b/.test(segment)
    ) {
      matches.push(segment);
    }
  }
  return matches;
}

function isVerificationCommand(command) {
  return verificationCommands(command).length > 0;
}

function verificationCommandLabel(command) {
  return verificationCommands(command).join(" && ");
}

module.exports = { isVerificationCommand, verificationCommandLabel, verificationCommands };
