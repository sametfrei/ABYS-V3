/**
 * ABYS karar motoru değerlendirme koşucusu.
 *
 * Altın senaryoları /api/decision-cases'e gönderir ve çıktıyı deterministik
 * kriterlerle puanlar. Amaç: her prompt/model/bilgi paketi değişikliğinde
 * "daha zeki oldu mu?" sorusuna sayıyla cevap vermek.
 *
 * Kullanım (dev sunucu çalışırken):
 *   npm run eval                # tüm senaryolar
 *   npm run eval -- turnaround  # id'si eşleşen senaryolar
 *
 * Not: yerel model CPU'da senaryo başına ~5-6 dk sürer. Hızlı tur için
 * .env.local'da AI_PROVIDER=gemini yapıp sunucuyu yeniden başlatın.
 */
import { SCENARIOS } from "../src/lib/scenarios.ts";
import { getConstraints, constraintsToPrompt } from "../src/lib/constraints.ts";
import { extractNumbers } from "../src/lib/ai/verify-cases.ts";
import { buildKnowledgeBlock } from "../src/lib/domain-knowledge.ts";

const BASE = process.env.EVAL_BASE_URL || "http://localhost:3000";
const filter = process.argv[2]?.toLowerCase() ?? "";

/** Senaryo başına kriterler: her biri 1 puan. */
function scoreCase(c, sources) {
  const checks = [];
  const ok = (name, pass, note = "") => checks.push({ name, pass, note });

  ok("tek vaka odaklı başlık", typeof c.title === "string" && c.title.length > 10);
  ok("severity geçerli", ["critical", "warning", "info", "healthy"].includes(c.severity));
  ok("güven skoru aralıkta", c.confidence >= 0 && c.confidence <= 100);
  ok("güven gerekçesi var", (c.confidenceRationale ?? "").length > 20);
  ok("en az 2 kanıt", (c.evidence ?? []).length >= 2);
  ok(
    "doğrulanmış kanıt var",
    (c.evidence ?? []).some((e) => e.reliability === "verified")
  );
  ok(
    "karşı senaryo tam",
    !!(c.counterfactual?.narrative && c.counterfactual?.projectedImpact && c.counterfactual?.timeHorizon)
  );
  const options = c.options ?? [];
  ok("en az 2 seçenek", options.length >= 2);
  ok("uygulanabilir seçenek var", options.some((o) => o.feasible));
  ok(
    "kısıta takılan seçenek gerekçeli",
    options.every((o) => o.feasible || (o.feasibilityNote ?? "").length > 5)
  );
  ok(
    "öneri uygulanabilir seçeneğe işaret ediyor",
    options.some((o) => o.feasible && o.rank === c.recommendedOptionRank)
  );

  const recommended = options.find((o) => o.rank === c.recommendedOptionRank);
  const titles = options.map((o) => (o.title ?? "").trim().toLowerCase()).filter(Boolean);
  const duplicateTitles = new Set(titles).size !== titles.length;
  ok(
    "çelişkili öneri yok",
    !!recommended?.feasible && !duplicateTitles,
    !recommended?.feasible ? "önerilen seçenek uygulanamaz" : duplicateTitles ? "aynı başlıkla birden fazla seçenek" : ""
  );

  ok(
    "boş alan yok",
    [c.title, c.businessImpact, c.confidenceRationale, c.historicalComparison].every(
      (v) => typeof v === "string" && v.trim().length > 0
    )
  );

  ok("güven gerekçesi anlamlı", (c.confidenceRationale ?? "").length >= 30);

  // Sayı disiplini: doğrulama sonrası hâlâ desteksiz sayı kalmış mı?
  const sourceNumbers = extractNumbers(sources);
  const outText = [
    c.businessImpact,
    c.historicalComparison,
    c.counterfactual?.narrative,
    c.counterfactual?.projectedImpact,
    ...(c.evidence ?? []).map((e) => e.fact),
    ...options.flatMap((o) => [o.detail, o.tradeoffs, o.expectedOutcome]),
  ]
    .filter(Boolean)
    .join("\n");
  let unsupported = 0;
  for (const n of extractNumbers(outText)) if (!sourceNumbers.has(n)) unsupported++;
  ok("sayı disiplini (desteksiz sayı yok)", unsupported === 0, unsupported ? `${unsupported} desteksiz sayı` : "");

  return checks;
}

async function runScenario(sectorId, scenario) {
  const constraints = constraintsToPrompt(getConstraints(sectorId));
  const domainKnowledge = buildKnowledgeBlock(sectorId);
  const body = { sectorId, data: scenario.data, constraints, decisionMemory: "" };

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/decision-cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error ?? `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "error") throw new Error(msg.error);
      if (msg.type === "result") result = msg.data;
    }
  }
  if (!result) throw new Error("Sonuç gelmedi.");

  const seconds = Math.round((Date.now() - t0) / 1000);
  const cases = result.cases ?? [];
  const sources = [scenario.data, constraints, domainKnowledge].join("\n");

  const caseCountOk = cases.length === 1;
  const checks = cases[0] ? scoreCase(cases[0], sources) : [];
  checks.unshift({ name: "tam 1 vaka üretildi", pass: caseCountOk, note: `${cases.length} vaka` });

  return { seconds, providerId: result.providerId, checks, title: cases[0]?.title ?? "—" };
}

const jobs = [];
for (const [sectorId, scenarios] of Object.entries(SCENARIOS)) {
  for (const sc of scenarios) {
    if (filter && !sc.id.toLowerCase().includes(filter) && !sectorId.includes(filter)) continue;
    jobs.push({ sectorId, sc });
  }
}

if (jobs.length === 0) {
  console.log(`Eşleşen senaryo yok: "${filter}"`);
  process.exit(1);
}

console.log(`${jobs.length} senaryo koşulacak (${BASE})\n`);
let totalPass = 0;
let totalChecks = 0;

for (const { sectorId, sc } of jobs) {
  process.stdout.write(`▶ [${sectorId}] ${sc.label} ... `);
  try {
    const r = await runScenario(sectorId, sc);
    const pass = r.checks.filter((c) => c.pass).length;
    totalPass += pass;
    totalChecks += r.checks.length;
    console.log(`${pass}/${r.checks.length} — ${r.seconds}sn — ${r.providerId}`);
    console.log(`  vaka: ${r.title}`);
    for (const c of r.checks.filter((c) => !c.pass)) {
      console.log(`  ✗ ${c.name}${c.note ? ` (${c.note})` : ""}`);
    }
  } catch (err) {
    console.log(`HATA: ${err.message}`);
    totalChecks += 16; // başarısız koşu tüm kriterlerden kalır
  }
}

console.log(`\nTOPLAM SKOR: ${totalPass}/${totalChecks} (${Math.round((totalPass / totalChecks) * 100)}%)`);
