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
import type { SmartProcessSubtype } from "./types";

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
    };
  }

  const fieldMapping = config.fieldMapping;
  const importedCounts: Partial<Record<SyncEntityKey, number>> = {};
  const errors: SyncRunError[] = [];
  const cursor: SyncCursor = { ...previousCursor };

  async function syncEntity<Raw>(
    key: SyncEntityKey,
    fetcher: (since?: string) => Promise<Raw[]>,
    map: (raw: Raw) => { externalId: string; updatedAt: string | null }
  ) {
    try {
      const raw = await fetcher(previousCursor[key] ?? undefined);
      const mapped = raw.map(map);
      const deduped = dedupeByExternalId(mapped);
      importedCounts[key] = deduped.items.length;
      cursor[key] = computeCursor(deduped.items, previousCursor[key] ?? null);
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
  };
}
