/**
 * Çok kriterli karar seçenekleri — Pareto ve ağırlıklı skor.
 *
 * Seçenekler birden fazla kriterde (maliyet, risk, süre, stratejik uyum...)
 * değerlendirilir. Her kriter "maximize" veya "minimize" yönündedir. Skorlar
 * min-max normalize edilir; ağırlıklar toplam 1'e ölçeklenir. Pareto baskınlığı
 * normalize edilmiş (yönü düzeltilmiş) değerler üzerinden hesaplanır.
 *
 * Bu motor tek bir "doğru cevap" dayatmaz: Pareto sınırındaki seçenekleri,
 * birbirlerine göre ödünleşimlerini ve ağırlıklı sıralamayı birlikte verir.
 * Ağırlıklar özneldir; sonuç yalnızca verilen ağırlıklara göre geçerlidir.
 */

export type CriterionDirection = "maximize" | "minimize";

export interface Criterion {
  id: string;
  label: string;
  direction: CriterionDirection;
  weight: number;
}

export interface OptionInput {
  id: string;
  label: string;
  scores: Record<string, number>;
}

export interface EvaluatedOption {
  id: string;
  label: string;
  /** Yönü düzeltilmiş, 0..1 normalize değerler. */
  normalized: Record<string, number>;
  /** 0..100 ağırlıklı skor. */
  weightedScore: number;
  rank: number;
  onParetoFrontier: boolean;
  dominatedBy: string[];
  bestCriterion: { id: string; label: string; value: number } | null;
  worstCriterion: { id: string; label: string; value: number } | null;
}

export interface EvaluationResult {
  options: EvaluatedOption[];
  frontier: string[];
  normalizedWeights: Record<string, number>;
  note: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateInputs(
  criteria: Criterion[],
  options: OptionInput[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (criteria.length === 0) issues.push({ path: "criteria", message: "En az bir kriter gerekir." });
  if (options.length < 2) issues.push({ path: "options", message: "En az iki seçenek gerekir." });

  const ids = new Set<string>();
  for (const c of criteria) {
    if (!c.id || ids.has(c.id)) {
      issues.push({ path: `criteria.${c.id}`, message: "Kriter kimlikleri boş veya tekrarlı olamaz." });
    }
    ids.add(c.id);
    if (!Number.isFinite(c.weight) || c.weight <= 0) {
      issues.push({ path: `criteria.${c.id}.weight`, message: "Ağırlık pozitif sayı olmalı." });
    }
  }

  const optionIds = new Set<string>();
  for (const o of options) {
    if (!o.id || optionIds.has(o.id)) {
      issues.push({ path: `options.${o.id}`, message: "Seçenek kimlikleri boş veya tekrarlı olamaz." });
    }
    optionIds.add(o.id);
    for (const c of criteria) {
      const value = o.scores[c.id];
      if (!Number.isFinite(value)) {
        issues.push({ path: `options.${o.id}.${c.id}`, message: "Skor sayısal olmalı." });
      }
    }
  }
  return issues;
}

export function evaluateOptions(
  criteria: Criterion[],
  options: OptionInput[]
): EvaluationResult {
  const issues = validateInputs(criteria, options);
  if (issues.length > 0) {
    throw new Error(issues[0].message);
  }

  const weightSum = criteria.reduce((acc, c) => acc + c.weight, 0);
  const normalizedWeights: Record<string, number> = {};
  for (const c of criteria) normalizedWeights[c.id] = c.weight / weightSum;

  // Kriter bazında min/max ve yön düzeltmesi.
  const ranges = new Map<string, { min: number; max: number }>();
  for (const c of criteria) {
    const values = options.map((o) => o.scores[c.id]);
    ranges.set(c.id, { min: Math.min(...values), max: Math.max(...values) });
  }

  const normalizedById = new Map<string, Record<string, number>>();
  for (const o of options) {
    const norm: Record<string, number> = {};
    for (const c of criteria) {
      const { min, max } = ranges.get(c.id)!;
      const raw = o.scores[c.id];
      let value: number;
      if (max === min) value = 0.5; // fark yoksa kriter ayırt etmez
      else value = (raw - min) / (max - min);
      if (c.direction === "minimize") value = 1 - value;
      norm[c.id] = Math.round(value * 1000) / 1000;
    }
    normalizedById.set(o.id, norm);
  }

  const weighted = options.map((o) => {
    const norm = normalizedById.get(o.id)!;
    let score = 0;
    for (const c of criteria) score += norm[c.id] * normalizedWeights[c.id];
    return { id: o.id, score: Math.round(score * 1000) / 10 }; // 0..100, 1 ondalık
  });

  // Pareto baskınlığı: her kritrede >= ve en az birinde >.
  const dominatedBy = new Map<string, string[]>();
  for (const a of options) {
    const list: string[] = [];
    const an = normalizedById.get(a.id)!;
    for (const b of options) {
      if (a.id === b.id) continue;
      const bn = normalizedById.get(b.id)!;
      let ge = true;
      let gt = false;
      for (const c of criteria) {
        if (bn[c.id] < an[c.id]) {
          ge = false;
          break;
        }
        if (bn[c.id] > an[c.id]) gt = true;
      }
      if (ge && gt) list.push(b.id);
    }
    dominatedBy.set(a.id, list);
  }

  const ranked = [...weighted].sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  const rankById = new Map(ranked.map((r, i) => [r.id, i + 1]));

  const evaluated: EvaluatedOption[] = options.map((o) => {
    const norm = normalizedById.get(o.id)!;
    const entries = criteria.map((c) => ({ id: c.id, label: c.label, value: norm[c.id] }));
    const best = [...entries].sort((x, y) => y.value - x.value)[0] ?? null;
    const worst = [...entries].sort((x, y) => x.value - y.value)[0] ?? null;
    const dominated = dominatedBy.get(o.id) ?? [];
    return {
      id: o.id,
      label: o.label,
      normalized: norm,
      weightedScore: weighted.find((w) => w.id === o.id)!.score,
      rank: rankById.get(o.id)!,
      onParetoFrontier: dominated.length === 0,
      dominatedBy: dominated,
      bestCriterion: best,
      worstCriterion: worst,
    };
  });

  evaluated.sort((a, b) => a.rank - b.rank);

  return {
    options: evaluated,
    frontier: evaluated.filter((e) => e.onParetoFrontier).map((e) => e.id),
    normalizedWeights,
    note:
      "Normalize değerler min-max ile 0–1 aralığına ölçeklenir; minimize kriterler ters çevrilir. " +
      "Ağırlıklı skor verilen ağırlıklara bağlıdır; Pareto sınırı ağırlıktan bağımsızdır.",
  };
}
