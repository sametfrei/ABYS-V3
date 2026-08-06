import { createRng, daysFromReference, rngInt, rngPick, type Rng } from "@/lib/demo/tais/rng";
import {
  BAKU_DISTRICTS,
  TAIS_CATEGORIES,
  TAIS_CUSTOMER_NAMES,
  TAIS_EMPLOYEE_NAMES,
  TAIS_LEAD_SOURCES,
  TAIS_TEAMS,
} from "@/lib/demo/tais/data";
import type { BitrixFieldMapping } from "./config";
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
  SmartProcessSubtype,
} from "./types";

/**
 * DEMO MOD kaynağı: gerçek bir Bitrix24 portalı yokken, mapper.ts +
 * sync.ts zincirini GERÇEKMİŞ GİBİ çalıştırmak için Bitrix24 REST
 * API'sinin döndüreceği şekle uygun sentetik ham kayıtlar üretir.
 * Math.random YOK — tohumlu RNG ile deterministik (aynı çağrı → aynı kayıt).
 * Bu kayıtlar TAIS'in gerçek demo veritabanını (seed.ts) BESLEMEZ; yalnızca
 * konnektör zincirinin uçtan uca çalıştığını kanıtlamak için üretilir.
 */

const DEMO_SEED = 24601;
const REFERENCE_ISO = "2026-01-15T09:00:00.000Z";

export interface Bitrix24DemoDataset {
  companies: BitrixCompanyRaw[];
  contacts: BitrixContactRaw[];
  leads: BitrixLeadRaw[];
  deals: BitrixDealRaw[];
  activities: BitrixActivityRaw[];
  tasks: BitrixTaskRaw[];
  users: BitrixUserRaw[];
  departments: BitrixDepartmentRaw[];
  smartProcessItems: Record<SmartProcessSubtype, BitrixSmartProcessItemRaw[]>;
}

function iso(rng: Rng, minPast: number, maxFuture: number): string {
  return daysFromReference(REFERENCE_ISO, rngInt(rng, minPast, maxFuture));
}

