import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "@/lib/auth/core";
import {
  MAX_OPTIMIZATION_CAPACITY,
  MAX_OPTIMIZATION_NODES,
  MAX_OPTIMIZATION_UNITS,
  MAX_OPTIMIZATION_VALUE_PER_UNIT,
  optimizeResourceAllocation,
} from "@/lib/optimization";
import { localizedError } from "@/lib/api-i18n";

const resourcesPerUnitSchema = z
  .record(
    z.string().trim().min(1).max(80),
    z.number().finite().nonnegative().max(MAX_OPTIMIZATION_CAPACITY)
  )
  .refine((map) => Object.keys(map).length <= 50, {
    message: "Bir seçenek en fazla 50 kaynak tüketebilir.",
  });

const resourceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  capacity: z.number().finite().nonnegative().max(MAX_OPTIMIZATION_CAPACITY),
  unit: z.string().trim().min(1).max(40),
});

const optionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  minUnits: z.number().int().nonnegative().max(1_000_000).optional(),
  maxUnits: z.number().int().nonnegative().max(MAX_OPTIMIZATION_UNITS),
  valuePerUnit: z.number().finite().nonnegative().max(MAX_OPTIMIZATION_VALUE_PER_UNIT),
  resourcesPerUnit: resourcesPerUnitSchema,
});

const postSchema = z.object({
  resources: z.array(resourceSchema).min(1).max(10),
  options: z.array(optionSchema).min(1).max(50),
  objectiveLabel: z.string().trim().max(160).optional(),
  valueUnit: z.string().trim().max(40).optional(),
  maxNodes: z.number().int().min(1).max(MAX_OPTIMIZATION_NODES).optional(),
});

/** POST — deterministik çok kaynaklı tam sayılı tahsis optimizasyonu. */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema, { maxBytes: 256_000 });
  if (!parsed.ok) return parsed.response;
  try {
    const result = optimizeResourceAllocation(parsed.data);
    return NextResponse.json({
      ...result,
      provenance: {
        engine: "src/lib/optimization.ts",
        calculation: "deterministic",
        generatedAt: new Date().toISOString(),
        note: "Bu sonuç yalnızca verilen kapasite, tüketim ve birim değer varsayımları altında geçerlidir.",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Optimizasyon girdisi geçersiz." },
      { status: 400 }
    );
  }
}
