import { portcoMatchKey } from "./action-grouping";

/** Minimal shape of a harvested activity row (emails, notes, V.I.C. actions, follow-ups). */
export interface TrailActivity {
  activityId: string;
  recordId: string;
  date: string;
  track: string;
  type: string;
  title: string;
  portco: string;
  person: string;
  owner: string;
  summary: string;
  sourceUrl: string;
  createdAt: string;
  resolved?: boolean;
  resolvedAt?: string;
}

export interface TrailLink { recordId: string; workstreamGid: string; status: string }

export interface TrailItem {
  id: string;
  date: string;
  label: "Email sent" | "Logged action" | "Follow-up done" | "Meeting" | "Email" | "Activity";
  title: string;
  summary: string;
  person: string;
  owner: string;
  url: string;
  direct: boolean;
}

function labelFor(a: TrailActivity): TrailItem["label"] {
  if (a.activityId.startsWith("action:")) return a.type === "logged-action" ? "Logged action" : "Email sent";
  if (a.track === "Follow-up") return "Follow-up done";
  if (/meeting/i.test(a.track) || /meeting|call/i.test(a.type)) return "Meeting";
  if (/email|mail/i.test(a.type) || /email|gmail|outlook/i.test(a.track)) return "Email";
  return "Activity";
}

/**
 * Recent activity for one workstream: rows filed against it (Action with V.I.C., linked notes)
 * plus the company's other activity on the same track. Open follow-ups are excluded (they are
 * already listed as follow-ups), undone actions are hidden, and multi-track actions show once.
 */
export function workstreamTrail(input: {
  gid: string;
  company: string;
  segment: string;
  activities: TrailActivity[];
  links: TrailLink[];
  undone: Set<string>;
  limit?: number;
}): TrailItem[] {
  const { gid, company, segment, activities, links, undone, limit = 8 } = input;
  const linked = new Set(links.filter((l) => l.workstreamGid === gid && (l.status === "matched" || l.status === "confirmed")).map((l) => l.recordId));
  const key = portcoMatchKey(company);
  const seen = new Set<string>();
  const out: TrailItem[] = [];
  for (const a of activities) {
    if (a.track === "Follow-up" && !a.resolved) continue;
    const base = a.activityId.startsWith("action:") ? a.activityId.split(":").slice(0, 2).join(":") : a.activityId;
    if (undone.has(base) || seen.has(base)) continue;
    const direct = a.recordId === `ws:${gid}` || linked.has(a.recordId);
    const sameCompany = !!key && a.portco.split(/\s*[,;]\s*/).some((p) => portcoMatchKey(p) === key);
    const otherTrack = (a.track === "BD" || a.track === "GTM") && (segment === "BD" || segment === "GTM") && a.track !== segment;
    if (!direct && (!sameCompany || otherTrack)) continue;
    seen.add(base);
    out.push({
      id: base,
      date: (a.track === "Follow-up" ? a.resolvedAt || a.date : a.date || a.createdAt || "").slice(0, 10),
      label: labelFor(a), title: a.title, summary: a.summary, person: a.person, owner: a.owner, url: a.sourceUrl, direct,
    });
  }
  return out.sort((x, y) => y.date.localeCompare(x.date) || Number(y.direct) - Number(x.direct)).slice(0, limit);
}
