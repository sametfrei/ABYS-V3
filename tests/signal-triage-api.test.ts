import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.ABYS_DB_DIR = path.join(os.tmpdir(), "abys-signal-triage-" + process.pid + "-" + randomUUID());

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => store.set(name, value),
      delete: (name: string) => store.delete(name),
    }),
    __setCookie: (name: string, value: string | undefined) => {
      if (value === undefined) store.delete(name);
      else store.set(name, value);
    },
  };
});

const nextHeaders = (await import("next/headers")) as unknown as {
  __setCookie: (name: string, value: string | undefined) => void;
};
const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession, hashPassword, SESSION_COOKIE } = await import("../src/lib/auth/core");
const { PATCH: triage } = await import("../src/app/api/signals/[id]/triage/route");
const { GET: listNotes, POST: createNote } = await import("../src/app/api/signals/[id]/notes/route");

const ORG_A = "signal-triage-a";
const ORG_B = "signal-triage-b";
const SIGNAL_ID = "signal-triage-1";

describe("signal triage and war-room API", () => {
  let analyst: string;
  let board: string;
  let otherTenant: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id,name,sector_id) VALUES ($1,'Triage A','other'),($2,'Triage B','other')", [ORG_A, ORG_B]);
    await db.query(
      "INSERT INTO signals (id,org_id,sector_id,category_id,severity,title,status,payload) VALUES ($1,$2,'other','kpi','warning','KPI alert','open','{}'::jsonb),('signal-triage-other',$3,'other','kpi','warning','Other tenant alert','open','{}'::jsonb)",
      [SIGNAL_ID, ORG_A, ORG_B]
    );
    const passwordHash = hashPassword("signal-triage-password");
    for (const [id, org, role] of [
      ["triage-analyst", ORG_A, "analyst"],
      ["triage-board", ORG_A, "board"],
      ["triage-other", ORG_B, "analyst"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id,org_id,email,display_name,role,password_hash) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, org, id + "@test.local", id, role, passwordHash]
      );
    }
    analyst = await createSession("triage-analyst", ORG_A);
    board = await createSession("triage-board", ORG_A);
    otherTenant = await createSession("triage-other", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("persists triage status and immutable war-room notes within the tenant", async () => {
    nextHeaders.__setCookie(SESSION_COOKIE, board);
    const denied = await triage(new NextRequest("http://localhost/api/signals", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "handled" }),
    }), { params: Promise.resolve({ id: SIGNAL_ID }) });
    expect(denied.status).toBe(403);

    nextHeaders.__setCookie(SESSION_COOKIE, analyst);
    const changed = await triage(new NextRequest("http://localhost/api/signals", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "escalated" }),
    }), { params: Promise.resolve({ id: SIGNAL_ID }) });
    expect(changed.status).toBe(200);

    const note = await createNote(new NextRequest("http://localhost/api/signals", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Vendor response pending; owner assigned." }),
    }), { params: Promise.resolve({ id: SIGNAL_ID }) });
    expect(note.status).toBe(201);

    const notes = await listNotes(new NextRequest("http://localhost/api/signals/" + SIGNAL_ID + "/notes"), { params: Promise.resolve({ id: SIGNAL_ID }) });
    expect(notes.status).toBe(200);
    expect((await notes.json() as { notes: { note: string }[] }).notes[0]?.note).toBe("Vendor response pending; owner assigned.");

    const db = getDb();
    const status = await db.query<{ status: string }>("SELECT status FROM signals WHERE org_id=$1 AND id=$2", [ORG_A, SIGNAL_ID]);
    expect(status.rows[0]?.status).toBe("escalated");
    await expect(db.query("UPDATE signal_notes SET note='tampered' WHERE org_id=$1 AND signal_id=$2", [ORG_A, SIGNAL_ID])).rejects.toThrow(/append-only/i);

    nextHeaders.__setCookie(SESSION_COOKIE, otherTenant);
    const crossTenantNotes = await listNotes(new NextRequest("http://localhost/api/signals/" + SIGNAL_ID + "/notes"), { params: Promise.resolve({ id: SIGNAL_ID }) });
    expect((await crossTenantNotes.json() as { notes: unknown[] }).notes).toHaveLength(0);
  });
});
