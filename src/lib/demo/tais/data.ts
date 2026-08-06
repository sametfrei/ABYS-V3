/**
 * TAIS IKF MMC demosu icin SABIT (deterministik) referans veriler.
 * Burada Math.random YOK — tum diziler literal veya sabit formulle
 * uretilir; seed.ts bunlari tohumlu RNG ile birlestirir.
 */

export type TaisCategoryId =
  | "cleaning"
  | "catering"
  | "pest_control"
  | "horeca"
  | "property_mgmt"
  | "office_mgmt";

export interface TaisCategory {
  id: TaisCategoryId;
  label: string;
}

export const TAIS_CATEGORIES: TaisCategory[] = [
  { id: "cleaning", label: "Cleaning" },
  { id: "catering", label: "Catering" },
  { id: "pest_control", label: "Pest Control" },
  { id: "horeca", label: "HORECA Solutions" },
  { id: "property_mgmt", label: "Property Management" },
  { id: "office_mgmt", label: "Office Management" },
];

export interface TaisTeamDef {
  key: string;
  name: string;
  category: TaisCategoryId;
  capacity: number;
}

/**
 * Kapasiteler senaryoyu doguracak sekilde secildi: "Cleaning Team B" digerlerine
 * gore dar kapasiteli tutuldu (18) ki gorev yogunlugu + SLA riski dogal olussun.
 */
export const TAIS_TEAMS: TaisTeamDef[] = [
  { key: "cleaning-a", name: "Cleaning Team A", category: "cleaning", capacity: 30 },
  { key: "cleaning-b", name: "Cleaning Team B", category: "cleaning", capacity: 18 },
  { key: "catering", name: "Catering Team", category: "catering", capacity: 25 },
  { key: "pest-control", name: "Pest Control Team", category: "pest_control", capacity: 14 },
  { key: "horeca", name: "HORECA Team", category: "horeca", capacity: 20 },
  { key: "property-mgmt", name: "Property Management Team", category: "property_mgmt", capacity: 18 },
  { key: "office-mgmt-a", name: "Office Management Team A", category: "office_mgmt", capacity: 20 },
  { key: "office-mgmt-b", name: "Office Management Team B", category: "office_mgmt", capacity: 20 },
];

export const BAKU_DISTRICTS = [
  "Nasimi", "Yasamal", "Sabail", "Narimanov", "Xatai", "Nizami",
  "Binagadi", "Suraxani", "Qaradag", "Xazar", "Sabuncu", "Pirallahi",
];

/** 25 kurumsal musteri — Baku baglaminda kurgusal isimler (gercek firma degil). */
export const TAIS_CUSTOMER_NAMES = [
  "Baku Crystal Plaza AVM",
  "Port Baku Residence",
  "Flame Towers Business Center",
  "Nizami Street Retail Park",
  "Xezer Lider Tower",
  "Winter Park Business Center",
  "Caspian Waterfront Hotel",
  "Baku White City Ofis Kompleksi",
  "Gunashli Sanayi Merkezi",
  "Narimanov Tibb Klinikasi",
  "Baku Dovlet Universiteti Kampusu",
  "Sahil Business Park",
  "Icheri Sheher Turizm Merkezi",
  "Yasamal Alisveris Merkezi",
  "Khazar Mall",
  "Port Baku Mall",
  "Baku Convention Center",
  "Ganjlik Mall",
  "28 May Business Center",
  "Landmark Baku Hotel",
  "Fountains Square Ofis Binasi",
  "Deniz Mall",
  "Baku Expo Center",
  "Caspian Business Center",
  "Zeytun Rezidans Kompleksi",
];

const EMPLOYEE_FIRST_NAMES = [
  "Elvin", "Kamran", "Nigar", "Aysel", "Tural", "Farid", "Gunel", "Sevinc",
  "Orkhan", "Rashad", "Leyla", "Aygun", "Anar", "Vusal", "Nurlan", "Sabina",
  "Elnur", "Rustam", "Naila", "Turkan",
];

const EMPLOYEE_LAST_NAMES = [
  "Aliyev", "Mammadov", "Huseynov", "Guliyev", "Hasanov", "Rzayev", "Ismayilov",
  "Karimov", "Abbasov", "Suleymanov", "Aliyeva", "Mammadova", "Huseynova",
  "Guliyeva", "Hasanova", "Rzayeva", "Ismayilova", "Karimova", "Abbasova", "Suleymanova",
];

/** 40 sabit tam ad — formul deterministik (Math.random yok). */
export const TAIS_EMPLOYEE_NAMES: string[] = Array.from({ length: 40 }, (_, i) => {
  const first = EMPLOYEE_FIRST_NAMES[i % EMPLOYEE_FIRST_NAMES.length];
  const last = EMPLOYEE_LAST_NAMES[(i * 7 + 3) % EMPLOYEE_LAST_NAMES.length];
  return `${first} ${last}`;
});

export const EMPLOYEE_ROLES = ["Saha Teknisyeni", "Ekip Lideri", "Operasyon Uzmani", "Saha Sorumlusu"];

export const TAIS_LEAD_SOURCES = ["Referans", "Bitrix24 Web Formu", "Soguk Arama", "Fuar/Etkinlik", "Ortak Kanal"];

export const TAIS_ACTIVITY_TYPES = ["call", "email", "meeting", "follow_up"] as const;
