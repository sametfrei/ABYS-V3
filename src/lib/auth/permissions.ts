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
  | "edit_kpi"         // KPI metrik serisi kaydetme/düzeltme (ham veri göçü değil)
  | "validate_kpi_definition" // KPI tanımının formül/birim/eşik tutarlılığını doğrulama
  | "approve_external_context" // Dış bağlam gözlemini insan incelemesiyle kabul/reddetme
  | "triage_signals" // Sinyal durumunu güncelleme ve war-room notu ekleme
  | "manage_reports" // Tenant raporlarını kaydetme ve silme
  | "approve_kpi_definition" // İnsan onayıyla KPI tanımını yetkili kılma
  | "confirm_business_profile" // org'un sektör/iş bağlamı sınıflandırmasını onaylama
  | "view_audit"       // denetim günlüğünü görme
  | "manage_users";    // kullanıcı/rol yönetimi

const MATRIX: Record<Role, Permission[]> = {
  board:        ["view_decisions", "view_audit"],
  ceo:          ["view_decisions", "run_analysis", "record_decision", "view_audit", "edit_kpi", "validate_kpi_definition", "approve_kpi_definition", "approve_external_context", "triage_signals", "manage_reports", "confirm_business_profile"],
  clevel:       ["view_decisions", "run_analysis", "record_decision", "view_audit", "edit_kpi", "validate_kpi_definition", "approve_kpi_definition", "approve_external_context", "triage_signals", "manage_reports", "confirm_business_profile"],
  dept_manager: ["view_decisions", "run_analysis", "record_decision", "edit_kpi", "validate_kpi_definition", "triage_signals", "manage_reports"],
  risk_manager: ["view_decisions", "run_analysis", "record_decision", "view_audit", "edit_kpi", "validate_kpi_definition", "approve_kpi_definition", "approve_external_context", "triage_signals", "manage_reports", "confirm_business_profile"],
  analyst:      ["view_decisions", "run_analysis", "edit_kpi", "validate_kpi_definition", "triage_signals", "manage_reports"],
  auditor:      ["view_decisions", "view_audit"],
  data_admin:   ["view_decisions", "ingest_data", "edit_kpi", "validate_kpi_definition", "triage_signals", "manage_reports"],
  sys_admin:    ["view_decisions", "view_audit", "manage_users", "edit_kpi", "validate_kpi_definition", "approve_kpi_definition", "approve_external_context", "triage_signals", "manage_reports", "confirm_business_profile"],
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
    edit_kpi: "KPI serisi kaydetme",
    validate_kpi_definition: "KPI tanımını doğrulama",
    approve_kpi_definition: "KPI tanımını onaylama",
    approve_external_context: "Dış bağlamı inceleme",
    triage_signals: "Sinyal triyajı ve war-room notu",
    manage_reports: "Rapor yönetimi",
    confirm_business_profile: "iş bağlamını onaylama",
    view_audit: "denetim günlüğü görüntüleme",
    manage_users: "kullanıcı yönetimi",
  };
  return `Bu işlem için yetkiniz yok (${labels[permission]}). Rolünüz bu izni içermiyor.`;
}
