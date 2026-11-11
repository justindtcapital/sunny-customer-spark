// A spot in the left menu (below Detailed search) where the current page can
// place its own actions (e.g. Network's Import/Export) through a React portal.
import { useSyncExternalStore } from "react";

let slot: HTMLElement | null = null;
const subscribers = new Set<() => void>();

/** Callback ref for the left-menu element. */
export function setPageActionsSlot(el: HTMLElement | null) {
  if (slot === el) return;
  slot = el;
  subscribers.forEach((fn) => fn());
}

/** The left-menu element, or null when the menu is collapsed/closed (render inline instead). */
export function usePageActionsSlot(): HTMLElement | null {
  return useSyncExternalStore(
    (fn) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    () => slot,
    () => null,
  );
}
