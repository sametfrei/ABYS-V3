import type { RoleId } from "./roles";
import type { SectorId } from "./sectors";

export interface AbysProfile {
  companyName: string;
  sectorId: SectorId;
  roleId: RoleId;
}

const KEY = "abys.profile";

export function saveProfile(profile: AbysProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(profile));
}

export function loadProfile(): AbysProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AbysProfile;
  } catch {
    return null;
  }
}

export function clearProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
