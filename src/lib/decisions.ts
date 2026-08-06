import type { Severity } from "./signals";
import { listEntities, upsertEntity, newId, type Entity } from "./entities";

/**
 * ABYS karar motoru veri modeli.
 *
 * Bir "DecisionCase" tek bir operasyonel vakayı temsil eder ve
 * yöneticinin 3 saniyede okuyacağı ilk ekran + tek tıkla açılan
 * kanıt katmanından oluşur:
 *  - ne oluyor / neden önemli / ne yapılmalı / güven skoru
 *  - kanıt zinciri (doğrulanmış / tahmini / bilinmeyen ayrımıyla)
 *  - karşı senaryo (aksiyon alınmazsa ne olur)
 *  - kısıt-farkındalıklı, uygulanabilirliğe göre sıralanmış seçenekler
 */

export type EvidenceReliability = "verified" | "estimated" | "unknown";

export interface EvidenceItem {
  source: string;
  fact: string;
  reliability: EvidenceReliability;
}

export interface Counterfactual {
  narrative: string;
  projectedImpact: string;
  timeHorizon: string;
}

export interface ActionOption {
  id: string;
  title: string;
  detail: string;
  feasible: boolean;
  feasibilityNote: string;
  tradeoffs: string;
  expectedOutcome: string;
  rank: number;
}

export interface DecisionCase extends Entity {
  /** Sunucu karar kaydı kimliği; yalnızca kurumsal TAIS görünümünde kullanılır. */
  decisionId?: string;
  sectorId: string;
  categoryId: string;
  categoryLabel: string;
  severity: Severity;
  title: string;
  businessImpact: string;
  confidence: number;
  confidenceRationale: string;
  evidence: EvidenceItem[];
  assumptions: string[];
  historicalComparison: string;
  counterfactual: Counterfactual;
  options: ActionOption[];
  recommendedOptionId: string;
  status: "open" | "decided";
}

export type DecisionChoice = "accepted" | "rejected" | "modified";

export type OutcomeResult = "improved" | "unchanged" | "worsened";

export interface DecisionOutcome {
  recordedAt: string;
  result: OutcomeResult;
  note: string;
}

export interface DecisionRecord extends Entity {
  caseId: string;
  caseTitle: string;
  sectorId: string;
  categoryLabel: string;
  severity: Severity;
  recommendedAction: string;
  choice: DecisionChoice;
  chosenAction: string;
  reason: string;
  decidedBy: string;
  confidence: number;
  outcome?: DecisionOutcome;
}

export type AuditEventType =
  | "analysis_run"
  | "case_generated"
  | "decision_made"
  | "outcome_recorded"
  | "data_ingested";

export interface AuditEvent extends Entity {
  type: AuditEventType;
  actor: string;
  summary: string;
  detail?: string;
}

const CASES = "decision-cases";
const RECORDS = "decision-records";
const AUDIT = "audit-events";

export function listCases(sectorId?: string): DecisionCase[] {
  const all = listEntities<DecisionCase>(CASES);
  const filtered = sectorId ? all.filter((c) => c.sectorId === sectorId) : all;
  return filtered.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

export function saveCase(c: DecisionCase) {
  upsertEntity(CASES, c);
}

export function replaceCasesForSector(sectorId: string, cases: DecisionCase[]) {
  const others = listEntities<DecisionCase>(CASES).filter((c) => c.sectorId !== sectorId);
  const merged = [...others, ...cases];
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`abys.entities.${CASES}`, JSON.stringify(merged));
  }
}

export function getCase(id: string): DecisionCase | undefined {
  return listEntities<DecisionCase>(CASES).find((c) => c.id === id);
}