export function buildDemoDataset(fieldMapping: BitrixFieldMapping): Bitrix24DemoDataset {
  const rng = createRng(DEMO_SEED);

  const companyCount = 8;
  const companies: BitrixCompanyRaw[] = Array.from({ length: companyCount }, (_, i) => ({
    ID: String(1000 + i),
    TITLE: TAIS_CUSTOMER_NAMES[i % TAIS_CUSTOMER_NAMES.length],
    DATE_MODIFY: iso(rng, -30, -1),
    ...(fieldMapping.company?.districtField ? { [fieldMapping.company.districtField]: rngPick(rng, BAKU_DISTRICTS) } : {}),
    ...(fieldMapping.company?.categoryField
      ? { [fieldMapping.company.categoryField]: rngPick(rng, TAIS_CATEGORIES).id }
      : {}),
  }));

  const contacts: BitrixContactRaw[] = companies.map((c, i) => ({
    ID: String(2000 + i),
    NAME: "Elvin",
    LAST_NAME: "Aliyev",
    COMPANY_ID: c.ID,
    DATE_MODIFY: iso(rng, -20, -1),
    ...(fieldMapping.contact?.roleField ? { [fieldMapping.contact.roleField]: "Tesis Müdürü" } : {}),
  }));

  const leads: BitrixLeadRaw[] = Array.from({ length: 5 }, (_, i) => ({
    ID: String(3000 + i),
    TITLE: `Yeni hizmet talebi — ${TAIS_CUSTOMER_NAMES[(i + 3) % TAIS_CUSTOMER_NAMES.length]}`,
    STATUS_ID: rngPick(rng, ["NEW", "IN_PROCESS", "CONVERTED"]),
    SOURCE_ID: rngPick(rng, TAIS_LEAD_SOURCES),
    DATE_CREATE: iso(rng, -15, -1),
    DATE_MODIFY: iso(rng, -5, 0),
    ...(fieldMapping.lead?.categoryField ? { [fieldMapping.lead.categoryField]: rngPick(rng, TAIS_CATEGORIES).id } : {}),
  }));

  const deals: BitrixDealRaw[] = companies.map((c, i) => ({
    ID: String(4000 + i),
    TITLE: `Sözleşme — ${c.TITLE}`,
    COMPANY_ID: c.ID,
    STAGE_ID: rngPick(rng, ["PROSPECTING", "NEGOTIATION", "WON"]),
    OPPORTUNITY: String(rngInt(rng, 3000, 40000)),
    CURRENCY_ID: "AZN",
    DATE_MODIFY: iso(rng, -10, 0),
    ...(fieldMapping.deal?.categoryField ? { [fieldMapping.deal.categoryField]: rngPick(rng, TAIS_CATEGORIES).id } : {}),
    ...(fieldMapping.deal?.renewalDateField ? { [fieldMapping.deal.renewalDateField]: iso(rng, 5, 60) } : {}),
    ...(fieldMapping.deal?.startDateField ? { [fieldMapping.deal.startDateField]: iso(rng, -200, -30) } : {}),
  }));

  const activities: BitrixActivityRaw[] = Array.from({ length: 10 }, (_, i) => ({
    ID: String(5000 + i),
    SUBJECT: `Müşteri takibi #${i + 1}`,
    TYPE_ID: rngPick(rng, ["1", "2", "4"]),
    OWNER_ID: deals[i % deals.length].ID,
    COMPLETED: rngPick(rng, ["Y", "N"]),
    START_TIME: iso(rng, -12, 2),
    DATE_MODIFY: iso(rng, -5, 0),
    ...(fieldMapping.activity?.followUpField ? { [fieldMapping.activity.followUpField]: i % 4 === 0 ? "Y" : "N" } : {}),
  }));

  const departments: BitrixDepartmentRaw[] = TAIS_TEAMS.map((t, i) => ({
    ID: String(100 + i),
    NAME: t.name,
  }));

  const users: BitrixUserRaw[] = Array.from({ length: 12 }, (_, i) => ({
    ID: String(200 + i),
    NAME: TAIS_EMPLOYEE_NAMES[i].split(" ")[0],
    LAST_NAME: TAIS_EMPLOYEE_NAMES[i].split(" ")[1] ?? "",
    WORK_POSITION: "Saha Teknisyeni",
    UF_DEPARTMENT: [departments[i % departments.length].ID],
    ACTIVE: true,
  }));

  const tasks: BitrixTaskRaw[] = Array.from({ length: 12 }, (_, i) => {
    const status = rngPick(rng, ["2", "3", "5"]);
    const deadline = iso(rng, -5, 5);
    return {
      id: String(6000 + i),
      title: `Saha görevi #${i + 1}`,
      responsibleId: users[i % users.length].ID,
      status,
      deadline,
      closedDate: status === "5" ? iso(rng, -3, 0) : undefined,
      updatedDate: iso(rng, -3, 0),
      ...(fieldMapping.task?.categoryField ? { [fieldMapping.task.categoryField]: rngPick(rng, TAIS_CATEGORIES).id } : {}),
      ...(fieldMapping.task?.locationField ? { [fieldMapping.task.locationField]: `loc-${i % companyCount}` } : {}),
      ...(fieldMapping.task?.customerField ? { [fieldMapping.task.customerField]: companies[i % companyCount].ID } : {}),
    };
  });

  function buildSmartProcessItems(subtype: SmartProcessSubtype, count: number, idBase: number): BitrixSmartProcessItemRaw[] {
    const spMapping = fieldMapping.smartProcess?.[subtype];
    return Array.from({ length: count }, (_, i) => ({
      id: String(idBase + i),
      title: `${subtype} kaydı #${i + 1}`,
      stageId: rngPick(rng, ["open", "in_progress", "resolved"]),
      companyId: companies[i % companyCount].ID,
      createdTime: iso(rng, -10, 0),
      updatedTime: iso(rng, -3, 0),
      ...(spMapping?.categoryField ? { [spMapping.categoryField]: rngPick(rng, TAIS_CATEGORIES).id } : {}),
      ...(spMapping?.locationField ? { [spMapping.locationField]: `loc-${i % companyCount}` } : {}),
      ...(spMapping?.customerField ? { [spMapping.customerField]: companies[i % companyCount].ID } : {}),
      ...(spMapping?.openedAtField ? { [spMapping.openedAtField]: iso(rng, -10, 0) } : {}),
    }));
  }

  return {
    companies,
    contacts,
    leads,
    deals,
    activities,
    tasks,
    users,
    departments,
    smartProcessItems: {
      serviceRequest: buildSmartProcessItems("serviceRequest", 4, 7000),
      complaint: buildSmartProcessItems("complaint", 3, 7100),
      qualityIssue: buildSmartProcessItems("qualityIssue", 3, 7200),
    },
  };
}
