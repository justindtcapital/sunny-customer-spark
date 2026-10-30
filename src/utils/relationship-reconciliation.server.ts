import { createServerOnlyFn } from "@tanstack/react-start";
import { reconcileRelationships } from "@/lib/relationship-reconciliation";
import type { RelationshipInput } from "./relationship-levels.server";
import { fetchSheetTab, TAB_NAMES } from "./sheets.server";

export const inspectRelationshipState = createServerOnlyFn(async (input: RelationshipInput) => {
  // Deliberately use raw reads: inspection must never self-heal IDs or prepare columns.
  const contacts = await fetchSheetTab(TAB_NAMES.contacts, true);
  const targets = await fetchSheetTab(TAB_NAMES.targets, true);
  return reconcileRelationships(input.contacts,contacts,targets);
});