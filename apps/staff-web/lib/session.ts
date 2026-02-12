import type { SessionData } from "./types";

const SESSION_STORAGE_KEY = "culturespark.staff.session";
const BRANCH_STORAGE_KEY = "culturespark.staff.selectedBranchId";

const canUseStorage = (): boolean => typeof window !== "undefined";

export const readSession = (): SessionData | null => {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

export const writeSession = (session: SessionData): void => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const clearSession = (): void => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
};

export const readSelectedBranchId = (): string => {
  if (!canUseStorage()) {
    return "";
  }

  return window.localStorage.getItem(BRANCH_STORAGE_KEY) ?? "";
};

export const writeSelectedBranchId = (branchId: string): void => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
};

export const clearSelectedBranchId = (): void => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(BRANCH_STORAGE_KEY);
};
