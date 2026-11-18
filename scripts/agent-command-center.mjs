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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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

const SPECIALISTS = [
  ["codebase-architect", "Kod Tabanı Mimarı", "Salt okunur araştırma"],
  ["data-integration-engineer", "Veri & Entegrasyon", "Şema, repo, konnektör"],
  ["intelligence-engineer", "Zekâ Motoru", "KPI, risk, senaryo"],
  ["frontend-ux-engineer", "Frontend & UX", "Ekranlar, bileşenler"],
  ["security-qa-reviewer", "Güvenlik & QA", "Bağımsız denetim"],
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

const TEST_CMD = /\b(vitest|tsc|eslint|agent-verify|npm test)\b/;

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
        if (b.name === "Bash" && typeof b.input?.command === "string" && TEST_CMD.test(b.input.command)) {
          pendingCmds.set(b.id, b.input.command.slice(0, 160));
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

function snapshot() {
  const meta = readAgentMeta();
  const runs = [];
  for (const file of subagentFiles()) {
    const parsed = parseAgent(file);
    if (!parsed) continue;
    const info = meta.get(parsed.id) ?? {};
    runs.push({
      ...parsed,
      role: info.subagentType ?? "unknown",
      task: info.description || "(görev başlığı kaydı yok)",
    });
  }
  runs.sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));

  const roster = SPECIALISTS.map(([key, name, focus]) => {
    const mine = runs.filter((r) => r.role === key);
    const active = mine.find((r) => r.status === "working") ?? null;
    return {
      key,
      name,
      focus,
      active: Boolean(active),
      runCount: mine.length,
      lastRun: mine[0] ?? null,
      runs: mine.slice(0, 4),
    };
  });

  return {
    generatedAt: Date.now(),
    repo: REPO_DIR,
    roster,
    runs,
    lead: { name: "Lead Architect", role: "Koordinatör", active: true },
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
</style></head><body>
<header><h1>ABYS Agent Command Center</h1><span class="sub">salt okunur · yalnızca 127.0.0.1 · gerçek transkript verisi</span><span class="sub" id="gen"></span></header>
<main id="grid"></main>
<footer>Veriler Claude Code alt-agent transkriptlerinden okunur. Gösterilmeyen bilgi yoksa "kayıt yok" yazar; tahmini ilerleme üretilmez.</footer>
<script>
const fmt=t=>t?new Date(t).toLocaleString("tr-TR"):"—";
const dur=(a,b)=>{if(!a||!b)return"—";const s=Math.max(0,Math.round((b-a)/1000));return s<60?s+" sn":Math.floor(s/60)+" dk "+(s%60)+" sn"};
function statusBadge(s){const m={working:["working","Çalışıyor"],completed:["completed","Tamamlandı"],stopped:["stopped","Durduruldu / rapor yok"]};const [c,l]=m[s]||["idle","Bilinmiyor"];return '<span class="badge '+c+'">'+l+'</span>'}
function runHtml(r){return '<div class="task">'+esc(r.task||"—")+'</div>'+
 '<div class="row">'+statusBadge(r.status)+'<span class="t">'+fmt(r.start)+' → '+fmt(r.end)+' · '+dur(r.start,r.end)+'</span></div>'+
 (r.files.length?'<ul class="files">'+r.files.slice(0,10).map(f=>'<li>'+esc(f)+'</li>').join("")+(r.files.length>10?'<li>+'+(r.files.length-10)+' dosya</li>':'')+'</ul>':'<div class="empty">Dosya değişikliği kaydı yok</div>')+
 (r.checks.length?'<div class="checks">'+r.checks.map(c=>'<div class="check"><span>'+esc(c.cmd)+'</span><span class="'+(c.result==="passed"?"pass":"fail")+'">'+c.result+'</span></div>').join("")+'</div>':'')+
 (r.errorCount?'<div class="err">'+r.errorCount+' araç hatası · son: '+esc(r.errors[r.errors.length-1]||"")+'</div>':'')}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function tick(){try{const r=await fetch("/api/state",{cache:"no-store"});const d=await r.json();
 document.getElementById("gen").textContent="güncellendi: "+new Date(d.generatedAt).toLocaleTimeString("tr-TR");
 document.getElementById("grid").innerHTML=d.roster.map(a=>{
   const runs=a.runs||[];
   return '<section class="card"><div class="row"><h2>'+esc(a.name)+'</h2>'+(a.active?statusBadge("working"):'<span class="badge idle">Bekliyor</span>')+'</div>'+
   '<div class="focus">'+esc(a.focus)+' · son çalışma: '+a.runCount+'</div>'+
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

server.listen(PORT, HOST, () => {
  console.log(`ABYS Agent Command Center: http://${HOST}:${PORT}`);
  console.log(`Proje: ${PROJECT_DIR}`);
});
