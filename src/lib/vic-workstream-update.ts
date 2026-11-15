// Pure: turns a reviewed V.I.C. workstream proposal into the updateWorkstreamFn payload (changed fields only).
export interface WsValues { status: string; priority: string; notes?: string; note?: string; completed: boolean }

const same = (a: string, b: string) => a.split(",").map((x) => x.trim()).filter(Boolean).sort().join("|") === b.split(",").map((x) => x.trim()).filter(Boolean).sort().join("|");

export function workstreamEditPlan(
  gid: string,
  current: { status: string; priority: string; notes: string; completed: boolean },
  next: { status: string; priority: string; note: string; completed: boolean },
  today: string,
) {
  const changes: { gid: string; type: "multi_enum" | "enum"; original: string; value: string | string[] }[] = [];
  if (!same(current.status, next.status)) changes.push({ gid: "Workstream Status", type: "multi_enum", original: current.status, value: next.status.split(",").map((x) => x.trim()).filter(Boolean) });
  if (current.priority.trim() !== next.priority.trim()) changes.push({ gid: "Workstream Priority", type: "enum", original: current.priority, value: next.priority.trim() });
  const note = next.note.trim();
  const notes = note ? { original: current.notes, value: [current.notes.trim(), `${today}: ${note}`].filter(Boolean).join("\n") } : undefined;
  const completed = next.completed !== current.completed ? next.completed : undefined;
  if (!changes.length && !notes && completed === undefined) return null;
  return { gid, changes, ...(notes ? { notes } : {}), ...(completed !== undefined ? { completed } : {}) };
}
