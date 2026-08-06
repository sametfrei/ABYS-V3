import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { retrieveChunks } from "@/lib/db/repos/documents";
import { loadTaisKpiInputs } from "@/lib/demo/tais/kpi";
import { loadTaisRiskInputs } from "@/lib/demo/tais/risks";
import { TAIS_REFERENCE_NOW } from "@/lib/demo/tais/seed";
import { answerTaisQuestion } from "@/lib/demo/tais/ask";
import type { TaisDecisionMeta } from "@/lib/demo/tais/executive-summary";
import type { AiDecisionCase } from "@/lib/ai/provider";

/**
 * Ask ABYS (master plan md.15): yetki-farkındalıklı yönetici asistanı.
 *
 * İLKE: Uydurma yok. Cevap yalnızca kurumun KENDİ kayıtlarından (vakalar,
 * kararlar, aksiyonlar, sonuçlar, sinyaller) ve erişim izni olan belge
 * parçalarından kurulur; her iddia kaynağıyla döner. Kanıt yoksa "kanıt
 * bulunamadı" denir — tahmin üretilmez.
 *
 * Her ifade etiketlenir: fact (kayıttan doğrudan), inference (kayıtlardan
 * çıkarım), recommendation (öneri). Tahmin (prediction) yalnızca kayıtlı
 * karşı senaryodan alıntılanır.
 */

type Label = "fact" | "inference" | "recommendation";
interface Statement {
  label: Label;
  text: string;
  source: string;
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  let body: { question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const question = body.question?.trim();
  if (!question) return NextResponse.json({ error: "Soru gerekli." }, { status: 400 });

  await migrate();
  const db = getDb();
  const org = session.orgId;
  const q = question.toLocaleLowerCase("tr-TR");

  const statements: Statement[] = [];
  const sources: { kind: string; ref: string; title: string }[] = [];
  let answer = "";

  const asks = (...words: string[]) => words.some((w) => q.includes(w));

  // --- TAIS demo: org'da TAIS verisi varsa, TAIS'e özgü sorulara (risk/KPI/
  //     karar) mevcut deterministik risk+KPI motorlarından cevap ver. Bu,
  //     örn. "risk" sorularının boş `signals` tablosuna düşüp kanıtsız
  //     kalmasını engeller — TAIS riskleri istek anında hesaplanır, DB'ye
  //     yazılmaz (bkz. src/lib/demo/tais/risks.ts sözleşmesi).
  const taisCustomerCount = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM tais_customers WHERE org_id = $1",
    [org]
  );
  if ((taisCustomerCount.rows[0]?.n ?? 0) > 0) {
    const [kpiInputs, riskInputs] = await Promise.all([
      loadTaisKpiInputs(org, TAIS_REFERENCE_NOW),
      loadTaisRiskInputs(org, TAIS_REFERENCE_NOW),
    ]);
    const caseRows = await db.query<{ id: string; payload: AiDecisionCase }>(
      `SELECT id, payload FROM decision_cases
       WHERE org_id = $1 AND category_id LIKE 'tais-decision:%'
       ORDER BY created_at ASC`,
      [org]
    );
    const decisions: TaisDecisionMeta[] = [];
    for (const c of caseRows.rows) {
      const rec = await db.query<{ id: string; state: string; payload: { riskIds?: string[] } }>(
        `SELECT id, state, payload FROM decision_records
         WHERE org_id = $1 AND case_id = $2 ORDER BY created_at ASC LIMIT 1`,
        [org, c.id]
      );
      const r = rec.rows[0];
      if (!r) continue;
      decisions.push({
        caseId: c.id,
        decisionId: r.id,
        state: r.state ?? "approved",
        riskIds: r.payload?.riskIds ?? [],
        case: c.payload,
      });
    }
    const taisResult = answerTaisQuestion({ question, kpiInputs, riskInputs, decisions, referenceNow: TAIS_REFERENCE_NOW });
    if (taisResult) {
      answer = taisResult.answer;
      statements.push(...taisResult.statements);
      sources.push(...taisResult.sources);
    }
  }

  // --- Aksiyonlar: "hangi aksiyonlar açık/gecikmiş/kimde"
  if (!answer && asks("aksiyon", "görev", "gecik", "kimde", "sorumlu")) {
    const acts = await db.query<{ id: string; title: string; owner: string; status: string }>(
      `SELECT id, title, owner, status FROM actions WHERE org_id = $1 AND status IN ('open','in_progress')
       ORDER BY created_at DESC LIMIT 10`,
      [org]
    );
    if (acts.rows.length > 0) {
      answer = `${acts.rows.length} açık aksiyon var.`;
      for (const a of acts.rows) {
        statements.push({
          label: "fact",
          text: `"${a.title}" — sorumlu: ${a.owner}, durum: ${a.status === "in_progress" ? "yürütülüyor" : "açık"}`,
          source: `aksiyon:${a.id.slice(0, 8)}`,
        });
        sources.push({ kind: "action", ref: a.id, title: a.title });
      }
    }
  }

