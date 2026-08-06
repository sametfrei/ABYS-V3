/**
 * Oturumsuz "prototip/demo" akışı anahtarı (dış inceleme P0 düzeltmesi).
 *
 * Bağlam: /api/analyze, /api/briefing, /api/ingest, /api/assess-risk,
 * /api/decision-cases (POST) bilinçli olarak oturumsuz da çalışabilecek
 * şekilde tasarlanmıştı — ana sayfa "No setup. Pick a role, get answers in
 * seconds." vaadiyle, localStorage tabanlı bir deneme modu sunar
 * (bkz. docs/DECISION_LOG.md). Ama varsayılan açık olması, kimliği
 * doğrulanmamış herhangi bir istemcinin AI hesap kaynağını (ve, politika
 * CLOUD_ALLOWED/CLOUD_ONLY ise, bulut maliyetini) tüketmesine izin veriyordu.
 *
 * Çözüm: bu uçlar artık VARSAYILAN OLARAK yalnızca oturumlu istekleri kabul
 * eder. Oturumsuz deneme akışı yalnızca ABYS_PUBLIC_DEMO=1 açıkça
 * ayarlandığında geri açılır (ve o zaman da IP başına hız sınırına tabidir —
 * bkz. src/lib/rate-limit.ts).
 */
export function isPublicDemoEnabled(): boolean {
  return process.env.ABYS_PUBLIC_DEMO === "1";
}
