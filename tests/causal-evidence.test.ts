import { describe, expect, it } from "vitest";
import {
  assessCausalEvidence,
  causalRelationLabel,
  type CausalEvidenceInput,
} from "../src/lib/causal-evidence";

const STRONG_EXPERIMENT: CausalEvidenceInput = {
  relationStatus: "data_confirmed",
  confidence: 90,
  method: "randomized_controlled_trial",
  sampleSize: 240,
  dataQuality: "high",
  uncertainty: "low",
};

describe("deterministik nedensel kanıt kalibrasyonu", () => {
  it("güçlü deneysel kanıtı yüksek seviye ve nedensel çıkarıma uygun sınıflandırır", () => {
    const result = assessCausalEvidence(STRONG_EXPERIMENT);
    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.causalConclusionSupported).toBe(true);
    expect(result.method).toBe("randomized_controlled_trial");
    expect(result.sampleSize).toBe(240);
    expect(assessCausalEvidence(STRONG_EXPERIMENT)).toEqual(result);
  });

  it("gözlemlenen korelasyonu güçlü üst veriye rağmen yükseltmez", () => {
    const result = assessCausalEvidence({
      ...STRONG_EXPERIMENT,
      relationStatus: "observed_correlation",
      confidence: 100,
      sampleSize: 100_000,
    });
    expect(result.level).toBe("low");
    expect(result.score).toBeLessThanOrEqual(24);
    expect(result.causalConclusionSupported).toBe(false);
    expect(result.limitations.join(" ")).toContain("Gözlemlenen korelasyon");
    expect(causalRelationLabel("observed_correlation")).toContain("nedensel sonuç değil");
  });

  it("eksik yöntem ve örneklemi veri onayıyla telafi etmez", () => {
    const result = assessCausalEvidence({
      relationStatus: "data_confirmed",
      confidence: 95,
      dataQuality: "high",
      uncertainty: "low",
    });
    expect(["low", "insufficient"]).toContain(result.level);
    expect(result.causalConclusionSupported).toBe(false);
    expect(result.limitations.join(" ")).toContain("Örneklem büyüklüğü yok");
  });

  it("küçük örneklemi yüksek kanıt seviyesine çıkarmaz", () => {
    const result = assessCausalEvidence({
      ...STRONG_EXPERIMENT,
      sampleSize: 12,
    });
    expect(result.level).toBe("medium");
    expect(result.score).toBeLessThan(75);
    expect(result.causalConclusionSupported).toBe(false);
    expect(result.limitations.join(" ")).toContain("Küçük örneklem");
  });

  it("uzman onayı ve tartışmalı ilişkiyi deneysel kanıt gibi sunmaz", () => {
    const expert = assessCausalEvidence({
      ...STRONG_EXPERIMENT,
      relationStatus: "expert_confirmed",
      method: "expert_judgment",
    });
    const disputed = assessCausalEvidence({
      ...STRONG_EXPERIMENT,
      relationStatus: "disputed",
    });
    expect(expert.level).toBe("medium");
    expect(expert.causalConclusionSupported).toBe(false);
    expect(disputed.level).toBe("insufficient");
    expect(disputed.score).toBeLessThan(20);
    expect(disputed.causalConclusionSupported).toBe(false);
  });

  it("geçersiz örneklem ve bilinmeyen yöntemi temkinli normalize eder", () => {
    const result = assessCausalEvidence({
      relationStatus: "data_confirmed",
      method: "bilinmeyen-yontem",
      sampleSize: Number.NaN,
      dataQuality: "mükemmel",
      uncertainty: "belirsiz",
    });
    expect(result.method).toBe("unknown");
    expect(result.sampleSize).toBeNull();
    expect(result.dataQuality).toBe("unknown");
    expect(result.uncertainty).toBe("unknown");
    expect(result.level).toBe("insufficient");
    expect(result.causalConclusionSupported).toBe(false);
  });
});
