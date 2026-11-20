import type { ShellKey } from "./i18n";

/**
 * Kenar çubuğu gezinmesi — etiket anahtarları i18n sözlüğünde tutulur ki
 * çeviri kapsamı testle doğrulanabilsin (bkz. tests/i18n.test.ts).
 */
export interface NavItemDefinition {
  href: string;
  labelKey: ShellKey;
}

export const DASHBOARD_NAV: NavItemDefinition[] = [
  { href: "/dashboard", labelKey: "nav.dashboard" },
  { href: "/dashboard/organization", labelKey: "nav.organization" },
  { href: "/dashboard/decision-ledger", labelKey: "nav.decisionLedger" },
  { href: "/dashboard/forecast", labelKey: "nav.forecast" },
  { href: "/dashboard/process", labelKey: "nav.process" },
  { href: "/dashboard/options", labelKey: "nav.options" },
  { href: "/dashboard/kpi", labelKey: "nav.kpi" },
  { href: "/dashboard/data-quality", labelKey: "nav.dataQuality" },
  { href: "/dashboard/ask", labelKey: "nav.ask" },
  { href: "/dashboard/decisions", labelKey: "nav.decisions" },
  { href: "/dashboard/actions", labelKey: "nav.actions" },
  { href: "/dashboard/scenarios", labelKey: "nav.scenarios" },
  { href: "/dashboard/memory", labelKey: "nav.memory" },
  { href: "/dashboard/analysis", labelKey: "nav.analysis" },
  { href: "/dashboard/reports", labelKey: "nav.reports" },
  { href: "/dashboard/alerts", labelKey: "nav.alerts" },
  { href: "/dashboard/integrations", labelKey: "nav.integrations" },
  { href: "/dashboard/connectors", labelKey: "nav.connectors" },
  { href: "/dashboard/discovery", labelKey: "nav.discovery" },
  { href: "/dashboard/advisors", labelKey: "nav.advisors" },
  { href: "/dashboard/audit", labelKey: "nav.audit" },
  { href: "/dashboard/settings", labelKey: "nav.settings" },
];
