import { useCallback, useEffect, useState } from "react";

export type ViewMode = "cards" | "table";

/**
 * Cards/table view toggle persisted to localStorage. Starts from the
 * fallback so SSR and first client render match, then adopts the saved
 * choice after hydration.
 */
export function usePersistedView(
  storageKey: string,
  fallback: ViewMode,
): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(fallback);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "cards" || saved === "table") setView(saved);
    } catch {
      // storage unavailable — keep fallback
    }
  }, [storageKey]);

  const setPersisted = useCallback(
    (v: ViewMode) => {
      setView(v);
      try {
        window.localStorage.setItem(storageKey, v);
      } catch {
        // storage unavailable — view still changes for this session
      }
    },
    [storageKey],
  );

  return [view, setPersisted];
}
