import { describe, expect, it } from "vitest";
import { hasPermission, permissionError, type Permission, type Role } from "../src/lib/auth/permissions";

// Beklenen matris burada ELLE yazılıyor (koddan tekrar üretilmiyor) — amaç,
// permissions.ts içindeki matris yanlışlıkla gevşetilirse bu testin kırılması.
const EXPECTED_MATRIX: Record<Role, Record<Permission, boolean>> = {
  board: {
    view_decisions: true,
    run_analysis: false,
    record_decision: false,
    ingest_data: false,
    view_audit: true,
    manage_users: false,
  },
  ceo: {
    view_decisions: true,
    run_analysis: true,
    record_decision: true,
    ingest_data: false,
    view_audit: true,
    manage_users: false,
  },
  clevel: {
    view_decisions: true,
    run_analysis: true,
    record_decision: true,
    ingest_data: false,
    view_audit: true,
    manage_users: false,
  },
  dept_manager: {
    view_decisions: true,
    run_analysis: true,
    record_decision: true,
    ingest_data: false,
    view_audit: false,
    manage_users: false,
  },
  risk_manager: {
    view_decisions: true,
    run_analysis: true,
    record_decision: true,
    ingest_data: false,
    view_audit: true,
    manage_users: false,
  },
  analyst: {
    view_decisions: true,
    run_analysis: true,
    record_decision: false,
    ingest_data: false,
    view_audit: false,
    manage_users: false,
  },
  auditor: {
    view_decisions: true,
    run_analysis: false,
    record_decision: false,
    ingest_data: false,
    view_audit: true,
    manage_users: false,
  },
  data_admin: {
    view_decisions: true,
    run_analysis: false,
    record_decision: false,
    ingest_data: true,
    view_audit: false,
    manage_users: false,
  },
  sys_admin: {
    view_decisions: true,
    run_analysis: false,
    record_decision: false,
    ingest_data: false,
    view_audit: true,
    manage_users: true,
  },
};

const ROLES = Object.keys(EXPECTED_MATRIX) as Role[];
const PERMISSIONS: Permission[] = [
  "view_decisions",
  "run_analysis",
  "record_decision",
  "ingest_data",
  "view_audit",
  "manage_users",
];

describe("hasPermission — 9 rol x 6 izin matrisi", () => {
  for (const role of ROLES) {
    describe(`rol: ${role}`, () => {
      for (const permission of PERMISSIONS) {
        const expected = EXPECTED_MATRIX[role][permission];
        it(`${permission} => ${expected}`, () => {
          expect(hasPermission(role, permission)).toBe(expected);
        });
      }
    });
  }
});

describe("hasPermission — varsayılan reddet", () => {
  it("bilinmeyen rol için false döner", () => {
    expect(hasPermission("unknown_role", "view_decisions")).toBe(false);
  });

  it("boş rol için false döner", () => {
    expect(hasPermission("", "view_decisions")).toBe(false);
  });

  it("bilinmeyen izin için false döner", () => {
    expect(hasPermission("ceo", "delete_everything" as Permission)).toBe(false);
  });

  it("bilinmeyen rol ve bilinmeyen izin ikisi birden için false döner", () => {
    expect(hasPermission("ghost", "nonexistent" as Permission)).toBe(false);
  });
});

describe("permissionError", () => {
  for (const permission of PERMISSIONS) {
    it(`${permission} için Türkçe mesaj ve izin adını içerir`, () => {
      const message = permissionError(permission);
      expect(message).toContain("Bu işlem için yetkiniz yok");
      expect(message).toContain("Rolünüz bu izni içermiyor");
    });
  }

  it("run_analysis için 'analiz çalıştırma' etiketini içerir", () => {
    expect(permissionError("run_analysis")).toContain("analiz çalıştırma");
  });

  it("manage_users için 'kullanıcı yönetimi' etiketini içerir", () => {
    expect(permissionError("manage_users")).toContain("kullanıcı yönetimi");
  });
});
