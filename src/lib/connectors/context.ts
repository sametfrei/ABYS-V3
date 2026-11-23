import { lookup } from "dns/promises";
import { fetchPinned, fetchPinnedTokenRequest } from "@/lib/net/pinned-fetch";
import type { ConnectorConfigRow } from "@/lib/db/repos/connectors";
import type { SyncContext } from "./types";

/**
 * Senkron ve bağlantı testi aynı yürütme bağlamını kullanır: sabitlenmiş DNS
 * (SSRF koruması), sırlar yalnızca ortam değişkeninden okunur.
 */
export function createConnectorSyncContext(
  configRow: ConnectorConfigRow,
  checkpoint: string | null
): SyncContext {
  const resolveHost = async (hostname: string) =>
    (await lookup(hostname, { all: true })).map((result) => result.address);
  return {
    orgId: configRow.orgId,
    configId: configRow.id,
    checkpoint,
    fetchImpl: (input, init) =>
      fetchPinned(input instanceof Request ? input.url : input, init),
    fetchTokenImpl: (input, init) =>
      fetchPinnedTokenRequest(input instanceof Request ? input.url : input, init, resolveHost),
    resolveHost,
    resolveSecret: (envVarName: string) => process.env[envVarName],
    now: () => new Date(),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
