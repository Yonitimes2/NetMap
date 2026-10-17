"use client";

import { useApp } from "./store";
import { useSession } from "./session-client";
import type { AccountRole } from "./account-doc";
import type { Account, Org, OrgRole } from "./types";

export type EffectiveRole = AccountRole | null;

/** The user's role in a customer. */
export const ROLE_LABEL: Record<AccountRole, string> = {
  owner: "בעל החשבון",
  admin: "בעל העסק",
  technician: "טכנאי",
  super: "מנהל-על",
};

/** The user's role in an account. */
export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: "בעלים",
  technician: "טכנאי",
  super: "מנהל מערכת",
};

/** The signed-in user (see session-client.ts). */
export const useCurrentUser = () => useSession((s) => s.user);

/** The signed-in user's role in a customer, as the server reported it. */
export function useRole(accountId: string | undefined): EffectiveRole {
  return useApp((s) => (accountId ? (s.meta[accountId]?.role ?? null) : null));
}

/** Every customer in this browser's copy is one the server lets the user see. */
export function useVisibleAccounts(): Account[] {
  return useApp((s) => s.accounts);
}

/** The accounts the user works in (system admins: every account). */
export const useOrgs = (): Org[] => useApp((s) => s.orgs);

/** Prices, costs and profit are an account owner's, for their own account (the server sends them to no one else). */
export const useSeesPrices = () => useApp((s) => s.orgs.some((o) => o.role === "owner"));

export const can = {
  view: (r: EffectiveRole) => r !== null,
  edit: (r: EffectiveRole) => r !== null,
  seeSecrets: (r: EffectiveRole) => r !== null,
  /** the people given access to just this customer */
  manageUsers: (r: EffectiveRole) => r === "owner" || r === "admin" || r === "super",
  manageSites: (r: EffectiveRole) => r !== null,
  /** move a project between its stages, mark equipment the customer already had */
  runProject: (r: EffectiveRole) => r === "owner" || r === "technician" || r === "super",
  /** the account's money: costs, customer prices, purchases, profit */
  money: (r: EffectiveRole) => r === "owner",
  /** open customers in the account / manage the account's people and details */
  addCustomers: (r: OrgRole | undefined) => !!r,
  manageOrg: (r: OrgRole | undefined) => r === "owner" || r === "super",
};
