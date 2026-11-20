/**
 * Deterministik kaynak tahsisi optimizasyonu.
 *
 * Model: çok kaynaklı, tam sayılı ve minimum taahhütlü kaynak tahsisi.
 * Amaç, seçeneklere atanan birimlerin toplam değerini kaynak kapasitelerini
 * aşmadan enbüyüklemektir. Çözücü dış servis veya rastgelelik kullanmaz.
 * Arama düğüm sınırına ulaşırsa sonuç "optimal" olarak etiketlenmez.
 */

export interface OptimizationResource {
  id: string;
  label: string;
  capacity: number;
  unit: string;
}

export interface OptimizationOption {
  id: string;
  label: string;
  minUnits?: number;
  maxUnits: number;
  valuePerUnit: number;
  resourcesPerUnit: Record<string, number>;
}

export interface OptimizationInput {
  resources: OptimizationResource[];
  options: OptimizationOption[];
  objectiveLabel?: string;
  valueUnit?: string;
  maxNodes?: number;
}

export type OptimizationStatus = "optimal" | "feasible" | "infeasible";

export interface OptimizationAllocation {
  optionId: string;
  label: string;
  units: number;
  value: number;
  resources: Record<string, number>;
}

export interface OptimizationResult {
  status: OptimizationStatus;
  complete: boolean;
  allocations: OptimizationAllocation[];
  objectiveValue: number;
  objective: { label: string; unit: string };
  resourceUsage: Record<string, number>;
  remaining: Record<string, number>;
  infeasibility: Array<{ resourceId: string; required: number; capacity: number }>;
  nodesExplored: number;
  nodeLimit: number;
  method: string;
  assumptions: string[];
  note: string;
}

export interface OptimizationValidationIssue {
  path: string;
  message: string;
}

export const MAX_OPTIMIZATION_CAPACITY = 1_000_000_000_000;
export const MAX_OPTIMIZATION_VALUE_PER_UNIT = 1_000_000_000;
export const MAX_OPTIMIZATION_UNITS = 1_000_000;
export const MAX_OPTIMIZATION_NODES = 100_000;
const DEFAULT_MAX_NODES = MAX_OPTIMIZATION_NODES;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  const scaled = (value + Number.EPSILON) * factor;
  if (!Number.isFinite(value) || !Number.isFinite(scaled)) {
    throw new Error("Hesaplama sonucu güvenli sayı aralığının dışına çıktı.");
  }
  return Math.round(scaled) / factor;
}

export function validateOptimizationInput(input: OptimizationInput): OptimizationValidationIssue[] {
  const issues: OptimizationValidationIssue[] = [];
  if (!Array.isArray(input.resources) || input.resources.length === 0) {
    issues.push({ path: "resources", message: "En az bir kaynak gerekir." });
  }
  if (!Array.isArray(input.options) || input.options.length === 0) {
    issues.push({ path: "options", message: "En az bir tahsis seçeneği gerekir." });
  }

  const resourceIds = new Set<string>();
  for (const resource of input.resources ?? []) {
    if (!resource.id || resourceIds.has(resource.id)) {
      issues.push({ path: `resources.${resource.id}`, message: "Kaynak kimlikleri boş veya tekrarlı olamaz." });
    }
    resourceIds.add(resource.id);
    if (!resource.label?.trim()) issues.push({ path: `resources.${resource.id}.label`, message: "Kaynak adı gerekli." });
    if (!resource.unit?.trim()) issues.push({ path: `resources.${resource.id}.unit`, message: "Kaynak birimi gerekli." });
    if (
      !finite(resource.capacity) ||
      resource.capacity < 0 ||
      resource.capacity > MAX_OPTIMIZATION_CAPACITY
    ) {
      issues.push({
        path: `resources.${resource.id}.capacity`,
        message: `Kapasite 0 ile ${MAX_OPTIMIZATION_CAPACITY} arasında olmalı.`,
      });
    }
  }

  const optionIds = new Set<string>();
  for (const option of input.options ?? []) {
    if (!option.id || optionIds.has(option.id)) {
      issues.push({ path: `options.${option.id}`, message: "Seçenek kimlikleri boş veya tekrarlı olamaz." });
    }
    optionIds.add(option.id);
    if (!option.label?.trim()) issues.push({ path: `options.${option.id}.label`, message: "Seçenek adı gerekli." });
    const minUnits = option.minUnits ?? 0;
    if (!Number.isInteger(minUnits) || minUnits < 0) {
      issues.push({ path: `options.${option.id}.minUnits`, message: "Minimum birim negatif olmayan tam sayı olmalı." });
    }
    if (
      !Number.isInteger(option.maxUnits) ||
      option.maxUnits < 0 ||
      option.maxUnits > MAX_OPTIMIZATION_UNITS
    ) {
      issues.push({
        path: `options.${option.id}.maxUnits`,
        message: `Maksimum birim 0 ile ${MAX_OPTIMIZATION_UNITS} arasında tam sayı olmalı.`,
      });
    }
    if (minUnits > option.maxUnits) {
      issues.push({ path: `options.${option.id}.minUnits`, message: "Minimum birim maksimumu aşamaz." });
    }
    if (
      !finite(option.valuePerUnit) ||
      option.valuePerUnit < 0 ||
      option.valuePerUnit > MAX_OPTIMIZATION_VALUE_PER_UNIT
    ) {
      issues.push({
        path: `options.${option.id}.valuePerUnit`,
        message: `Birim değeri 0 ile ${MAX_OPTIMIZATION_VALUE_PER_UNIT} arasında olmalı.`,
      });
    }
    for (const [resourceId, amount] of Object.entries(option.resourcesPerUnit ?? {})) {
      if (!resourceIds.has(resourceId)) {
        issues.push({ path: `options.${option.id}.resourcesPerUnit.${resourceId}`, message: "Tanımsız kaynak kullanılıyor." });
      }
      if (!finite(amount) || amount < 0 || amount > MAX_OPTIMIZATION_CAPACITY) {
        issues.push({
          path: `options.${option.id}.resourcesPerUnit.${resourceId}`,
          message: `Birim kaynak tüketimi 0 ile ${MAX_OPTIMIZATION_CAPACITY} arasında olmalı.`,
        });
      }
    }
  }
  return issues;
}

