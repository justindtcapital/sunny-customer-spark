// Server functions for the Knowledge Base UI: activity timeline, workstream
// review queue, suggested contacts, and manual harvest trigger.

import { createServerFn } from "@tanstack/react-start";
import { requireTeamAuth } from "./team-auth";

export const fetchKnowledgeDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listKnowledgeRecords, listHarvestedActivities, listWorkstreamLinks, listSuggestedContacts } =
    await import("./knowledge.server");
  const [records, activities, links, suggested] = await Promise.all([
    listKnowledgeRecords().catch(() => []),
    listHarvestedActivities().catch(() => []),
    listWorkstreamLinks().catch(() => []),
    listSuggestedContacts().catch(() => []),
  ]);
  // Email-harvested activity only counts once confirmed in Activity Review.
  const { reviewMap, isRegisteredActivity } = await import("./notes-inbox.server");
  const reviews = await reviewMap();
  const typeOf = new Map(records.map((r) => [r.recordId, r.sourceType]));
  const registered = activities.filter((a) => isRegisteredActivity(typeOf.get(a.recordId) || "", reviews.get(a.recordId)));
  // Reviewed next-step assignments replace the raw extracted "who" names.
  const withSteps = records.map((r) => {
    const steps = reviews.get(r.recordId)?.nextSteps;
    if (!steps?.length) return r;
    let ex: Record<string, unknown> = {};
    try { ex = JSON.parse(r.extractedJson || "{}"); } catch { /* ignore */ }
    return { ...r, extractedJson: JSON.stringify({ ...ex, nextSteps: steps }) };
  });
  // Notes reviewed as BD and/or GTM count once per chosen track (follow-ups keep theirs).
  const tracked = registered.flatMap((a) => {
    const t = reviews.get(a.recordId)?.activityTracks;
    if (!t?.length || a.type === "follow-up") return [a];
    return t.map((track, i) => ({ ...a, track, activityId: i ? `${a.activityId}:${track}` : a.activityId }));
  });
  return { records: withSteps, activities: tracked, links, suggested };
});

export const reviewWorkstreamLinkFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { linkId: string; action: "confirm" | "ignore"; workstreamGid?: string; workstreamName?: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { reviewWorkstreamLink } = await import("./knowledge.server");
    const status = data.action === "confirm" ? "confirmed" : "ignored";
    const ok = await reviewWorkstreamLink(data.linkId, status, data.workstreamGid || "", data.workstreamName || "");
    return { ok };
  });

export const reviewSuggestedContactFn = createServerFn({ method: "POST" })
  .inputValidator((input: { suggestionId: string; action: "approve-network" | "approve-prospecting" | "ignore" }) => input)
  .handler(async ({ data }) => {
    const { reviewSuggestedContact } = await import("./knowledge.server");
    const status =
      data.action === "approve-network"
        ? "approved-network"
        : data.action === "approve-prospecting"
          ? "approved-prospecting"
          : "ignored";
    const ok = await reviewSuggestedContact(data.suggestionId, status);
    return { ok };
  });

export const runKnowledgeHarvestFn = createServerFn({ method: "POST" }).handler(async () => {
  const { runKnowledgeHarvest } = await import("./knowledge-harvest.server");
  return runKnowledgeHarvest({ maxThreadsPerTrack: 15 });
});

/** On-demand mailbox pull for the Activity inbox (tracking aliases only). */
export const syncMailboxFn = createServerFn({ method: "POST" }).handler(async () => {
  const { runKnowledgeHarvest } = await import("./knowledge-harvest.server");
  return runKnowledgeHarvest({ maxThreadsPerTrack: 40, includeGmail: true, includeGranola: false, includeDrive: false });
});

export const fetchGranolaImportsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listGranolaImports, isGranolaConfigured } = await import("./granola.server");
  if (!isGranolaConfigured()) return { connected: false, imports: [] };
  return { connected: true, imports: await listGranolaImports().catch(() => []) };
});

