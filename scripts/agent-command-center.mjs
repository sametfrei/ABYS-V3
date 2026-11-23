#!/usr/bin/env node
/**
 * ABYS Agent Command Center — yerel, SALT OKUNUR izleme paneli.
 *
 * Veri kaynağı: Claude Code'un gerçek oturum/alt-agent transkriptleri
 * (~/.claude/projects/<proje>/<session>.jsonl ve <session>/subagents/agent-*.jsonl).
 * Yalnızca doğrulanabilir alanlar gösterilir: agent kimliği, görev başlığı,
 * zaman damgaları, Write/Edit ile dokunulan dosyalar, çalıştırılan doğrulama
 * komutları ve araç hataları. Sahte ilerleme yüzdesi üretilmez.
 *
 * Güvenlik: yalnızca 127.0.0.1'e bağlanır; yalnızca GET kabul eder; hiçbir
 * dosya yazmaz; transkript içeriğini (komut çıktısı, dosya içeriği, env)
 * ekrana basmaz. Sırlar panelde görünmez.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isVerificationCommand, verificationCommandLabel } = require("./command-classification.cjs");

const PROJECT_DIR = path.join(
  homedir(),
  ".claude",
  "projects",
  "-Users-sametozcan-ABYS-V3"
);
const REPO_DIR = path.resolve(process.cwd());
const HOST = "127.0.0.1";
const PORT = Number(process.env.AGENT_CENTER_PORT ?? 3200);
const ACTIVE_WINDOW_MS = 90_000;
const MAX_LOOKBACK_SESSIONS = 25;
const CODEX_SESSIONS_DIR = path.join(homedir(), ".codex", "sessions");
const CODEX_CONFIG_FILE = path.join(homedir(), ".codex", "config.toml");
const ROADMAP_FILE = path.join(REPO_DIR, "docs", "ROADMAP.md");
const CONSTITUTION_FILE = path.join(REPO_DIR, "docs", "PRODUCT-CONSTITUTION.md");
const ORGANIZATION_FILE = path.join(REPO_DIR, "docs", "agents", "organization.json");

const SPECIALISTS = [
  ["codebase-architect", "Kod Tabanı Mimarı", "Salt okunur araştırma"],
  ["data-integration-engineer", "Veri & Entegrasyon", "Şema, repo, konnektör"],
  ["intelligence-engineer", "Zekâ Motoru", "KPI, risk, senaryo"],
  ["frontend-ux-engineer", "Frontend & UX", "Ekranlar, bileşenler"],
  ["security-qa-reviewer", "Güvenlik & QA", "Bağımsız denetim"],
];

function loadOrganization() {
  try {
    const parsed = JSON.parse(readFileSync(ORGANIZATION_FILE, "utf8"));
    const roles = [];
    const departments = [];
    if (parsed?.root) {
      roles.push({
        ...parsed.root,
        level: 1,
        departmentKey: null,
        departmentName: "Yönetim",
        aliases: parsed.root.aliases ?? [],
      });
    }
    for (const department of parsed?.departments ?? []) {
      departments.push({
        key: department.key,
        name: department.name,
        directorKey: department.director?.key ?? null,
      });
      if (department.director) {
        roles.push({
          ...department.director,
          level: 2,
          departmentKey: department.key,
          departmentName: department.name,
          aliases: department.director.aliases ?? [],
        });
      }
      for (const specialist of department.specialists ?? []) {
        roles.push({
          ...specialist,
          level: 3,
          departmentKey: department.key,
          departmentName: department.name,
          aliases: specialist.aliases ?? [],
        });
      }
    }
    if (!parsed?.root || departments.length !== 5 || roles.length !== 31) {
      return { source: relative(ORGANIZATION_FILE), valid: false, roles, departments, raw: parsed };
    }
    return {
      source: relative(ORGANIZATION_FILE),
      valid: true,
      roles,
      departments,
      operatingModel: parsed.operatingModel ?? {},
      raw: parsed,
    };
  } catch (error) {
    return {
      source: relative(ORGANIZATION_FILE),
      valid: false,
      roles: [],
      departments: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const ORGANIZATION = loadOrganization();
const ORGANIZATION_ROLES = ORGANIZATION.roles.length > 0
  ? ORGANIZATION.roles
  : SPECIALISTS.map(([key, name, focus]) => ({
      key,
      name,
      focus,
      title: name,
      level: 3,
      departmentKey: "legacy",
      departmentName: "Eski uzman profilleri",
      aliases: [],
    }));
const ROLE_BY_KEY = new Map(ORGANIZATION_ROLES.map((role) => [role.key, role]));
const LEGACY_ROLE_MAP = new Map([
  ["lead", ORGANIZATION.raw?.root?.key ?? "codex-ceo"],
  ["codebase-architect", "backend-architecture-engineer"],
  ["data-integration-engineer", "synchronization-event-engineer"],
  ["frontend-ux-engineer", "frontend-platform-engineer"],
  ["intelligence-engineer", "predictive-causal-intelligence-engineer"],
  ["security-qa-reviewer", "application-security-engineer"],
]);

const ROLE_HINTS = [
  ["enterprise-protocol-engineer", /\bsoap\b|\bodata\b|\bjdbc\b|\bodbc\b|webhook|protokol/i],
  ["erp-integration-engineer", /\bsap\b|oracle|dynamics|netsuite|odoo|infor|\bifs\b|\berp\b/i],
  ["crm-integration-engineer", /salesforce|hubspot|\bcrm\b/i],
  ["synchronization-event-engineer", /senkron|scheduler|checkpoint|idempot|zamanlay/i],
  ["data-mapping-entity-resolution-engineer", /mapping|eşleme|entity resolution|golden record|altın kayıt|survivorship/i],
  ["enterprise-ontology-engineer", /ontoloji|ontology|sektör paketi|semantik model/i],
  ["knowledge-graph-engineer", /knowledge graph|bilgi graf|semantic graph|semantik graf|traversal/i],
  ["digital-twin-engineer", /digital twin|dijital ikiz|as-of|\basof\b|enterprise state/i],
  ["predictive-causal-intelligence-engineer", /forecast|tahmin|anomali|anomaly|\bkpi\b|nedensel|causal/i],
  ["decision-science-optimization-engineer", /optimiz|monte carlo|senaryo|scenario|karar ekonomisi|decision economics/i],
  ["database-persistence-engineer", /migration|repository|pglite|postgres|\bsql\b|şema|schema/i],
  ["api-contract-engineer", /\bapi\b|\brest\b|graphql|sözleşme|contract/i],
  ["performance-engineer", /performans|performance|query plan|profiling|ölçeklen/i],
  ["developer-experience-engineer", /developer experience|\bdx\b|build|eslint|dokümantasyon|tooling/i],
  ["executive-ux-engineer", /executive ux|30 seconds|30 saniye|yönetici deneyimi/i],
  ["frontend-platform-engineer", /frontend|next\.js|react|typescript|bileşen|component/i],
  ["executive-dashboard-engineer", /dashboard|intelligence center|karar yüzeyi/i],
  ["data-visualization-engineer", /grafik|chart|görselleştirme|visualization|trend/i],
  ["design-systems-accessibility-engineer", /erişilebilirlik|accessibility|design system|tasarım sistemi/i],
  ["identity-tenant-security-engineer", /\bauth\b|tenant|oturum|session|\brbac\b|oidc|kimlik/i],
  ["audit-governance-engineer", /audit|denetim|governance|provenance|policy|politika/i],
  ["test-automation-engineer", /\btest\b|vitest|regresyon|regression|e2e/i],
  ["reliability-observability-engineer", /health|observability|reliability|güvenilirlik|izleme|monitoring/i],
  ["application-security-engineer", /güvenlik|security|ssrf|zafiyet|vulnerability/i],
  ["backend-architecture-engineer", /mimari|architecture|refactor|kod taban|service boundary/i],
];

const cache = new Map();

function readLines(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Yarım yazılmış son satır olabilir; yok say.
    }
  }
  return out;
}

function listTopLevelSessions() {
  try {
    return readdirSync(PROJECT_DIR)
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => {
        const p = path.join(PROJECT_DIR, n);
        return { id: n.slice(0, -6), file: p, mtime: statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, MAX_LOOKBACK_SESSIONS);
  } catch {
    return [];
  }
}

/** Agent tool çağrıları ile dönen agentId'leri eşle. */
function readAgentMeta() {
  const meta = new Map();
  const pending = new Map();
  for (const session of listTopLevelSessions()) {
    for (const entry of readLines(session.file)) {
      const blocks = entry?.message?.content;
      if (!Array.isArray(blocks)) continue;
      for (const b of blocks) {
        if (b?.type === "tool_use" && b.name === "Agent") {
          pending.set(b.id, {
            description: String(b.input?.description ?? "").slice(0, 140),
            subagentType: String(b.input?.subagent_type ?? "unknown"),
          });
        } else if (b?.type === "tool_result" && pending.has(b.tool_use_id)) {
          const text =
            typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
          const m = text.match(/agentId:\s*([a-z0-9]+)/i);
          if (m) {
            const info = pending.get(b.tool_use_id);
            meta.set(m[1], info);
          }
          pending.delete(b.tool_use_id);
        }
      }
    }
  }
  return meta;
}

