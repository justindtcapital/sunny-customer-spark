import { describe, expect, it } from "vitest";
import { anticipatedFollowUps, candidateNames, dueThisWeek, investmentStrip, matchPeople, parseCoworkBrief, priorityBadge, weekEnd } from "./morning-brief";

const SAMPLE = `Test run of the daily brief.

8:30 AM PT: Industry Icons 2027 sponsorship (Critical, Teams, 30 min)
Jill Pro (DTS marketing), with Julia Beech and Marissa Herman.

12:00 PM PT: Terragrit connect (PortCo, Teams, 1 hr)
Sam Nagar leads, with Michael Mazza.

Gaps
The Vahan thread has only a few days of history.

Top priorities
1. Confirm the Matt Darcy time.
2. Prep the Vince Ippolito call.`;

describe("morning brief", () => {
  it("parses Cowork meetings, gaps and priorities", () => {
    const b = parseCoworkBrief(SAMPLE);
    expect(b.meetings.map((m) => m.title)).toEqual(["Industry Icons 2027 sponsorship", "Terragrit connect"]);
    expect(b.meetings[1]).toMatchObject({ time: "12:00 PM PT", tags: ["PortCo"], platform: "Teams", duration: "1 hr" });
    expect(b.meetings[1].text).toContain("Sam Nagar");
    expect(b.gaps).toContain("Vahan");
    expect(b.priorities).toEqual(["Confirm the Matt Darcy time.", "Prep the Vince Ippolito call."]);
  });
  it("finds names and only links unique full-name matches", () => {
    expect(candidateNames("Sam Nagar leads, with Michael Mazza on Teams in November")).toEqual(["Sam Nagar", "Michael Mazza"]);
    const m = matchPeople(["Sam Nagar", "Jo Lee", "Julia Beech"], [
      { id: "1", name: "Sam Nagar", company: "Terragrit", email: "" },
      { id: "2", name: "Jo Lee", company: "A", email: "" }, { id: "3", name: "Jo Lee", company: "B", email: "" },
    ], (n) => n === "Julia Beech");
    expect(m[0].contact?.id).toBe("1");
    expect(m[1].possible).toHaveLength(2);
    expect(m[2].teammate).toBe(true);
  });
  it("due this week runs through Sunday, overdue first", () => {
    expect(weekEnd("2026-11-06")).toBe("2026-11-08");
    const rows = [{ id: "a", summary: "x", person: "", company: "", due: "2026-11-09" }, { id: "b", summary: "y", person: "", company: "", due: "2026-11-07" }, { id: "c", summary: "z", person: "", company: "", due: "2026-11-01" }];
    expect(dueThisWeek(rows, "2026-11-06").map((r) => [r.id, r.overdue])).toEqual([["c", true], ["b", false]]);
  });
  it("flags workstreams quiet 21+ days and warm contacts quiet 45+ days", () => {
    const items = anticipatedFollowUps({
      today: "2026-11-06",
      workstreams: [{ gid: "w", company: "Terragrit", name: "GTM", lastActivity: "2026-10-16", status: "Active", priority: "", active: true }, { gid: "v", company: "X", name: "BD", lastActivity: "2026-10-20", status: "Active", priority: "", active: true }],
      contacts: [{ id: "c", name: "Vince", company: "Redesign", temperature: "Warm", lastContact: "2026-09-22" }, { id: "d", name: "Cold", company: "", temperature: "Cold", lastContact: "2025-01-01" }],
      noteSteps: [], nmCompanies: new Set(["terragrit"]),
    });
    expect(items.map((i) => i.kind)).toEqual(["workstream", "contact"]);
  });
  it("investment strip formats ownership and marks blanks", () => {
    expect(investmentStrip({ "DTC Ownership": "0.125", "DTC Investment ($M)": "3" })).toMatchObject({ ownership: "12.5%", investment: "$3M", round: "Not recorded" });
    expect(priorityBadge("Needle Mover")).toBe("NM");
    expect(priorityBadge("Back Burner")).toBe("BB");
  });
});
