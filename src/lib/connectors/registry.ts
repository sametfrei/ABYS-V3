import type { ConnectorAdapter, ConnectorDefinition } from "./types";
import { restAdapter } from "./rest-adapter";
import { mysqlAdapter, sqlAdapter, sqlServerAdapter } from "./sql-adapter";

/**
 * Konnektör kayıt defteri.
 *
 * Durum anlamları kesin ve denetlenebilir:
 * - ready: adaptör kodu mevcut ve yerel entegrasyon testleriyle doğrulandı.
 * - requires-credentials: aynı adaptör kullanılabilir; ancak canlı bağlantı
 *   için müşteriye ait uç nokta/anahtar gerekir — bu ortamda doğrulanmadı.
 * - planned: adaptör henüz yok; yalnızca yol haritası kaydı.
 *
 * Vendor uçları çoğunlukla REST/OData sunar; bu nedenle aynı genel REST
 * adaptörü kullanılır. SOAP/JDBC gerektiren senaryolar ayrı adaptör işidir.
 */

const VENDOR_ENTITIES = [
  "customer",
  "supplier",
  "product",
  "order",
  "invoice",
  "payment",
  "employee",
  "project",
  "inventory",
] as const;

export const CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  {
    id: "rest-generic",
    label: "Genel REST / OData",
    category: "generic",
    status: "ready",
    authType: "bearer_token",
    entities: [...VENDOR_ENTITIES, "account", "event"],
    note: "Sayfalama, alan eşlemesi, artımlı checkpoint ve yeniden deneme desteklenir.",
  },
  {
    id: "postgresql",
    label: "PostgreSQL (salt-okunur SQL)",
    category: "generic",
    status: "ready",
    authType: "none",
    entities: [...VENDOR_ENTITIES, "account", "event"],
    note: "Ortam değişkenindeki bağlantı adresiyle SQL sorgusu çalıştırır; salt-okunur transaction ve satır sınırı uygular.",
  },
  {
    id: "sqlserver",
    label: "Microsoft SQL Server (salt-okunur SQL)",
    category: "generic",
    status: "ready",
    authType: "none",
    entities: [...VENDOR_ENTITIES, "account", "event"],
    note: "Ayrıcalığı yalnızca SELECT olan SQL Server kullanıcısıyla sorgu, eşleme ve zamanlanmış senkron.",
  },
  {
    id: "mysql",
    label: "MySQL / MariaDB (salt-okunur SQL)",
    category: "generic",
    status: "ready",
    authType: "none",
    entities: [...VENDOR_ENTITIES, "account", "event"],
    note: "Salt-okunur transaction, parametreli checkpoint ve kanonik veri senkronu.",
  },
  {
    id: "erp12",
    label: "ERP12",
    category: "erp",
    status: "planned",
    authType: "none",
    entities: [...VENDOR_ENTITIES, "account"],
    note: "ERP12 yerel kurulumdur. Üreticiden API/veritabanı erişim yöntemi ve şema doğrulanmadan canlı adaptör etkinleştirilmez.",
  },
  {
    id: "sap",
    label: "SAP (OData / S/4HANA)",
    category: "erp",
    status: "requires-credentials",
    authType: "basic",
    entities: [...VENDOR_ENTITIES],
    note: "SAP OData servisleri genel REST adaptörüyle bağlanır; müşteri servis yolu ve kimliği gerekir.",
  },
  {
    id: "oracle",
    label: "Oracle Fusion / NetSuite-benzeri REST",
    category: "erp",
    status: "requires-credentials",
    authType: "basic",
    entities: [...VENDOR_ENTITIES],
    note: "REST uçları genel adaptörle bağlanır; Oracle sürümüne göre servis yolu değişir.",
  },
  {
    id: "dynamics",
    label: "Microsoft Dynamics 365",
    category: "erp",
    status: "requires-credentials",
    authType: "oauth2_client_credentials",
    entities: [...VENDOR_ENTITIES],
    note: "OData uçları desteklenir. OAuth2 client-credentials token akışı yerel testlerle doğrulanmıştır; canlı Microsoft kimliği gerekir.",
  },
  {
    id: "salesforce",
    label: "Salesforce",
    category: "crm",
    status: "requires-credentials",
    authType: "bearer_token",
    entities: ["customer", "account", "order", "invoice", "product", "event"],
    note: "REST API sayfalama (nextRecordsUrl) için cursor sayfalaması yapılandırılabilir.",
  },
  {
    id: "hubspot",
    label: "HubSpot",
    category: "crm",
    status: "requires-credentials",
    authType: "bearer_token",
    entities: ["customer", "account", "order", "event"],
    note: "CRM nesneleri `results` ve `paging.next.after` cursor yapısıyla okunur.",
  },
  {
    id: "netsuite",
    label: "NetSuite",
    category: "erp",
    status: "requires-credentials",
    authType: "oauth2_client_credentials",
    entities: [...VENDOR_ENTITIES],
    note: "JSON dönen uçlarda genel adaptör ve OAuth2 client-credentials kullanılabilir; NetSuite canlı kimliği olmadan doğrulanmamıştır.",
  },
  {
    id: "odoo",
    label: "Odoo",
    category: "erp",
    status: "requires-credentials",
    authType: "api_key",
    entities: [...VENDOR_ENTITIES],
    note: "Odoo JSON-RPC/XML-RPC kullanır; JSON dönen özel uç yoksa adaptör uyarlaması gerekir.",
  },
  {
    id: "infor",
    label: "Infor",
    category: "erp",
    status: "requires-credentials",
    authType: "oauth2_client_credentials",
    entities: [...VENDOR_ENTITIES],
    note:
      "Infor ION API Gateway REST uçları genel adaptörle okunur; OAuth2 client-credentials token akışı " +
      "yerel testlerle doğrulanmıştır, canlı Infor kiracısı ve kimliği olmadan doğrulanmamıştır.",
  },
  {
    id: "ifs",
    label: "IFS",
    category: "erp",
    status: "requires-credentials",
    authType: "basic",
    entities: [...VENDOR_ENTITIES],
    note:
      "IFS OData v4 uçları genel REST adaptörüyle bağlanır; müşteri projesi, servis yolu ve kimliği gerekir.",
  },
  {
    id: "sage",
    label: "Sage",
    category: "erp",
    status: "requires-credentials",
    authType: "oauth2_client_credentials",
    entities: [...VENDOR_ENTITIES],
    note:
      "Sage 200 / Intacct REST uçları OAuth2 client-credentials ile okunabilir; ürün sürümüne göre servis " +
      "yolu değişir, canlı kimlik olmadan doğrulanmamıştır.",
  },
];

const ADAPTERS: Record<string, ConnectorAdapter> = {
  "rest-generic": restAdapter,
  postgresql: sqlAdapter,
  sqlserver: sqlServerAdapter,
  mysql: mysqlAdapter,
  // Vendor tanımları aynı adaptörü kullanır; canlı kimlik bilgisi olmadan
  // "ready" sayılmazlar (definition.status ile ayrışır).
  sap: restAdapter,
  oracle: restAdapter,
  dynamics: restAdapter,
  salesforce: restAdapter,
  hubspot: restAdapter,
  netsuite: restAdapter,
  odoo: restAdapter,
  infor: restAdapter,
  ifs: restAdapter,
  sage: restAdapter,
};

export function listDefinitions(): ConnectorDefinition[] {
  return CONNECTOR_DEFINITIONS;
}

export function getDefinition(id: string): ConnectorDefinition | undefined {
  return CONNECTOR_DEFINITIONS.find((d) => d.id === id);
}

export function getAdapter(id: string): ConnectorAdapter | undefined {
  return ADAPTERS[id];
}
