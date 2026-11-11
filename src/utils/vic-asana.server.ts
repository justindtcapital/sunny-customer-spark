// V.I.C.'s read-only Asana access — server-only. Every call is a GET with the app's
// Asana token; V.I.C. never creates, edits or comments in Asana.
import { asanaReadPath, clipJson } from "@/lib/vic-asana";

const BASE = "https://app.asana.com/api/1.0";
let workspaceGid: string | undefined = process.env.ASANA_WORKSPACE_GID;

async function get<T = unknown>(path: string): Promise<T> {
  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) throw new Error("Asana is not connected (ASANA_ACCESS_TOKEN missing).");
  const safe = asanaReadPath(path);
  if (!safe) throw new Error("That Asana path isn't allowed.");
  const res = await fetch(`${BASE}${safe}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Asana API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
  return (await res.json()) as T;
}

async function workspace(): Promise<string> {
  if (workspaceGid) return workspaceGid;
  const project = process.env.ASANA_PORTCO_PROJECT_GID;
  const r = project
    ? await get<{ data: { workspace?: { gid: string } } }>(`/projects/${project}?opt_fields=workspace`)
    : null;
  workspaceGid = r?.data.workspace?.gid
    || (await get<{ data: { workspaces?: { gid: string }[] } }>("/users/me?opt_fields=workspaces")).data.workspaces?.[0]?.gid;
  if (!workspaceGid) throw new Error("Couldn't find the Asana workspace.");
  return workspaceGid;
}

type Task = {
  gid: string; name?: string; completed?: boolean; due_on?: string | null; completed_at?: string | null; modified_at?: string | null;
  assignee?: { name?: string } | null; projects?: { name?: string }[]; parent?: { gid: string; name?: string } | null;
  permalink_url?: string; notes?: string; memberships?: { section?: { name?: string } | null }[];
  custom_fields?: { name: string; display_value?: string | null }[];
};

const LIST_FIELDS = "name,completed,due_on,completed_at,modified_at,assignee.name,projects.name,parent.name,permalink_url";

const brief = (t: Task) => ({
  gid: t.gid, name: t.name || "", completed: !!t.completed, due: t.due_on || "", assignee: t.assignee?.name || "",
  projects: (t.projects || []).map((p) => p.name).filter(Boolean), parent: t.parent?.name || "", lastModified: (t.modified_at || "").slice(0, 10), url: t.permalink_url || "",
});

export async function searchAsanaTasks(input: { text: string; assigneeEmail?: string; includeCompleted: boolean; projectGid?: string; dueBefore?: string; dueAfter?: string }) {
  const p = new URLSearchParams({ opt_fields: LIST_FIELDS, limit: "40", sort_by: "modified_at" });
  if (input.text.trim()) p.set("text", input.text.trim());
  if (input.assigneeEmail) p.set("assignee.any", input.assigneeEmail);
  if (!input.includeCompleted) p.set("completed", "false");
  if (input.projectGid && /^\d+$/.test(input.projectGid)) p.set("projects.any", input.projectGid);
  if (input.dueBefore && /^\d{4}-\d{2}-\d{2}$/.test(input.dueBefore)) p.set("due_on.before", input.dueBefore);
  if (input.dueAfter && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAfter)) p.set("due_on.after", input.dueAfter);
  const r = await get<{ data: Task[] }>(`/workspaces/${await workspace()}/tasks/search?${p.toString()}`);
  return { tasks: (r.data || []).map(brief) };
}

export async function getAsanaTask(gid: string) {
  if (!/^\d+$/.test(gid)) throw new Error("Asana task IDs are numbers.");
  const fields = `${LIST_FIELDS},notes,memberships.section.name,custom_fields.name,custom_fields.display_value`;
  const [task, subs, stories] = await Promise.all([
    get<{ data: Task }>(`/tasks/${gid}?opt_fields=${fields}`),
    get<{ data: Task[] }>(`/tasks/${gid}/subtasks?opt_fields=${LIST_FIELDS}&limit=50`).catch(() => ({ data: [] as Task[] })),
    get<{ data: { type?: string; text?: string; created_at?: string; created_by?: { name?: string } | null }[] }>(`/tasks/${gid}/stories?opt_fields=type,text,created_at,created_by.name&limit=100`).catch(() => ({ data: [] })),
  ]);
  const t = task.data;
  return {
    ...brief(t),
    notes: (t.notes || "").slice(0, 4000),
    sections: (t.memberships || []).map((m) => m.section?.name).filter(Boolean),
    fields: Object.fromEntries((t.custom_fields || []).filter((f) => f.display_value).map((f) => [f.name, f.display_value])),
    subtasks: (subs.data || []).map(brief),
    comments: (stories.data || []).filter((s) => s.type === "comment").slice(-20)
      .map((s) => ({ by: s.created_by?.name || "", at: (s.created_at || "").slice(0, 10), text: (s.text || "").slice(0, 1000) })),
  };
}

export async function searchAsanaProjects(query: string) {
  const r = await get<{ data: { gid: string; name: string }[] }>(`/workspaces/${await workspace()}/typeahead?resource_type=project&count=20&query=${encodeURIComponent(query.trim())}`);
  return { projects: r.data || [] };
}

/** Any read-only Asana API GET (e.g. /projects/{gid}/sections). Large replies are shortened. */
export async function asanaApiGet(path: string) {
  const { json, truncated } = clipJson(await get(path));
  return { data: json, truncated };
}
