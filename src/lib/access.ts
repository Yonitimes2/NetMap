"use client";

import { useApp } from "./store";
import type { Account, Role } from "./types";

export type EffectiveRole = Role | "super" | null;

export const ROLE_LABEL: Record<Role | "super", string> = {
  admin: "מנהל (בעל העסק)",
  technician: "טכנאי",
  super: "מנהל-על",
};

export function useCurrentUser() {
  return useApp((s) => s.users.find((u) => u.id === s.currentUserId));
}

/** Role of the current user in an account. Membership wins over super-admin. */
export function useRole(accountId: string | undefined): EffectiveRole {
  return useApp((s) => {
    if (!accountId) return null;
    const m = s.memberships.find((x) => x.accountId === accountId && x.userId === s.currentUserId);
    if (m) return m.role;
    const u = s.users.find((x) => x.id === s.currentUserId);
    return u?.superAdmin ? "super" : null;
  });
}

export function useVisibleAccounts(): Account[] {
  const accounts = useApp((s) => s.accounts);
  const memberships = useApp((s) => s.memberships);
  const user = useCurrentUser();
  if (!user) return [];
  if (user.superAdmin) return accounts;
  const ids = new Set(memberships.filter((m) => m.userId === user.id).map((m) => m.accountId));
  return accounts.filter((a) => ids.has(a.id));
}

export const can = {
  view: (r: EffectiveRole) => r !== null,
  edit: (r: EffectiveRole) => r !== null,
  seeSecrets: (r: EffectiveRole) => r !== null,
  manageUsers: (r: EffectiveRole) => r === "admin" || r === "super",
  manageSites: (r: EffectiveRole) => r === "admin" || r === "super" || r === "technician",
};
