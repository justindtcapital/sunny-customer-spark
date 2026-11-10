import { describe, expect, it } from "vitest";
import { workstreamTrail, type TrailActivity } from "./workstream-trail";

const act = (p: Partial<TrailActivity>): TrailActivity => ({
  activityId: "a", recordId: "r", date: "2026-11-01", track: "", type: "", title: "t", portco: "", person: "", owner: "", summary: "", sourceUrl: "", createdAt: "", ...p,
});
const run = (activities: TrailActivity[], extra: Partial<Parameters<typeof workstreamTrail>[0]> = {}) =>
  workstreamTrail({ gid: "123", company: "Bland AI", segment: "GTM", activities, links: [], undone: new Set(), ...extra });

describe("workstreamTrail", () => {
  it("shows an email sent with V.I.C. from this workstream once, even when filed on two tracks", () => {
    const rows = run([
      act({ activityId: "action:abc:BD", recordId: "ws:123", type: "follow-up", track: "BD" }),
      act({ activityId: "action:abc:GTM", recordId: "ws:123", type: "follow-up", track: "GTM" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Email sent");
  });

  it("hides open follow-ups but shows completed ones", () => {
    const rows = run([
      act({ activityId: "f1", track: "Follow-up", portco: "Bland", resolved: false }),
      act({ activityId: "f2", track: "Follow-up", portco: "Bland", resolved: true, resolvedAt: "2026-11-09T10:00:00Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["f2"]);
    expect(rows[0]!.date).toBe("2026-11-09");
  });

  it("hides undone actions", () => {
    expect(run([act({ activityId: "action:abc:GTM", recordId: "ws:123" })], { undone: new Set(["action:abc"]) })).toEqual([]);
  });

  it("includes the company's activity on the same track but not the other track", () => {
    const rows = run([
      act({ activityId: "g", portco: "Bland", track: "GTM" }),
      act({ activityId: "b", portco: "Bland", track: "BD" }),
      act({ activityId: "m", portco: "Bland", track: "Meeting – Drive", type: "meeting" }),
      act({ activityId: "x", portco: "Akka", track: "GTM" }),
    ]);
    expect(rows.map((r) => r.id).sort()).toEqual(["g", "m"]);
  });

  it("includes notes linked to this workstream regardless of company tag", () => {
    const rows = run([act({ activityId: "n", recordId: "note1", portco: "", type: "meeting" })], { links: [{ recordId: "note1", workstreamGid: "123", status: "confirmed" }] });
    expect(rows[0]!.label).toBe("Meeting");
  });

  it("returns newest first, capped at the limit", () => {
    const rows = run(["2026-10-01", "2026-11-05", "2026-11-02"].map((date, i) => act({ activityId: `a${i}`, portco: "Bland", date })), { limit: 2 });
    expect(rows.map((r) => r.date)).toEqual(["2026-11-05", "2026-11-02"]);
  });
});
