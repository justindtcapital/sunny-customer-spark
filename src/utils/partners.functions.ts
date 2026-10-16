import { createServerFn } from "@tanstack/react-start";
import type { PartnerCategory } from "@/lib/partners";

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
