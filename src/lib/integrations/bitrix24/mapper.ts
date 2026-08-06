import type { BitrixFieldMapping, BitrixSmartProcessFieldMapping } from "./config";
import type {
  BitrixActivityRaw,
  BitrixCompanyRaw,
  BitrixContactRaw,
  BitrixDealRaw,
  BitrixDepartmentRaw,
  BitrixLeadRaw,
  BitrixSmartProcessItemRaw,
  BitrixTaskRaw,
  BitrixUserRaw,
  NormalizedActivity,
  NormalizedContact,
  NormalizedCustomer,
  NormalizedDeal,
  NormalizedDepartment,
  NormalizedEmployee,
  NormalizedServiceLead,
  NormalizedSmartProcessItem,
  NormalizedTask,
  SmartProcessSubtype,
} from "./types";

/**
 * Ham Bitrix24 nesnelerini TAIS alan modeline yakın, normallestirilmis
 * hale getiren SAF fonksiyonlar. Hicbir ozel alan adi burada sabit
 * YAZILMAZ — hepsi field-mapping parametresinden okunur (bkz. config.ts).
 * Ağ erişimi, DB erişimi YOK.
 */

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function customField(raw: Record<string, unknown>, fieldName: string | undefined): string | null {
  if (!fieldName) return null;
  return asText(raw[fieldName]);
}

export function mapCompany(raw: BitrixCompanyRaw, fieldMapping: BitrixFieldMapping): NormalizedCustomer {
  return {
    externalId: raw.ID,
    name: raw.TITLE,
    district: customField(raw, fieldMapping.company?.districtField),
    category: customField(raw, fieldMapping.company?.categoryField),
    updatedAt: asText(raw.DATE_MODIFY ?? raw.DATE_CREATE),
  };
}

export function mapContact(raw: BitrixContactRaw, fieldMapping: BitrixFieldMapping): NormalizedContact {
  const fullName = [raw.NAME, raw.LAST_NAME].filter(Boolean).join(" ").trim() || `Kontak ${raw.ID}`;
  return {
    externalId: raw.ID,
    fullName,
    companyExternalId: asText(raw.COMPANY_ID),
    role: customField(raw, fieldMapping.contact?.roleField) ?? asText(raw.POST),
    updatedAt: asText(raw.DATE_MODIFY),
  };
}

export function mapLead(raw: BitrixLeadRaw, fieldMapping: BitrixFieldMapping): NormalizedServiceLead {
  return {
    externalId: raw.ID,
    title: raw.TITLE,
    customerExternalId: asText(raw.COMPANY_ID),
    category: customField(raw, fieldMapping.lead?.categoryField),
    stage: asText(raw.STATUS_ID) ?? "new",
    source: asText(raw.SOURCE_ID),
    createdAt: asText(raw.DATE_CREATE),
    updatedAt: asText(raw.DATE_MODIFY),
  };
}

export function mapDeal(raw: BitrixDealRaw, fieldMapping: BitrixFieldMapping): NormalizedDeal {
  const parsedValue = Number(raw.OPPORTUNITY);
  return {
    externalId: raw.ID,
    title: raw.TITLE,
    customerExternalId: asText(raw.COMPANY_ID),
    category: customField(raw, fieldMapping.deal?.categoryField),
    stage: asText(raw.STAGE_ID) ?? "prospecting",
    valueAzn: Number.isFinite(parsedValue) ? parsedValue : 0,
    renewalDate: customField(raw, fieldMapping.deal?.renewalDateField),
    startDate: customField(raw, fieldMapping.deal?.startDateField),
    updatedAt: asText(raw.DATE_MODIFY),
  };
}

const ACTIVITY_TYPE_BY_ID: Record<string, NormalizedActivity["type"]> = {
  "1": "call",
  "2": "meeting",
  "4": "email",
  "6": "follow_up",
};

