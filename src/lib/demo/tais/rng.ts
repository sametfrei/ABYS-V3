/**
 * Tohumlu (seeded) sozde-rasgele uretici — TAIS demo verisi Math.random
 * KULLANMAZ ki ayni tohum daima ayni sonucu uretsin (bkz. seed.ts).
 * mulberry32: kucuk, bagimliliksiz, tekrarlanabilir 32-bit PRNG.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max] kapali aralikta tam sayi (min ve max dahil). */
export function rngInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  return items[rngInt(rng, 0, items.length - 1)];
}

/** Fisher-Yates, tohumlu rng ile — girdi dizisini degistirmez. */
export function rngShuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rngInt(rng, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Referans andan gun cinsinden ofset (negatif = gecmis, pozitif = gelecek). */
export function daysFromReference(referenceIso: string, offsetDays: number): string {
  const ms = new Date(referenceIso).getTime() + offsetDays * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}
