import type { Temperature } from "./types";

/** Only a direct human selection can assign anything other than Cold. */
export function creationRating(selected?: Temperature, explicitSelection = false): Temperature {
  return explicitSelection && selected ? selected : "Cold";
}

/** Activity score never changes a saved relationship rating. */
export function ratingAfterActivity(current: Temperature, _score: number): Temperature {
  return current;
}