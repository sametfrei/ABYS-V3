/**
 * KPI yönü (polarite) için tek kanonik çıkarım.
 *
 * Şemada açık bir polarite alanı yoktur; yön yalnızca kayıtlı eşik/hedef
 * konumlarından türetilir. Uydurma yapılmaz: en az iki referans gerekir,
 * eşit veya çelişkili referanslarda sonuç `null` döner. Bu modül hem sonuç
 * ölçümü hem de aykırılık sinyali sınıflandırması tarafından kullanılır.
 */

export type KpiDirection = "lower_is_better" | "higher_is_better";
export type KpiDirectionBasis = Array<"warn" | "critical" | "target">;

export interface KpiDirectionInference {
  direction: KpiDirection;
  basis: KpiDirectionBasis;
}

/**
 * Eşik konumlarından yönü ve kullanılan referansları türetir.
 *
 * - `warn` + `critical` varsa: kritik eşik uyarıdan yüksekse yüksek değer
 *   kötüdür (`lower_is_better`); düşükse düşük değer kötüdür.
 * - Hedef de varsa iyi tarafta ve uyarı eşiğinden kesin olarak ayrı olmalıdır;
 *   aksi halde tanım çelişkilidir ve `null` döner.
 * - Tek referans, eşit referans çifti veya çelişkili hedef belirsizdir.
 */
export function inferKpiDirectionWithBasis(
  warn: number | null,
  critical: number | null,
  target: number | null
): KpiDirectionInference | null {
  const present = [warn, critical, target].filter((value) => value !== null).length;
  if (present < 2) return null;

  let lowerIsBetter: boolean;
  let basis: KpiDirectionBasis;

  if (warn !== null && critical !== null) {
    if (warn === critical) return null;
    // Kritik eşik uyarıdan yüksekse yüksek değer kötüdür (hata oranı gibi).
    lowerIsBetter = critical > warn;
    basis = ["warn", "critical"];
    if (target !== null) {
      const targetConsistent = lowerIsBetter ? target < warn : target > warn;
      if (!targetConsistent) return null;
      basis = ["warn", "critical", "target"];
    }
  } else if (warn !== null && target !== null) {
    if (warn === target) return null;
    lowerIsBetter = target < warn;
    basis = ["warn", "target"];
  } else if (critical !== null && target !== null) {
    if (critical === target) return null;
    lowerIsBetter = target < critical;
    basis = ["critical", "target"];
  } else {
    return null;
  }

  return {
    direction: lowerIsBetter ? "lower_is_better" : "higher_is_better",
    basis,
  };
}

/** Yalnızca yön gerektiğinde kullanılan sade sürüm. */
export function inferKpiDirection(
  warn: number | null,
  critical: number | null,
  target: number | null
): KpiDirection | null {
  return inferKpiDirectionWithBasis(warn, critical, target)?.direction ?? null;
}
