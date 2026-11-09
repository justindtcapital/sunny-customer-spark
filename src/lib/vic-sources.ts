/** External databases the user can ask V.I.C. to always check (browser-safe). */
export const VIC_EXTERNAL_SOURCES = [
  { id: "apollo", name: "Apollo", hint: "People outside our records", instruction: "The user ticked Apollo: for this question, also run apolloPeopleSearch for relevant people outside our records (after checking our own records) and say what Apollo returned, even if nothing." },
  { id: "sumble", name: "Sumble", hint: "Company profiles and tech", instruction: "The user ticked Sumble: for this question, also use sumbleCompanyIntel and/or sumbleCompaniesByTech for relevant companies (after checking our own records) and say what Sumble returned, even if nothing." },
] as const;

export type VicExternalSource = (typeof VIC_EXTERNAL_SOURCES)[number]["id"];

export function parseVicSources(value: unknown): VicExternalSource[] {
  if (!Array.isArray(value)) return [];
  return VIC_EXTERNAL_SOURCES.filter((s) => value.includes(s.id)).map((s) => s.id);
}

export function vicSourceInstructions(value: unknown): string {
  const ids = parseVicSources(value);
  return VIC_EXTERNAL_SOURCES.filter((s) => ids.includes(s.id)).map((s) => s.instruction).join("\n");
}
