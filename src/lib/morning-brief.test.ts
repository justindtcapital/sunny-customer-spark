import { describe, expect, it } from "vitest";
import { anticipatedFollowUps, candidateNames, emailsInText, parseAttendees, sameNickname, companyKey, firstSentences, dueThisWeek, investmentStrip, isInternalOrg, matchPeople, parseCoworkBrief, priorityBadge, splitPortcos, stripScheduling, titleCompany, weekEnd } from "./morning-brief";

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
    expect(candidateNames("Redesign Group Vince was introduced to Misa Labs by Vince Ippolito")).toEqual(["Vince Ippolito"]);
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
  it("only the PortCo named in the title gets full details; others are just mentioned", () => {
    const names = ["Terragrit", "MavenAGI", "SuperAnnotate"];
    expect(splitPortcos("Terragrit connect", "Julia framed Terragrit and MavenAGI as two teams to compare.", names, { portcoTag: true, hasExternal: false })).toEqual({ primary: ["Terragrit"], mentioned: ["MavenAGI"] });
    expect(splitPortcos("Vince Ippolito, Redesign Group", "A services GTM partnership around MavenAGI.", names, { portcoTag: false, hasExternal: true })).toEqual({ primary: [], mentioned: ["MavenAGI"] });
  });
  it("reads the outside company from the meeting title, never Dell", () => {
    expect(titleCompany("Matt Darcy, Digital Realty")).toBe("Digital Realty");
    expect(titleCompany("Industry Icons 2027 sponsorship")).toBe("");
    expect(isInternalOrg("Dell Technologies")).toBe(true);
    expect(isInternalOrg("Redesign Group")).toBe(false);
    expect(companyKey("The Redesign Group")).toBe(companyKey("Redesign Group Inc"));
    expect(firstSentences("Acme makes widgets. It is based in Austin. It raised $5M.")).toBe("Acme makes widgets. It is based in Austin.");
  });
  it("drops scheduling back-and-forth but keeps discussion history", () => {
    const t = stripScheduling("He followed up Oct 28 after you met in Santa Clara. He wants to discuss ISV partnerships. On Nov 5 he offered 1:00 to 1:45 ET, after 3:30 ET, or next week because he had a 2 ET flight. The invite is on the 10:00 PT slot, so confirm he accepted that time. Jill offered to move it to next week. Confirm whether to keep it or move it. Vahan is traveling and confirmed Friday.");
    expect(t).toBe("He followed up Oct 28 after you met in Santa Clara. He wants to discuss ISV partnerships.");
  });
  it("reads emails and roles from Cowork's Attendees line, keeping it out of the prose", () => {
    const b = parseCoworkBrief("10:00 AM PT: Matt Darcy, Digital Realty (Critical, Teams, 30 min)\nAttendees: Matthew Darcy (Director, Strategic Alliances) <Matt.Darcy@DigitalRealty.com>, Vahan Petrosyan (role unknown), Sam Nagar (sam@terragrit.ai)\nHe wants to discuss ISV partnerships.");
    expect(b.meetings[0].attendees).toEqual([
      { name: "Matthew Darcy", role: "Director, Strategic Alliances", email: "matt.darcy@digitalrealty.com" },
      { name: "Vahan Petrosyan", role: "", email: "" },
      { name: "Sam Nagar", role: "", email: "sam@terragrit.ai" },
    ]);
    expect(b.meetings[0].text).toBe("He wants to discuss ISV partnerships.");
    expect(parseAttendees("Attendees: <jane.doe@acme.com>")[0]).toEqual({ name: "Jane Doe", role: "", email: "jane.doe@acme.com" });
    expect(emailsInText("Looped in Arthur Li <arthur@x.io> today.")).toEqual([{ name: "Arthur Li", role: "", email: "arthur@x.io" }]);
  });
  it("matches by email before name and holds nicknames as possible, never new", () => {
    const contacts = [{ id: "1", name: "Matt Darcy", company: "Digital Realty", email: "matt.darcy@digitalrealty.com" }, { id: "2", name: "Ann Lee", company: "A", email: "" }];
    const [byEmail, nick, fresh] = matchPeople(["Matthew Darcy", "Matthew Darcy Jr", "Vahan Petrosyan"], contacts, () => false, { "matthew darcy": "matt.darcy@digitalrealty.com" });
    expect(byEmail.contact?.id).toBe("1");
    expect(nick.possible).toBeUndefined();
    expect(fresh).toEqual({ name: "Vahan Petrosyan" });
    expect(matchPeople(["Matthew Darcy"], contacts, () => false)[0].possible?.[0].id).toBe("1");
    expect(sameNickname("Matt Darcy", "Matthew Darcy")).toBe(true);
    expect(sameNickname("Jo Darcy", "John Darcy")).toBe(false);
  });
  it("investment strip formats ownership and marks blanks", () => {
    expect(investmentStrip({ "DTC Ownership": "0.125", "DTC Investment ($M)": "3" })).toMatchObject({ ownership: "12.5%", investment: "$3M", round: "Not recorded" });
    expect(priorityBadge("Needle Mover")).toBe("NM");
    expect(priorityBadge("Back Burner")).toBe("BB");
  });
});
