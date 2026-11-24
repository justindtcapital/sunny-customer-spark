// Pill colours for Dell status values, matching the Dell Leverage dashboard
// stages: Interested gray, Working to Engage sky, Engaged / Stalled amber,
// Engaged / Progressing green, Existing Dell blue.
import { stageOf } from "@/lib/dell-leverage";

const TONE: Record<string, string> = {
  Interested: "bg-stage-interested/15 text-stage-interested-text border-stage-interested/40",
  "Working to Engage": "bg-stage-working/15 text-stage-working-text border-stage-working/40",
  "Engaged / Stalled": "bg-stage-stalled/15 text-stage-stalled-text border-stage-stalled/40",
  "Engaged / Progressing": "bg-stage-progressing/15 text-stage-progressing-text border-stage-progressing/40",
  Existing: "bg-stage-existing/15 text-stage-existing-text border-stage-existing/40",
};
const FALLBACK = "bg-muted text-muted-foreground border-border";

/** Tailwind classes for a status pill; unknown or unset values fall back to muted. */
export function dellStatusTone(status: string): string {
  return TONE[stageOf(status)] ?? FALLBACK;
}
