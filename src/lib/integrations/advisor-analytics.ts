import { getDb, migrate } from "@/lib/db/client";

/**
 * Danışman Analitik Motoru (Faz 2) — olaylardan DETERMİNİSTİK süre metrikleri.
 *
 * İlke: her metrik olay zaman damgalarının aritmetiğidir; dil modeli
 * kullanılmaz. Model yalnızca sonucu YORUMLAYABİLİR (neden düştü, ne yapmalı).
 *
 * Gizlilik: hesaplar İŞ olaylarına dayanır (lead.opened, call.completed...).
 * Tuş vuruşu/mouse izi gerekmez — "ne kadar tuşa bastı" değil, "işi ne kadar
 * sürede bitirdi" ölçülür. Bu hem hukuken temiz hem yönetimsel olarak anlamlı.
 *
 * Süre modeli (dürüst üçlü ayrım — dış inceleme P0):
 * - activeMinutes: bir session segmenti İÇİNDE, ardışık olaylar arası
 *   IDLE_THRESHOLD_MS'i AŞMAYAN boşluklar.
 * - gapMinutes: bir session segmenti İÇİNDE, eşiği AŞAN boşluklar — "boşta"
 *   DEĞİL "olay boşluğu" denir, çünkü danışman telefonda/portal dışı iş
 *   yapıyor olabilir; segment içinde olduğu bilinir ama ne yaptığı bilinmez.
 * - unknownMinutes: session.started/session.ended (veya session_ref)
 *   segmentlerinin DIŞINDA kalan süre — hiçbir sınıfa sokulmaz. Danışmanın
 *   olay akışında hiç session bilgisi yoksa bu alan null'dır (segment sınırı
 *   doğrulanamadığından "bilinmiyor" bile denemez — UYDURMA yok).
 *
 * `idleMinutes` KULLANIMDAN KALDIRILDI (bkz. docs/INTEGRATION.md) ama geriye
 * dönük uyumluluk için bir sürüm boyunca eski düz (session'dan bağımsız)
 * hesabıyla aynı değerle doldurulmaya devam eder.
 */

const IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 dk — bu eşik çıktıda raporlanır
const CALL_TIMEOUT_MS = 60 * 60 * 1000; // call.started sonrası 60 dk geçmeden "yarım" sayılmaz
const SALE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // sale.started sonrası 24 sa geçmeden "yarım" sayılmaz

export interface AdvisorMetrics {
  advisorRef: string;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  /** İlk-son olay arası toplam süre (sistemde geçirilen) */
  spanMinutes: number;
  /** Session segmenti içinde, eşik altı boşluklar toplamı = gerçek aktif çalışma */
  activeMinutes: number;
  /** Session segmenti içinde, eşiği aşan boşluklar — "olay boşluğu" (eski adı: boşta) */
  gapMinutes: number;
  /**
   * Session segmentleri dışında kalan, sınıflandırılamayan süre. Danışmanın
   * olay akışında hiç session.started/ended veya session_ref bilgisi yoksa
   * segment sınırı doğrulanamadığından null döner (uydurma yok).
   */
  unknownMinutes: number | null;
  /** @deprecated gapMinutes kullanın. Geriye dönük uyumluluk için eski düz (session'dan bağımsız) hesapla dolduruluyor. */
  idleMinutes: number;
  /** lead.opened → ilk call.started/call.completed arası ortalama */
  avgFirstResponseMinutes: number | null;
  /** call.completed → note.completed arası ortalama */
  avgNoteAfterCallMinutes: number | null;
  /** lead.opened → sale.completed arası ortalama (tamamlanan işler) */
  avgSaleCycleMinutes: number | null;
  /** Başlayıp bitmeyen iş sayısı (call.started/sale.started var ama zaman aşımı dolmuş) */
  abandonedCount: number;
  counts: Record<string, number>;
  idleThresholdMinutes: number;
}

interface EventRow {
  event_type: string;
  actor_ref: string | null;
  subject_ref: string | null;
  session_ref: string | null;
  occurred_at: string;
}

interface TimedEvent extends EventRow {
  t: number;
}

interface Segment {
  startMs: number;
  endMs: number;
  events: TimedEvent[];
}

function activeGapForEvents(events: TimedEvent[]): { activeMs: number; gapMs: number } {
  let active = 0;
  let gap = 0;
  for (let i = 1; i < events.length; i++) {
    const d = events[i].t - events[i - 1].t;
    if (d > IDLE_THRESHOLD_MS) gap += d;
    else active += d;
  }
  return { activeMs: active, gapMs: gap };
}

/**
 * Olay akışından doğrulanabilir session segmentleri kurar. Segment sınırı
 * yalnızca gerçek verilerden (session_ref grubu ya da session.started/ended
 * çifti) türetilir; hiçbir varsayımla "muhtemelen içerideydi" denmez.
 * Hiç session bilgisi yoksa null döner (unknownMinutes hesaplanamaz).
 */
