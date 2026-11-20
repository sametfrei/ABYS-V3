import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup } from "dns/promises";
import { validateOutboundUrl } from "./ssrf";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type ResolveHost = (hostname: string) => Promise<string[]>;

export interface PinnedResponse {
  status: number;
  headers: Headers;
  body: Buffer;
  finalUrl: string;
}

/** DNS cevabını istek boyunca sabitler; fetch'in hostname'i yeniden çözmesini engeller. */
export async function resolvePinnedAddress(
  rawUrl: string,
  resolveHost: ResolveHost = async (hostname) =>
    (await dnsLookup(hostname, { all: true })).map((row) => row.address)
): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  const { url, addresses } = await validateOutboundUrl(rawUrl, resolveHost);
  const address = addresses[0];
  return { url, address, family: address.includes(":") ? 6 : 4 };
}

function responseHeaders(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const item of value) result.append(name, item);
    else if (value !== undefined) result.set(name, value);
  }
  return result;
}

async function requestPinned(
  url: URL,
  address: string,
  family: 4 | 6,
  init: RequestInit
): Promise<{ status: number; headers: Headers; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const headers = new Headers(init.headers);
    headers.set("Host", url.host);
    const method = (init.method ?? "GET").toUpperCase();
    if (init.body !== undefined && typeof init.body !== "string") {
      reject(new Error("Sabitlenmiş HTTP istemcisi yalnızca metin gövdesi destekler."));
      return;
    }
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers: Object.fromEntries(headers.entries()),
        servername: url.protocol === "https:" ? url.hostname : undefined,
        signal: init.signal ?? undefined,
        // Node bu callback'i kullandığında DNS tekrar çözülmez.
        lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
          if (options?.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        }) as never,
      } as http.RequestOptions,
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > MAX_RESPONSE_BYTES) {
            response.destroy(new Error("Yanıt gövdesi 2MB sınırını aşıyor."));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("error", reject);
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: responseHeaders(response.headers),
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    request.setTimeout(FETCH_TIMEOUT_MS, () => request.destroy(new Error("İstek zaman aşımına uğradı.")));
    request.on("error", reject);
    request.end(init.body ?? undefined);
  });
}

const SENSITIVE_REDIRECT_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie)$/i;

/** Origin değişen redirect'te kaynak kimliğini üçüncü tarafa taşımaz. */
export function headersForRedirectHop(
  headers: HeadersInit | undefined,
  initialOrigin: string,
  nextOrigin: string
): Headers {
  const result = new Headers(headers);
  if (initialOrigin === nextOrigin) return result;
  for (const name of [...result.keys()]) {
    if (SENSITIVE_REDIRECT_HEADER.test(name) || /(api[-_]?key|token|secret|password)/i.test(name)) {
      result.delete(name);
    }
  }
  return result;
}

/**
 * Yalnızca GET kullanan, redirect'leri her hopta yeniden doğrulayan ve DNS'i
 * sabitlenmiş adrese bağlayan dış istek yardımcısı. Kaynak sistemlere yazma
 * yapılamaz; gelecekteki kontrollü write-back ayrı bir action gateway olmalıdır.
 */
export async function fetchPinned(
  input: string | URL,
  init: RequestInit = {},
  resolveHost?: ResolveHost
): Promise<Response> {
  if (init.method && init.method.toUpperCase() !== "GET") {
    throw new Error("Kaynak konnektörleri yalnızca GET kullanabilir.");
  }

  let current = new URL(String(input));
  const initialOrigin = current.origin;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const pinned = await resolvePinnedAddress(current.href, resolveHost);
    const response = await requestPinned(pinned.url, pinned.address, pinned.family, {
      ...init,
      headers: headersForRedirectHop(init.headers, initialOrigin, pinned.url.origin),
    });
    const location = response.headers.get("location");
    if (REDIRECT_STATUSES.has(response.status) && location) {
      if (redirects === MAX_REDIRECTS) throw new Error("Çok fazla HTTP yönlendirmesi.");
      current = new URL(location, pinned.url);
      continue;
    }
    return new Response(new Uint8Array(response.body), {
      status: response.status,
      headers: response.headers,
    });
  }
  throw new Error("Çok fazla HTTP yönlendirmesi.");
}

/**
 * OAuth2 token endpoint'i için dar kapsamlı POST istemcisi. Redirect izlemez;
 * böylece istemci sırrı veya dönen token başka bir origin'e taşınamaz.
 */
export async function fetchPinnedTokenRequest(
  input: string | URL,
  init: RequestInit = {},
  resolveHost?: ResolveHost
): Promise<Response> {
  if ((init.method ?? "POST").toUpperCase() !== "POST") {
    throw new Error("Token istemcisi yalnızca POST kullanabilir.");
  }
  const pinned = await resolvePinnedAddress(String(input), resolveHost);
  if (pinned.url.protocol !== "https:") {
    throw new Error("OAuth2 token endpoint'i HTTPS olmalı.");
  }
  const response = await requestPinned(pinned.url, pinned.address, pinned.family, {
    ...init,
    method: "POST",
  });
  if (REDIRECT_STATUSES.has(response.status)) {
    throw new Error("OAuth2 token endpoint'i yönlendirme döndüremaz.");
  }
  return new Response(new Uint8Array(response.body), {
    status: response.status,
    headers: response.headers,
  });
}
