import type { SectorId } from "./sectors";

/**
 * Senaryo motoru (Faz 6, master plan md.13).
 *
 * TEMEL KURAL: Sayısal sonuçlar DETERMİNİSTİK formüllerle hesaplanır — dil
 * modeli sayı üretmez, yalnızca sonucu açıklayabilir. Her sonuç girdilerini,
 * kullanılan formülü, varsayımları, sınırları ve duyarlılığı birlikte taşır
 * (izlenebilirlik). Katsayılar domain-knowledge.ts ile aynı dayanaklardan gelir.
 */

export interface ScenarioVariable {
  id: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface ScenarioTemplate {
  id: string;
  label: string;
  description: string;
  variables: ScenarioVariable[];
  /** Formülün insan-okunur ifadesi — çıktıda gösterilir. */
  formulaText: string;
  limitations: string[];
  compute: (v: Record<string, number>) => { label: string; value: number; unit: string }[];
}

const AVIATION_TURNAROUND: ScenarioTemplate = {
  id: "turnaround-delay",
  label: "Turnaround gecikme maliyeti",
  description:
    "Rötar dakikası ve etkilenen bağlantı sayısına göre doğrudan maliyet ve yayılma etkisi.",
  variables: [
    { id: "delayMin", label: "Rötar süresi", unit: "dk", value: 30, min: 0, max: 180, step: 5 },
    { id: "connections", label: "Etkilenen bağlantı uçuşu", unit: "adet", value: 2, min: 0, max: 20, step: 1 },
    { id: "rushBags", label: "Yetişmeyen transfer bagajı", unit: "adet", value: 10, min: 0, max: 200, step: 5 },
  ],
  formulaText:
    "doğrudan = rötar_dk × 100 €/dk · yayılma = bağlantı × 0.4 × rötar_dk × 100 €/dk · bagaj = adet × 50 €",
  limitations: [
    "Katsayılar sektör ortalaması varsayılanıdır; şirket verisiyle güncellenmelidir.",
    "Yayılma katsayısı (0.4) ampirik bir yaklaşımdır, ağ topolojisine göre değişir.",
    "Yolcu tazminatı (3 saat+ eşiği) bu hesaba dahil değildir.",
  ],
  compute: (v) => {
    const direct = v.delayMin * 100;
    const propagation = v.connections * 0.4 * v.delayMin * 100;
    const bags = v.rushBags * 50;
    return [
      { label: "Doğrudan rötar maliyeti", value: Math.round(direct), unit: "€" },
      { label: "Bağlantı yayılma maliyeti", value: Math.round(propagation), unit: "€" },
      { label: "Transfer bagaj maliyeti", value: Math.round(bags), unit: "€" },
      { label: "Toplam tahmini maliyet", value: Math.round(direct + propagation + bags), unit: "€" },
    ];
  },
};

const MANUFACTURING_DOWNTIME: ScenarioTemplate = {
  id: "line-downtime",
  label: "Hat duruşu ve teslim gecikmesi",
  description: "Duruş süresi ve ceza oranına göre maliyet ile teslim gecikmesi etkisi.",
  variables: [
    { id: "downtimeHours", label: "Duruş süresi", unit: "saat", value: 4, min: 0, max: 72, step: 1 },
    { id: "contractValue", label: "Sözleşme bedeli", unit: "TL", value: 500000, min: 0, max: 10000000, step: 50000 },
    { id: "delayWeeks", label: "Teslim gecikmesi", unit: "hafta", value: 1, min: 0, max: 12, step: 1 },
  ],
  formulaText: "duruş = saat × 5.000 TL/saat · ceza = sözleşme × %0,5 × hafta",
  limitations: [
    "Duruş saat maliyeti örnek varsayılandır; tesise göre değişir.",
    "Ceza oranı sözleşmeye göre değişir (%0,5-1 aralığı varsayıldı).",
  ],
  compute: (v) => {
    const downtime = v.downtimeHours * 5000;
    const penalty = v.contractValue * 0.005 * v.delayWeeks;
    return [
      { label: "Duruş maliyeti", value: Math.round(downtime), unit: "TL" },
      { label: "Gecikme cezası", value: Math.round(penalty), unit: "TL" },
      { label: "Toplam tahmini maliyet", value: Math.round(downtime + penalty), unit: "TL" },
    ];
  },
};

const LOGISTICS_ETA: ScenarioTemplate = {
  id: "eta-cascade",
  label: "ETA sapması ve ağ etkisi",
  description: "Ana hat gecikmesinin dağıtım turlarına yayılması ve bekleme maliyeti.",
  variables: [
    { id: "delayHours", label: "Ana hat gecikmesi", unit: "saat", value: 2, min: 0, max: 24, step: 1 },
    { id: "routes", label: "Etkilenen dağıtım turu", unit: "adet", value: 3, min: 0, max: 30, step: 1 },
  ],
  formulaText: "bekleme = saat × 400 TL/saat · ağ etkisi = gecikme × 1.7 (ampirik yayılma)",
  limitations: [
    "Yayılma çarpanı (1.7) geçmiş olay ortalamasıdır, güzergâha göre değişir.",
    "SLA cezaları müşteri sözleşmesine göre ayrıca hesaplanmalıdır.",
  ],
  compute: (v) => {
    const waiting = v.delayHours * 400 * Math.max(1, v.routes);
    const networkHours = v.delayHours * 1.7;
    return [
      { label: "Toplam bekleme maliyeti", value: Math.round(waiting), unit: "TL" },
      { label: "Tahmini ağ gecikmesi", value: Math.round(networkHours * 10) / 10, unit: "saat" },
    ];
  },
};

const GENERIC_CAPACITY: ScenarioTemplate = {
  id: "capacity-gap",
  label: "Kapasite açığı etkisi",
  description: "Eksik kapasitenin iş yükü ve gecikmeye etkisi (sektör-bağımsız).",
  variables: [
    { id: "missingStaff", label: "Eksik personel", unit: "kişi", value: 2, min: 0, max: 50, step: 1 },
    { id: "hours", label: "Süre", unit: "saat", value: 8, min: 1, max: 72, step: 1 },
    { id: "hourlyCost", label: "Saatlik maliyet", unit: "TL/saat", value: 300, min: 0, max: 5000, step: 50 },
  ],
  formulaText: "kayıp kapasite = eksik_kişi × saat · maliyet = kayıp × saatlik_maliyet",
  limitations: ["Verimlilik kaybı doğrusal varsayıldı; gerçekte eşik etkileri olabilir."],
  compute: (v) => {
    const lostHours = v.missingStaff * v.hours;
    return [
      { label: "Kayıp kapasite", value: lostHours, unit: "kişi-saat" },
      { label: "Tahmini maliyet", value: Math.round(lostHours * v.hourlyCost), unit: "TL" },
    ];
  },
};

const TEMPLATES: Partial<Record<SectorId, ScenarioTemplate[]>> = {
  aviation: [AVIATION_TURNAROUND, GENERIC_CAPACITY],
  manufacturing: [MANUFACTURING_DOWNTIME, GENERIC_CAPACITY],
  logistics: [LOGISTICS_ETA, GENERIC_CAPACITY],
};

export function getTemplates(sectorId: SectorId): ScenarioTemplate[] {
  return TEMPLATES[sectorId] ?? [GENERIC_CAPACITY];
}

export function getTemplate(sectorId: SectorId, templateId: string): ScenarioTemplate | undefined {
  return getTemplates(sectorId).find((t) => t.id === templateId);
}

export interface ScenarioRun {
  name: string;
  inputs: Record<string, number>;
  results: { label: string; value: number; unit: string }[];
}

/**
 * Karşılaştırmalı senaryo seti: taban (kullanıcının girdiği değerler),
 * iyimser (-%30), kötümser (+%50). Çarpanlar sabittir ve çıktıda gösterilir —
 * gizli varsayım bırakılmaz.
 */
export function runComparison(
  template: ScenarioTemplate,
  inputs: Record<string, number>
): { runs: ScenarioRun[]; sensitivity: { variable: string; effect: string }[] } {
  const scale = (factor: number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const v of template.variables) {
      const raw = (inputs[v.id] ?? v.value) * factor;
      out[v.id] = Math.max(v.min, Math.min(v.max, Math.round(raw * 100) / 100));
    }
    return out;
  };

