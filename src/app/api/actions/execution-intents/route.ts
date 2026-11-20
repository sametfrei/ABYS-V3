import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../auth/login/route";
import {
  EXECUTION_INTENT_MODES,
  ExecutionIntentError,
  approveExecutionIntent,
  listExecutionIntents,
  prepareExecutionIntent,
} from "@/lib/db/repos/execution-intents";

const payloadSchema = z
  .record(z.string(), z.unknown())
  .refine((payload) => JSON.stringify(payload).length <= 50_000, {
    message: "Yürütme yükü en fazla 50.000 karakter olabilir.",
  });

const postSchema = z.object({
  actionId: z.string().min(1).max(300),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency anahtarı yalnızca güvenli karakterler içermeli."),
  mode: z.enum(EXECUTION_INTENT_MODES),
  targetSystem: z.string().trim().max(200).optional(),
  summary: z.string().trim().min(1).max(2000),
  payload: payloadSchema.optional(),
});

const patchSchema = z.object({
  intentId: z.string().min(1).max(300),
});

function intentErrorResponse(err: ExecutionIntentError) {
  const status = err.reason === "not_found" ? 404 : err.reason === "conflict" ? 409 : 409;
  return NextResponse.json(
    { error: err.message, code: err.code, reason: err.reason },
    { status }
  );
}

/** Yürütme hazırlıkları — dış sistem çağrısı değil, insan onaylı niyet kaydı. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const actionId = req.nextUrl.searchParams.get("actionId") ?? undefined;
  if (actionId && actionId.length > 300) {
    return NextResponse.json({ error: "Geçersiz aksiyon kimliği." }, { status: 400 });
  }
  const intents = await listExecutionIntents({ orgId: session.orgId, actionId });
  return NextResponse.json({ intents });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }
  const parsed = await parseBody(req, postSchema, { maxBytes: 64 * 1024 });
  if (!parsed.ok) return parsed.response;
  try {
    const result = await prepareExecutionIntent({
      orgId: session.orgId,
      actionId: parsed.data.actionId,
      idempotencyKey: parsed.data.idempotencyKey,
      mode: parsed.data.mode,
      targetSystem: parsed.data.targetSystem,
      summary: parsed.data.summary,
      payload: parsed.data.payload,
      actorId: session.userId,
      actorName: session.displayName,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof ExecutionIntentError) return intentErrorResponse(err);
    throw err;
  }
}

/** Hazırlanmış niyeti insan onayına sunar; dış çağrı yapmaz. */
export async function PATCH(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }
  const parsed = await parseBody(req, patchSchema, { maxBytes: 8 * 1024 });
  if (!parsed.ok) return parsed.response;
  try {
    const intent = await approveExecutionIntent({
      orgId: session.orgId,
      intentId: parsed.data.intentId,
      actorId: session.userId,
      actorName: session.displayName,
    });
    return NextResponse.json({ intent });
  } catch (err) {
    if (err instanceof ExecutionIntentError) return intentErrorResponse(err);
    throw err;
  }
}