function subagentFiles() {
  const files = new Set();
  for (const session of listTopLevelSessions()) {
    const dir = path.join(PROJECT_DIR, session.id, "subagents");
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      const m = n.match(/^agent-([a-z0-9]+)\.jsonl$/i);
      if (m) files.add(path.join(dir, n));
    }
  }
  return [...files];
}

function relative(file) {
  if (!file) return "";
  const abs = path.resolve(file);
  return abs.startsWith(REPO_DIR + path.sep) ? abs.slice(REPO_DIR.length + 1) : abs;
}

function parseAgent(file) {
  const key = file;
  let mtime = 0;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const cached = cache.get(key);
  if (cached && cached.mtime === mtime) return cached.value;

  const lines = readLines(file);
  let start = null;
  let end = null;
  let handback = false;
  const touched = new Set();
  const pendingCmds = new Map();
  const checks = [];
  const errors = [];
  const toolCounts = {};

  for (const entry of lines) {
    const ts = entry?.timestamp ? Date.parse(entry.timestamp) : null;
    if (ts && Number.isFinite(ts)) {
      if (start === null || ts < start) start = ts;
      if (end === null || ts > end) end = ts;
    }
    const blocks = entry?.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (b?.type === "tool_use") {
        toolCounts[b.name] = (toolCounts[b.name] ?? 0) + 1;
        if (["Write", "Edit", "NotebookEdit"].includes(b.name)) {
          const fp = b.input?.file_path;
          if (typeof fp === "string") touched.add(relative(fp));
        }
        if (b.name === "Bash" && typeof b.input?.command === "string" && isVerificationCommand(b.input.command)) {
          pendingCmds.set(b.id, verificationCommandLabel(b.input.command).slice(0, 160));
        }
        if (b.name === "SubagentHandback") handback = true;
      } else if (b?.type === "tool_result") {
        const cmd = pendingCmds.get(b.tool_use_id);
        if (cmd) {
          const text =
            typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
          const failed =
            b.is_error === true || /\b(failed|FAIL|error TS|✖)/.test(text);
          checks.push({ cmd, result: failed ? "failed" : "passed" });
          pendingCmds.delete(b.tool_use_id);
        }
        if (b.is_error === true) {
          const text =
            typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
          errors.push(text.replace(/\s+/g, " ").slice(0, 140));
        }
      }
    }
  }

  const age = Date.now() - mtime;
  const status = handback ? "completed" : age < ACTIVE_WINDOW_MS ? "working" : "stopped";

  const value = {
    id: path.basename(file).replace(/^agent-|\.jsonl$/g, ""),
    status,
    start,
    end,
    lastActivity: mtime,
    handback,
    files: [...touched],
    checks: checks.slice(-6),
    errors: errors.slice(-3),
    errorCount: errors.length,
    tools: Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  };
  cache.set(key, { mtime, value });
  return value;
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(file));
    else out.push(file);
  }
  return out;
}

