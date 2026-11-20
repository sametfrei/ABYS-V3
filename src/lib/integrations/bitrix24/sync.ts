import { randomBytes } from "crypto";
import { checkLiveCredentials, type BitrixConnectorConfig } from "./config";
import {
  fetchActivities,
  fetchCompanies,
  fetchContacts,
  fetchDeals,
  fetchDepartments,
  fetchLeads,
  fetchSmartProcessItems,
  fetchTasks,
  fetchUsers,
} from "./client";
import { buildDemoDataset } from "./demo-source";
import type { CanonicalEntity, CanonicalRecord } from "@/lib/connectors/types";
import {
  mapActivity,
  mapCompany,
  mapContact,
  mapDeal,
  mapDepartment,
  mapLead,
  mapSmartProcessItem,
  mapTask,
  mapUser,
} from "./mapper";
import type {
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
 * Senkron orkestrasyonu. DEMO ve LIVE aynı mapper/normalize zincirinden
 * geçer (bkz. mapCompany vb.) — konnektör "boş arayüz" değildir.
 *
 * LIVE dalı: kimlik bilgisi eksikse ağa HİÇ çıkmaz, sahte başarı DÖNMEZ,
 * demo verisine sessizce DÜŞMEZ (bkz. status "credentials_missing").
 */

export type SyncEntityKey =
  | "companies"
  | "contacts"
  | "leads"
  | "deals"
  | "activities"
  | "tasks"
  | "users"
  | "departments"
  | "serviceRequest"
  | "complaint"
  | "qualityIssue";

export type SyncCursor = Partial<Record<SyncEntityKey, string | null>>;

export interface SyncRunError {
  entity: SyncEntityKey | "config";
  message: string;
}

export interface SyncRunResult {
  runId: string;
  mode: "demo" | "live";
  startedAt: string;
  finishedAt: string;
  status: "ok" | "error" | "credentials_missing";
  importedCounts: Partial<Record<SyncEntityKey, number>>;
  errors: SyncRunError[];
  cursor: SyncCursor;
  /** Kanonik yazım için route tarafından kullanılır; HTTP yanıtına aktarılmaz. */
  canonicalRecords: CanonicalRecord[];
}

const CANONICAL_ENTITY_BY_KEY: Record<SyncEntityKey, CanonicalEntity> = {
  companies: "customer",
  contacts: "customer",
  leads: "event",
  deals: "order",
  activities: "event",
  tasks: "event",
  users: "employee",
  departments: "event",
  serviceRequest: "event",
  complaint: "event",
  qualityIssue: "event",
};

type SyncItem = { externalId: string; updatedAt: string | null };

function sourceId(key: SyncEntityKey, externalId: string | null): string | null {
  return externalId ? `${key}:${externalId}` : null;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function eventTime(
  candidates: Array<string | null | undefined>,
  observedAt: string
): { occurred_at: string; occurred_at_source: "source" | "sync_observation" } {
  for (const candidate of candidates) {
    const normalized = isoDate(candidate ?? null);
    if (normalized) return { occurred_at: normalized, occurred_at_source: "source" };
  }
  return { occurred_at: observedAt, occurred_at_source: "sync_observation" };
}

/**
 * Bitrix24 aynı sayısal ID'leri farklı nesne ailelerinde kullanabilir. Kaynak
 * kimliği bu nedenle nesne türüyle ad alanına alınır; company#1000 ile
 * contact#1000 aynı müşteri kaydını ezemez.
 */
function recordsFor(key: SyncEntityKey, items: SyncItem[], observedAt: string): CanonicalRecord[] {
  return items.map((item) => {
    const common = { source_entity: key, source_external_id: item.externalId };
    let entity: CanonicalEntity = CANONICAL_ENTITY_BY_KEY[key];
    let fields: CanonicalRecord["fields"] = common;

    switch (key) {
      case "companies": {
        const company = item as unknown as NormalizedCustomer;
        entity = "customer";
        fields = { ...common, name: company.name, segment: company.category, district: company.district };
        break;
      }
      case "contacts": {
        const contact = item as unknown as NormalizedContact;
        entity = "customer";
        fields = {
          ...common,
          name: contact.fullName,
          company_ref: sourceId("companies", contact.companyExternalId),
          role: contact.role,
        };
        break;
      }
      case "leads": {
        const lead = item as unknown as NormalizedServiceLead;
        entity = "event";
        fields = {
          ...common,
          event_type: "lead.synced",
          ...eventTime([lead.createdAt, lead.updatedAt], observedAt),
          subject_ref: sourceId("companies", lead.customerExternalId) ?? sourceId(key, lead.externalId),
          title: lead.title,
          stage: lead.stage,
          source: lead.source,
          category: lead.category,
        };
        break;
      }
      case "deals": {
        const deal = item as unknown as NormalizedDeal;
        entity = "order";
        fields = {
          ...common,
          customerId: sourceId("companies", deal.customerExternalId),
          total_amount: deal.valueAzn,
          order_date: isoDate(deal.startDate),
          status: deal.stage,
          title: deal.title,
          category: deal.category,
          renewal_date: isoDate(deal.renewalDate),
        };
        break;
      }
      case "activities": {
        const activity = item as unknown as NormalizedActivity;
        entity = "event";
        fields = {
          ...common,
          event_type: `activity.${activity.type}`,
          ...eventTime([activity.occurredAt, activity.updatedAt], observedAt),
          subject_ref: sourceId("users", activity.ownerExternalId) ?? sourceId(key, activity.externalId),
          title: activity.subject,
        };
        break;
      }
      case "tasks": {
        const task = item as unknown as NormalizedTask;
        entity = "event";
        fields = {
          ...common,
          event_type: `task.${task.status}`,
          ...eventTime([task.completedAt, task.updatedAt], observedAt),
          subject_ref: sourceId("companies", task.customerExternalId) ?? sourceId(key, task.externalId),
          title: task.title,
          status: task.status,
          category: task.category,
          due_at: isoDate(task.dueAt),
          owner_ref: sourceId("users", task.responsibleExternalId),
        };
        break;
      }
      case "users": {
        const user = item as unknown as NormalizedEmployee;
        entity = "employee";
        fields = {
          ...common,
          name: user.fullName,
          department: user.departmentExternalIds
            .map((id) => sourceId("departments", id))
            .filter(Boolean)
            .join(","),
          role: user.role,
          status: user.active ? "active" : "inactive",
        };
        break;
      }
      case "departments": {
        const department = item as unknown as NormalizedDepartment;
        entity = "event";
        fields = {
          ...common,
          event_type: "department.snapshot",
          ...eventTime([department.updatedAt], observedAt),
          subject_ref: sourceId(key, department.externalId),
          name: department.name,
          parent_ref: sourceId(key, department.parentExternalId),
        };
        break;
      }
      case "serviceRequest":
      case "complaint":
      case "qualityIssue": {
        const record = item as unknown as NormalizedSmartProcessItem;
        entity = "event";
        fields = {
          ...common,
          event_type: `${record.subtype}.${record.status}`,
          ...eventTime([record.openedAt, record.updatedAt], observedAt),
          subject_ref: sourceId("companies", record.customerExternalId) ?? sourceId(key, record.externalId),
          title: record.title,
          status: record.status,
          category: record.category,
          location_ref: record.locationExternalId,
          matched_task_ref: sourceId("tasks", record.matchedTaskExternalId),
        };
        break;
      }
    }

    return {
      entity,
      externalId: sourceId(key, item.externalId) ?? `${key}:missing-id`,
      sourceUpdatedAt: isoDate(item.updatedAt),
      fields,
    };
  });
}

/** Dış kimliğe (externalId) göre tekilleştirir; idempotency'nin temelidir. */
export function dedupeByExternalId<T extends { externalId: string }>(
  items: T[]
): { items: T[]; duplicates: number } {
  const seen = new Map<string, T>();
  let duplicates = 0;
  for (const item of items) {
    if (seen.has(item.externalId)) {
      duplicates++;
      continue;
    }
    seen.set(item.externalId, item);
  }
  return { items: Array.from(seen.values()), duplicates };
}

/** Bir sonraki senkron için imleç: görülen en yeni updatedAt değeri. */
export function computeCursor(items: { updatedAt: string | null }[], previous: string | null = null): string | null {
  let latest = previous;
  for (const item of items) {
    if (!item.updatedAt) continue;
    if (!latest || item.updatedAt > latest) latest = item.updatedAt;
  }
  return latest;
}

function newRunId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * DEMO senkron: gerçek bağlantı hiç kurulmaz. buildDemoDataset ile üretilen
 * sentetik Bitrix24 kayıtları, live modla AYNI mapper fonksiyonlarından
 * geçirilir — zincirin gerçekten çalıştığını kanıtlar.
 */
export function runDemoSync(config: BitrixConnectorConfig): SyncRunResult {
  const startedAt = new Date().toISOString();
  const fieldMapping = config.fieldMapping;
  const dataset = buildDemoDataset(fieldMapping);

  const customers = dataset.companies.map((c) => mapCompany(c, fieldMapping));
  const contacts = dataset.contacts.map((c) => mapContact(c, fieldMapping));
  const leads = dataset.leads.map((l) => mapLead(l, fieldMapping));
  const deals = dataset.deals.map((d) => mapDeal(d, fieldMapping));
  const activities = dataset.activities.map((a) => mapActivity(a, fieldMapping));
  const tasks = dataset.tasks.map((t) => mapTask(t, fieldMapping));
  const users = dataset.users.map((u) => mapUser(u, fieldMapping));
  const departments = dataset.departments.map((d) => mapDepartment(d));
  const serviceRequest = dataset.smartProcessItems.serviceRequest.map((s) =>
    mapSmartProcessItem(s, fieldMapping, "serviceRequest")
  );
  const complaint = dataset.smartProcessItems.complaint.map((s) => mapSmartProcessItem(s, fieldMapping, "complaint"));
  const qualityIssue = dataset.smartProcessItems.qualityIssue.map((s) =>
    mapSmartProcessItem(s, fieldMapping, "qualityIssue")
  );

  const dedupedCustomers = dedupeByExternalId(customers);
  const dedupedContacts = dedupeByExternalId(contacts);
  const dedupedLeads = dedupeByExternalId(leads);
  const dedupedDeals = dedupeByExternalId(deals);
  const dedupedActivities = dedupeByExternalId(activities);
  const dedupedTasks = dedupeByExternalId(tasks);
  const dedupedUsers = dedupeByExternalId(users);
  const dedupedDepartments = dedupeByExternalId(departments);
  const dedupedServiceRequest = dedupeByExternalId(serviceRequest);
  const dedupedComplaint = dedupeByExternalId(complaint);
  const dedupedQualityIssue = dedupeByExternalId(qualityIssue);
  const canonicalRecords = [
    ...recordsFor("companies", dedupedCustomers.items, startedAt),
    ...recordsFor("contacts", dedupedContacts.items, startedAt),
    ...recordsFor("leads", dedupedLeads.items, startedAt),
    ...recordsFor("deals", dedupedDeals.items, startedAt),
    ...recordsFor("activities", dedupedActivities.items, startedAt),
    ...recordsFor("tasks", dedupedTasks.items, startedAt),
    ...recordsFor("users", dedupedUsers.items, startedAt),
    ...recordsFor("departments", dedupedDepartments.items, startedAt),
    ...recordsFor("serviceRequest", dedupedServiceRequest.items, startedAt),
    ...recordsFor("complaint", dedupedComplaint.items, startedAt),
    ...recordsFor("qualityIssue", dedupedQualityIssue.items, startedAt),
  ];

  return {
    runId: newRunId(),
    mode: "demo",
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "ok",
    importedCounts: {
      companies: dedupedCustomers.items.length,
      contacts: dedupedContacts.items.length,
      leads: dedupedLeads.items.length,
      deals: dedupedDeals.items.length,
      activities: dedupedActivities.items.length,
      tasks: dedupedTasks.items.length,
      users: dedupedUsers.items.length,
      departments: dedupedDepartments.items.length,
      serviceRequest: dedupedServiceRequest.items.length,
      complaint: dedupedComplaint.items.length,
      qualityIssue: dedupedQualityIssue.items.length,
    },
    errors: [],
    cursor: {
      companies: computeCursor(dedupedCustomers.items),
      contacts: computeCursor(dedupedContacts.items),
      leads: computeCursor(dedupedLeads.items),
      deals: computeCursor(dedupedDeals.items),
      activities: computeCursor(dedupedActivities.items),
      tasks: computeCursor(dedupedTasks.items),
      serviceRequest: computeCursor(dedupedServiceRequest.items),
      complaint: computeCursor(dedupedComplaint.items),
      qualityIssue: computeCursor(dedupedQualityIssue.items),
    },
    canonicalRecords,
  };
}

const SMART_PROCESS_SUBTYPES: SmartProcessSubtype[] = ["serviceRequest", "complaint", "qualityIssue"];

/**
 * LIVE senkron. Kimlik bilgisi eksikse ağa hiç çıkmadan
 * status="credentials_missing" döner. Var olan girişlerde her varlık
 * türü ayrı ayrı çekilir; bir türün hatası diğerlerini durdurmaz
 * (kısmi başarı errors[] ile raporlanır).
 */
export async function runLiveSync(config: BitrixConnectorConfig, previousCursor: SyncCursor = {}): Promise<SyncRunResult> {
  const startedAt = new Date().toISOString();
  const runId = newRunId();

  const credCheck = checkLiveCredentials(config);
  if (!credCheck.ok) {
    return {
      runId,
      mode: "live",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "credentials_missing",
      importedCounts: {},
      errors: [{ entity: "config", message: `Live bağlantı yapılandırılmamış: ${credCheck.missing.join(", ")}` }],
      cursor: previousCursor,
      canonicalRecords: [],
    };
  }

  const fieldMapping = config.fieldMapping;
  const importedCounts: Partial<Record<SyncEntityKey, number>> = {};
  const errors: SyncRunError[] = [];
  const cursor: SyncCursor = { ...previousCursor };
  const canonicalRecords: CanonicalRecord[] = [];

  async function syncEntity<Raw, Mapped extends { externalId: string; updatedAt: string | null }>(
    key: SyncEntityKey,
    fetcher: (since?: string) => Promise<Raw[]>,
    map: (raw: Raw) => Mapped
  ) {
    try {
      const raw = await fetcher(previousCursor[key] ?? undefined);
      const mapped = raw.map(map);
      const deduped = dedupeByExternalId(mapped);
      importedCounts[key] = deduped.items.length;
      cursor[key] = computeCursor(deduped.items, previousCursor[key] ?? null);
      canonicalRecords.push(...recordsFor(key, deduped.items, startedAt));
    } catch (err) {
      errors.push({ entity: key, message: err instanceof Error ? err.message : "bilinmeyen hata" });
    }
  }

  await syncEntity("companies", (s) => fetchCompanies(config, s), (r) => mapCompany(r, fieldMapping));
  await syncEntity("contacts", (s) => fetchContacts(config, s), (r) => mapContact(r, fieldMapping));
  await syncEntity("leads", (s) => fetchLeads(config, s), (r) => mapLead(r, fieldMapping));
  await syncEntity("deals", (s) => fetchDeals(config, s), (r) => mapDeal(r, fieldMapping));
  await syncEntity("activities", (s) => fetchActivities(config, s), (r) => mapActivity(r, fieldMapping));
  await syncEntity("tasks", (s) => fetchTasks(config, s), (r) => mapTask(r, fieldMapping));
  await syncEntity("users", () => fetchUsers(config), (r) => mapUser(r, fieldMapping));
  await syncEntity("departments", () => fetchDepartments(config), (r) => mapDepartment(r));

  for (const subtype of SMART_PROCESS_SUBTYPES) {
    const entityTypeId = fieldMapping.smartProcess?.[subtype]?.entityTypeId;
    if (!entityTypeId) {
      errors.push({ entity: subtype, message: "field-mapping dosyasında entityTypeId tanımlı değil." });
      continue;
    }
    await syncEntity(
      subtype,
      (s) => fetchSmartProcessItems(config, entityTypeId, s),
      (r) => mapSmartProcessItem(r, fieldMapping, subtype)
    );
  }

  return {
    runId,
    mode: "live",
    startedAt,
    finishedAt: new Date().toISOString(),
    status: errors.length === 0 ? "ok" : "error",
    importedCounts,
    errors,
    cursor,
    canonicalRecords,
  };
}
