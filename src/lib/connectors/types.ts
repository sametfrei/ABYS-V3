/**
 * Kurumsal konnektör SDK'sı — sağlayıcıdan bağımsız sözleşme.
 *
 * Bu katman bir sistemin "desteklendiğini" yalnızca adaptörü gerçekten veri
 * çekebildiğinde iddia eder. Kayıt defterindeki her tanım bir durum taşır:
 * - ready: adaptör mevcut ve yerel testlerle doğrulandı
 * - requires-credentials: adaptör hazır, yalnızca müşteri kimliği/anahtarı gerekir
 * - planned: yalnızca yol haritası kaydı; adaptör yok
 *
 * Sırlar asla veritabanına/yanıta yazılmaz: konfigürasyon yalnızca ortam
 * değişkeni ADINI taşır; değer çalışma anında `resolveSecret` ile okunur.
 */

export type ConnectorStatus = "ready" | "requires-credentials" | "planned";

export type ConnectorAuthType =
  | "none"
  | "api_key"
  | "bearer_token"
  | "basic"
  | "oauth2_client_credentials";

export interface ConnectorDefinition {
  id: string;
  label: string;
  category: "erp" | "crm" | "generic";
  status: ConnectorStatus;
  authType: ConnectorAuthType;
  /** Bu adaptörün doldurabildiği kanonik varlıklar. */
  entities: CanonicalEntity[];
  docsUrl?: string;
  note: string;
}

/** Sistemden bağımsız kanonik varlık modeli (unified business context). */
export type CanonicalEntity =
  | "customer"
  | "supplier"
  | "employee"
  | "product"
  | "order"
  | "invoice"
  | "payment"
  | "account"
  | "project"
  | "inventory"
  | "event";

export interface CanonicalRecord {
  entity: CanonicalEntity;
  externalId: string;
  sourceUpdatedAt: string | null;
  fields: Record<string, string | number | boolean | null>;
}

export interface FieldMapping {
  /** Kanonik alan adı → kaynak JSON içindeki nokta yolu. */
  [canonicalField: string]: string;
}

export interface RestConnectorConfig {
  kind: "rest";
  baseUrl: string;
  path: string;
  /** Kaynak sistemler salt-okunur; kontrollü write-back ayrı action gateway gerektirir. */
  method?: "GET";
  headers?: Record<string, string>;
  /** Sır değeri değil, ortam değişkeni adı. */
  secretEnvVar?: string;
  authType: ConnectorAuthType;
  /** OAuth2 client-credentials token endpoint'i; yalnızca HTTPS kabul edilir. */
  oauth2TokenUrl?: string;
  /** İstemci kimliğini taşıyan ortam değişkeni adı; değer saklanmaz. */
  oauth2ClientIdEnvVar?: string;
  /** OAuth2 scope; boşsa gönderilmez. */
  oauth2Scope?: string;
  /** OAuth2 audience; boşsa gönderilmez. */
  oauth2Audience?: string;
  /** OAuth2 resource; boşsa gönderilmez. */
  oauth2Resource?: string;
  /** API key için header adı (örn. X-API-Key); bearer/basic için kullanılmaz. */
  apiKeyHeader?: string;
  entity: CanonicalEntity;
  /** Yanıtta kayıt dizisinin bulunduğu nokta yolu (örn. value veya data.items). */
  recordsPath?: string;
  idField: string;
  updatedAtField?: string;
  fieldMap: FieldMapping;
  /** Kanonik sayısal alan → KPI etiketi. Yalnızca açıkça eşlenen alanlar KPI olur. */
  kpiFieldMap?: Record<string, string>;
  /**
   * Kanonik alanlardan deterministik formülle hesaplanan KPI'lar.
   * Anahtar `kpiId` veya `packId:kpiId`; değer org içindeki KPI etiketidir.
   */
  computedKpiMap?: Record<string, string>;
  /** KPI gözlem zamanını taşıyan kanonik alan; yoksa sourceUpdatedAt kullanılır. */
  kpiObservedAtField?: string;
  /** Kanonik alan değerini süreç olayı türüne dönüştürmek için alan adı. */
  eventTypeField?: string;
  /** Süreç örneğini (subject) taşıyan kanonik alan; yoksa externalId kullanılır. */
  eventSubjectField?: string;
  /** Olay zamanını taşıyan kanonik alan; yoksa sourceUpdatedAt kullanılır. */
  eventTimeField?: string;
  pagination:
    | { type: "none" }
    | { type: "page"; pageParam: string; limitParam?: string; pageSize: number; startPage?: number }
    | { type: "cursor"; cursorParam: string; cursorPath: string };
  /** Artımlı senkron için gönderilecek parametre adı (checkpoint değeri buraya yazılır). */
  updatedSinceParam?: string;
  maxPages?: number;
  pageSize?: number;
}

export type ConnectorConfig = RestConnectorConfig;

export interface SyncContext {
  orgId: string;
  configId: string;
  /** Önceki çalıştırmadan kalan checkpoint (örn. son updatedAt). */
  checkpoint: string | null;
  fetchImpl: typeof fetch;
  /** Yalnızca OAuth2 token endpoint'i için POST yapan, redirect izlemeyen istemci. */
  fetchTokenImpl?: typeof fetch;
  resolveHost: (hostname: string) => Promise<string[]>;
  resolveSecret: (envVarName: string) => string | undefined;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export interface SyncPage {
  page: number;
  read: number;
  written: number;
  cursor: string | null;
}

export interface ObservedSourceField {
  path: string;
  types: Record<string, number>;
  observations: number;
}

export interface ConnectorRecordRejection {
  entity: CanonicalEntity;
  sourceRef: string | null;
  code: string;
  reason: string;
}

export interface SyncOutcome {
  records: CanonicalRecord[];
  pages: number;
  readCount: number;
  skipped: number;
  warnings: string[];
  checkpoint: string | null;
  /** Kaynak sistemin yalnızca alan adları ve tipleri; değer içermez. */
  sourceSchema: ObservedSourceField[];
  /** Kanonik sözleşmeye uymayan ve zekâ hattına alınmayan kayıtlar. */
  rejected: ConnectorRecordRejection[];
}

export interface ConnectorAdapter {
  id: string;
  status: ConnectorStatus;
  validate(config: unknown): string[];
  sync(config: ConnectorConfig, ctx: SyncContext): Promise<SyncOutcome>;
}
