"use client";

import { create } from "zustand";

/** A short message at the bottom of the screen ("הוכנס לארון…", "בוטל: …"). */
export const useToast = create<{ text: string; tone: "info" | "error"; n: number } | { text: null; tone: "info"; n: number }>(() => ({
  text: null,
  tone: "info",
  n: 0,
}));

export const toast = (text: string, tone: "info" | "error" = "info") =>
  useToast.setState((s) => ({ text, tone, n: s.n + 1 }));
