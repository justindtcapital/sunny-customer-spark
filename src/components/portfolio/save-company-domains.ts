import type { PortfolioCompany } from "@/lib/types";
import { parseDomainList } from "@/lib/company-domains";
import { updatePortfolioCompany } from "@/utils/sheets.functions";
import { toast } from "sonner";

/** Save alias/dismissed domains, re-sending the company's current fields so nothing is cleared. */
export async function saveCompanyDomains(
  company: PortfolioCompany,
  patch: { domainAliases?: string[]; dismissedDomains?: string[] },
): Promise<PortfolioCompany | null> {
  try {
    const res = await updatePortfolioCompany({
      data: {
        urid: company.urid,
        matchName: company.name,
        name: company.name,
        website: company.website,
        focusArea: company.sector,
        location: company.location,
        description: company.description,
        domainAliases: patch.domainAliases ? parseDomainList(patch.domainAliases) : undefined,
        dismissedDomains: patch.dismissedDomains ? parseDomainList(patch.dismissedDomains) : undefined,
        upsertNew: company.id.startsWith("asana-pc-"),
      },
    });
    if (!res.updated) {
      toast.error("Couldn't find that company in the sheet to update.");
      return null;
    }
    const rejected = res.rejectedDomains || [];
    for (const r of rejected) toast.warning(`${r.domain} not added: ${r.reason}.`);
    const bad = new Set(rejected.map((r) => r.domain));
    return {
      ...company,
      urid: company.urid || res.urid,
      domainAliases: patch.domainAliases
        ? parseDomainList(patch.domainAliases).filter((d) => !bad.has(d))
        : company.domainAliases,
      dismissedDomains: patch.dismissedDomains ? parseDomainList(patch.dismissedDomains) : company.dismissedDomains,
    };
  } catch (e) {
    console.error("saveCompanyDomains failed", e);
    toast.error(e instanceof Error ? e.message : "Couldn't save the domains.");
    return null;
  }
}
