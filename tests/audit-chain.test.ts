import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * bkz. tests/tenant-isolation.test.ts üstündeki açıklama. Kendi geçici
 * dizinini kullanır ki dev sunucusu veya diğer test dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-audit-chain-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { recordAuditEvent, verifyAuditChain, GENESIS_HASH } = await import(
  "../src/lib/db/repos/audit"
);

describe("denetim günlüğü hash zinciri", () => {
  const org = randomBytes(8).toString("hex");
  const otherOrg = randomBytes(8).toString("hex");

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      org,
      "Zincir Test Org",
      "aviation",
    ]);
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      otherOrg,
      "Diğer Org",
      "aviation",
    ]);
  });

  afterAll(async () => {
    await getDb().query("DELETE FROM audit_events WHERE org_id = $1 OR org_id = $2", [org, otherOrg]);
  });

  it("üç kayıttan sonra zincir geçerlidir", async () => {
    await recordAuditEvent({ orgId: org, actor: "test", type: "olay_1", summary: "İlk olay" });
    await recordAuditEvent({ orgId: org, actor: "test", type: "olay_2", summary: "İkinci olay", detail: "detay-2" });
    await recordAuditEvent({ orgId: org, actor: "test", type: "olay_3", summary: "Üçüncü olay" });

    const result = await verifyAuditChain(org);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it("ilk kaydın prev_hash'i GENESIS'tir", async () => {
    const db = getDb();
    const r = await db.query<{ prev_hash: string | null }>(
      "SELECT prev_hash FROM audit_events WHERE org_id = $1 ORDER BY created_at ASC LIMIT 1",
      [org]
    );
    expect(r.rows[0].prev_hash).toBe(GENESIS_HASH);
  });

  it("her kaydın prev_hash'i bir öncekinin entry_hash'ine eşittir", async () => {
    const db = getDb();
    const r = await db.query<{ prev_hash: string | null; entry_hash: string | null }>(
      "SELECT prev_hash, entry_hash FROM audit_events WHERE org_id = $1 ORDER BY created_at ASC",
      [org]
    );
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].prev_hash).toBe(r.rows[i - 1].entry_hash);
    }
  });

  it("ortadaki kaydın payload'u değiştirilirse zincir geçersiz olur ve doğru kaydı işaret eder", async () => {
    const db = getDb();
    const r = await db.query<{ id: string }>(
      "SELECT id FROM audit_events WHERE org_id = $1 ORDER BY created_at ASC",
      [org]
    );
    const middleId = r.rows[1].id;

    await db.query("UPDATE audit_events SET summary = $1 WHERE id = $2", [
      "Kurcalanmış özet",
      middleId,
    ]);

    const result = await verifyAuditChain(org);
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe(middleId);
  });

  it("kayıt yoksa zincir geçerli ve boş sayılır", async () => {
    const result = await verifyAuditChain(otherOrg);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("NULL hash'li (zincir-öncesi) kayıtlar atlanır ve zincir onlardan sonra başlar", async () => {
    const legacyOrg = randomBytes(8).toString("hex");
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      legacyOrg,
      "Eski Org",
      "aviation",
    ]);

    // Migration 13 öncesi kayıt benzetimi: prev_hash/entry_hash NULL.
    await db.query(
      "INSERT INTO audit_events (id, org_id, actor, type, summary) VALUES ($1, $2, $3, $4, $5)",
      [randomBytes(8).toString("hex"), legacyOrg, "sistem", "legacy", "Zincir öncesi kayıt"]
    );

    await recordAuditEvent({ orgId: legacyOrg, actor: "test", type: "olay_1", summary: "Zincirli ilk olay" });
    await recordAuditEvent({ orgId: legacyOrg, actor: "test", type: "olay_2", summary: "Zincirli ikinci olay" });

    const result = await verifyAuditChain(legacyOrg);
    expect(result.valid).toBe(true);
    expect(result.skipped).toBe(1);
    expect(result.checked).toBe(2);

    await db.query("DELETE FROM audit_events WHERE org_id = $1", [legacyOrg]);
  });
});
