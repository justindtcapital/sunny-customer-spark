// Stakeholders & contacts picker for a workstream: multi-select search over the
// Venture Pulse Network and Prospecting people, stored as names on the workstream.

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchPeopleFn } from "@/utils/knowledge.functions";
import type { PersonMatch } from "@/utils/notes-inbox.server";

export interface Stakeholder {
  name: string;
  email: string;
  where: string;
}

/** Split the legacy free-text stakeholders field into initial chips. */
export function parseStakeholders(text: string): Stakeholder[] {
  return (text || "")
    .split(/[,;\n•]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, email: "", where: "" }));
}

export function StakeholderPicker({ value, onChange }: { value: Stakeholder[]; onChange: (v: Stakeholder[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      searchPeopleFn({ data: { q: q.trim() } })
        .then((r) => setResults(r.filter((p) => !value.some((v) => v.name.toLowerCase() === p.name.toLowerCase() || (p.email && v.email.toLowerCase() === p.email.toLowerCase())))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, value]);

  const add = (p: PersonMatch) => {
    onChange([...value, { name: p.name, email: p.email, where: p.where }]);
    setQ(""); setResults([]);
  };

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((s, i) => {
            const chip = (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[11px]">
                {s.name}
                {s.where && <span className="text-[9px] text-muted-foreground">{s.where === "Network" ? "NWK" : s.where}</span>}
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </span>
            );
            return s.email ? (
              <Link key={`${s.name}-${i}`} to={s.where === "Prospecting" ? "/targeting" : "/crm"} search={s.where === "Prospecting" ? { target: s.email } : { contact: s.email }} className="hover:opacity-80">{chip}</Link>
            ) : (
              <span key={`${s.name}-${i}`}>{chip}</span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-7 text-xs"
          placeholder="Search Network & Prospecting to add a stakeholder…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {searching && <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {results.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-sm">
          {results.map((p, i) => (
            <button key={`${p.email || p.name}-${i}`} type="button" onClick={() => add(p)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted">
              <span className="min-w-0 truncate">{p.name}{p.company ? <span className="text-muted-foreground"> · {p.company}</span> : null}</span>
              <span className="shrink-0 rounded border border-border px-1 text-[9px] text-muted-foreground">{p.where}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
