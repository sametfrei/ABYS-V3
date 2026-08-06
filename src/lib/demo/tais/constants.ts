/**
 * TAIS IKF MMC demosu icin paylasilan sabitler.
 *
 * Neden ayri dosya: seed.ts ve decisions.ts birbirinin fonksiyonlarini
 * cagirir (seed.ts karar+aksiyon zincirini de kurmak icin decisions.ts'e,
 * decisions.ts referans sabitleri icin seed.ts'e ihtiyac duyardi) — bu
 * dongusel importu onlemek icin sabitler tek, notrl bir modulde tutulur.
 * seed.ts geriye donuk uyumluluk icin bunlari yeniden disa aktarir.
 */

export const TAIS_ORG_CODE = "tais-ikf-demo";
export const TAIS_ORG_NAME = "TAIS IKF MMC";
/** sectors.ts SectorId listesinde "Integrated Facility Management" yok — sentetik varsayim (bkz. docs/TAIS_DEMO_SCOPE.md #7). */
export const TAIS_SECTOR_ID = "other";
export const TAIS_SEED = 20260722;
/** Demo "bugun"u — tum senaryo tarihleri buna gore hesaplanir. */
export const TAIS_REFERENCE_NOW = "2026-07-20T09:00:00.000Z";

/** TAIS demo girisi icin varsayilan hesap — bootstrap.ts bunu env degiskenleriyle gecersiz kilabilir. */
export const TAIS_DEMO_EMAIL = "ceo@tais.demo";
export const TAIS_DEMO_PASSWORD = "abys-demo-2026";

/** decisions.ts'in urettigi decision_cases.category_id degerlerinin sabit on eki (idempotency + wipe icin). */
export const TAIS_DECISION_MARKER_PREFIX = "tais-decision:";
