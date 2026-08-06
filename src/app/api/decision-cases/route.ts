import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getActiveProvider } from "@/lib/ai/provider";
import { getSector } from "@/lib/sectors";
import { streamedJsonResponse } from "@/lib/ai/stream-route";
import { buildKnowledgeBlock } from "@/lib/domain-knowledge";
import { verifyDecisionCases } from "@/lib/ai/verify-cases";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { checkAnonymousRate } from "@/lib/rate-limit";
import { isPublicDemoEnabled } from "@/lib/public-demo";
import { SESSION_COOKIE } from "../auth/login/route";
import { insertCases, listCasesForOrg, buildServerMemory } from "@/lib/db/repos/decisions";
import { logModelRun } from "@/lib/db/repos/model-runs";
import { getDb } from "@/lib/db/client";

/** Kurumun kayıtlı vakaları (oturum gerekli; org daima oturumdan). */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  const sectorId = req.nextUrl.searchParams.get("sectorId") ?? undefined;
  const cases = await listCasesForOrg(session.orgId, sectorId);
  const db = getDb();
  const enriched = await Promise.all(
    cases.map(async (storedCase) => {
      const record = await db.query<{ id: string }>(
        "SELECT id FROM decision_records WHERE org_id = $1 AND case_id = $2 ORDER BY created_at ASC LIMIT 1",
        [session.orgId, storedCase.id]
      );
      return { ...storedCase, decisionId: record.rows[0]?.id };
    })
  );
  return NextResponse.json({ cases: enriched });
}

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let body: {
    sectorId?: string;
    data?: string;
    constraints?: string;
    decisionMemory?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const data = body.data?.trim();

  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(SESSION_COOKIE)?.value);
  const sector = getSector(session?.sectorId ?? body.sectorId);

  if (!sector) {
    return NextResponse.json({ error: "Geçersiz sektör." }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Operasyonel veri boş olamaz." }, { status: 400 });
  }
  if (data.length > 12000) {
    return NextResponse.json({ error: "Veri çok uzun (12000 karakter sınırı)." }, { status: 400 });
  }

  const constraints =
    body.constraints?.trim() ||
    "Kısıt bildirilmedi — seçenekleri genel operasyonel makullük içinde değerlendir.";

  const domainKnowledge = buildKnowledgeBlock(sector.id);
  if (!session) {
    // Oturumsuz erişim varsayılan olarak kapalıdır — yalnızca ABYS_PUBLIC_DEMO=1
    // ile açık deneme akışı için geri açılır (bkz. src/lib/public-demo.ts).
    if (!isPublicDemoEnabled()) {
      return NextResponse.json({ error: "Bu uç oturum gerektirir." }, { status: 401 });
    }
    // Oturumsuz istekler IP başına sınırlıdır (AI kaynak tüketimine karşı).
    const rate = checkAnonymousRate(req, false);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: rate.message },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } }
      );
    }
    // Oturum varsa yetki SUNUCUDA denetlenir (denetçi analiz çalıştıramaz).
  } else if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }

  // Oturum varsa hafıza SUNUCUDAKİ gerçek kararlar+sonuçlardan kurulur
  // (org-izolasyonlu, kanıtlanmış dersler öne alınır — öğrenme halkası).
  // Oturum yoksa prototip akışı istemcinin gönderdiği özeti kullanır.
  const decisionMemory = session
    ? await buildServerMemory(session.orgId, sector.id)
    : body.decisionMemory?.trim() || "";
  if (session) {
    console.info(
      `[ogrenme] kurumsal hafiza prompt'a beslendi: ${decisionMemory.length} karakter` +
        (decisionMemory.includes("Ders:") ? " (kayitli ders iceriyor)" : "")
    );
  }

  return streamedJsonResponse(async () => {
    const startedAt = Date.now();
    const provider = await getActiveProvider();
    const rawCases = await provider.analyzeDecisionCases({
      sectorLabel: sector.label,
      riskCategories: sector.riskCategories,
      constraints,
      decisionMemory,
      domainKnowledge,
      data,
    });
    // Deterministik doğrulama: desteksiz sayıları işaretle, yapısal tutarlılığı onar.
    const { cases } = verifyDecisionCases(rawCases, {
      data,
      constraints,
      domainKnowledge,
      decisionMemory,
    });
    // Oturum varsa: vakalar + model çalışma kaydı kurum adına kalıcılaşır.
    if (session) {
      if (cases.length > 0) await insertCases(session.orgId, sector.id, cases);
      await logModelRun({
        orgId: session.orgId,
        taskType: "decision_cases",
        provider: provider.id,
        model: provider.id === "ollama" ? process.env.OLLAMA_MODEL ?? "qwen3:4b-instruct" : undefined,
        policy: process.env.AI_POLICY ?? "LOCAL_ONLY",
        latencyMs: Date.now() - startedAt,
        outputValid: cases.length > 0,
        resultCount: cases.length,
        actor: session.displayName,
      }).catch(() => {});
    }
    return { cases, providerId: provider.id, persisted: !!session };
  });
}
