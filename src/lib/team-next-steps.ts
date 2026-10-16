import { CORE_TEAM, teamMemberFor } from "./user-ownership";

export interface AssignedNextStep { action: string; who: string; whoEmail?: string; dueDate: string; portco?: string; partner?: string }

export function coreAssignee(emailOrName?: string) {
  const person = teamMemberFor(emailOrName);
  return CORE_TEAM.find((t) => t.email === person?.email);
}

/** External next steps remain informational; core teammates own dated actions. */
export function normalizeAssignedStep(step: AssignedNextStep): AssignedNextStep {
  const teammate = coreAssignee(step.whoEmail) || coreAssignee(step.who);
  if (!teammate) return { ...step, dueDate: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(step.dueDate) || new Date(`${step.dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== step.dueDate) throw new Error(`Choose a due date for ${teammate.name}`);
  return { ...step, who: teammate.name, whoEmail: teammate.email };
}