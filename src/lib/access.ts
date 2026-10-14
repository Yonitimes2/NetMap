"use client";

import { useApp } from "./store";
import { useSession } from "./session-client";
import type { AccountRole } from "./account-doc";
import type { Account, Role } from "./types";

export type EffectiveRole = AccountRole | null;

export const ROLE_LABEL: Record<Role | "super", string> = {
  admin: "מנהל (בעל העסק)",
  technician: "טכנאי",
  super: "מנהל-על",
};

/** The signed-in user (see session-client.ts). */
export const useCurrentUser = () => useSession((s) => s.user);

/** The signed-in user's role in an account, as the server reported it. */
export function useRole(accountId: string | undefined): EffectiveRole {
  return useApp((s) => (accountId ? (s.meta[accountId]?.role ?? null) : null));
}

/** Every account in this browser's copy is one the server lets the user see. */
export function useVisibleAccounts(): Account[] {
  return useApp((s) => s.accounts);
}

export const can = {
  view: (r: EffectiveRole) => r !== null,
  edit: (r: EffectiveRole) => r !== null,
  seeSecrets: (r: EffectiveRole) => r !== null,
  manageUsers: (r: EffectiveRole) => r === "admin" || r === "super",
  manageSites: (r: EffectiveRole) => r === "admin" || r === "super" || r === "technician",
};
