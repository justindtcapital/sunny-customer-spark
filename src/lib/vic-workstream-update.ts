// Pure: turns a reviewed V.I.C. workstream proposal into the updateWorkstreamFn payload (changed fields only).
import { SWD_STATUS_FIELD } from "./sell-with-dell-status";
import { SELL_IN_FIELD } from "./sell-in-status";

export interface WsValues {
  status: string;
  priority: string;
  sellWithDellStatus?: string;
  sellInStatus?: string;
  dellStakeholders?: string;
  notes?: string;
  note?: string;
  completed: boolean;
}

const same = (a: string, b: string) => a.split(",").map((x) => x.trim()).filter(Boolean).sort().join("|") === b.split(",").map((x) => x.trim()).filter(Boolean).sort().join("|");

export function workstreamEditPlan(
  gid: string,
  current: { status: string; priority: string; sellWithDellStatus?: string; sellInStatus?: string; dellStakeholders?: string; notes: string; completed: boolean },
  next: { status: string; priority: string; sellWithDellStatus?: string; sellInStatus?: string; dellStakeholders?: string; note: string; completed: boolean },
  today: string,
) {
  const changes: { gid: string; type: "multi_enum" | "enum" | "text"; original: string; value: string | string[] }[] = [];
  if (!same(current.status, next.status)) changes.push({ gid: "Workstream Status", type: "multi_enum", original: current.status, value: next.status.split(",").map((x) => x.trim()).filter(Boolean) });
  if (current.priority.trim() !== next.priority.trim()) changes.push({ gid: "Workstream Priority", type: "enum", original: current.priority, value: next.priority.trim() });
  if (next.sellWithDellStatus !== undefined && !same(current.sellWithDellStatus || "", next.sellWithDellStatus)) {
    changes.push({ gid: SWD_STATUS_FIELD, type: "multi_enum", original: current.sellWithDellStatus || "", value: next.sellWithDellStatus.split(",").map((x) => x.trim()).filter(Boolean) });
  }
  if (next.sellInStatus !== undefined && (current.sellInStatus || "").trim() !== next.sellInStatus.trim()) {
    changes.push({ gid: SELL_IN_FIELD, type: "enum", original: current.sellInStatus || "", value: next.sellInStatus.trim() });
  }
  if (next.dellStakeholders !== undefined && (current.dellStakeholders || "").trim() !== next.dellStakeholders.trim()) {
    changes.push({ gid: "Dell Stakeholders", type: "text", original: current.dellStakeholders || "", value: next.dellStakeholders.trim() });
  }
  const note = next.note.trim();
  const notes = note ? { original: current.notes, value: [current.notes.trim(), `${today}: ${note}`].filter(Boolean).join("\n") } : undefined;
  const completed = next.completed !== current.completed ? next.completed : undefined;
  if (!changes.length && !notes && completed === undefined) return null;
  return { gid, changes, ...(notes ? { notes } : {}), ...(completed !== undefined ? { completed } : {}) };
}
