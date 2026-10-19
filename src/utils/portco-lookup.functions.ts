import { createServerFn } from "@tanstack/react-start";
import { lookupCompany, suggestKeyPeople } from "./portco-lookup.server";

export const lookupCompanyFn = createServerFn({ method: "POST" })
  .inputValidator((d: { name?: string; website?: string; linkedinUrl?: string }) => d)
  .handler(async ({ data }) => lookupCompany(data));

export const suggestKeyPeopleFn = createServerFn({ method: "POST" })
  .inputValidator((d: { website?: string; name?: string }) => d)
  .handler(async ({ data }) => {
    try {
      return await suggestKeyPeople(data);
    } catch (e) {
      return { people: [], error: e instanceof Error ? e.message : "Apollo search failed" };
    }
  });
