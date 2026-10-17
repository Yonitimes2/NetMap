"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/session-client";
import { toast } from "@/lib/toast";
import type { ProjectFinance, QuoteDefaults } from "@/lib/quote";

export interface FinanceState {
  finance: ProjectFinance;
  defaults: QuoteDefaults;
  orgId: string;
  /** the version, counted on each save, and when it was saved */
  rev: number;
  updatedAt?: number;
}

/**
 * A project's money (its quote and purchasing), for the account's owners: loaded once, and each
 * change saved a moment later (the last one wins), with a light note that it was saved.
 */
export function useProjectFinance(accountId: string, siteId: string, savedNote: string) {
  const [state, setState] = useState<FinanceState | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  /** the latest version, so quick changes build on each other */
  const latest = useRef<ProjectFinance | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** when the note last showed: not on every keystroke */
  const notedAt = useRef(0);
  const url = `/api/accounts/${accountId}/projects/${siteId}/finance`;

  useEffect(() => {
    let alive = true;
    authApi<FinanceState>(url, "GET")
      .then((r) => {
        if (!alive) return;
        latest.current = r.finance;
        setState(r);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [url]);

  const change = useCallback(
    (fn: (f: ProjectFinance) => ProjectFinance) => {
      if (!latest.current) return;
      const finance = fn(latest.current);
      latest.current = finance;
      setState((st) => st && { ...st, finance });
      clearTimeout(timer.current);
      setSaving(true);
      timer.current = setTimeout(() => {
        authApi<{ rev: number; updatedAt: number }>(url, "PUT", { finance: latest.current })
          .then((r) => {
            setState((st) => st && { ...st, rev: r.rev, updatedAt: r.updatedAt });
            if (Date.now() - notedAt.current > 4000) {
              notedAt.current = Date.now();
              toast(`${savedNote} · גרסה ${r.rev}`);
            }
          })
          .catch((e: Error) => toast(`לא נשמר: ${e.message}`, "error"))
          .finally(() => setSaving(false));
      }, 700);
    },
    [url, savedNote],
  );

  const orgId = state?.orgId;
  const saveDefaults = useCallback(
    async (defaults: QuoteDefaults) => {
      setState((s) => s && { ...s, defaults });
      if (!orgId) return;
      try {
        const r = await authApi<{ defaults: QuoteDefaults }>(`/api/orgs/${orgId}/quote-defaults`, "PUT", { defaults });
        setState((s) => s && { ...s, defaults: r.defaults });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [orgId],
  );

  return { state, error, saving, change, saveDefaults };
}

/** "גרסה 4 · נשמרה 17.10, 22:33", or that it's saving. */
export function versionText(state: FinanceState, saving: boolean) {
  if (saving) return "שומר…";
  if (!state.rev) return "עוד לא נשמרו שינויים";
  return `גרסה ${state.rev} · נשמרה ${new Date(state.updatedAt ?? 0).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}
