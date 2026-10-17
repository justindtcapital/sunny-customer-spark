import { z } from "zod";
import type { HomeReminder } from "./home-momentum";

export const followUpEditSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  details: z.string().max(4000),
  due: z.string().refine((s) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s), "Choose a valid date"),
  owner: z.string().min(1).max(200),
  company: z.string().max(500),
  people: z.array(z.object({ name: z.string().max(200), email: z.string().max(200) })).max(30),
  tracks: z.array(z.enum(["BD", "GTM"])).max(2),
});
export type FollowUpEdit = z.infer<typeof followUpEditSchema>;
export function followUpValues(r: HomeReminder): FollowUpEdit {
  return { summary: r.summary, details: r.details || "", due: r.due.slice(0, 10), owner: r.owner,
    company: r.company, people: r.people || (r.person ? [{ name: r.person, email: r.email || "" }] : []), tracks: r.tracks || [] };
}
/** The source identity and match keys must survive edits and reassignment. */
export function applyFollowUpEdit(r: HomeReminder, edit?: FollowUpEdit): HomeReminder {
  if (!edit) return r;
  return { ...r, summary: edit.summary, details: edit.details, due: edit.due, owner: edit.owner, company: edit.company,
    people: edit.people, tracks: edit.tracks };
}