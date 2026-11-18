/**
 * Süreç madenciliği — olay günlüğünden gerçek süreç akışı.
 *
 * Olaylar özne (subject) bazında kronolojik sıralanır; ardışık olay çiftleri
 * geçiş (transition) olarak sayılır. Her geçiş için adet, medyan ve P90 süre
 * hesaplanır. En yavaş geçişler darboğaz olarak işaretlenir. Tanımlı bir
 * hedef süreç modeli yoksa "sapma" iddiası üretilmez; yalnızca gözlenen akış
 * ve süreler raporlanır.
 *
 * Bu, kanıtlanmış bir süreç modeli değil, gözleme dayalı bir tanımdır.
 */

export interface ProcessEvent {
  subject: string;
  type: string;
  /** Unix epoch milisaniye. */
  at: number;
}

export interface TransitionStat {
  from: string;
  to: string;
  count: number;
  medianSeconds: number;
  p90Seconds: number;
}

export interface ProcessMiningResult {
  subjects: number;
  events: number;
  transitions: TransitionStat[];
  bottlenecks: TransitionStat[];
  medianCaseSeconds: number | null;
  startEvents: { type: string; count: number }[];
  evidence: "low" | "medium" | "high";
  note: string;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function topCounts(counter: Map<string, number>, limit: number) {
  return [...counter.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
    .slice(0, limit);
}

export function mineProcess(events: ProcessEvent[], bottleneckLimit = 5): ProcessMiningResult {
  const bySubject = new Map<string, ProcessEvent[]>();
  for (const e of events) {
    if (!e.subject || !e.type || !Number.isFinite(e.at)) continue;
    const list = bySubject.get(e.subject) ?? [];
    list.push(e);
    bySubject.set(e.subject, list);
  }

  const durations = new Map<string, { label: string; from: string; to: string; values: number[] }>();
  const startCounter = new Map<string, number>();
  const caseSpans: number[] = [];

  for (const list of bySubject.values()) {
    list.sort((a, b) => a.at - b.at || a.type.localeCompare(b.type));
    startCounter.set(list[0].type, (startCounter.get(list[0].type) ?? 0) + 1);
    if (list.length > 1) {
      caseSpans.push((list[list.length - 1].at - list[0].at) / 1000);
    }
    for (let i = 1; i < list.length; i++) {
      const from = list[i - 1].type;
      const to = list[i].type;
      const key = `${from}→${to}`;
      const entry = durations.get(key) ?? { label: key, from, to, values: [] };
      entry.values.push(Math.max(0, (list[i].at - list[i - 1].at) / 1000));
      durations.set(key, entry);
    }
  }

  const transitions: TransitionStat[] = [...durations.values()]
    .map((entry) => {
      const sorted = [...entry.values].sort((a, b) => a - b);
      return {
        from: entry.from,
        to: entry.to,
        count: entry.values.length,
        medianSeconds: round1(quantile(sorted, 0.5)),
        p90Seconds: round1(quantile(sorted, 0.9)),
      };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

  const bottlenecks = transitions
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.p90Seconds - a.p90Seconds || b.count - a.count)
    .slice(0, bottleneckLimit);

  const subjects = bySubject.size;
  const totalEvents = events.filter((e) => e.subject && e.type && Number.isFinite(e.at)).length;
  const evidence: ProcessMiningResult["evidence"] =
    subjects >= 20 && totalEvents >= 100 ? "high" : subjects >= 5 ? "medium" : "low";

  return {
    subjects,
    events: totalEvents,
    transitions,
    bottlenecks,
    medianCaseSeconds: caseSpans.length > 0 ? round1(quantile([...caseSpans].sort((a, b) => a - b), 0.5)) : null,
    startEvents: topCounts(startCounter, 5),
    evidence,
    note:
      "Gözlenen olay akışıdır; hedef süreç modeliyle karşılaştırma yapılmadığı için sapma iddiası içermez. " +
      "Süreler olay zaman damgaları arasındaki farktır; bekleme nedeni bilinmez.",
  };
}
