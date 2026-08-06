/**
 * Bitrix24 nesne sekilleri (ham API yaniti) ve ABYS/TAIS icin normallestirilmis
 * karsiliklari. Ham tipler kasitli olarak gevsek tutulur (Bitrix24 REST API'si
 * kurumdan kuruma ozel alan ekler) — kesin alan adlari BURADA sabitlenmez,
 * config.ts uzerinden field-mapping dosyasindan okunur.
 */

/** Bitrix24 ozel alanlari (UF_*, ufCrm*_*) her nesnede farkli olabilir. */
export type BitrixCustomFields = Record<string, string | number | boolean | null | undefined>;

export interface BitrixCompanyRaw extends BitrixCustomFields {
  ID: string;
  TITLE: string;
  DATE_MODIFY?: string;
  DATE_CREATE?: string;
}

export interface BitrixContactRaw extends BitrixCustomFields {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  COMPANY_ID?: string;
  POST?: string;
  DATE_MODIFY?: string;
}

export interface BitrixLeadRaw extends BitrixCustomFields {
  ID: string;
  TITLE: string;
  COMPANY_ID?: string;
  STATUS_ID?: string;
  SOURCE_ID?: string;
  DATE_CREATE?: string;
  DATE_MODIFY?: string;
}

export interface BitrixDealRaw extends BitrixCustomFields {
  ID: string;
  TITLE: string;
  COMPANY_ID?: string;
  STAGE_ID?: string;
  OPPORTUNITY?: string;
  CURRENCY_ID?: string;
  DATE_CREATE?: string;
  DATE_MODIFY?: string;
}

export interface BitrixActivityRaw extends BitrixCustomFields {
  ID: string;
  SUBJECT?: string;
  TYPE_ID?: string;
  OWNER_ID?: string; // ilişkili deal/lead/company id
  COMPLETED?: "Y" | "N";
  START_TIME?: string;
  DATE_MODIFY?: string;
}

export interface BitrixTaskRaw extends BitrixCustomFields {
  id: string;
  title?: string;
  responsibleId?: string;
  status?: string; // Bitrix task durumu (2=beklemede, 5=tamamlandi, ...)
  deadline?: string;
  closedDate?: string;
  dateCreate?: string;
  updatedDate?: string;
}

export interface BitrixUserRaw {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  WORK_POSITION?: string;
  UF_DEPARTMENT?: string[];
  ACTIVE?: boolean;
  // Kuruma özel alanlar (config.ts alan eşlemesiyle okunur) — değer türü
  // diğer ham tiplerden farklı olarak dizi de olabildiğinden gevşek tutulur.
  [customField: string]: string | number | boolean | string[] | null | undefined;
}

export interface BitrixDepartmentRaw {
  ID: string;
  NAME: string;
  PARENT?: string;
}

/** Smart Process / Dynamic Item — CRM entity type 1030+ (hizmet talebi, şikâyet, kalite kaydı vb.) */
export interface BitrixSmartProcessItemRaw extends BitrixCustomFields {
  id: string;
  title?: string;
  stageId?: string;
  companyId?: string;
  createdTime?: string;
  updatedTime?: string;
}

export type BitrixEntityKind =
  | "company"
  | "contact"
  | "lead"
  | "deal"
  | "activity"
  | "task"
  | "user"
  | "department"
  | "smartProcess";

// --- Normallestirilmis (TAIS alan modeline yakin) çıktılar ---

export interface NormalizedCustomer {
  externalId: string;
  name: string;
  district: string | null;
  category: string | null;
  updatedAt: string | null;
}

export interface NormalizedContact {
  externalId: string;
  fullName: string;
  companyExternalId: string | null;
  role: string | null;
  updatedAt: string | null;
}

export interface NormalizedServiceLead {
  externalId: string;
  title: string;
  customerExternalId: string | null;
  category: string | null;
  stage: string;
  source: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedDeal {
  externalId: string;
  title: string;
  customerExternalId: string | null;
  category: string | null;
  stage: string;
  valueAzn: number;
  renewalDate: string | null;
  startDate: string | null;
  updatedAt: string | null;
}

export interface NormalizedActivity {
  externalId: string;
  subject: string;
  type: "call" | "email" | "meeting" | "follow_up";
  ownerExternalId: string | null;
  occurredAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedTask {
  externalId: string;
  title: string;
  category: string | null;
  locationExternalId: string | null;
  customerExternalId: string | null;
  responsibleExternalId: string | null;
  status: "open" | "in_progress" | "completed";
  dueAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedEmployee {
  externalId: string;
  fullName: string;
  role: string | null;
  departmentExternalIds: string[];
  active: boolean;
  // Bitrix24 user.get bir değişiklik zaman damgası döndürmez; artan senkron
  // imleci bu varlık türü için kullanılamaz (bkz. sync.ts computeCursor).
  updatedAt: string | null;
}

export interface NormalizedDepartment {
  externalId: string;
  name: string;
  parentExternalId: string | null;
  // department.get değişiklik zaman damgası döndürmez (bkz. NormalizedEmployee notu).
  updatedAt: string | null;
}

export type SmartProcessSubtype = "serviceRequest" | "complaint" | "qualityIssue";

export interface NormalizedSmartProcessItem {
  externalId: string;
  subtype: SmartProcessSubtype;
  title: string;
  status: string;
  customerExternalId: string | null;
  locationExternalId: string | null;
  category: string | null;
  matchedTaskExternalId: string | null;
  openedAt: string | null;
  updatedAt: string | null;
}
