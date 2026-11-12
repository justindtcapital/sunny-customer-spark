import { describe, expect, it } from "vitest";
import { planAttendeeWrites } from "./event-people";

const ev = "evt-1";
const row = (index: number, name: string, email: string, status: string) => ({ index, eventUrid: ev, name, email, status });
const inc = (name: string, email: string, status: string) => ({ eventUrid: ev, name, email, status, kind: "Prospect", date: "" });

describe("planAttendeeWrites", () => {
  it("upgrades an earlier invitee to Attended when the attendee list is uploaded", () => {
    const r = planAttendeeWrites([row(3, "Pat Lee", "pat@x.com", "Invited")], [inc("Pat Lee", "pat@x.com", "Attended")]);
    expect(r.append).toHaveLength(0);
    expect(r.upgrades).toEqual([{ index: 3, status: "Attended" }]);
  });

  it("never downgrades an attendee to Invited", () => {
    const r = planAttendeeWrites([row(0, "Pat Lee", "pat@x.com", "Attended")], [inc("Pat Lee", "pat@x.com", "Invited")]);
    expect(r).toEqual({ append: [], upgrades: [] });
  });

  it("appends new people once, matching by email or full name", () => {
    const r = planAttendeeWrites(
      [row(0, "Sam Roe", "", "Invited")],
      [inc("Sam  Roe", "sam@y.com", "Attended"), inc("New Person", "new@z.com", "Attended"), inc("New Person", "new@z.com", "Attended")],
    );
    expect(r.upgrades).toEqual([{ index: 0, status: "Attended" }]);
    expect(r.append.map((a) => a.email)).toEqual(["new@z.com"]);
  });
});
