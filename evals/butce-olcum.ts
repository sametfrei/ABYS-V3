import { buildKnowledgeBlock } from "../src/lib/domain-knowledge";
import {
  buildDiagnosisPrompt,
  buildOptionsPrompt,
  diagnosisJsonSchema,
  optionsJsonSchema,
} from "../src/lib/ai/decision-prompt";

// Teşhis ve seçenek çağrılarının GERÇEK token ihtiyacını ölçer.
// Kullanım:
//   npx tsx butce-olcum.ts <senaryo> <butce>            → teşhis ölçümü
//   npx tsx butce-olcum.ts <senaryo> <butce> secenek    → seçenek ölçümü
// done_reason=stop + geçerli JSON ise "harcanan" değeri gerçek ihtiyaçtır.

const senaryolar: Record<string, { sector: string; data: string; constraints: string }> = {
  manufacturing: {
    sector: "manufacturing",
    data: "Hat 3 verimi %62'ye düştü (hedef %85). Son 4 saatte 3 plansız duruş, toplam 47 dakika. Sipariş kuyruğu 1200 adet, teslim taahhüdü 48 saat. Kalite red oranı %4,1 (normal %1,8). Vardiya başı operatör 6 kişi, 2 kişi raporlu.",
    constraints: "Vardiya 08:00-16:00. Ek personel yok. Bakım ekibi 14:00'a kadar başka hatta.",
  },
  aviation: {
    sector: "aviation",
    data: "Ekip görev süresi sınırına yaklaşan 4 mürettebat var. TK-2043 rotasyonu 40 dk gecikmeli. Yedek ekip İstanbul'da, transfer 90 dk. Pik saat 18:00-20:00, 11 kalkış planlı. Slot kaybı riski 3 uçuşta.",
    constraints: "Görev süresi yasal sınırı aşılamaz. Yedek ekip tek. Slot değişimi 2 saat önceden bildirilmeli.",
  },
};

function paramsFor(ad: string) {
  const s = senaryolar[ad];
  return {
    sectorLabel: s.sector,
    riskCategories: [{ id: "ops", label: "Operasyon", sources: ["canlı veri"] }],
    constraints: s.constraints,
    decisionMemory: "",
    domainKnowledge: buildKnowledgeBlock(s.sector as never),
    data: s.data,
  };
}

// Tek Ollama çağrısı: içerik + harcanan token + bitiş sebebi döner.
async function cagir(prompt: string, schema: unknown, butce: number) {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3:4b-instruct",
      messages: [{ role: "user", content: prompt }],
      stream: true,
      format: schema,
      think: false,
      options: { temperature: 0.2, num_ctx: 8192, num_predict: butce },
    }),
    signal: AbortSignal.timeout(1_500_000),
  });

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  let buf = "";
  let used = 0;
  let reason = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.trim()) continue;
      const j = JSON.parse(l);
      if (j.message?.content) out += j.message.content;
      if (j.done) { used = j.eval_count ?? 0; reason = j.done_reason ?? ""; }
    }
  }

  let gecerli = false;
  try { JSON.parse(out); gecerli = true; } catch { gecerli = false; }
  return { out, used, reason, gecerli };
}

function raporla(etiket: string, butce: number, r: { used: number; reason: string; out: string; gecerli: boolean }) {
  console.log(
    `${etiket.padEnd(22)} butce=${String(butce).padStart(5)} | harcanan=${String(r.used).padStart(5)} | bitis=${r.reason.padEnd(6)} | cikti=${String(r.out.length).padStart(5)} krk | JSON=${r.gecerli ? "GECERLI" : "BOZUK"}`
  );
  if (r.reason === "stop" && r.gecerli) {
    console.log(`>>> ${etiket}: GERCEK IHTIYAC = ${r.used} token (onerilen num_predict: ${Math.ceil((r.used * 1.3) / 256) * 256})`);
  } else {
    console.log(`>>> ${etiket}: ${butce} token ile bitiremedi (bitis=${r.reason}) - butce yetersiz veya baska sorun`);
  }
}

async function main() {
  const hedef = process.argv[2] || "manufacturing";
  const butce = Number(process.argv[3] || 4096);
  const mod = process.argv[4] || "teshis";
  const p = paramsFor(hedef);

  if (mod === "secenek") {
    // Önce teşhis (bol bütçeyle), sonra o teşhisle seçenek ölçümü.
    const t = await cagir(buildDiagnosisPrompt(p as never), diagnosisJsonSchema, 4096);
    if (!t.gecerli) { console.log("teshis uretilemedi, secenek olculemiyor"); return; }
    const r = await cagir(buildOptionsPrompt(p as never, JSON.parse(t.out)), optionsJsonSchema, butce);
    raporla(`secenek/${hedef}`, butce, r);
  } else {
    const r = await cagir(buildDiagnosisPrompt(p as never), diagnosisJsonSchema, butce);
    raporla(`teshis/${hedef}`, butce, r);
  }
}
main();
