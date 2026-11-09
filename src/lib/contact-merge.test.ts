import { describe, expect, it } from "vitest";
import { findDuplicateGroups, mergeFields, planContactMerge, planMergeUndo, statusOptions, type MergeRecord } from "./contact-merge";

const headers = ["Name", "Role", "Company", "Email", "Phone Number", "Relationship Status", "PortCo Tags", "Date Added", "URID", "Merged URIDs"];
const a: MergeRecord = { urid: "u-a", values: { name: "Matt Darcy", role: "VP", company: "Digital Realty", email: "matt@dr.com", "phone number": "+1 415 555 0100", "relationship status": "Warm", "portco tags": "Maven", "date added": "2025-03-01", urid: "u-a" } };
const b: MergeRecord = { urid: "u-b", values: { name: "Matthew Darcy", role: "SVP", company: "Digital Realty", email: "mdarcy@gmail.com", "phone number": "", "relationship status": "Prospecting", "portco tags": "Hyperbolic", "date added": "2024-11-02", urid: "u-b" } };

describe("contact merge plan", () => {
  it("asks for a status when Network and Prospecting records are merged", () => {
    expect(statusOptions([a, b])).toEqual(["Warm", "Prospecting"]);
  });

  it("keeps the main record's ID and archives the other as Merged", () => {
    const plan = planContactMerge({ headers, records: [a, b], keeperIndex: 0, choices: {}, status: "Warm" });
    expect(plan.keeperUrid).toBe("u-a");
    expect(plan.archivedUpdates).toEqual([{ urid: "u-b", values: { "relationship status": "Merged", "merged into": "u-a", email: "" } }]);
    expect(plan.keeperAfter["merged urids"]).toBe("u-b");
  });

  it("uses the value picked for each field", () => {
    const plan = planContactMerge({ headers, records: [a, b], keeperIndex: 0, choices: { role: 1, name: 1 }, status: "Warm" });
    expect(plan.keeperAfter.role).toBe("SVP");
    expect(plan.keeperAfter.name).toBe("Matthew Darcy");
    expect(plan.keeperAfter["phone number"]).toBe("+1 415 555 0100");
  });

  it("keeps every email address with the chosen primary first", () => {
    const plan = planContactMerge({ headers, records: [a, b], keeperIndex: 0, choices: { email: 1 }, status: "Warm" });
    expect(plan.keeperAfter.email).toBe("mdarcy@gmail.com; matt@dr.com");
  });

  it("combines PortCo tags by default and keeps the earliest Date Added", () => {
    const fields = mergeFields(headers, [a, b], 0);
    expect(fields.find((f) => f.key === "portco tags")?.defaultChoice).toBe("combine");
    const plan = planContactMerge({ headers, records: [a, b], keeperIndex: 0, choices: {}, status: "Warm" });
    expect(plan.keeperAfter["portco tags"]).toBe("Maven, Hyperbolic");
    expect(plan.keeperAfter["date added"]).toBe("2024-11-02");
  });

  it("undo restores merged cells but keeps a teammate's later edit", () => {
    const before = { role: "VP", email: "matt@dr.com" };
    const after = { role: "SVP", email: "matt@dr.com; mdarcy@gmail.com" };
    const current = { role: "Chief Revenue Officer", email: "matt@dr.com; mdarcy@gmail.com" };
    expect(planMergeUndo(before, after, current)).toEqual({ restore: { email: "matt@dr.com" }, keptEdits: ["role"] });
  });
});

describe("duplicate suggestions", () => {
  const people = [
    { urid: "1", name: "Matt Darcy", email: "matt@dr.com", company: "Digital Realty", linkedin: "", status: "Warm" },
    { urid: "2", name: "Matthew Darcy", email: "", company: "Digital Realty Inc.", linkedin: "", status: "Prospecting" },
    { urid: "3", name: "Jane Roe", email: "jane@x.com", company: "X", linkedin: "", status: "Cold" },
    { urid: "4", name: "J. Roe", email: "JANE@x.com", company: "", linkedin: "", status: "Prospecting" },
    { urid: "5", name: "Old Copy", email: "jane@x.com", company: "", linkedin: "", status: "Merged" },
  ];

  it("finds same-email duplicates as strong and nickname matches as possible", () => {
    const groups = findDuplicateGroups(people);
    expect(groups.map((g) => [g.people.map((p) => p.urid).sort(), g.strength])).toEqual([
      [["3", "4"], "strong"],
      [["1", "2"], "possible"],
    ]);
  });

  it("hides groups a teammate marked as not duplicates", () => {
    expect(findDuplicateGroups(people, [["4", "3"]]).map((g) => g.key)).toEqual(["1|2"]);
  });
});
