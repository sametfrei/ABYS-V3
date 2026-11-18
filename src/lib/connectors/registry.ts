import type { ConnectorAdapter, ConnectorDefinition } from "./types";
import { restAdapter } from "./rest-adapter";

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
    note: "OData uçları desteklenir. OAuth2 token akışı bu sürümde müşteri tarafından sağlanan bearer token ile yapılandırılır.",
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
    note: "SuiteQL/RESTlet çıktısı JSON ise genel adaptörle bağlanır; token yönetimi müşteri tarafındadır.",
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
    status: "planned",
    authType: "oauth2_client_credentials",
    entities: [...VENDOR_ENTITIES],
    note: "ION/API Gateway adaptörü planlı; henüz uygulanmadı.",
  },
  {
    id: "ifs",
    label: "IFS",
    category: "erp",
    status: "planned",
    authType: "basic",
    entities: [...VENDOR_ENTITIES],
    note: "IFS REST/OData adaptörü planlı; henüz uygulanmadı.",
  },
  {
    id: "sage",
    label: "Sage",
    category: "erp",
    status: "planned",
    authType: "oauth2_client_credentials",
    entities: [...VENDOR_ENTITIES],
    note: "Sage ürün ailesine göre değişen API'ler için adaptör planlı.",
  },
];

const ADAPTERS: Record<string, ConnectorAdapter> = {
  "rest-generic": restAdapter,
  // Vendor tanımları aynı adaptörü kullanır; canlı kimlik bilgisi olmadan
  // "ready" sayılmazlar (definition.status ile ayrışır).
  sap: restAdapter,
  oracle: restAdapter,
  dynamics: restAdapter,
  salesforce: restAdapter,
  hubspot: restAdapter,
  netsuite: restAdapter,
  odoo: restAdapter,
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