function buildSessionSegments(sorted: TimedEvent[]): Segment[] | null {
  if (sorted.some((e) => e.session_ref)) {
    const groups = new Map<string, TimedEvent[]>();
    for (const e of sorted) {
      if (!e.session_ref) continue;
      const list = groups.get(e.session_ref) ?? [];
      list.push(e);
      groups.set(e.session_ref, list);
    }
    return [...groups.values()]
      .map((events) => {
        const sortedEvents = [...events].sort((a, b) => a.t - b.t);
        return {
          startMs: sortedEvents[0].t,
          endMs: sortedEvents[sortedEvents.length - 1].t,
          events: sortedEvents,
        };
      })
      .sort((a, b) => a.startMs - b.startMs);
  }

  if (!sorted.some((e) => e.event_type === "session.started" || e.event_type === "session.ended")) {
    return null;
  }

  const segments: Segment[] = [];
  let openStart: number | null = null;
  let bucket: TimedEvent[] = [];
  for (const e of sorted) {
    if (e.event_type === "session.started") {
      if (openStart !== null && bucket.length > 0) {
        // Önceki oturum session.ended almadan yeni oturum başladı — son
        // bilinen olayla kapatılmış say (uydurma yok, elde ne varsa o).
        segments.push({ startMs: openStart, endMs: bucket[bucket.length - 1].t, events: bucket });
      }
      openStart = e.t;
      bucket = [e];
      continue;
    }
    if (openStart === null) continue; // session açılmadan gelen olay: segment dışı
    bucket.push(e);
    if (e.event_type === "session.ended") {
      segments.push({ startMs: openStart, endMs: e.t, events: bucket });
      openStart = null;
      bucket = [];
    }
  }
  if (openStart !== null && bucket.length > 0) {
    // Kapanmamış oturum: elimizdeki son olaya kadar sürdüğünü kabul ederiz.
    segments.push({ startMs: openStart, endMs: bucket[bucket.length - 1].t, events: bucket });
  }
  return segments.length > 0 ? segments : null;
}