function compareVectors(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function optimizeResourceAllocation(input: OptimizationInput): OptimizationResult {
  const issues = validateOptimizationInput(input);
  if (issues.length > 0) throw new Error(issues[0].message);

  const nodeLimit = Math.max(
    1,
    Math.min(MAX_OPTIMIZATION_NODES, Math.trunc(input.maxNodes ?? DEFAULT_MAX_NODES))
  );
  const resources = input.resources.map((resource) => ({ ...resource }));
  const optionOrder = input.options.map((_, index) => index);
  const capacities = Object.fromEntries(
    resources.map((resource) => [resource.id, resource.capacity])
  ) as Record<string, number>;
  const minimums = input.options.map((option) => option.minUnits ?? 0);

  const minUsage: Record<string, number> = Object.fromEntries(resources.map((r) => [r.id, 0]));
  for (const [index, option] of input.options.entries()) {
    for (const [resourceId, amount] of Object.entries(option.resourcesPerUnit)) {
      minUsage[resourceId] += amount * minimums[index];
    }
  }
  const infeasibility = resources
    .filter((resource) => minUsage[resource.id] > capacities[resource.id] + 1e-9)
    .map((resource) => ({
      resourceId: resource.id,
      required: round(minUsage[resource.id]),
      capacity: resource.capacity,
    }));

  const objective = {
    label: input.objectiveLabel?.trim() || "Toplam değer",
    unit: input.valueUnit?.trim() || "",
  };
  if (infeasibility.length > 0) {
    return {
      status: "infeasible",
      complete: true,
      allocations: [],
      objectiveValue: 0,
      objective,
      resourceUsage: Object.fromEntries(resources.map((r) => [r.id, 0])),
      remaining: { ...capacities },
      infeasibility,
      nodesExplored: 0,
      nodeLimit,
      method: "deterministic-multi-resource-integer-branch-and-bound/v1",
      assumptions: [
        "Minimum taahhütler zorunludur.",
        "Kaynak tüketimi birim başına sabittir.",
        "Amaç toplam değeri enbüyüklemektir.",
      ],
      note: "Minimum taahhütler mevcut kapasiteyi aştığı için uygulanabilir tahsis yok.",
    };
  }

  // İyi bir üst sınırı erken bulmak için yüksek değer yoğunluklu seçenekler
  // önce denenir. Eşitlikte kimlik sırası deterministiktir.
  optionOrder.sort((a, b) => {
    const density = (index: number) => {
      const option = input.options[index];
      const usage = resources.reduce(
        (sum, resource) =>
          sum +
          (option.resourcesPerUnit[resource.id] ?? 0) /
            Math.max(1, resource.capacity),
        0
      );
      return usage === 0 ? Number.POSITIVE_INFINITY : option.valuePerUnit / usage;
    };
    const diff = density(b) - density(a);
    if (diff !== 0) return diff;
    return input.options[a].id.localeCompare(input.options[b].id);
  });

  const suffixMinUsage = Array.from({ length: optionOrder.length + 1 }, () =>
    Object.fromEntries(resources.map((resource) => [resource.id, 0])) as Record<string, number>
  );
  for (let position = optionOrder.length - 1; position >= 0; position--) {
    const index = optionOrder[position];
    for (const resource of resources) {
      suffixMinUsage[position][resource.id] =
        suffixMinUsage[position + 1][resource.id] +
        (input.options[index].resourcesPerUnit[resource.id] ?? 0) * minimums[index];
    }
  }

  const currentUnits = new Array(input.options.length).fill(0);
  const currentUsage: Record<string, number> = Object.fromEntries(resources.map((r) => [r.id, 0]));
  let bestUnits = [...minimums];
  let bestValue = input.options.reduce(
    (sum, option, index) => sum + option.valuePerUnit * minimums[index],
    0
  );
  let nodes = 0;
  let complete = true;

  function maxUnitsForOption(index: number): number {
    const option = input.options[index];
    let upper = option.maxUnits;
    for (const resource of resources) {
      const perUnit = option.resourcesPerUnit[resource.id] ?? 0;
      if (perUnit <= 0) continue;
      const available = capacities[resource.id] - currentUsage[resource.id];
      upper = Math.min(upper, Math.max(0, Math.floor((available + 1e-9) / perUnit)));
    }
    return upper;
  }

  function boundValue(position: number, value: number): number {
    let bound = value;
    for (let next = position; next < optionOrder.length; next++) {
      const index = optionOrder[next];
      bound += maxUnitsForOption(index) * input.options[index].valuePerUnit;
    }
    return bound;
  }

  function search(position: number, value: number): void {
    if (nodes >= nodeLimit) {
      complete = false;
      return;
    }
    nodes++;

    for (const resource of resources) {
      if (currentUsage[resource.id] + suffixMinUsage[position][resource.id] > capacities[resource.id] + 1e-9) {
        return;
      }
    }
    if (boundValue(position, value) < bestValue - 1e-9) return;
    if (position === optionOrder.length) {
      if (
        value > bestValue + 1e-9 ||
        (Math.abs(value - bestValue) <= 1e-9 && compareVectors(currentUnits, bestUnits) > 0)
      ) {
        bestValue = value;
        bestUnits = [...currentUnits];
      }
      return;
    }

    const index = optionOrder[position];
    const option = input.options[index];
    const upper = maxUnitsForOption(index);
    const lower = minimums[index];
    for (let units = upper; units >= lower; units--) {
      currentUnits[index] = units;
      for (const resource of resources) {
        currentUsage[resource.id] += (option.resourcesPerUnit[resource.id] ?? 0) * units;
      }
      search(position + 1, value + option.valuePerUnit * units);
      for (const resource of resources) {
        currentUsage[resource.id] -= (option.resourcesPerUnit[resource.id] ?? 0) * units;
      }
      currentUnits[index] = 0;
      if (!complete) return;
    }
  }

  search(0, 0);

  const allocations: OptimizationAllocation[] = input.options.map((option, index) => ({
    optionId: option.id,
    label: option.label,
    units: bestUnits[index],
    value: round(option.valuePerUnit * bestUnits[index]),
    resources: Object.fromEntries(
      resources.map((resource) => [
        resource.id,
        round((option.resourcesPerUnit[resource.id] ?? 0) * bestUnits[index]),
      ])
    ),
  }));
  const resourceUsage: Record<string, number> = {};
  for (const resource of resources) {
    resourceUsage[resource.id] = round(
      input.options.reduce(
        (sum, option, index) =>
          sum + (option.resourcesPerUnit[resource.id] ?? 0) * bestUnits[index],
        0
      )
    );
  }

  return {
    status: complete ? "optimal" : "feasible",
    complete,
    allocations,
    objectiveValue: round(bestValue),
    objective,
    resourceUsage,
    remaining: Object.fromEntries(
      resources.map((resource) => [
        resource.id,
        round(capacities[resource.id] - resourceUsage[resource.id]),
      ])
    ),
    infeasibility: [],
    nodesExplored: nodes,
    nodeLimit,
    method: "deterministic-multi-resource-integer-branch-and-bound/v1",
    assumptions: [
      "Kaynak tüketimi birim başına sabittir.",
      "Minimum taahhütler zorunludur.",
      "Amaç toplam değeri enbüyüklemektir.",
      "Eşit değerlerde giriş sırasındaki daha yüksek tahsis deterministik olarak tercih edilir.",
    ],
    note: complete
      ? "Arama uzayı tamamlandı; bulunan tahsis bu model için optimaldir."
      : "Arama düğüm sınırına ulaştı; sonuç uygulanabilir ancak optimal olduğu iddia edilmez. Düğüm sınırını artırın veya modeli sadeleştirin.",
  };
}
