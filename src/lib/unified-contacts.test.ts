import { describe, expect, it } from "vitest";
import { buildProspectView, contactRowFromTarget, planStatusFlags, viewHeaders } from "./unified-contacts";

const contacts = [
  ["Name", "Email", "Relationship Status", "URID", "Prospecting Stage", "Phone Number"],
  ["Ann Lee", "ann@x.com", "Warm", "u1", "", "1"],
  ["Bo Chan", "bo@y.com", "Prospecting", "u2", "Outreach Sent", "2"],
  ["Cy Day", "cy@z.com", "Cold", "u3", "", ""],
];

describe("one contact list", () => {
  it("Prospecting view shows only prospect-flagged rows, mapped to the old columns", () => {
    const v = buildProspectView(contacts, viewHeaders(["URID", "First Name", "Last Name", "Email", "Stage", "Phone"]));
    expect(v.rows.length).toBe(2);
    expect(v.rows[1].slice(0, 6)).toEqual(["u2", "Bo", "Chan", "bo@y.com", "Outreach Sent", "2"]);
    expect(v.contactRowByViewRow[1]).toBe(3);
  });
  it("new prospects become a Contacts row flagged Prospecting with the same ID", () => {
    const row = contactRowFromTarget(["URID", "First Name", "Last Name", "Email"], ["u9", "Di", "Ng", "di@q.com"], contacts[0]);
    expect(row).toEqual(["Di Ng", "di@q.com", "Prospecting", "u9", "Prospecting", ""]);
  });
  it("moving to Prospecting is a status flag; teammate changes and repeats are not overwritten", () => {
    const plan = planStatusFlags(contacts, [
      { urid: "u1", expected: "Warm", to: "Prospecting" },
      { urid: "u2", expected: "Warm", to: "Prospecting" },
      { urid: "u3", expected: "Warm", to: "Prospecting" },
      { urid: "nope", expected: "Warm", to: "Prospecting" },
    ]);
    expect(plan.map((p) => p.status)).toEqual(["change", "already", "changed-elsewhere", "missing"]);
    expect(plan[0].row).toBe(2);
  });
});
