import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { validateDefinition } from "@/lib/db/repos/kpi-registry";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "validate_kpi_definition")) {
    return NextResponse.json({ error: permissionError("validate_kpi_definition") }, { status: 403 });
  }
  const { id } = await params;
  try {
    const validated = await validateDefinition({
      orgId: session.orgId,
      id,
      userId: session.userId,
      displayName: session.displayName,
      role: session.role,
    });
    return validated
      ? NextResponse.json({ validated: true })
      : NextResponse.json({ error: "Definition not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Validation failed." },
      { status: 422 }
    );
  }
}
