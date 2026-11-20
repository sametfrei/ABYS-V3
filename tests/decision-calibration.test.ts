import { describe, expect, it } from "vitest";
import {
  CALIBRATION_ALIGNMENT_TOLERANCE,
  CALIBRATION_PRIOR_SAMPLES,
  MIN_CALIBRATION_SAMPLES,
  buildDecisionCalibration,
  calibrationForConfidence,
} from "@/lib/decision-calibration";
import { summarizeDecisionLearning, type DecisionLearningEntry } from "@/lib/decision-economics";

function bucket(
  key: string,
  label: string,
  min: number,
  max: number,
  overrides: Partial<{
    total: number;
    withOutcome: number;
    improved: number;
    rangeEvaluable: number;
    rangeHits: number;
    improvedRate: number | null;
    rangeHitRate: number | null;
  }> = {}
) {
  const withOutcome = overrides.withOutcome ?? 0;
  const improved = overrides.improved ?? 0;
  return {
    key,
    label,
    min,
    max,
    total: overrides.total ?? withOutcome,
    withOutcome,
    improved,
    improvedRate: overrides.improvedRate ?? (withOutcome === 0 ? null : improved / withOutcome),
    rangeEvaluable: overrides.rangeEvaluable ?? 0,
    rangeHits: overrides.rangeHits ?? 0,
    rangeHitRate: overrides.rangeHitRate ?? null,
  };
}

describe("decision calibration", () => {
  it("yeterli örnek yoksa düzeltme üretmez", () => {
    const calibration = buildDecisionCalibration([
      bucket("70-84", "70–84", 70, 84, { withOutcome: MIN_CALIBRATION_SAMPLES - 1, improved: 2 }),
    ]);
    expect(calibration.status).toBe("insufficient_evidence");
    const target = calibration.buckets[0];
    expect(target.status).toBe("insufficient_evidence");
    expect(target.adjustedConfidence).toBeNull();
    expect(target.direction).toBeNull();
    expect(target.samplesNeeded).toBe(1);
    expect(calibration.totalWithOutcome).toBe(MIN_CALIBRATION_SAMPLES - 1);
  });

  it("gözlenen iyileşme ilan edilen güvenin altındaysa aşırı güvenli işaretler", () => {
    const calibration = buildDecisionCalibration([
      bucket("50-69", "50–69", 50, 69, { withOutcome: 10, improved: 4 }),
    ]);
    const target = calibration.buckets[0];
    expect(calibration.status).toBe("measured");
    expect(target.status).toBe("measured");
    expect(target.statedConfidence).toBe(60);
    expect(target.improvedRate).toBeCloseTo(0.4, 10);
    expect(target.direction).toBe("overconfident");
    expect(target.gap).toBeCloseTo(-0.2, 10);
    // (10·40 + 5·60) / 15 = 46,67 → 47
    expect(target.adjustedConfidence).toBe(47);
    expect(target.samplesNeeded).toBe(0);
  });

  it("fark tolerans içindeyse tutarlı sayar ve önceki ağırlığı uygular", () => {
    const calibration = buildDecisionCalibration([
      bucket("85-100", "85–100", 85, 100, { withOutcome: 10, improved: 10 }),
    ]);
    const target = calibration.buckets[0];
    expect(target.statedConfidence).toBe(93);
    // 93 → 100 farkı 7 puan; toleransın içinde kalır.
    expect(target.direction).toBe("aligned");
    expect(target.adjustedConfidence).toBe(
      Math.round((10 * 100 + CALIBRATION_PRIOR_SAMPLES * 93) / (10 + CALIBRATION_PRIOR_SAMPLES))
    );

    const aligned = buildDecisionCalibration([
      bucket("0-49", "0–49", 0, 49, { withOutcome: 20, improved: 4 }),
    ]).buckets[0];
    expect(aligned.statedConfidence).toBe(25);
    expect(Math.abs((aligned.improvedRate ?? 0) - 0.25)).toBeLessThan(CALIBRATION_ALIGNMENT_TOLERANCE);
    expect(aligned.direction).toBe("aligned");
  });

  it("düzeltilmiş güven 0–100 aralığına sıkışır", () => {
    const low = buildDecisionCalibration([
      bucket("85-100", "85–100", 85, 100, { withOutcome: 40, improved: 0 }),
    ]).buckets[0];
    expect(low.adjustedConfidence).not.toBeNull();
    expect(low.adjustedConfidence!).toBeGreaterThanOrEqual(0);
    const high = buildDecisionCalibration([
      bucket("0-49", "0–49", 0, 49, { withOutcome: 40, improved: 40 }),
    ]).buckets[0];
    expect(high.improvedRate).toBe(1);
    expect(high.adjustedConfidence!).toBeLessThanOrEqual(100);
    expect(high.direction).toBe("underconfident");
  });

  it("kısmi ölçüm durumunu doğru raporlar", () => {
    const calibration = buildDecisionCalibration([
      bucket("0-49", "0–49", 0, 49, { withOutcome: 6, improved: 3 }),
      bucket("50-69", "50–69", 50, 69, { withOutcome: 1, improved: 1 }),
    ]);
    expect(calibration.status).toBe("partial");
    expect(calibration.buckets.map((item) => item.status)).toEqual([
      "measured",
      "insufficient_evidence",
    ]);
  });

  it("gerçek karar kayıtlarından uçtan uca kalibrasyon üretir", () => {
    const entries: DecisionLearningEntry[] = Array.from({ length: 8 }, (_, index) => ({
      confidence: 60,
      choice: "accepted",
      result: index < 2 ? "improved" : "unchanged",
      expectedImpact: null,
      actualImpact: null,
    }));
    const learning = summarizeDecisionLearning(entries);
    const calibration = buildDecisionCalibration(learning.confidenceBuckets);
    const target = calibrationForConfidence(60, calibration);
    expect(target).not.toBeNull();
    expect(target!.key).toBe("50-69");
    expect(target!.withOutcome).toBe(8);
    expect(target!.improvedRate).toBeCloseTo(0.25, 10);
    expect(target!.direction).toBe("overconfident");
    expect(calibration.totalWithOutcome).toBe(8);
  });

  it("güven değeri kova sınırlarında doğru eşleşir ve geçersiz girdiye null döner", () => {
    const calibration = buildDecisionCalibration([
      bucket("0-49", "0–49", 0, 49),
      bucket("50-69", "50–69", 50, 69),
      bucket("70-84", "70–84", 70, 84),
      bucket("85-100", "85–100", 85, 100),
    ]);
    expect(calibrationForConfidence(0, calibration)?.key).toBe("0-49");
    expect(calibrationForConfidence(50, calibration)?.key).toBe("50-69");
    expect(calibrationForConfidence(84, calibration)?.key).toBe("70-84");
    expect(calibrationForConfidence(100, calibration)?.key).toBe("85-100");
    expect(calibrationForConfidence(Number.NaN, calibration)).toBeNull();
    expect(calibrationForConfidence(-20, calibration)?.key).toBe("0-49");
  });
});
