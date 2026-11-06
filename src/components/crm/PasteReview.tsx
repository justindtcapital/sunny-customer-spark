import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle } from "lucide-react";
import { parsePastedContacts, singleNameReport, type PastedContact } from "@/lib/paste-parse";

type RowEdit = Partial<PastedContact> & { skip?: boolean };

/** Parse pasted text into an editable review list. Nothing is saved here. */
export function usePasteReview(text: string, isDuplicate: (r: PastedContact) => boolean = () => false) {
  const [combine, setCombine] = useState<boolean | undefined>(undefined);
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const parsed = useMemo(() => parsePastedContacts(text, combine), [text, combine]);
  // Re-parsing changes row meaning, so earlier per-row edits no longer apply.
  useEffect(() => setEdits({}), [text, combine]);

  const reviewed = useMemo(() => parsed.rows.map((r, i) => ({ ...r, ...edits[i] })), [parsed.rows, edits]);
  const report = useMemo(() => singleNameReport(reviewed.map((r, i) => (edits[i]?.skip ? { name: "x y" } : r))), [reviewed, edits]);
  const toImport = useMemo(() => reviewed.filter((_, i) => !edits[i]?.skip).map(({ skip: _s, ...r }) => r as PastedContact), [reviewed, edits]);
  const duplicates = useMemo(() => toImport.filter(isDuplicate).length, [toImport, isDuplicate]);

  const edit = (i: number, patch: RowEdit) => setEdits((e) => ({ ...e, [i]: { ...e[i], ...patch } }));
  const moveSurnames = () =>
    setEdits((e) => {
      const next = { ...e };
      for (const i of report.surnameInCompany) {
        const r = reviewed[i];
        next[i] = { ...next[i], name: `${r.name.trim()} ${r.company.trim()}`, company: "" };
      }
      return next;
    });
  const reset = () => { setCombine(undefined); setEdits({}); };

  return { parsed, reviewed, edits, edit, report, toImport, duplicates, combine: combine ?? parsed.firstLastDetected, setCombine, moveSurnames, reset, isDuplicate };
}

export type PasteReviewState = ReturnType<typeof usePasteReview>;

/** Editable pre-flight table for pasted people, with the single-name warning. */
export function PasteReviewPanel({ review, noun = "contact" }: { review: PasteReviewState; noun?: string }) {
  const { parsed, reviewed, edits, edit, report, toImport, duplicates, combine, setCombine, moveSurnames, isDuplicate } = review;
  if (reviewed.length === 0) return null;
  const singles = new Set(report.singles);
  const surnames = new Set(report.surnameInCompany);
  return (
    <div className="space-y-2">
      {!parsed.headerMapped && (
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
          <Checkbox checked={combine} onCheckedChange={(v) => setCombine(v === true)} />
          <span>
            Columns 1 &amp; 2 are <span className="font-medium text-foreground">first and last names</span>
            {parsed.firstLastDetected && <span className="text-muted-foreground/70"> — detected automatically</span>}
          </span>
        </label>
      )}
      {parsed.headerMapped && (
        <p className="text-[11px] text-muted-foreground">Columns matched from your header row.</p>
      )}

      {report.singles.length > 0 && (
        <div role="alert" className="rounded border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] text-foreground space-y-1.5">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
            <span>
              <span className="font-semibold">{report.singles.length} of {toImport.length} {report.singles.length === 1 ? "people has" : "people have"} only one name.</span>
              {report.surnameInCompany.length > 0
                ? ` ${report.surnameInCompany.length} look like their last name was put in Company. Check the table before adding.`
                : " Add last names below if you have them."}
            </span>
          </div>
          {report.surnameInCompany.length > 0 && (
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={moveSurnames}>
              Move Company into last name for {report.surnameInCompany.length}
            </Button>
          )}
        </div>
      )}

      <div>
        <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
          Review before adding · {toImport.length} {noun}{toImport.length !== 1 ? "s" : ""}
          {duplicates > 0 && ` · ${duplicates} already saved (won't be duplicated)`}
        </Label>
        <ScrollArea className="h-64 border border-border rounded">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr className="text-left">
                <th className="px-1.5 py-1 font-semibold w-10">Add</th>
                <th className="px-1.5 py-1 font-semibold">Name</th>
                <th className="px-1.5 py-1 font-semibold">Company</th>
                <th className="px-1.5 py-1 font-semibold">Title</th>
                <th className="px-1.5 py-1 font-semibold">Email</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.map((r, i) => {
                const skipped = !!edits[i]?.skip;
                const field = (k: keyof PastedContact, placeholder: string, warn = false) => (
                  <Input
                    value={r[k]}
                    disabled={skipped}
                    placeholder={placeholder}
                    aria-label={`${k === "linkedinUrl" ? "LinkedIn" : k[0].toUpperCase() + k.slice(1)} for row ${i + 1}`}
                    onChange={(e) => edit(i, { [k]: e.target.value })}
                    className={`h-7 text-[11px] px-1.5 ${warn ? "border-warning" : ""}`}
                  />
                );
                return (
                  <tr key={i} className={`border-t border-border align-top ${skipped ? "opacity-50" : ""}`}>
                    <td className="px-1.5 py-1">
                      <Checkbox checked={!skipped} onCheckedChange={(v) => edit(i, { skip: v !== true })} aria-label={`Add row ${i + 1}`} className="mt-1.5" />
                    </td>
                    <td className="px-1.5 py-1 min-w-32">
                      {field("name", r.email || r.linkedinUrl ? "Found on add" : "Name", !skipped && singles.has(i))}
                      {!skipped && singles.has(i) && <span className="text-[9px] text-warning">one name only</span>}
                    </td>
                    <td className="px-1.5 py-1 min-w-28">
                      {field("company", "Company", !skipped && surnames.has(i))}
                      {!skipped && surnames.has(i) && <span className="text-[9px] text-warning">looks like a last name</span>}
                    </td>
                    <td className="px-1.5 py-1 min-w-28">{field("title", "Title")}</td>
                    <td className="px-1.5 py-1 min-w-36">
                      {field("email", "Email")}
                      {!skipped && isDuplicate(r) && <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5">already saved</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  );
}