export function mapActivity(raw: BitrixActivityRaw, fieldMapping: BitrixFieldMapping): NormalizedActivity {
  const isFollowUp = customField(raw, fieldMapping.activity?.followUpField) === "Y";
  const type = isFollowUp ? "follow_up" : ACTIVITY_TYPE_BY_ID[asText(raw.TYPE_ID) ?? ""] ?? "call";
  return {
    externalId: raw.ID,
    subject: asText(raw.SUBJECT) ?? `Aktivite ${raw.ID}`,
    type,
    ownerExternalId: asText(raw.OWNER_ID),
    occurredAt: asText(raw.START_TIME),
    updatedAt: asText(raw.DATE_MODIFY),
  };
}

const TASK_STATUS_BY_CODE: Record<string, NormalizedTask["status"]> = {
  "3": "in_progress",
  "4": "completed",
  "5": "completed",
};

export function mapTask(raw: BitrixTaskRaw, fieldMapping: BitrixFieldMapping): NormalizedTask {
  const status = TASK_STATUS_BY_CODE[asText(raw.status) ?? ""] ?? "open";
  return {
    externalId: raw.id,
    title: asText(raw.title) ?? `Görev ${raw.id}`,
    category: customField(raw, fieldMapping.task?.categoryField),
    locationExternalId: customField(raw, fieldMapping.task?.locationField),
    customerExternalId: customField(raw, fieldMapping.task?.customerField),
    responsibleExternalId: asText(raw.responsibleId),
    status,
    dueAt: asText(raw.deadline),
    completedAt: status === "completed" ? asText(raw.closedDate) : null,
    updatedAt: asText(raw.updatedDate ?? raw.dateCreate),
  };
}

export function mapUser(raw: BitrixUserRaw, fieldMapping: BitrixFieldMapping): NormalizedEmployee {
  const fullName = [raw.NAME, raw.LAST_NAME].filter(Boolean).join(" ").trim() || `Kullanıcı ${raw.ID}`;
  return {
    externalId: raw.ID,
    fullName,
    role: customField(raw, fieldMapping.user?.roleField) ?? asText(raw.WORK_POSITION),
    departmentExternalIds: Array.isArray(raw.UF_DEPARTMENT) ? raw.UF_DEPARTMENT.map(String) : [],
    active: raw.ACTIVE !== false,
    updatedAt: null,
  };
}

export function mapDepartment(raw: BitrixDepartmentRaw): NormalizedDepartment {
  return {
    externalId: raw.ID,
    name: raw.NAME,
    parentExternalId: asText(raw.PARENT),
    updatedAt: null,
  };
}

/** smartProcess alt-türüne göre config'ten ilgili alan eşlemesini seçer. */
export function resolveSmartProcessFieldMapping(
  fieldMapping: BitrixFieldMapping,
  subtype: SmartProcessSubtype
): BitrixSmartProcessFieldMapping | undefined {
  return fieldMapping.smartProcess?.[subtype];
}

export function mapSmartProcessItem(
  raw: BitrixSmartProcessItemRaw,
  fieldMapping: BitrixFieldMapping,
  subtype: SmartProcessSubtype
): NormalizedSmartProcessItem {
  const spMapping = resolveSmartProcessFieldMapping(fieldMapping, subtype);
  return {
    externalId: raw.id,
    subtype,
    title: asText(raw.title) ?? `${subtype} ${raw.id}`,
    status: asText(raw.stageId) ?? "open",
    customerExternalId: customField(raw, spMapping?.customerField) ?? asText(raw.companyId),
    locationExternalId: customField(raw, spMapping?.locationField),
    category: customField(raw, spMapping?.categoryField),
    matchedTaskExternalId: customField(raw, spMapping?.matchedTaskField),
    openedAt: customField(raw, spMapping?.openedAtField) ?? asText(raw.createdTime),
    updatedAt: asText(raw.updatedTime),
  };
}
