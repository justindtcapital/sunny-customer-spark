import { describe, expect, it } from "vitest";
import { CORE_TEAM, teamMemberFor, teamProfile, ownerMatches } from "../src/lib/user-ownership";
import { normalizeAssignedStep } from "../src/lib/team-next-steps";

describe("core team accountability", () => {
  it("includes exactly the four core team members", () => {
    expect(CORE_TEAM.map((t) => t.name).sort()).toEqual(["Chris Falloon", "Chris Hillock", "Julia Beech", "Shane Earley"]);
  });
  it.each(["Chris F", "Chris", "Chris Falloon", "Chris F @", "chrisf@dt-capital.net", "chris.falloon@del.com"])("resolves %s to Chris Falloon only", (alias) => {
    expect(teamMemberFor(alias)?.email).toBe("chris.falloon@dell.com");
    const hillock = teamProfile("chrish@dt-capital.net");
    if (!hillock) throw new Error("Missing profile");
    expect(ownerMatches(alias, hillock)).toBe(false);
  });
  it.each(CORE_TEAM)("requires a date for $name", (t) => {
    expect(() => normalizeAssignedStep({ action: "Send recap", who: t.name, dueDate: "" })).toThrow(`Choose a due date for ${t.name}`);
  });
  it.each(CORE_TEAM)("saves $name with their canonical identity and date", (t) => {
    expect(normalizeAssignedStep({ action: "Send recap", who: t.name, dueDate: "2026-10-23" })).toEqual({ action: "Send recap", who: t.name, whoEmail: t.email, dueDate: "2026-10-23" });
  });
  it("leaves external contact next steps informational without dates", () => {
    expect(normalizeAssignedStep({ action: "Review proposal", who: "Alex Investor", whoEmail: "alex@example.com", dueDate: "2026-10-23" }).dueDate).toBe("");
  });
});