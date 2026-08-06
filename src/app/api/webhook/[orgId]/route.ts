import { NextRequest, NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db/client";
import { verifyWebhook, recordDelivery } from "@/lib/integrations/webhook";
import { insertDataset } from "@/lib/db/repos/data";
import { parseKpis } from "@/lib/kpi";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/**
 * İmzalı webhook alım ucu (master plan md.16).
 * POST /api/webhook/<orgId>
 *
 * Zorunlu başlıklar:
 *   X-ABYS-Signature        HMAC-SHA256(secret, "<timestamp>.<rawBody>") hex
 *   X-ABYS-Timestamp        epoch ms (±5 dk pencere)
 *   X-ABYS-Idempotency-Key  benzersiz teslimat anahtarı
 *
 * Kabul edilen gövde: { source: string, payload: string | object }
 * Ham girdi KORUNUR (veri soyu), KPI'lar ayıklanır, denetim olayı yazılır.
 * Bu uç OTURUM GEREKTİRMEZ (makineler çağırır) — güvenlik tamamen imzaya
 * dayanır; org kimliği URL'den gelir ama işlem yalnızca imza doğrularsa yapılır.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const rawBody = await req.text();

  const signature = req.headers.get("x-abys-signature");
  const timestamp = req.headers.get("x-abys-timestamp");
  const idempotencyKey = req.headers.get("x-abys-idempotency-key");

  const verdict = await verifyWebhook({ orgId, signature, timestamp, idempotencyKey, rawBody });

  if (!verdict.ok) {
    // Reddedilen denemeler de kaydedilir (idempotency anahtarı varsa).
    if (idempotencyKey && signature && verdict.reason !== "org_bulunamadi") {
      await recordDelivery({
        orgId,
        idempotencyKey,
        signature,
        payloadSize: rawBody.length,
        accepted: false,
        reason: verdict.reason,
      }).catch(() => {});
    }
    const status = verdict.reason === "hiz_siniri" ? 429 : verdict.reason === "org_bulunamadi" ? 404 : 401;
    return NextResponse.json({ error: verdict.message, reason: verdict.reason }, { status });
  }

  // İmza geçerli — idempotency kontrolü (aynı teslimat iki kez işlenmez)
  const dup = await recordDelivery({
    orgId,
    idempotencyKey: idempotencyKey!,
    signature: signature!,
    payloadSize: rawBody.length,
    accepted: true,
  });
  if (dup.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true, message: "Bu teslimat zaten işlendi (idempotent)." });
  }

  let body: { source?: string; payload?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Gövde geçerli JSON değil." }, { status: 400 });
  }

  const payloadText =
    typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload ?? {}, null, 2);
  if (!payloadText.trim()) {
    return NextResponse.json({ error: "payload boş olamaz." }, { status: 400 });
  }

  await migrate();
  const db = getDb();
  const org = await db.query<{ sector_id: string }>("SELECT sector_id FROM organizations WHERE id = $1", [orgId]);
  const sectorId = org.rows[0]?.sector_id ?? "other";

  // Ham girdi korunur + KPI ayıklama (deterministik)
  const kpis = parseKpis(payloadText).map((k) => ({ label: k.label, value: k.value }));
  const datasetId = await insertDataset({
    orgId,
    sectorId,
    sourceLabel: body.source?.trim() || "webhook",
    rawContent: payloadText,
    ingestedBy: "webhook",
    kpis,
  });

  await recordAuditEvent({
    orgId,
    actor: "webhook",
    type: "data_ingested",
    summary: `Webhook verisi alındı: ${body.source ?? "webhook"} (${kpis.length} KPI)`,
    detail: datasetId,
  });

  return NextResponse.json({ ok: true, datasetId, kpiCount: kpis.length });
}
