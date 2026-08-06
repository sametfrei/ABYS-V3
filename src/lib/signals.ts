import type { Sector } from "./sectors";
import { listEntities } from "./entities";
import type { AssessedRisk } from "./entities";

export type Severity = "critical" | "warning" | "info" | "healthy";

export interface Signal {
  id: string;
  categoryId: string;
  categoryLabel: string;
  severity: Severity;
  title: string;
  sources: string[];
  recommendedAction?: string;
  isReal?: boolean;
  serviceType?: string | null;
  customerName?: string | null;
  locationName?: string | null;
  rootCause?: string;
  expectedImpact?: string;
  confidence?: number;
  dataAsOf?: string;
  evidence?: { type: string; id: string }[];
}

const SEVERITY_CYCLE: Severity[] = ["critical", "warning", "info", "warning"];

export function seedSignalsForSector(sector: Sector): Signal[] {
  return sector.riskCategories.map((rc, i) => ({
    id: `${sector.id}-${rc.id}`,
    categoryId: rc.id,
    categoryLabel: rc.label,
    severity: SEVERITY_CYCLE[i % SEVERITY_CYCLE.length],
    title: rc.outputExample,
    sources: rc.sources,
    isReal: false,
  }));
}

export function getActiveSignals(sector: Sector): Signal[] {
  const assessed = listEntities<AssessedRisk>("assessed-risks").filter((a) => a.sectorId === sector.id);
  if (assessed.length === 0) return seedSignalsForSector(sector);

  return assessed.map((a) => {
    const rc = sector.riskCategories.find((r) => r.id === a.categoryId);
    return {
      id: `${sector.id}-${a.categoryId}`,
      categoryId: a.categoryId,
      categoryLabel: a.categoryLabel,
      severity: a.severity,
      title: a.explanation,
      sources: rc?.sources ?? [],
      recommendedAction: a.recommendedAction,
      isReal: true,
    };
  });
}

export const SEVERITY_META: Record<Severity, { label: string; color: string; soft: string }> = {
  critical: { label: "KRİTİK", color: "var(--abys-critical)", soft: "var(--abys-critical-soft)" },
  warning: { label: "DİKKAT", color: "var(--abys-warning)", soft: "var(--abys-warning-soft)" },
  info: { label: "BİLGİ", color: "var(--abys-info)", soft: "var(--abys-info-soft)" },
  healthy: { label: "SAĞLIKLI", color: "var(--abys-healthy)", soft: "var(--abys-healthy-soft)" },
};