export function listDecisions(sectorId?: string): DecisionRecord[] {
  const all = listEntities<DecisionRecord>(RECORDS);
  const filtered = sectorId ? all.filter((d) => d.sectorId === sectorId) : all;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveDecision(record: DecisionRecord) {
  upsertEntity(RECORDS, record);
}

export function listAudit(): AuditEvent[] {
  return listEntities<AuditEvent>(AUDIT).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function logAudit(type: AuditEventType, actor: string, summary: string, detail?: string) {
  upsertEntity<AuditEvent>(AUDIT, {
    id: newId(),
    createdAt: new Date().toISOString(),
    type,
    actor,
    summary,
    detail,
  });
}

function severityWeight(s: Severity): number {
  switch (s) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

/** Türkçe metni karşılaştırma için kaba token kümesine indirger. */
function tokenize(text: string): Set<string> {
  const stop = new Set([
    "için", "gibi", "daha", "sonra", "önce", "olarak", "olan", "değil",
    "aktif", "durum", "normal", "yeni", "saat", "yerel", "veri",
  ]);
  return new Set(
    text
      .toLocaleLowerCase("tr-TR")
      .split(/[^a-zçğıöşü0-9%]+/)
      .filter((t) => t.length >= 3 && !stop.has(t))
  );
}

/**
 * Karar-sonuç hafızasını AI prompt'una beslenecek kısa bir özete çevirir.
 * Bu, ABYS'in "kurumsal hafıza" katmanıdır: hangi öneri kabul edildi,
 * hangisi neden reddedildi, sonuç ne oldu.
 *
 * currentData verilirse tüm geçmiş dökülmez: mevcut duruma en çok benzeyen
 * kayıtlar seçilir (kelime örtüşmesi; sonucu kaydedilmiş dersler öncelikli).
 * Böylece model "geçen sefer benzer durumda ne işe yaradı"yı görür ve
 * prompt kısa kalır — CPU'da her token süre demek.
 */
export function decisionMemorySummary(sectorId: string, currentData = "", limit = 5): string {
  const all = listDecisions(sectorId);
  if (all.length === 0) return "";

  let records: DecisionRecord[];
  if (currentData.trim()) {
    const dataTokens = tokenize(currentData);
    records = all
      .map((r) => {
        const recTokens = tokenize(
          `${r.caseTitle} ${r.categoryLabel} ${r.recommendedAction} ${r.chosenAction} ${r.reason}`
        );
        let overlap = 0;
        for (const t of recTokens) if (dataTokens.has(t)) overlap++;
        // Sonucu kaydedilmiş kararlar kanıtlanmış ders taşır — öne al.
        const score = overlap + (r.outcome ? 2 : 0);
        return { r, score };
      })
      .sort((a, b) => b.score - a.score || b.r.createdAt.localeCompare(a.r.createdAt))
      .slice(0, limit)
      .map((x) => x.r);
  } else {
    records = all.slice(0, limit);
  }

  const decided = all.filter((r) => r.outcome);
  const improved = decided.filter((r) => r.outcome!.result === "improved").length;
  const statsLine =
    decided.length > 0
      ? `\nGenel istatistik: toplam ${all.length} karar, sonucu kaydedilen ${decided.length}, iyileşme sağlanan ${improved}.`
      : "";

  const lines = records.map((r) => {
    const choiceLabel =
      r.choice === "accepted" ? "KABUL" : r.choice === "rejected" ? "RED" : "DEĞİŞTİRİLDİ";
    const outcome = r.outcome
      ? ` Sonuç: ${outcomeLabel(r.outcome.result)}${r.outcome.note ? ` (${r.outcome.note})` : ""}.`
      : " Sonuç: henüz kaydedilmedi.";
    const modified =
      r.choice === "modified" ? ` Uygulanan aksiyon: "${r.chosenAction}".` : "";
    return `- [${r.categoryLabel}] Öneri: "${r.recommendedAction}" → ${choiceLabel}${
      r.reason ? ` (gerekçe: ${r.reason})` : ""
    }.${modified}${outcome}`;
  });

  return lines.join("\n") + statsLine;
}

export function outcomeLabel(result: OutcomeResult): string {
  switch (result) {
    case "improved":
      return "iyileşme sağlandı";
    case "unchanged":
      return "değişim olmadı";
    case "worsened":
      return "durum kötüleşti";
  }
}

export const CHOICE_META: Record<DecisionChoice, { label: string; color: string }> = {
  accepted: { label: "Kabul edildi", color: "var(--abys-healthy)" },
  rejected: { label: "Reddedildi", color: "var(--abys-critical)" },
  modified: { label: "Değiştirilerek uygulandı", color: "var(--abys-warning)" },
};

export const RELIABILITY_META: Record<EvidenceReliability, { label: string; color: string }> = {
  verified: { label: "Doğrulanmış veri", color: "var(--abys-healthy)" },
  estimated: { label: "Tahmini", color: "var(--abys-warning)" },
  unknown: { label: "Bilinmiyor", color: "var(--abys-muted, #8a8578)" },
};

export const AUDIT_TYPE_META: Record<AuditEventType, string> = {
  analysis_run: "Analiz çalıştırıldı",
  case_generated: "Vaka üretildi",
  decision_made: "Karar verildi",
  outcome_recorded: "Sonuç kaydedildi",
  data_ingested: "Veri alındı",
};
