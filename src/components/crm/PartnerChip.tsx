import { Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { matchPartner } from "@/lib/partners";
import { usePartners } from "@/lib/use-partners";

/** Shows "Partner · Trace3" when this contact's company is a partner. */
export function PartnerChip({ company }: { company: string }) {
  const partners = usePartners();
  const p = matchPartner(company, partners);
  if (!p) return null;
  return (
    <Link to="/partners" className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
      title={`${p.category} partner — open Partners`}>
      <Handshake className="h-3 w-3" />Partner · {p.name}
    </Link>
  );
}
