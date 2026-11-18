import { z } from "zod";

/**
 * Ortak parola politikası — hem sunucu doğrulaması hem istemci formu
 * aynı sınırları kullanır. Parola KIRPILMAZ (trim edilmez): baştaki/sondaki
 * boşluklar parolanın parçasıdır ve sessizce değiştirilmemelidir.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı`)
  .max(MAX_PASSWORD_LENGTH, `parola en fazla ${MAX_PASSWORD_LENGTH} karakter olmalı`);
