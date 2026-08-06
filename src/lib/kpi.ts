export interface ParsedKpi {
  label: string;
  value: string;
}

// "Etiket: 123 (%4.5)" satırlarını ve CSV başlık+veri satırlarını KPI çiftlerine çevirir.
// AI gerektirmez — veri yüklendiği anda çalışır.
export function parseKpis(text: string): ParsedKpi[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const kpis: ParsedKpi[] = [];

  const colonPattern = /^([^:]{2,60}):\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(colonPattern);
    if (m && /\d/.test(m[2])) {
      kpis.push({ label: m[1].trim(), value: m[2].trim() });
    }
  }

  // CSV biçimi: ilk satır başlık, ikinci satır değer
  if (kpis.length === 0 && lines.length >= 2 && lines[0].includes(",")) {
    const headers = lines[0].split(",");
    const values = lines[lines.length - 1].split(",");
    headers.forEach((h, i) => {
      const v = values[i]?.trim();
      if (h.trim() && v) kpis.push({ label: h.trim(), value: v });
    });
  }

  return kpis;
}

export interface HeroKpi {
  key: "dataCount" | "conversion" | "unreached" | "sales";
  label: string;
  value: string | null;
}

const HERO_MATCHERS: { key: HeroKpi["key"]; label: string; patterns: RegExp[] }[] = [
  { key: "dataCount", label: "Data Sayısı", patterns: [/atanan başvuru/i, /toplam data/i, /^data$/i] },
  { key: "conversion", label: "Dönüşüm Oranı", patterns: [/dönüşüm oranı/i, /^dönüşüm$/i] },
  { key: "unreached", label: "Aranmayan / Ulaşılamayan Data", patterns: [/ulaşılamayan/i, /cevap yok/i, /aranmayan/i] },
  { key: "sales", label: "Satış Tutarı", patterns: [/günlük satış tutarı/i, /satış tutarı/i, /toplam ciro/i, /toplam tutar/i] },
];

// Ana sayfada sadece bu 4 metriği öne çıkar; geri kalan tüm KPI'lar Reports'ta.
export function pickHeroKpis(kpis: ParsedKpi[]): HeroKpi[] {
  return HERO_MATCHERS.map((m) => {
    const found = kpis.find((k) => m.patterns.some((p) => p.test(k.label)));
    return { key: m.key, label: found?.label ?? m.label, value: found?.value ?? null };
  });
}