export const verifyGranolaImportsFn = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator((input: { noteIds?: string[]; retry?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { verifyGranolaImports } = await import("./granola.server");
    const { loadGranolaKey } = await import("./granola-connections.server");
    const access = data.retry ? { apiKey: await loadGranolaKey(context.userId), userId: context.userId } : undefined;
    return { imports: await verifyGranolaImports({ noteIds: data.noteIds, retry: !!data.retry, access }) };
  });

/** Manual-only Granola pull (the scheduled harvest never touches Granola). */
export const syncGranolaFn = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator((input: { importedBy?: string }) => input || {})
  .handler(async ({ context }) => {
    const { loadGranolaKey } = await import("./granola-connections.server");
    const { runKnowledgeHarvest } = await import("./knowledge-harvest.server");
    const { withDeadline } = await import("./request-deadline.server");
    const apiKey = await loadGranolaKey(context.userId);
    return withDeadline("Import my Granola", 55_000, (step) => {
      step("Read and save Granola notes");
      return runKnowledgeHarvest({ includeGmail: false, includeDrive: false, includeGranola: true, maxGranolaNotes: 2, importedBy: context.teamEmail, granolaAccess: { apiKey, userId: context.userId } });
    });
  });

export const fetchNotesInboxFn = createServerFn({ method: "POST" })
  .inputValidator((input: { history?: boolean; owner?: string; kind?: "notes" | "activity" }) => input)
  .handler(async ({ data }) => {
    const { listNotesInbox } = await import("./notes-inbox.server");
    const { isGranolaConfigured } = await import("./granola.server");
    return { granolaConnected: isGranolaConfigured(), items: await listNotesInbox(!!data.history, data.owner, data.kind || "notes") };
  });

/** Full canonical portfolio vocabulary, including potential companies without workstreams. */
export const fetchReviewCompaniesFn = createServerFn({ method: "GET" }).middleware([requireTeamAuth])
  .handler(async () => {
    const { buildPortfolioCompanies } = await import("./sheets.server");
    return [...new Set((await buildPortfolioCompanies(true)).map((company) => company.name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  });

export const uploadNoteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; text: string; base64: string; mimeType: string; importedBy?: string }) => {
    if (!input.name || input.base64.length > 8_000_000) throw new Error("File missing or too large");
    return input;
  })
  .handler(async ({ data }) => {
    const { uploadNote } = await import("./knowledge-harvest.server");
    return uploadNote(data);
  });

export const reviewNoteFn = createServerFn({ method: "POST" })
  .inputValidator((input: import("./notes-inbox.server").ReviewNoteInput) => input)
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { reviewNote } = await import("./notes-inbox.server");
    return withDeadline(`review ${data.recordId}`, 55_000, (step) => reviewNote(data, step));
  });

/** Contact search (Network + Prospecting) for tagging notes and activity. */
export const searchPeopleFn = createServerFn({ method: "POST" })
  .inputValidator((input: { q: string; hints?: string[] }) => ({
    q: String(input?.q || "").slice(0, 100),
    hints: (Array.isArray(input?.hints) ? input.hints : []).map((h) => String(h || "").slice(0, 120)).filter(Boolean).slice(0, 20),
  }))
  .handler(async ({ data }) => {
    const { searchPeople } = await import("./notes-inbox.server");
    return searchPeople(data.q, data.hints);
  });

/** People finder "Edit": fix a saved person's name/title/company/email by record ID (human edit). */
export const updatePersonFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((input: { urid: string; name?: string; title?: string; company?: string; email?: string }) => {
    const urid = String(input?.urid || "").trim();
    if (!urid || urid.length > 100) throw new Error("Missing record ID");
    const field = (v: unknown, max: number) => (v === undefined ? undefined : String(v).trim().slice(0, max));
    const out = { urid, name: field(input.name, 200), title: field(input.title, 200), company: field(input.company, 200), email: field(input.email, 400) };
    if (out.name !== undefined && !out.name) throw new Error("Name can't be empty");
    if (out.email && !/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+(\s*[;,]\s*[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+)*$/.test(out.email)) throw new Error("That email doesn't look right");
    return out;
  })
  .handler(async ({ data }) => {
    const { mergeContactFields } = await import("./sheets.server");
    const { urid, ...rest } = data;
    const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Record<string, string>;
    if (fields["email"] !== undefined) {
      const { normalizeEmails } = await import("@/lib/email");
      fields["email"] = normalizeEmails(fields["email"]);
    }
    const res = await mergeContactFields("", fields, "user", urid);
    if (!res.success) throw new Error("That person wasn't found — they may have been merged or removed. Search again.");
    return { ok: true, written: res.written };
  });

/** Notes, emails and workstreams connected to one person (contact/prospect panels). */
export const fetchPersonContextFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name?: string; email?: string }) => ({
    name: String(input?.name || "").slice(0, 200), email: String(input?.email || "").slice(0, 200),
  }))
  .handler(async ({ data }) => {
    const { personContext } = await import("./notes-inbox.server");
    return personContext(data);
  });

export const reopenNoteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { recordId: string }) => input)
  .handler(async ({ data }) => {
    const { reopenNote } = await import("./notes-inbox.server");
    await reopenNote(data.recordId);
    return { ok: true };
  });

/** Pull meeting files dropped into the Venture Pulse KB Drive. */
export const syncDriveNotesFn = createServerFn({ method: "POST" }).handler(async () => {
  const { importDriveNotes } = await import("./drive-notes.server");
  return importDriveNotes();
});
