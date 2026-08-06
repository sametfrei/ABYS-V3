import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/lib/integrations/advisor-analytics";

const T0 = new Date("2026-01-01T09:00:00.000Z").getTime();
const min = (n: number) => n * 60 * 1000;
function iso(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

describe("computeMetrics — süre modeli (dürüst üçlü ayrım)", () => {
  it("session.started/ended segmenti: segment içi ≤10dk aktif, >10dk boşluk (gap); segment dışı unknownMinutes'e düşer", () => {
    const events = [
      { event_type: "session.started", actor_ref: "adv-1", subject_ref: null, session_ref: null, occurred_at: iso(0) },
      // segment içi, önceki olaydan 5dk sonra → aktif
      { event_type: "lead.opened", actor_ref: "adv-1", subject_ref: "lead-1", session_ref: null, occurred_at: iso(min(5)) },
      // segment içi, önceki olaydan 5dk sonra → aktif
      { event_type: "session.ended", actor_ref: "adv-1", subject_ref: null, session_ref: null, occurred_at: iso(min(10)) },
      // segment dışı (session kapandıktan sonra, yeni session açılmadan) → unknown
      { event_type: "call.started", actor_ref: "adv-1", subject_ref: "lead-1", session_ref: null, occurred_at: iso(min(30)) },
    ];
    const m = computeMetrics("adv-1", events, T0 + min(30));
    expect(m.activeMinutes).toBe(10);
    expect(m.gapMinutes).toBe(0);
    expect(m.unknownMinutes).toBe(20);
    expect(m.spanMinutes).toBe(30);
  });

  it("session_ref grubu: aynı segment içinde ≤10dk aktif, >10dk boşluk (gap) doğru ayrılır", () => {
    const events = [
      { event_type: "lead.opened", actor_ref: "adv-2", subject_ref: "lead-2", session_ref: "s-1", occurred_at: iso(0) },
      // önceki olaydan 8dk sonra, eşik altı → aktif
      { event_type: "call.started", actor_ref: "adv-2", subject_ref: "lead-2", session_ref: "s-1", occurred_at: iso(min(8)) },
      // önceki olaydan 11dk sonra, eşiği aşıyor → gap
      { event_type: "call.completed", actor_ref: "adv-2", subject_ref: "lead-2", session_ref: "s-1", occurred_at: iso(min(19)) },
    ];
    const m = computeMetrics("adv-2", events, T0 + min(19));
    expect(m.activeMinutes).toBe(8);
    expect(m.gapMinutes).toBe(11);
    // Tüm olaylar aynı session_ref segmentine ait, segment dışı süre yok.
    expect(m.unknownMinutes).toBe(0);
  });

  it("hiç session bilgisi yoksa unknownMinutes null kalır (uydurma yok), eski düz hesap kullanılır", () => {
    const events = [
      { event_type: "lead.opened", actor_ref: "adv-3", subject_ref: "lead-3", session_ref: null, occurred_at: iso(0) },
      // önceki olaydan 15dk sonra, eşiği aşıyor → gap (idleMinutes ile aynı)
      { event_type: "call.started", actor_ref: "adv-3", subject_ref: "lead-3", session_ref: null, occurred_at: iso(min(15)) },
    ];
    const m = computeMetrics("adv-3", events, T0 + min(15));
    expect(m.unknownMinutes).toBeNull();
    expect(m.gapMinutes).toBe(15);
    expect(m.gapMinutes).toBe(m.idleMinutes);
    expect(m.activeMinutes).toBe(0);
  });

  it("devam eden çağrı 60 dk dolmadan 'yarım' sayılmaz; 60 dk'yı aşınca sayılır", () => {
    const notYetTimedOut = [
      {
        event_type: "call.started",
        actor_ref: "adv-4",
        subject_ref: "lead-4",
        session_ref: null,
        occurred_at: iso(0),
      },
    ];
    // asOfMs = call.started'dan 30dk sonra — 60dk eşiği henüz dolmadı.
    const stillOngoing = computeMetrics("adv-4", notYetTimedOut, T0 + min(30));
    expect(stillOngoing.abandonedCount).toBe(0);

    // asOfMs = call.started'dan 90dk sonra — eşik aşıldı, "yarım" sayılır.
    const abandoned = computeMetrics("adv-4", notYetTimedOut, T0 + min(90));
    expect(abandoned.abandonedCount).toBe(1);
  });

  it("devam eden satış 24 saat dolmadan 'yarım' sayılmaz; aşınca sayılır", () => {
    const events = [
      {
        event_type: "sale.started",
        actor_ref: "adv-5",
        subject_ref: "lead-5",
        session_ref: null,
        occurred_at: iso(0),
      },
    ];
    const stillOngoing = computeMetrics("adv-5", events, T0 + min(60 * 23));
    expect(stillOngoing.abandonedCount).toBe(0);

    const abandoned = computeMetrics("adv-5", events, T0 + min(60 * 25));
    expect(abandoned.abandonedCount).toBe(1);
  });
});
