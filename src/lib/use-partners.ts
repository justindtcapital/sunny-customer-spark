import { useEffect, useState } from "react";
import type { Partner } from "@/lib/partners";
import { fetchPartnersFn } from "@/utils/partners.functions";

// One shared fetch per page load; review cards and contact panes all reuse it.
let cache: Promise<{ partners: Partner[]; counts: Record<string, number> }> | null = null;

export function loadPartners(force = false) {
  if (!cache || force) cache = fetchPartnersFn().catch((e) => { cache = null; throw e; });
  return cache;
}

export function usePartners(): Partner[] {
  const [partners, setPartners] = useState<Partner[]>([]);
  useEffect(() => {
    let live = true;
    loadPartners().then((r) => { if (live) setPartners(r.partners); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return partners;
}
