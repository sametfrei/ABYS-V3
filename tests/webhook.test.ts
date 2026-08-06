import { describe, expect, it } from "vitest";
import { signPayload } from "../src/lib/integrations/webhook";

describe("signPayload", () => {
  it("aynı girdi için aynı imzayı üretir", () => {
    const a = signPayload("sirri-1", "1700000000000", '{"event":"lead.created"}');
    const b = signPayload("sirri-1", "1700000000000", '{"event":"lead.created"}');
    expect(a).toBe(b);
  });

  it("farklı gövde için farklı imza üretir", () => {
    const a = signPayload("sirri-1", "1700000000000", '{"event":"lead.created"}');
    const b = signPayload("sirri-1", "1700000000000", '{"event":"lead.updated"}');
    expect(a).not.toBe(b);
  });

  it("farklı zaman damgası için farklı imza üretir", () => {
    const a = signPayload("sirri-1", "1700000000000", '{"event":"lead.created"}');
    const b = signPayload("sirri-1", "1700000000001", '{"event":"lead.created"}');
    expect(a).not.toBe(b);
  });

  it("bilinen sır+gövde+zaman için beklenen HMAC-SHA256 değerini üretir", () => {
    // Referans değer: createHmac("sha256", "test-secret-abc123").update("1700000000000.{...}").digest("hex")
    const secret = "test-secret-abc123";
    const timestamp = "1700000000000";
    const rawBody = '{"event":"lead.created","id":"abc"}';
    const sig = signPayload(secret, timestamp, rawBody);
    expect(sig).toBe("4e2d1cff977633f5caf69446b1fbf6a3ee5e81bf233baf56798784740bcbf6e1");
  });

  it("64 karakterlik hex dizesi üretir", () => {
    const sig = signPayload("sirri-1", "1700000000000", "gövde");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});
