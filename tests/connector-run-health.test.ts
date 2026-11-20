import { describe, expect, it } from "vitest";
import { connectorHealthNote, summarizeConnectorRuns } from "../src/lib/connector-run-health";

function run(id: string, status: string, startedAt: string, error: string | null = null) {
  return { id, status, startedAt, error };
}

describe("Konnektör senkron sağlığı", () => {
  it("hiç çalıştırma yoksa nötr özet döner", () => {
    expect(summarizeConnectorRuns([])).toMatchObject({
      lastStatus: null,
      consecutiveFailures: 0,
      retryRecommended: false,
      lastErrorMessage: null,
    });
  });

  it("en yeni başarılı çalıştırmada yeniden deneme önermez", () => {
    const health = summarizeConnectorRuns([
      run("a", "failed", "2026-01-01T00:00:00Z", "zaman aşımı"),
      run("b", "success", "2026-01-02T00:00:00Z"),
    ]);
    expect(health.lastStatus).toBe("success");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.retryRecommended).toBe(false);
    expect(connectorHealthNote(health)).toBeNull();
  });

  it("art arda gelen başarısızlıkları sayar ve son mesajı taşır", () => {
    const health = summarizeConnectorRuns([
      run("a", "success", "2026-01-01T00:00:00Z"),
      run("b", "failed", "2026-01-02T00:00:00Z", "HTTP 500"),
      run("c", "failed", "2026-01-03T00:00:00Z", "  HTTP 429  "),
    ]);
    expect(health.consecutiveFailures).toBe(2);
    expect(health.lastErrorMessage).toBe("HTTP 429");
    expect(health.lastFailureAt).toBe("2026-01-03T00:00:00Z");
    expect(health.retryRecommended).toBe(true);
    expect(connectorHealthNote(health)).toContain("2 ardışık senkron hatası");
  });

  it("girdi sırasından bağımsızdır", () => {
    const runs = [
      run("a", "failed", "2026-01-03T00:00:00Z", "x"),
      run("b", "success", "2026-01-01T00:00:00Z"),
      run("c", "failed", "2026-01-02T00:00:00Z", "y"),
    ];
    const forward = summarizeConnectorRuns(runs);
    const backward = summarizeConnectorRuns([...runs].reverse());
    expect(forward).toEqual(backward);
    expect(forward.consecutiveFailures).toBe(2);
  });

  it("geçersiz tarihlerde çökmez, hata mesajı boşsa null kalır", () => {
    const health = summarizeConnectorRuns([
      run("a", "failed", "bozuk", "   "),
      run("b", "success", "2026-01-01T00:00:00Z"),
    ]);
    expect(health.lastStatus).toBe("success");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastErrorMessage).toBeNull();
  });
});
