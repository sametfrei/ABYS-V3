import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { localizedError, requestLocale } from "@/lib/api-i18n";
import { t } from "@/lib/i18n";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { getSemanticGraph } from "@/lib/db/repos/semantic-graph";
import { traverseSemanticGraph, type TraversalDirection } from "@/lib/semantic-traversal";

function boundedInteger(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.trunc(parsed)))
    : fallback;
}

/** GET /api/semantic-graph/neighborhood — bir varlıktan çok-hop grafik komşuluğu. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const root = req.nextUrl.searchParams.get("root")?.trim();
  if (!root) return localizedError(req, "api.graph.rootRequired", 400);
  const entity = req.nextUrl.searchParams.get("entity")?.trim() || null;
  const rawDirection = req.nextUrl.searchParams.get("direction") ?? "both";
  if (rawDirection !== "outbound" && rawDirection !== "inbound" && rawDirection !== "both") {
    return localizedError(req, "api.graph.invalidDirection", 400);
  }
  const direction = rawDirection as TraversalDirection;
  const depth = boundedInteger(req.nextUrl.searchParams.get("depth"), 2, 0, 8);
  const maxNodes = boundedInteger(req.nextUrl.searchParams.get("maxNodes"), 200, 1, 2_000);
  const sourceLimit = boundedInteger(req.nextUrl.searchParams.get("limit"), 2_000, 1, 10_000);

  const graph = await getSemanticGraph(session.orgId, sourceLimit);
  const exact = graph.nodes.find((node) => node.id === root);
  const candidates = exact
    ? [exact]
    : graph.nodes.filter((node) => node.ref === root && (!entity || node.entity === entity));
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: t(requestLocale(req), "api.graph.nodeNotFound"), truncated: graph.coverage.truncated },
      { status: 404 }
    );
  }
  if (candidates.length > 1) {
    return NextResponse.json(
      {
        error: t(requestLocale(req), "api.graph.ambiguousRoot"),
        candidates: candidates.slice(0, 20).map((node) => ({
          id: node.id,
          entity: node.entity,
          ref: node.ref,
          label: node.label,
        })),
      },
      { status: 409 }
    );
  }

  const traversal = traverseSemanticGraph(graph, {
    rootNodeIds: [candidates[0].id],
    depth,
    direction,
    maxNodes,
  });
  return NextResponse.json({
    root: candidates[0],
    traversal,
    sourceCoverage: graph.coverage,
    provenance: graph.provenance,
  });
}
