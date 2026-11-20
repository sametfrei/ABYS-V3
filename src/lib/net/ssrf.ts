import { isIPv4 } from "net";

/**
 * SSRF koruması — dışarıya yapılan istekler için ortak doğrulama.
 * Yalnızca http/https kabul edilir; localhost, iç ağlar, link-local ve bulut
 * metadata adresleri reddedilir. DNS çözümü çağıran tarafından enjekte
 * edilebilir (test edilebilirlik); üretimde `dns.lookup` kullanılır.
 */

export function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (isIPv4(mapped)) return isBlockedIp(mapped);
  }
  return false;
}

export class SsrfError extends Error {
  constructor(message = "İç ağ hedeflerine erişim reddedildi (SSRF koruması).") {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * URL'yi doğrular ve çözümlenmiş public IP listedesini döner.
 * Çözümleme başarısızsa veya herhangi bir adres iç ağdaysa hata atar.
 */
export async function validateOutboundUrl(
  raw: string,
  resolveHost: (hostname: string) => Promise<string[]>
): Promise<{ url: URL; addresses: string[] }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SsrfError("Geçersiz URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Yalnızca http/https şemasına izin verilir.");
  }
  if (url.username || url.password) {
    throw new SsrfError("URL içinde kimlik bilgisi kabul edilmez.");
  }
  if (url.hostname.toLowerCase() === "localhost") {
    throw new SsrfError();
  }
  // IP literal doğrudan verilmişse DNS'e gitmeden kontrol et.
  if (isIPv4(url.hostname) || url.hostname.includes(":")) {
    if (isBlockedIp(url.hostname.replace(/^\[|\]$/g, ""))) throw new SsrfError();
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(url.hostname);
  } catch {
    throw new SsrfError("Ana bilgisayar adı çözümlenemedi.");
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedIp(a))) {
    throw new SsrfError();
  }
  return { url, addresses };
}
