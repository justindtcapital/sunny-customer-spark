import { createServerFn } from "@tanstack/react-start";
import { requireTeamAuth } from "./team-auth";
import type { ContactImportInput } from "./bulk-import.server";

export const importContactsBatch = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator((input: ContactImportInput) => {
    if (!Array.isArray(input.contacts) || !input.contacts.length || input.contacts.length > 1000) throw new Error("Choose between 1 and 1000 contacts.");
    return input;
  }).handler(async ({ data,context }) => {
    const { runJournalOperation } = await import("./bulk-journal.server");
    const { importContactRows } = await import("./bulk-import.server");
    const result = await runJournalOperation({ kind:"contact-import",page:"/crm",input:data,actor:context,run:async journal => {
      const value = await importContactRows(data,journal);
      return { value,outcomes:value.outcomes };
    } });
    return { ...result.value,operationId:result.operationId };
  });