function listCodexSessionFiles() {
  return walkFiles(CODEX_SESSIONS_DIR)
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => {
      try {
        const meta = readLines(file).find((entry) => entry?.type === "session_meta")?.payload;
        const cwd = typeof meta?.cwd === "string" ? path.resolve(meta.cwd) : null;
        if (cwd !== REPO_DIR) return null;
        return { file, mtime: statSync(file).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_LOOKBACK_SESSIONS);
}

function firstText(payload) {
  const content = payload?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

function clip(value, max = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isTaskMessage(text) {
  return Boolean(text) && !/^<(?:subagent_notification|turn_aborted)\b/i.test(text);
}

function canonicalRoleKey(role) {
  const raw = String(role ?? "").trim();
  if (ROLE_BY_KEY.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (LEGACY_ROLE_MAP.has(lower)) return LEGACY_ROLE_MAP.get(lower);
  const byName = ORGANIZATION_ROLES.find(
    (item) => item.name.toLowerCase() === lower || item.key.toLowerCase() === lower
  );
  if (byName) return byName.key;
  return ORGANIZATION.raw?.root?.key ?? "codex-ceo";
}

function inferRole(text) {
  const lower = String(text ?? "").toLowerCase();
  for (const role of ORGANIZATION_ROLES) {
    const names = [role.name, role.title, ...(role.aliases ?? [])]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    if (names.some((name) => name.length >= 4 && lower.includes(name))) return role.key;
  }
  for (const [role, pattern] of ROLE_HINTS) {
    if (pattern.test(text)) return role;
  }
  return ORGANIZATION.raw?.root?.key ?? "codex-ceo";
}

function patchFiles(command) {
  const files = new Set();
  const filePattern = /^\s*\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$/gm;
  let match;
  while ((match = filePattern.exec(command)) !== null) files.add(relative(match[1].trim()));
  return [...files];
}

function checkResult(output) {
  const exit = /\bProcess exited with code\s+(\d+)\b/i.exec(output);
  if (exit) return Number(exit[1]) === 0 ? "passed" : "failed";
  if (/\b(?:FAIL(?:ED)?|✖|error TS|Process exited with code\s+[1-9])\b/i.test(output)) {
    return "failed";
  }
  if (/\b(?:All checks passed|\d+ passed|Successfully compiled|Compiled successfully)\b/i.test(output)) {
    return "passed";
  }
  return "unknown";
}

function parseCodexSession(file) {
  const key = `codex:${file}`;
  let mtime = 0;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const cached = cache.get(key);
  if (cached && cached.mtime === mtime) return cached.value;

  const lines = readLines(file);
  const meta = lines.find((x) => x?.type === "session_meta")?.payload ?? {};
  const firstPrompt = lines
    .filter((x) => x?.type === "response_item" && x.payload?.type === "message" && x.payload?.role === "user")
    .map((x) => firstText(x.payload))
    .find(isTaskMessage) ?? "";
  const userMessages = lines
    .filter((x) => x?.type === "response_item" && x.payload?.type === "message" && x.payload?.role === "user")
    .map((x) => firstText(x.payload))
    .filter(isTaskMessage);
  const assistantMessages = lines
    .filter((x) => x?.type === "response_item" && x.payload?.type === "message" && x.payload?.role === "assistant")
    .map((x) => firstText(x.payload))
    .filter(Boolean);

  let taskState = "unknown";
  let taskStartedAt = null;
  let taskEndedAt = null;
  const files = new Set();
  const checkCalls = new Map();
  const checks = [];
  let errorCount = 0;
  let lastCommand = "";

  for (const line of lines) {
    const payload = line?.payload;
    if (!payload) continue;
    if (line.type === "event_msg") {
      if (payload.type === "task_started") {
        taskState = "working";
        taskStartedAt = payload.started_at
          ? payload.started_at * 1000
          : line.timestamp
            ? Date.parse(line.timestamp)
            : taskStartedAt;
      } else if (payload.type === "task_complete") {
        taskState = "completed";
        taskEndedAt = payload.completed_at
          ? payload.completed_at * 1000
          : line.timestamp
            ? Date.parse(line.timestamp)
            : taskEndedAt;
      } else if (payload.type === "turn_aborted") {
        taskState = "stopped";
        taskEndedAt = payload.completed_at
          ? payload.completed_at * 1000
          : line.timestamp
            ? Date.parse(line.timestamp)
            : taskEndedAt;
      }
      continue;
    }

    if (line.type !== "response_item") continue;
    if (payload.type === "function_call") {
      let args = {};
      try {
        args = typeof payload.arguments === "string" ? JSON.parse(payload.arguments) : payload.arguments ?? {};
      } catch {
        args = {};
      }
      const command = typeof args?.cmd === "string" ? args.cmd : "";
      if (command) lastCommand = clip(command, 160);
      if (command) for (const filePath of patchFiles(command)) files.add(filePath);
      if (payload.name === "apply_patch" && typeof args?.command === "string") {
        for (const filePath of patchFiles(args.command)) files.add(filePath);
      }
      if (command && isVerificationCommand(command)) {
        checkCalls.set(payload.call_id ?? payload.id, clip(verificationCommandLabel(command), 160));
      }
    } else if (payload.type === "function_call_output") {
      const cmd = checkCalls.get(payload.call_id);
      if (cmd) {
        const output = typeof payload.output === "string" ? payload.output : "";
        const result = checkResult(output);
        checks.push({ cmd, result });
        if (result === "failed") errorCount++;
        checkCalls.delete(payload.call_id);
      }
    }
  }

  const startTimes = lines
    .map((x) => (x?.timestamp ? Date.parse(x.timestamp) : NaN))
    .filter(Number.isFinite);
  const startedAt = startTimes.length > 0 ? Math.min(...startTimes) : null;
  const lastActivity = mtime;
  const activePrompt = userMessages.at(-1) || firstPrompt;
  const inferredRole = inferRole(activePrompt);
  const isSubagent = Boolean(meta.source?.subagent) || meta.thread_source === "subagent";
  const status =
    taskState === "unknown" && Date.now() - lastActivity < ACTIVE_WINDOW_MS ? "working" : taskState;
  const value = {
    id: meta.id ?? path.basename(file),
    nickname: meta.agent_nickname ?? null,
    role: isSubagent ? inferredRole : (ORGANIZATION.raw?.root?.key ?? "lead"),
    source: isSubagent ? "subagent" : meta.thread_source ?? "codex",
    threadSource: meta.thread_source ?? null,
    parentId: meta.parent_thread_id ?? null,
    status,
    taskState,
    start: startedAt,
    end: taskEndedAt,
    lastActivity,
    task: clip(activePrompt || "(görev başlığı kaydı yok)"),
    firstPrompt: clip(firstPrompt),
    activity: clip(assistantMessages.at(-1) ?? lastCommand ?? ""),
    files: [...files],
    checks: checks.slice(-6),
    errors: [],
    errorCount,
    tools: [],
    file,
  };
  cache.set(key, { mtime, value });
  return value;
}

function parseRoadmap() {
  const statuses = ["E2E (test)", "Kısmi", "Tarayıcı bekliyor", "Dış kimlik gerekir", "Planlı"];
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const capabilities = [];
  if (existsSync(ROADMAP_FILE)) {
    const lines = readFileSync(ROADMAP_FILE, "utf8").split("\n");
    for (const line of lines) {
      if (!line.startsWith("|")) continue;
      const columns = line.split("|").slice(1, -1).map((column) => column.trim());
      if (columns.length < 3 || !statuses.includes(columns[1])) continue;
      counts[columns[1]] += 1;
      capabilities.push({ name: columns[0], status: columns[1] });
    }
  }
  let phase = "Kayıtlı aşama yok";
  if (existsSync(CONSTITUTION_FILE)) {
    const text = readFileSync(CONSTITUTION_FILE, "utf8");
    const match = text.match(/^#{2,3}\s+(Phase\s+[^\n]+?)\s*$/m);
    if (match) phase = match[1].replace(/progress record.*/i, "").trim();
  }
  if (phase === "Kayıtlı aşama yok" && existsSync(ROADMAP_FILE)) {
    const text = readFileSync(ROADMAP_FILE, "utf8");
    const match = text.match(/^#{2,3}\s+(Phase\s+[^\n]+?)\s*$/m);
    if (match) phase = match[1].replace(/progress record.*/i, "").trim();
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    phase,
    counts,
    total,
    verified: counts["E2E (test)"],
    completedCapabilities: capabilities
      .filter((capability) => capability.status === "E2E (test)")
      .slice(0, 6),
    queuedCapabilities: capabilities.filter((capability) => capability.status !== "E2E (test)"),
    source: relative(ROADMAP_FILE),
  };
}

function readRuntimeConfig() {
  const result = {
    file: relative(CODEX_CONFIG_FILE),
    readable: false,
    sandboxMode: null,
    approvalPolicy: null,
    approvalsReviewer: null,
    agentsEnabled: null,
    maxConcurrentThreads: null,
    source: "yapılandırma okunamadı",
  };
  try {
    const text = readFileSync(CODEX_CONFIG_FILE, "utf8");
    result.readable = true;
    const values = new Map();
    let section = "";
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/\s+#.*$/, "").trim();
      if (!line) continue;
      const sectionMatch = line.match(/^\[([^\]]+)]$/);
      if (sectionMatch) {
        section = sectionMatch[1].trim();
        continue;
      }
      const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
      if (!assignment) continue;
      const key = section ? `${section}.${assignment[1]}` : assignment[1];
      values.set(key, assignment[2].trim().replace(/^["']|["']$/g, ""));
    }
    const value = (key) => {
      return values.get(key) ?? null;
    };
    result.sandboxMode = value("sandbox_mode");
    result.approvalPolicy = value("approval_policy");
    result.approvalsReviewer = value("approvals_reviewer");
    result.agentsEnabled = value("agents.enabled");
    result.maxConcurrentThreads = Number(
      value("agents.max_concurrent_threads_per_session") ??
      value("features.multi_agent_v2.max_concurrent_threads_per_session") ??
      NaN
    );
    if (!Number.isFinite(result.maxConcurrentThreads)) result.maxConcurrentThreads = null;
    result.source = "~/.codex/config.toml";
  } catch {
    // Yapılandırma okunamazsa manifest varsayılanı kullanılır; bu gerçek değer gibi gösterilmez.
  }
  return result;
}

function snapshot() {
  const meta = readAgentMeta();
  const claudeRuns = [];
  for (const file of subagentFiles()) {
    const parsed = parseAgent(file);
    if (!parsed) continue;
    const info = meta.get(parsed.id) ?? {};
    claudeRuns.push({
      ...parsed,
      role: canonicalRoleKey(info.subagentType ?? "unknown"),
      task: info.description || "(görev başlığı kaydı yok)",
      source: "claude",
    });
  }
  claudeRuns.sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));

  const codexSessions = listCodexSessionFiles()
    .map(({ file }) => parseCodexSession(file))
    .filter(Boolean)
    .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
  const codexRuns = codexSessions.map((session) => ({
    id: session.id,
    status: session.status,
    start: session.start,
    end: session.end,
    lastActivity: session.lastActivity,
    task: session.task,
    activity: session.activity,
    files: session.files,
    checks: session.checks,
    errors: session.errors,
    errorCount: session.errorCount,
    tools: session.tools,
    role: session.role,
    source: "codex",
    nickname: session.nickname,
  }));
  const runs = [...claudeRuns, ...codexRuns].sort(
    (a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0)
  );
  const roadmap = parseRoadmap();
  const checks = runs
    .flatMap((run) => (run.checks ?? []).map((check) => ({ ...check, run })))
    .filter((check) => check.result === "passed" || check.result === "failed")
    .sort((a, b) => (b.run.lastActivity ?? 0) - (a.run.lastActivity ?? 0));
  const lastIntegration = checks.find((check) => check.result === "passed") ?? null;
  const failedChecks = checks.filter((check) => check.result === "failed");

  const roster = ORGANIZATION_ROLES.map((role) => {
    const mine = runs.filter((r) => r.role === role.key);
    const active = mine.find((r) => r.status === "working") ?? null;
    return {
      key: role.key,
      name: role.name,
      title: role.title ?? role.name,
      focus: role.focus,
      level: role.level,
      departmentKey: role.departmentKey,
      departmentName: role.departmentName,
      active: Boolean(active),
      instantiated: mine.length > 0,
      status: active ? "active" : mine.length > 0 ? "instantiated" : "defined",
      runCount: mine.length,
      lastRun: mine[0] ?? null,
      runs: mine.slice(0, 4),
    };
  });

  const runtimeConfig = readRuntimeConfig();
  const organization = {
    valid: ORGANIZATION.valid,
    source: ORGANIZATION.source,
    definedRoles: roster.length,
    directors: roster.filter((role) => role.level === 2).length,
    specialists: roster.filter((role) => role.level === 3).length,
    departments: ORGANIZATION.departments,
    instantiated: roster.filter((role) => role.instantiated).length,
    active: roster.filter((role) => role.active).length,
    concurrency: {
      initialTarget: ORGANIZATION.operatingModel?.initialConcurrency ?? 8,
      expansionLadder: ORGANIZATION.operatingModel?.expansionLadder ?? [8, 12, 16, 20, 24, 30],
      configured: runtimeConfig.maxConcurrentThreads,
      source: runtimeConfig.maxConcurrentThreads === null ? "manifest / doğrulanmadı" : runtimeConfig.source,
    },
  };

  const tasks = {
    running: runs.filter((run) => run.status === "working"),
    completed: runs.filter((run) => run.status === "completed"),
    stopped: runs.filter((run) => run.status === "stopped"),
    queued: roadmap.queuedCapabilities.map((capability) => ({
      id: `roadmap:${capability.name}`,
      role: "roadmap",
      status: "queued",
      source: "roadmap",
      task: capability.name,
      activity: capability.status,
      files: [],
      checks: [],
      errors: [],
      errorCount: 0,
    })),
    failedChecks,
  };

  return {
    generatedAt: Date.now(),
    repo: REPO_DIR,
    organization,
    runtimeConfig,
    roster,
    runs,
    codex: {
      connected: codexSessions.length > 0,
      source: relative(CODEX_SESSIONS_DIR),
      sessionCount: codexSessions.length,
      activeCount: codexSessions.filter((session) => session.status === "working").length,
      sessions: codexSessions.map((session) => ({
        id: session.id,
        nickname: session.nickname,
        role: session.role,
        status: session.status,
        task: session.task,
        activity: session.activity,
        lastActivity: session.lastActivity,
        source: session.source,
      })),
    },
    roadmap,
    tasks,
    lastSuccessfulIntegration: lastIntegration
      ? {
          cmd: lastIntegration.cmd,
          role: lastIntegration.run.role,
          source: lastIntegration.run.source,
          at: lastIntegration.run.lastActivity,
        }
      : null,
  };
}

const HTML = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ABYS Agent Command Center</title>
<style>
:root{--bg:#0f1420;--panel:#171e2e;--line:#26304a;--ink:#e7ecf7;--muted:#93a0bd;--ok:#3ddc97;--work:#f5b942;--bad:#ff6b6b;--idle:#6b7894;--accent:#6ea8fe}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:18px 24px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
h1{font-size:18px;margin:0;letter-spacing:.2px}.sub{color:var(--muted);font-size:12px}
main{padding:20px 24px;display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card h2{font-size:14px;margin:0 0 2px}.focus{color:var(--muted);font-size:12px;margin-bottom:10px}
.badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.4px}
.working{background:rgba(245,185,66,.16);color:var(--work)}.completed{background:rgba(61,220,151,.14);color:var(--ok)}
.stopped{background:rgba(255,107,107,.14);color:var(--bad)}.idle{background:rgba(107,120,148,.18);color:var(--idle)}
.row{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:6px 0}
.task{font-weight:600;margin:8px 0 2px}.t{color:var(--muted);font-size:11px}
.files{margin:6px 0 0;padding-left:16px;font-size:12px;color:#c9d4ea}.files li{word-break:break-all}
.checks{display:flex;flex-direction:column;gap:3px;margin-top:6px;font-size:12px}
.check{display:flex;justify-content:space-between;gap:8px;background:#111827;border:1px solid var(--line);border-radius:7px;padding:4px 8px}
.pass{color:var(--ok)}.fail{color:var(--bad)}
.muted{color:var(--muted)}.empty{color:var(--muted);font-size:12px;font-style:italic}
.err{color:var(--bad);font-size:11px;margin-top:4px}
footer{padding:12px 24px;color:var(--muted);font-size:11px;border-top:1px solid var(--line)}
.overview{padding:18px 24px 0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.stat .label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px}.stat .value{font-size:16px;font-weight:700;margin-top:3px}.stat .detail{color:var(--muted);font-size:11px;margin-top:4px}
.board{padding:14px 24px 0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.board-col{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.board-col h3{font-size:13px;margin:0 0 8px}.task-item{border-top:1px solid var(--line);padding:8px 0;font-size:12px}.task-item:first-of-type{border-top:0;padding-top:2px}
.task-title{font-weight:600}.task-meta{color:var(--muted);font-size:11px;margin-top:3px}.task-activity{color:#c9d4ea;font-size:11px;margin-top:3px;word-break:break-word}
.link{color:var(--accent);text-decoration:none}.link:hover{text-decoration:underline}
@media(max-width:700px){main{padding:14px}.overview,.board{padding:14px 14px 0}h1{font-size:16px}}
</style></head><body>
<header><h1>ABYS Agent Command Center</h1><span class="sub">salt okunur · yalnızca 127.0.0.1 · Claude + Codex gerçek oturum verisi</span><span class="sub" id="gen"></span></header>
<section class="overview" id="overview"></section>
<section class="board" id="board"></section>
<main id="grid"></main>
<footer>Claude Code transkriptleri ve Codex rollout JSONL dosyaları salt okunur izlenir. Gösterilmeyen bilgi yoksa "kayıt yok" yazar; tahmini ilerleme veya sahte agent aktivitesi üretilmez. Canlı uygulama: <a class="link" href="http://127.0.0.1:3100" target="_blank" rel="noreferrer">127.0.0.1:3100</a></footer>
<script>
const fmt=t=>t?new Date(t).toLocaleString("tr-TR"):"—";
const dur=(a,b)=>{if(!a||!b)return"—";const s=Math.max(0,Math.round((b-a)/1000));return s<60?s+" sn":Math.floor(s/60)+" dk "+(s%60)+" sn"};
function statusBadge(s){const m={working:["working","Çalışıyor"],completed:["completed","Tamamlandı"],stopped:["stopped","Durduruldu"],unknown:["idle","Kayıt bekliyor"]};const entry=m[s]||["idle","Bilinmiyor"];return '<span class="badge '+entry[0]+'">'+entry[1]+'</span>'}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function runHtml(r){return '<div class="task">'+esc(r.task||"—")+'</div>'+
 '<div class="row">'+statusBadge(r.status)+'<span class="t">'+fmt(r.start)+' → '+fmt(r.end)+' · '+dur(r.start,r.end)+'</span></div>'+
 (r.activity?'<div class="task-activity">'+esc(r.activity)+'</div>':'')+
 ((r.files&&r.files.length)?'<ul class="files">'+r.files.slice(0,10).map(f=>'<li>'+esc(f)+'</li>').join("")+(r.files.length>10?'<li>+'+(r.files.length-10)+' dosya</li>':'')+'</ul>':'<div class="empty">Dosya değişikliği kaydı yok</div>')+
 ((r.checks&&r.checks.length)?'<div class="checks">'+r.checks.map(c=>'<div class="check"><span>'+esc(c.cmd)+'</span><span class="'+(c.result==="passed"?"pass":"fail")+'">'+c.result+'</span></div>').join("")+'</div>':'')+
 (r.errorCount?'<div class="err">'+r.errorCount+' araç hatası</div>':'')}
function taskHtml(t){return '<div class="task-item"><div class="task-title">'+esc(t.role||t.nickname||'atanmamış')+' · '+esc(t.task||'görev kaydı yok')+'</div>'+
 '<div class="task-meta">'+esc(t.source||'')+' · son aktivite '+fmt(t.lastActivity)+'</div>'+
 (t.activity?'<div class="task-activity">'+esc(t.activity)+'</div>':'')+
 ((t.files&&t.files.length)?'<div class="task-activity">dosyalar: '+esc(t.files.slice(0,4).join(', '))+(t.files.length>4?' +'+(t.files.length-4):'')+'</div>':'')+'</div>'}
function overviewHtml(d){const r=d.roadmap||{};const c=d.codex||{};const org=d.organization||{};const cfg=d.runtimeConfig||{};const last=d.lastSuccessfulIntegration;const counts=Object.entries(r.counts||{}).map(([k,v])=>k+': '+v).join(' · ');const active=Number(org.active||0);
return '<div class="stat"><div class="label">Aktif aşama (kayıtlı)</div><div class="value">'+esc(r.phase||'Kayıt yok')+'</div><div class="detail">'+esc(r.source||'')+'</div></div>'+
 '<div class="stat"><div class="label">Yol haritası kanıtı</div><div class="value">'+Number(r.verified||0)+' / '+Number(r.total||0)+' doğrulanmış</div><div class="detail">'+esc(counts||'Kayıt yok')+'</div></div>'+
 '<div class="stat"><div class="label">Organizasyon</div><div class="value">'+Number(org.definedRoles||0)+' rol · '+Number(org.instantiated||0)+' örneklenmiş · '+active+' aktif</div><div class="detail">'+Number(org.directors||0)+' direktör · '+Number(org.specialists||0)+' uzman · eşzamanlı hedef '+Number(org.concurrency?.configured ?? org.concurrency?.initialTarget ?? 8)+'</div></div>'+
 '<div class="stat"><div class="label">Codex köprüsü</div><div class="value">'+(c.connected?'Bağlı':'Kayıt yok')+' · '+active+' aktif rol</div><div class="detail">'+Number(c.sessionCount||0)+' oturum · '+Number(c.activeCount||0)+' aktif oturum · '+esc(c.source||'')+' · '+esc(cfg.approvalPolicy||'approval kaydı yok')+'</div></div>'+
 '<div class="stat"><div class="label">Son başarılı entegrasyon</div><div class="value">'+(last?fmt(last.at):'Henüz yok')+'</div><div class="detail">'+esc(last?((last.role||'')+' · '+last.cmd):'Başarılı doğrulama kaydı yok')+'</div></div>'}
function boardHtml(d){const t=d.tasks||{};const cols=[['Çalışıyor',t.running||[]],['Tamamlandı',t.completed||[]],['Durdurulan / engel',t.stopped||[]],['Kuyruk (gerçek kayıt)',t.queued||[]]];return cols.map(pair=>'<section class="board-col"><h3>'+pair[0]+' · '+pair[1].length+'</h3>'+(pair[1].length?pair[1].slice(0,5).map(taskHtml).join(''):'<div class="empty">Kayıt yok</div>')+(pair[1].length>5?'<div class="task-meta">+'+(pair[1].length-5)+' kayıt</div>':'')+'</section>').join('')}
async function tick(){try{const response=await fetch("/api/state",{cache:"no-store"});const d=await response.json();
 document.getElementById("gen").textContent="güncellendi: "+new Date(d.generatedAt).toLocaleTimeString("tr-TR");
 document.getElementById("overview").innerHTML=overviewHtml(d);
 document.getElementById("board").innerHTML=boardHtml(d);
 document.getElementById("grid").innerHTML=d.roster.map(a=>{
   const runs=a.runs||[];
   const badge=a.active?statusBadge("working"):'<span class="badge idle">'+(a.instantiated?'Örneklenmiş':'Tanımlı')+'</span>';
   return '<section class="card"><div class="row"><h2>'+esc(a.name)+'</h2>'+badge+'</div>'+
   '<div class="focus">'+esc(a.departmentName||'')+' · Seviye '+Number(a.level||0)+' · '+esc(a.focus||'')+' · son çalışma: '+a.runCount+'</div>'+
   (runs.length?runs.map(runHtml).join('<hr style="border:0;border-top:1px solid var(--line);margin:10px 0">'):'<div class="empty">Bu oturumda çalışma kaydı yok</div>')+
   '</section>'}).join("");
}catch(e){document.getElementById("gen").textContent="bağlantı hatası"}}
tick();setInterval(tick,3000);
</script></body></html>`;

const server = createServer((req, res) => {
  const host = (req.headers.host ?? "").split(":")[0];
  if (req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Yalnızca GET");
    return;
  }
  // Yalnızca localhost Host başlığı (DNS rebinding'e karşı ek kontrol).
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Yalnızca localhost");
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(HTML);
    return;
  }
  if (url.pathname === "/api/state") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(snapshot()));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Bulunamadı");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} zaten kullanımda. AGENT_CENTER_PORT ile başka bir port seçin.`);
  } else if (error.code === "EPERM") {
    console.error(`Port ${PORT} bağlanamadı (EPERM). Sandbox/izin kısıtı olmadan çalıştırın.`);
  } else {
    console.error(`Sunucu başlatılamadı: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`ABYS Agent Command Center: http://${HOST}:${PORT}`);
  console.log(`Proje: ${REPO_DIR}`);
});
