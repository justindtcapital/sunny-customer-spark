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
export function nextRelationshipLevel(current: Temperature, change: RelationshipChange): "Hot" | "Warm" | "Cold" | "Prospecting" | null {
  if (current === "Council") return null;
  if (change === "prospecting") return "Prospecting";
  if (change === "promote") return current === "Cold" ? "Warm" : current === "Warm" ? "Hot" : null;
  return current === "Hot" ? "Warm" : current === "Warm" ? "Cold" : "Prospecting";
}