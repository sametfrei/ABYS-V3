#!/usr/bin/env node
/**
 * PreToolUse (Bash) guard — yalnızca subagent'lar için.
 *
 * Claude Code hook girdisinde `agent_type` yalnızca hook bir subagent içinde
 * çalışırken bulunur. Ana oturumda (Lead Architect) alan yoktur; Lead serbesttir.
 *
 * - codebase-architect / security-qa-reviewer: yalnızca git diff|status|log|show
 * - diğer subagent'lar: commit/push/reset/stash/checkout/clean... ve
 *   npm install/ci/publish engellenir; test/lint/tsc ve salt-okunur git serbest.
 *
 * Çıkış: exit 0 + hookSpecificOutput.permissionDecision = "deny" (blok).
 */
import { readFileSync } from "node:fs";

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const agentType = input.agent_type || "";
if (!agentType) process.exit(0); // Ana oturum: guard uygulanmaz.

const cmd = input?.tool_input?.command ?? "";

const segments = cmd
  .split(/&&|\|\||;|\n|\|/)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => s.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, "")) // FOO=1 git commit
  .map((s) => s.replace(/^env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ""))
  .map((s) => s.replace(/^(?:sudo|command|exec)\s+/, ""))
  .map((s) => s.replace(/^cd\s+\S+\s*$/, ""))
  .filter(Boolean);

const GIT = /^git\s+(?:-C\s+\S+\s+)?/;
const gitRead = /^git\s+(?:-C\s+\S+\s+)?(?:diff|status|log|show)\b/;
const readonlyAgents = new Set(["codebase-architect", "security-qa-reviewer"]);

if (readonlyAgents.has(agentType)) {
  for (const seg of segments) {
    if (!gitRead.test(seg)) {
      deny(`Salt-okunur agent yalnızca git diff/status/log/show çalıştırabilir: ${seg}`);
    }
  }
  process.exit(0);
}

const forbidden = [
  new RegExp(
    `${GIT.source}(?:commit|push|reset|checkout|clean|rebase|stash|merge|tag|cherry-pick|switch|restore|add|rm|mv)\\b`
  ),
  /^npm\s+(?:install|ci|publish|uninstall|link|rebuild)\b/,
  /^(?:rm\s+-[rf]{1,2}\b|rm\s+--recursive\b|sudo\b|curl\b|wget\b|ssh\b|scp\b|rsync\b|nc\b|ncat\b|telnet\b)/,
  /^claude\b/,
];

for (const seg of segments) {
  if (forbidden.some((re) => re.test(seg))) {
    deny(`Subagent bu komutu çalıştıramaz: ${seg}`);
  }
}

process.exit(0);
