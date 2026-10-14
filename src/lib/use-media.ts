"use client";

import { useSyncExternalStore } from "react";

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Phones (narrow, or held sideways): the map gets a bottom tool bar and nothing floats over it.
 * The width matches Tailwind's md breakpoint.
 */
export const PHONE_QUERY = "(max-width: 767px), (pointer: coarse) and (max-height: 500px)";
export const useIsPhone = () => useMedia(PHONE_QUERY);
export const isPhone = () => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches;

/** A phone held sideways: little height, so details open beside the map instead of below it. */
export const useLandscapePhone = () => useMedia("(pointer: coarse) and (max-height: 500px) and (orientation: landscape)");

/** Finger instead of mouse: bigger hit areas on the map. */
export const useCoarsePointer = () => useMedia("(pointer: coarse)");

/** Running as an installed app (home-screen icon), not in a browser tab. */
export const useStandalone = () => useMedia("(display-mode: standalone)");
