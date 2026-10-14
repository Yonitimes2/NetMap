/** Shared by the server and the browser (no Node imports here). */

export type AuthRole = "admin" | "member";

export const AUTH_ROLE_LABEL: Record<AuthRole, string> = {
  admin: "מנהל מערכת",
  member: "משתמש",
};

export const PASSWORD_MIN = 8;