  const base = { ...Object.fromEntries(template.variables.map((v) => [v.id, inputs[v.id] ?? v.value])) };
  const runs: ScenarioRun[] = [
    { name: "Taban", inputs: base, results: template.compute(base) },
    { name: "İyimser (−%30)", inputs: scale(0.7), results: template.compute(scale(0.7)) },
    { name: "Kötümser (+%50)", inputs: scale(1.5), results: template.compute(scale(1.5)) },
  ];

  // Duyarlılık: her değişken tek başına %10 artırıldığında toplam nasıl değişir
  const totalOf = (r: { label: string; value: number }[]) => r[r.length - 1]?.value ?? 0;
  const baseTotal = totalOf(runs[0].results);
  const sensitivity = template.variables.map((v) => {
    const bumped = { ...base, [v.id]: Math.min(v.max, (base[v.id] ?? v.value) * 1.1) };
    const delta = totalOf(template.compute(bumped)) - baseTotal;
    const pct = baseTotal !== 0 ? Math.round((delta / baseTotal) * 1000) / 10 : 0;
    return {
      variable: v.label,
      effect: `%10 artış → toplamda ${pct >= 0 ? "+" : ""}${pct}% (${Math.round(delta)} ${runs[0].results[runs[0].results.length - 1]?.unit ?? ""})`,
    };
  });

  return { runs, sensitivity };
}
