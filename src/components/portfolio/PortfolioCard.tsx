import type { PortfolioCompany } from "@/lib/types";
import type { PortfolioCompanyCounts } from "@/routes/portfolio";
import { Card, CardContent } from "@/components/ui/card";
import { PortcoLogo } from "@/components/portfolio/PortcoLogo";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Mail, MapPin, Users, Calendar, Link2 } from "lucide-react";

interface PortfolioCardProps {
  company: PortfolioCompany;
  counts: PortfolioCompanyCounts;
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function PortfolioCard({
  company,
  counts,
  onClick,
  selected = false,
  onToggleSelect,
}: PortfolioCardProps) {

  return (
    <Card
      className={`cursor-pointer surface-hover border-border h-full flex flex-col ${
        selected ? "ring-2 ring-primary/40 border-primary/40" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {onToggleSelect && (
              <div
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect(company.id)}
                  aria-label={`Select ${company.name}`}
                />
              </div>
            )}
            <PortcoLogo name={company.name} website={company.website} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{company.name}</h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{company.sector}</span>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">{company.domain}</Badge>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{company.description}</p>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            {company.location}
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3" />
            {company.contactEmail}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-auto pt-3 border-t border-border">
          <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
            <Users className="h-3 w-3 inline mr-0.5" />
            {counts.people} {counts.people === 1 ? "person" : "people"}
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
            <Calendar className="h-3 w-3 inline mr-0.5" />
            {counts.events} events
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
            <Link2 className="h-3 w-3 inline mr-0.5" />
            {counts.intros} intros
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
