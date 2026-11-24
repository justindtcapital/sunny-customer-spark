// Pure shaping of full PortCo dossiers and Dell Leverage views for V.I.C. (read-only).
import type { Contact, PortfolioCompany } from "@/lib/types";
import type { Workstream } from "@/lib/workstream-parse";
import type { PlannerEvent } from "@/lib/event-planner";
import type { CampaignRecord } from "@/lib/campaigns";
import { domainCategory } from "@/lib/types";
import { portCoKey } from "@/lib/portco-canonical";
import { SWD_STATUS_FIELD } from "@/lib/sell-with-dell-status";
import { SELL_IN_FIELD } from "@/lib/sell-in-status";
import {
  buHeatmap,
  companyStageBoard,
  dellRowsFrom,
  filterDellRows,
  movementInWindow,
  stakeholderMap,
  summarizeDell,
  DEFAULT_DELL_FILTER,
  type DellFilter,
  type StatusChange,
} from "@/lib/dell-leverage";

export interface PortcoProfileRow {
  urid: string;
  company: string;
  owner: string;
  fields: Record<string, string>;
  archived: Record<string, string>;
  updatedAt: string;
  updatedBy: string;
}

export function vicPortcoProfile(input: {
  company: PortfolioCompany;
  profile?: PortcoProfileRow;
  workstreams: Workstream[];
  contacts: Contact[];
  events: PlannerEvent[];
  campaigns: CampaignRecord[];
  workstreamArchives?: Record<string, Record<string, string>>;
}) {
  const key = portCoKey(input.company.name);
  const ws = input.workstreams.filter((w) => portCoKey(w.company) === key);
  const activeWs = ws.filter((w) => !w.completed);
  const completedWs = ws.filter((w) => w.completed);
  const linkedEvents = input.events.filter((e) => e.portcos.some((p) => portCoKey(p) === key));
  const linkedCampaigns = input.campaigns.filter((c) => c.portcos.some((p) => portCoKey(p) === key));
  const people = input.contacts.filter((c) => portCoKey(c.company) === key);

  const shapeWs = (w: Workstream) => ({
    gid: w.gid,
    track: w.segment,
    name: w.name,
    owner: w.owner,
    status: w.fields["Workstream Status"] || w.workstreamStatus || w.status,
    priority: w.fields["Workstream Priority"] || w.workstreamPriority || "",
    sellWithDellStatus: w.fields[SWD_STATUS_FIELD] || "",
    sellInStatus: w.fields[SELL_IN_FIELD] || "",
    dellBu: w.fields["Dell Targets"] || "",
    dellStakeholders: w.fields["Dell Stakeholders"] || "",
    dellNotes: (w.fields["Dell Engagement Notes"] || "").slice(0, 500),
    dellAsks: (w.fields["Dell Asks"] || "").slice(0, 500),
    notes: (w.notes || w.nextSteps || "").slice(0, 600),
    completed: w.completed,
    completedAt: w.completedAt || "",
    lastActivity: w.lastActivity,
    archived: input.workstreamArchives?.[w.gid] || undefined,
  });

  return {
    company: {
      urid: input.company.urid || "",
      name: input.company.name,
      sector: input.company.sector,
      domain: domainCategory(input.company.domain),
      website: input.company.website,
      location: input.company.location,
      summary: (input.company.description || "").slice(0, 2000),
      owner: input.profile?.owner || "",
      updatedAt: input.profile?.updatedAt || "",
      updatedBy: input.profile?.updatedBy || "",
    },
    profileFields: input.profile?.fields || {},
    archivedProfileFields: input.profile?.archived || {},
    activeWorkstreams: activeWs.map(shapeWs),
    completedWorkstreams: completedWs.slice(0, 40).map(shapeWs),
    contacts: people.slice(0, 60).map((c) => ({ urid: c.urid || c.id, name: c.name, title: c.title, email: c.email, linkedin: c.linkedinUrl || "" })),
    events: linkedEvents.slice(0, 40).map((e) => ({ urid: e.urid, name: e.name, start: e.start, location: e.location, status: e.dtcStatus || e.status })),
    campaigns: linkedCampaigns.slice(0, 30).map((c) => ({ id: c.id, name: c.name, status: c.status, owner: c.owner, memberCount: c.memberCount ?? 0 })),
  };
}

export function vicDellLeverageView(input: {
  workstreams: Workstream[];
  contacts: Contact[] | null;
  companies: PortfolioCompany[];
  changes: StatusChange[];
  filter?: Partial<DellFilter>;
  days?: number;
}) {
  const domains = new Map(input.companies.map((c) => [portCoKey(c.name || ""), domainCategory(c.domain)]));
  const allRows = dellRowsFrom(input.workstreams, {
    contacts: input.contacts,
    domainOf: (company) => domains.get(portCoKey(company)) || "Other",
  });
  const f: DellFilter = { ...DEFAULT_DELL_FILTER, ...input.filter };
  const rows = filterDellRows(allRows, f);
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (input.days ?? 30) * 86_400_000).toISOString().slice(0, 10);
  return {
    summary: summarizeDell(rows),
    stageBoard: companyStageBoard(rows).map((col) => ({
      stage: col.stage,
      workstreams: col.workstreams,
      companies: col.companies.map((c) => c.company),
    })),
    byBusinessUnit: buHeatmap(rows),
    stakeholders: stakeholderMap(rows).map((g) => ({
      bu: g.bu,
      gaps: g.gaps,
      workstreams: g.workstreams,
      people: g.people.map((p) => ({ name: p.name, title: p.title, linked: p.linked, workstreams: p.workstreams })),
    })),
    recentMovements: movementInWindow(input.changes, rows, from, today).slice(0, 40),
    workstreams: rows.slice(0, 150).map((r) => ({
      gid: r.workstreamId,
      company: r.company,
      name: r.name,
      motion: r.motion,
      stage: r.stage,
      statuses: r.statuses,
      outcomes: r.outcomes,
      bu: r.bu,
      domain: r.domain,
      products: r.products,
      completed: r.completed,
      stakeholders: r.stakeholders.map((s) => ({ name: s.name, status: s.status, title: s.title || "", urid: s.urid || "" })),
      dellNotes: (r.engagementNotes || "").slice(0, 400),
      dellAsks: r.asks,
    })),
    truncated: rows.length > 150,
  };
}