import { Linkedin, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { personKeyOf, type CandidatePerson } from "@/lib/campaigns";

export function PeopleTable({
  people,
  selectable,
  onRemove,
  badge,
}: {
  people: CandidatePerson[];
  selectable?: { isSelected: (p: CandidatePerson) => boolean; toggle: (p: CandidatePerson) => void };
  onRemove?: (p: CandidatePerson) => void;
  badge?: (p: CandidatePerson) => string;
}) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            {selectable && <th className="w-8" />}
            <th className="text-left px-2 py-1.5">Name</th>
            <th className="text-left px-2 py-1.5">Title</th>
            <th className="text-left px-2 py-1.5">Company</th>
            <th className="text-left px-2 py-1.5">Email</th>
            <th className="text-left px-2 py-1.5">Source</th>
            {onRemove && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => (
            <tr key={`${personKeyOf(p)}-${i}`} className="border-t border-border">
              {selectable && (
                <td className="px-2">
                  <Checkbox checked={selectable.isSelected(p)} onCheckedChange={() => selectable.toggle(p)} aria-label={`Select ${p.name}`} />
                </td>
              )}
              <td className="px-2 py-1.5 font-medium text-foreground">
                {p.name}
                {p.linkedin && (
                  <a href={p.linkedin} target="_blank" rel="noreferrer" className="ml-1 inline-block text-primary">
                    <Linkedin className="h-3 w-3" />
                  </a>
                )}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{p.title}</td>
              <td className="px-2 py-1.5">{p.company}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{p.email || "—"}</td>
              <td className="px-2 py-1.5">
                <Badge variant="outline" className="whitespace-nowrap text-[9px] capitalize">
                  {badge ? badge(p) : p.origin}
                </Badge>
              </td>
              {onRemove && (
                <td className="px-2">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemove(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
          {people.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                No people.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
