import { describe, expect, it } from "vitest";
import { addedWithin, doToday, upcomingEvents } from "./home-panels";

describe("home panels", () => {
  it("Do today includes today's and earlier incomplete actions, not future or undated", () => {
    const rows = [{ id: "a", due: "2026-10-30" }, { id: "b", due: "2026-10-28" }, { id: "c", due: "2026-10-31" }, { id: "d", due: "" }];
    const out = doToday(rows, "2026-10-30");
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
    expect(out.map((r) => r.overdue)).toEqual([true, false]);
  });
  it("upcoming events skip past and declined ones and cap the list", () => {
    const ev = (start: string, dtcStatus = "Potential") => ({ start, end: start, dtcStatus });
    const out = upcomingEvents([ev("2026-10-29"), ev("2026-11-02"), ev("2026-11-01", "Declined"), ev("2026-10-30")], "2026-10-30");
    expect(out.map((e) => e.start)).toEqual(["2026-10-30", "2026-11-02"]);
  });
  it("counts people added in the last 30 days", () => {
    expect(addedWithin([{ dateAdded: "2026-10-01" }, { dateAdded: "2026-09-30" }, { dateAdded: "" }], "2026-10-30")).toBe(1);
  });
});

import { dueInRange, eventsInRange } from "./home-panels";
describe("home panel day selection", () => {
  it("lists actions due on the selected days only", () => {
    const rows = [{ id: "a", due: "2026-11-03" }, { id: "b", due: "2026-11-01" }, { id: "c", due: "2026-11-08" }];
    expect(dueInRange(rows, "2026-11-01", "2026-11-07").map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("includes multi-day events that overlap the selected days", () => {
    const ev = [{ start: "2026-10-28", end: "2026-11-02" }, { start: "2026-11-10", end: "2026-11-10" }, { start: "2026-11-05", end: "", dtcStatus: "Declined" }];
    expect(eventsInRange(ev, "2026-11-01", "2026-11-07").map((e) => e.start)).toEqual(["2026-10-28"]);
  });
});
