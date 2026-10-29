import { useState } from "react";
import type { Contact, PortfolioCompany } from "@/lib/types";
import type { DomainSuggestion } from "@/lib/company-domains";
import { Button } from "@/components/ui/button";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { saveCompanyDomains } from "./save-company-domains";

// Review-only: suggested domains never link anyone until a teammate verifies them.
export function DomainSuggestions({
  company,
  suggestions,
  onCompanyUpdate,
}: {
  company: PortfolioCompany;
  suggestions: DomainSuggestion<Contact>[];
  onCompanyUpdate?: (updated: PortfolioCompany) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!suggestions.length) return null;

  const act = async (domain: string, verify: boolean) => {
    setBusy(domain);
    try {
      const updated = await saveCompanyDomains(
        company,
        verify
          ? { domainAliases: [...(company.domainAliases || []), domain] }
          : { dismissedDomains: [...(company.dismissedDomains || []), domain] },
      );
      if (updated) {
        toast.success(verify ? `${domain} now links people to ${company.name}.` : `Dismissed ${domain}.`);
        onCompanyUpdate?.(updated);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-3 rounded-md border border-dashed border-border bg-muted/40 p-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Possible matches — not linked until verified
      </p>
      <ul className="space-y-1.5">
        {suggestions.slice(0, 5).map((s) => (
          <li key={s.domain} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-xs">
              <span className="font-mono">@{s.domain}</span>
              <span className="text-muted-foreground">
                {" "}
                · {s.contacts.length} {s.contacts.length === 1 ? "person" : "people"} · {s.reason}
                {" — "}
                {s.contacts.slice(0, 3).map((c) => c.name).join(", ")}
                {s.contacts.length > 3 ? "…" : ""}
              </span>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={!!busy} onClick={() => void act(s.domain, true)}>
                {busy === s.domain ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                Add domain as verified
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={!!busy} onClick={() => void act(s.domain, false)}>
                <X className="mr-1 h-3 w-3" /> Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
