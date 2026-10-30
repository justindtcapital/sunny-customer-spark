import { useRef, useState } from "react";
import { Blocks, Building2, GitCompareArrows, Users, Upload, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VIC_SKILLS, getVicSkill, type VicSkillId } from "@/lib/vic-skills";

const icons = [Building2, GitCompareArrows, Users];
export function VicSkillPicker({ value, onChange, onDraft, disabled, placement = "composer" }: { value?: VicSkillId; onChange: (id?: VicSkillId) => void; onDraft: (text: string) => void; disabled: boolean; placement?: "composer" | "sidebar" | "upload" }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = getVicSkill(value);
  if (placement === "sidebar") return <section aria-label="Skills" className="space-y-1.5">
    <h2 className="text-sm font-semibold">Skills</h2>
    <div className="grid gap-0.5">
      {VIC_SKILLS.map((skill, index) => {
        const Icon = icons[index] || Blocks;
        return <label key={skill.id} className="flex min-h-6 cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-[11px] leading-4 hover:bg-muted/60">
          <Checkbox checked={value === skill.id} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true ? skill.id : undefined)} className="size-3.5" />
          <Icon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1">{skill.name}</span>
        </label>;
      })}
    </div>
  </section>;
  return <div className="flex min-w-0 flex-wrap items-center gap-1">
    {placement !== "upload" && <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" variant={selected ? "secondary" : "ghost"} size="sm" disabled={disabled} className="h-8 gap-1.5 text-xs"><Blocks /><span>{selected?.name || "Skills"}</span></Button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {VIC_SKILLS.map((skill, index) => {
          const Icon = icons[index] || Blocks;
          return <Button key={skill.id} type="button" variant="ghost" className="h-10 w-full justify-start" onClick={() => { onChange(skill.id); setOpen(false); }}><Icon /><span className="flex-1 text-left">{skill.name}</span>{value === skill.id && <Check />}</Button>;
        })}
      </PopoverContent>
    </Popover>}
    {selected && placement !== "upload" && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={disabled} aria-label="Clear skill" title="Clear skill" onClick={() => onChange(undefined)}><X /></Button>}
    {value === "company-overlap" && <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()} title="Upload company text (.txt, .md, .csv)"><Upload />Company text</Button>
      <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" aria-label="Upload company text" onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!/\.(txt|md|csv)$/i.test(file.name)) return toast.error("Choose a TXT, Markdown, or CSV file; paste text from PDFs or slides.");
        if (file.size > 100_000) return toast.error("Choose a text file smaller than 100 KB.");
        try { const text = await file.text(); if (!text.trim()) return toast.error("That file has no company text."); onDraft(`Compare this company with our portfolio. Identify overlap, adjacent capabilities, and possible partnerships.\n\nCompany material (${file.name}):\n${text}`); }
        catch { toast.error("Couldn't read that file."); }
      }} />
    </>}
  </div>;
}