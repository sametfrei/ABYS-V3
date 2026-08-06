/**
 * Rol → izin matrisi (Faz 2). İzinler SUNUCUDA uygulanır; UI'da gizlemek
 * yeterli değildir. Kaynak: master plan bölüm 6 rol listesi.
 *
 * İlkeler:
 * - Denetçi (auditor) salt-okunurdur: kanıt ve denetim geçmişini görür,
 *   analiz çalıştıramaz, karar veremez, veri alamaz.
 * - Analiz çalıştırma ile karar verme ayrı yetkilerdir (analist hazırlar,
 *   yönetici karar verir).
 * - Veri alma (ingest/göç) veri yöneticisinin işidir.
 */

export type Role =
  | "board"
  | "ceo"
  | "clevel"
  | "dept_manager"
  | "risk_manager"
  | "analyst"
  | "auditor"
  | "data_admin"
  | "sys_admin";

export type Permission =
  | "view_decisions"   // vaka ve karar geçmişini görme
  | "run_analysis"     // AI analizi çalıştırma
  | "record_decision"  // kabul/ret/değiştir kararı verme
  | "ingest_data"      // veri içe alma ve prototip göçü
  | "view_audit"       // denetim günlüğünü görme
  | "manage_users";    // kullanıcı/rol yönetimi

const MATRIX: Record<Role, Permission[]> = {
  board:        ["view_decisions", "view_audit"],
  ceo:          ["view_decisions", "run_analysis", "record_decision", "view_audit"],
  clevel:       ["view_decisions", "run_analysis", "record_decision", "view_audit"],
  dept_manager: ["view_decisions", "run_analysis", "record_decision"],
  risk_manager: ["view_decisions", "run_analysis", "record_decision", "view_audit"],
  analyst:      ["view_decisions", "run_analysis"],
  auditor:      ["view_decisions", "view_audit"],
  data_admin:   ["view_decisions", "ingest_data"],
  sys_admin:    ["view_decisions", "view_audit", "manage_users"],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return (MATRIX[role as Role] ?? []).includes(permission);
}

/** Route yardımcıları için: izin yoksa Türkçe gerekçeli hata metni. */
export function permissionError(permission: Permission): string {
  const labels: Record<Permission, string> = {
    view_decisions: "karar geçmişini görüntüleme",
    run_analysis: "analiz çalıştırma",
    record_decision: "karar kaydetme",
    ingest_data: "veri içe alma",
    view_audit: "denetim günlüğü görüntüleme",
    manage_users: "kullanıcı yönetimi",
  };
  return `Bu işlem için yetkiniz yok (${labels[permission]}). Rolünüz bu izni içermiyor.`;
}
