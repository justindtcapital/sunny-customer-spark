import { createServerFn } from "@tanstack/react-start";
import type { PartnerCategory } from "@/lib/partners";
import { requireTeamAuth } from "./team-auth";

export const fetchPartnersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { partnerSummaries } = await import("./partners.server");
  return partnerSummaries();
});

export const addPartnerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; category: PartnerCategory; website?: string; notes?: string }) => {
    if (!d?.name?.trim()) throw new Error("Partner name is required");
    return d;
  })
  .handler(async ({ data }) => {
    const { addPartner } = await import("./partners.server");
    return addPartner(data);
  });

export const fetchPartnerDetailFn = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string }) => d)
  .handler(async ({ data }) => {
    const { partnerDetail } = await import("./partners.server");
    return partnerDetail(data.name);
  });

export const setPartnerDomainsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; domains: string[] }) => {
    if (!d?.name?.trim() || !Array.isArray(d.domains) || d.domains.length > 30) throw new Error("Invalid partner domains");
    return d;
  })
  .middleware([requireTeamAuth])
  .handler(async ({ data, context }) => {
    const { setPartnerDomains } = await import("./partners.server");
    const res = await setPartnerDomains(data.name, data.domains);
    const { logOpsEvent } = await import("./sheets.server");
    await logOpsEvent({
      action: "maintenance",
      source: "company_domains",
      status: res.rejected.length ? "warning" : "ok",
      summary: `Email domains for partner ${data.name}: ${res.domains.join(", ") || "none"}`,
      details: { by: context.teamEmail || "teammate", rejected: res.rejected.map((r) => `${r.domain} (${r.reason})`).join("; ") },
    });
    return res;
  });
