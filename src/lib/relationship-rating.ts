import type { Temperature } from "./types";

/** Only a direct human selection can assign anything other than Cold. */
export function creationRating(selected?: Temperature, explicitSelection = false): Temperature {
  return explicitSelection && selected ? selected : "Cold";
}

/** Activity score never changes a saved relationship rating. */
export function ratingAfterActivity(current: Temperature, _score: number): Temperature {
  return current;
}

export type RelationshipChange = "promote" | "demote" | "prospecting";
/** Ladder: Prospecting < Cold < Warm < Hot < Council (Council = extra hot, still Network). */
export function nextRelationshipLevel(current: Temperature, change: RelationshipChange): Temperature | "Prospecting" | null {
  if (change === "prospecting") return "Prospecting";
  if (change === "promote") return current === "Cold" ? "Warm" : current === "Warm" ? "Hot" : current === "Hot" ? "Council" : null;
  return current === "Council" ? "Hot" : current === "Hot" ? "Warm" : current === "Warm" ? "Cold" : "Prospecting";
}