  // --- Kararlar: "hangi karar bekliyor / onayım"
  if (!answer && asks("karar", "onay", "bekleyen", "vaka")) {
    const cases = await db.query<{ id: string; title: string; severity: string; confidence: number }>(
      `SELECT id, title, severity, confidence FROM decision_cases WHERE org_id = $1 AND status = 'open'
       ORDER BY confidence DESC LIMIT 5`,
      [org]
    );
    if (cases.rows.length > 0) {
      answer = `Onayınızı bekleyen ${cases.rows.length} karar vakası var.`;
      for (const c of cases.rows) {
        statements.push({
          label: "fact",
          text: `${c.title} (kritiklik: ${c.severity}, güven: %${c.confidence})`,
          source: `vaka:${c.id.slice(0, 8)}`,
        });
        sources.push({ kind: "case", ref: c.id, title: c.title });
      }
    } else {
      answer = "Onay bekleyen açık karar vakası yok.";
      statements.push({ label: "fact", text: "Açık vaka sayısı: 0", source: "decision_cases" });
    }
  }

  // --- Sonuçlar/öğrenme: "işe yaradı mı / benzer durumda ne yaptık"
  if (!answer && asks("işe yara", "sonuç", "benzer", "geçmiş", "ders", "öğren")) {
    const outs = await db.query<{ result: string; note: string; lesson: string | null; created_at: string }>(
      `SELECT result, note, lesson, created_at FROM outcomes WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [org]
    );
    if (outs.rows.length > 0) {
      const improved = outs.rows.filter((o) => o.result === "improved").length;
      answer = `Kayıtlı ${outs.rows.length} sonuçtan ${improved} tanesinde iyileşme sağlandı.`;
      for (const o of outs.rows) {
        statements.push({
          label: "fact",
          text: `${o.result === "improved" ? "İyileşti" : o.result === "worsened" ? "Kötüleşti" : "Değişmedi"}: ${o.note}`,
          source: "sonuç kaydı",
        });
        if (o.lesson) {
          statements.push({ label: "inference", text: `Çıkarılan ders: ${o.lesson}`, source: "kurumsal hafıza" });
        }
      }
    }
  }

  // --- Riskler/sinyaller
  if (!answer && asks("risk", "sinyal", "kritik", "uyarı", "sorun")) {
    const sigs = await db.query<{ id: string; title: string; severity: string }>(
      `SELECT id, title, severity FROM signals WHERE org_id = $1 AND status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END LIMIT 5`,
      [org]
    );
    if (sigs.rows.length > 0) {
      answer = `${sigs.rows.length} açık sinyal izleniyor.`;
      for (const s of sigs.rows) {
        statements.push({ label: "fact", text: `[${s.severity}] ${s.title}`, source: `sinyal:${s.id.slice(0, 8)}` });
        sources.push({ kind: "signal", ref: s.id, title: s.title });
      }
    }
  }

  // --- Belge erişimi (RAG): yukarıdakiler cevap vermediyse ya da soru
  //     prosedür/politika sorduysa. Yalnızca izinli belgelerden, atıflı.
  const chunks = await retrieveChunks({ orgId: org, role: session.role, query: question, limit: 3 });
  for (const ch of chunks) {
    statements.push({
      label: "fact",
      text: ch.text.length > 400 ? ch.text.slice(0, 400) + "…" : ch.text,
      source: `${ch.documentTitle} · parça ${ch.chunkIndex + 1}`,
    });
    sources.push({ kind: "document", ref: `${ch.documentId}#${ch.chunkIndex}`, title: ch.documentTitle });
  }
  if (!answer && chunks.length > 0) {
    answer = `Kurumsal belgelerde ${chunks.length} ilgili bölüm bulundu.`;
  }

  // --- Kanıt yoksa dürüst cevap (uydurma YOK)
  if (!answer && statements.length === 0) {
    return NextResponse.json({
      answer: "Bu soruyu yanıtlayacak kayıt ya da belge bulunamadı.",
      evidenceAvailable: false,
      statements: [],
      sources: [],
      note: "ABYS yalnızca kurumun kendi kayıtlarından ve erişim izniniz olan belgelerden cevap verir; tahmin üretmez.",
    });
  }

  return NextResponse.json({
    answer,
    evidenceAvailable: true,
    statements,
    sources,
    viewer: { role: session.role },
  });
}
