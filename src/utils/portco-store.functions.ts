import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";

export interface PortcoTableProfile {
  urid: string;
  company: string;
  owner: string;
  fields: Record<string, string>;
  archived: Record<string, string>;
  updatedAt: string;
  updatedBy: string;
}

/** Profile rows (with archived Asana fields) and per-workstream archives for the table views. */
export const fetchPortcoTableFn = createServerFn({ method: "GET" })
  .middleware([requireTeamAuth])
  .handler(async (): Promise<{ profiles: PortcoTableProfile[]; workstreamArchives: Record<string, Record<string, string>>; error: string }> => {
    const { readProfiles, readWorkstreamArchives } = await import("./portco-store.server");
    try {
      const [profiles, workstreamArchives] = await Promise.all([readProfiles(), readWorkstreamArchives()]);
      return { profiles: profiles.map(({ row: _row, ...p }) => p), workstreamArchives, error: "" };
    } catch (e) {
      console.error("[portco-table] read failed", e);
      return { profiles: [], workstreamArchives: {}, error: e instanceof Error ? e.message : String(e) };
    }
  });

const cell = z.union([z.string().max(500), z.array(z.string().max(120)).max(30)]);

/** Save one profile cell (conflict-checked against the value the editor started from). */
export const saveProfileCellFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d) => z.object({ urid: z.string().max(80).optional(), company: z.string().min(1).max(200), field: z.string().min(1).max(80), original: cell, value: cell }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; profile: PortcoTableProfile } | { ok: false; error: string }> => {
    try {
      const { saveProfileFields } = await import("./portco-store.server");
      const { teamMemberFor } = await import("@/lib/user-ownership");
      const by = teamMemberFor(context.teamEmail)?.displayName || context.teamEmail;
      const { row: _row, ...profile } = await saveProfileFields({ urid: data.urid, company: data.company, changes: [{ field: data.field, original: data.original, value: data.value }] }, by);
      return { ok: true, profile };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