function minutesBetween(a: number, b: number): number {
  return Math.max(0, Math.round(((b - a) / 60000) * 10) / 10);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/**
 * Bir danışmanın belirli aralıktaki olaylarından metrikleri hesaplar.
 * `asOfMs`: "yarım bırakılan iş" zaman aşımının ölçüldüğü referans an —
 * varsayılan gerçek zaman, ama geçmiş bir pencere sorgulanıyorsa çağıran
 * pencerenin `to` sınırını geçebilir (bkz. metricsForOrg).
 */
export function computeMetrics(
  advisorRef: string,
  events: EventRow[],
  asOfMs: number = Date.now()
): AdvisorMetrics {
  const sorted: TimedEvent[] = [...events]
    .map((e) => ({ ...e, t: new Date(e.occurred_at).getTime() }))
    .sort((a, b) => a.t - b.t);
  const counts: Record<string, number> = {};
  for (const e of sorted) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;

  const base: AdvisorMetrics = {
    advisorRef,
    eventCount: sorted.length,
    firstEventAt: sorted[0]?.occurred_at ?? null,
    lastEventAt: sorted[sorted.length - 1]?.occurred_at ?? null,
    spanMinutes: 0,
    activeMinutes: 0,
    gapMinutes: 0,
    unknownMinutes: null,
    idleMinutes: 0,
    avgFirstResponseMinutes: null,
    avgNoteAfterCallMinutes: null,
    avgSaleCycleMinutes: null,
    abandonedCount: 0,
    counts,
    idleThresholdMinutes: IDLE_THRESHOLD_MS / 60000,
  };
  if (sorted.length === 0) return base;

  const times = sorted.map((e) => e.t);
  base.spanMinutes = minutesBetween(times[0], times[times.length - 1]);

  // Eski düz hesap (session'dan bağımsız) — yalnızca deprecated idleMinutes için korunuyor.
  const legacy = activeGapForEvents(sorted);
  base.idleMinutes = Math.round((legacy.gapMs / 60000) * 10) / 10;

  const segments = buildSessionSegments(sorted);
  if (segments) {
    let activeMs = 0;
    let gapMs = 0;
    for (const seg of segments) {
      const r = activeGapForEvents(seg.events);
      activeMs += r.activeMs;
      gapMs += r.gapMs;
    }
    const totalSpanMs = times[times.length - 1] - times[0];
    base.activeMinutes = Math.round((activeMs / 60000) * 10) / 10;
    base.gapMinutes = Math.round((gapMs / 60000) * 10) / 10;
    base.unknownMinutes = Math.round((Math.max(0, totalSpanMs - activeMs - gapMs) / 60000) * 10) / 10;
  } else {
    // Hiç session bilgisi yok: segment sınırı doğrulanamaz, unknownMinutes null kalır (uydurma yok).
    base.activeMinutes = Math.round((legacy.activeMs / 60000) * 10) / 10;
    base.gapMinutes = base.idleMinutes;
  }

  // Konu (lead) bazlı süre zincirleri
  const bySubject = new Map<string, EventRow[]>();
  for (const e of sorted) {
    if (!e.subject_ref) continue;
    const list = bySubject.get(e.subject_ref) ?? [];
    list.push(e);
    bySubject.set(e.subject_ref, list);
  }

  const firstResponses: number[] = [];
  const noteDelays: number[] = [];
  const saleCycles: number[] = [];
  let abandoned = 0;

  for (const [, list] of bySubject) {
    const at = (type: string) => {
      const found = list.find((x) => x.event_type === type);
      return found ? new Date(found.occurred_at).getTime() : null;
    };
    const opened = at("lead.opened") ?? at("lead.assigned") ?? at("lead.created");
    const callStarted = at("call.started");
    const callDone = at("call.completed") ?? at("call.finished");
    const noteDone = at("note.completed") ?? at("note.created");
    const saleDone = at("sale.completed");

    // İlk müdahale: lead açıldıktan sonra ilk temas
    const firstContact = callStarted ?? callDone;
    if (opened !== null && firstContact !== null && firstContact >= opened) {
      firstResponses.push(minutesBetween(opened, firstContact));
    }
    // Görüşme sonrası not girme süresi
    if (callDone !== null && noteDone !== null && noteDone >= callDone) {
      noteDelays.push(minutesBetween(callDone, noteDone));
    }
    // Satış döngüsü
    if (opened !== null && saleDone !== null && saleDone >= opened) {
      saleCycles.push(minutesBetween(opened, saleDone));
    }
    // Yarım bırakılan iş: başlamış, bitmemiş VE zaman aşımı dolmuş
    // (henüz aşılmadıysa "devam ediyor" sayılır, "yarım" değil)
    const saleStarted = at("sale.started");
    if (callStarted !== null && callDone === null && asOfMs - callStarted > CALL_TIMEOUT_MS) {
      abandoned++;
    }
    if (saleStarted !== null && saleDone === null && asOfMs - saleStarted > SALE_TIMEOUT_MS) {
      abandoned++;
    }
  }

  base.avgFirstResponseMinutes = avg(firstResponses);
  base.avgNoteAfterCallMinutes = avg(noteDelays);
  base.avgSaleCycleMinutes = avg(saleCycles);
  base.abandonedCount = abandoned;
  return base;
}

/** Kurumdaki tüm danışmanların metrikleri (org-izolasyonlu). */
export async function metricsForOrg(params: {
  orgId: string;
  fromIso?: string;
  toIso?: string;
  advisorRef?: string;
}): Promise<AdvisorMetrics[]> {
  await migrate();
  const from = params.fromIso ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const to = params.toIso ?? new Date().toISOString();

  const sql = `SELECT event_type, actor_ref, subject_ref, session_ref, occurred_at
     FROM integration_events
     WHERE org_id = $1 AND actor_ref IS NOT NULL
       AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
       ${params.advisorRef ? "AND actor_ref = $4" : ""}
     ORDER BY occurred_at ASC`;
  const args = params.advisorRef ? [params.orgId, from, to, params.advisorRef] : [params.orgId, from, to];
  const r = await getDb().query<EventRow>(sql, args);
  const asOfMs = new Date(to).getTime();

  const byAdvisor = new Map<string, EventRow[]>();
  for (const row of r.rows) {
    const ref = row.actor_ref!;
    const list = byAdvisor.get(ref) ?? [];
    list.push(row);
    byAdvisor.set(ref, list);
  }

  return [...byAdvisor.entries()]
    .map(([ref, events]) => computeMetrics(ref, events, asOfMs))
    .sort((a, b) => b.eventCount - a.eventCount);
}

export interface TimelineEntry {
  at: string;
  eventType: string;
  subjectRef: string | null;
  gapMinutesBefore: number | null;
  isIdleGap: boolean;
}

/** Danışmanın gün akışı (Timeline Engine) — olayların sıralı dökümü. */
export async function timelineFor(params: {
  orgId: string;
  advisorRef: string;
  fromIso?: string;
  toIso?: string;
}): Promise<TimelineEntry[]> {
  await migrate();
  const from = params.fromIso ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const to = params.toIso ?? new Date().toISOString();
  const r = await getDb().query<EventRow>(
    `SELECT event_type, actor_ref, subject_ref, occurred_at FROM integration_events
     WHERE org_id = $1 AND actor_ref = $2
       AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
     ORDER BY occurred_at ASC`,
    [params.orgId, params.advisorRef, from, to]
  );

  let prev: number | null = null;
  return r.rows.map((row) => {
    const t = new Date(row.occurred_at).getTime();
    const gap = prev === null ? null : minutesBetween(prev, t);
    const isIdle = prev !== null && t - prev > IDLE_THRESHOLD_MS;
    prev = t;
    return {
      at: row.occurred_at,
      eventType: row.event_type,
      subjectRef: row.subject_ref,
      gapMinutesBefore: gap,
      isIdleGap: isIdle,
    };
  });
}
