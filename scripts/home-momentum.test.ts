import { describe, expect, it } from "vitest";
import { periodBounds, inPeriod, activeWorkstream, reminderBucket, dedupeReminders, scopeMomentum, type HomeReminder } from "../src/lib/home-momentum";
import { creationRating, ratingAfterActivity } from "../src/lib/relationship-rating";
import { scoreContact } from "../src/lib/activity-score";
import type { Contact } from "../src/lib/types";
import type { Workstream } from "../src/lib/workstream-parse";

describe("manual ratings", () => {
  it("promotions and imports default Cold even when an automated caller requests Hot", () => {
    expect(creationRating()).toBe("Cold");
    expect(creationRating("Hot")).toBe("Cold");
  });
  it("allows explicit human selection of Warm", () => {
    expect(creationRating("Warm", true)).toBe("Warm");
  });
  it("activity cannot change an existing saved rating", () => {
    expect(ratingAfterActivity("Warm", 100)).toBe("Warm");
    expect(ratingAfterActivity("Cold", 100)).toBe("Cold");
    expect(ratingAfterActivity("Council", 0)).toBe("Council");
  });
  it("scoreContact retains Cold even for maximum activity", () => {
    const c = { temperature: "Cold", lastContact: "2026-10-15", interactions: Array.from({ length: 10 }, (_, i) => ({ id: String(i), date: "2026-10-15", type: "email", summary: "Sent", isFollowUp: true, followUpComplete: true })), eventsAttended: ["a", "b", "c"], portCoIntros: ["a", "b"] } as Contact;
    const result = scoreContact(c, Date.parse("2026-10-15T12:00:00Z"));
    expect(result.score).toBe(100);
    expect(result.tier).toBe("Cold");
  });
});

describe("calendar momentum", () => {
  const now = new Date("2026-10-15T15:55:00Z");
  it("uses Monday through today for this week", () => {
    expect(periodBounds(now, "week")).toEqual({ today: "2026-10-15", start: "2026-10-12", monday: "2026-10-12", weekEnd: "2026-10-18" });
  });
  it("uses month-to-date rather than a rolling thirty days", () => {
    expect(periodBounds(now, "month").start).toBe("2026-10-01");
    expect(inPeriod("2026-09-30", "2026-10-01", "2026-10-15")).toBe(false);
    expect(inPeriod("2026-10-16", "2026-10-01", "2026-10-15")).toBe(false);
  });
  it("excludes unknown creation dates rather than substituting last activity", () => {
    expect(inPeriod(undefined, "2026-10-12", "2026-10-15")).toBe(false);
    expect(inPeriod("2026-10-14T23:00:00Z", "2026-10-12", "2026-10-15")).toBe(true);
  });
  it("completed and unset streams do not count as active", () => {
    const w = (status: string) => ({ completed: false, workstreamStatus: status }) as Workstream;
    expect(activeWorkstream(w("Completed"))).toBe(false);
    expect(activeWorkstream(w("Not set"))).toBe(false);
  });
  it.each(["Working to Complete", "Stalled", "Early Conversations"])("%s counts as active", (status) => {
    expect(activeWorkstream({ completed: false, workstreamStatus: status } as Workstream)).toBe(true);
  });
});

describe("follow-up calendar", () => {
  it("keeps undated flags separate from due and overdue", () => {
    expect(reminderBucket("", "2026-10-15", "2026-10-18")).toBe("undated");
    expect(reminderBucket("2026-10-14", "2026-10-15", "2026-10-18")).toBe("overdue");
    expect(reminderBucket("2026-10-18", "2026-10-15", "2026-10-18")).toBe("due");
    expect(reminderBucket("2026-10-19", "2026-10-15", "2026-10-18")).toBe("later");
  });
  it("does not double count a campaign reminder also saved on a prospect", () => {
    const common = { person: "Alice", email: "alice@example.com", company: "Example", owner: "Chris Falloon", due: "2026-10-16", summary: "Follow-up" };
    const reminders: HomeReminder[] = [{ ...common, id: "t", source: "Prospecting" }, { ...common, id: "c", source: "Campaign" }];
    expect(dedupeReminders(reminders)).toHaveLength(1);
    expect(dedupeReminders(reminders)[0].source).toBe("Prospecting");
  });
});

describe("Mine and Team", () => {
  it("Mine uses recorded owners and Team includes unassigned records", () => {
    const input = { contacts: [], companies: [], members: [], campaigns: [], ownedGids: [], targets: [{ id: "a", prime: "Chris Falloon" }, { id: "b", prime: "" }], events: [{ gid: "e1", owner: "Chris Falloon", portcos: [] }, { gid: "e2", owner: "Julia Beech", portcos: [] }], workstreams: [{ gid: "w1", owner: "Chris Falloon", company: "Maven" }, { gid: "w2", owner: "Julia Beech", company: "Maven" }] } as Parameters<typeof scopeMomentum>[0];
    expect(scopeMomentum(input, "mine", "chris.falloon@dell.com").targets.map((t) => t.id)).toEqual(["a"]);
    expect(scopeMomentum(input, "mine", "chris.falloon@dell.com").events.map((e) => e.gid)).toEqual(["e1"]);
    expect(scopeMomentum(input, "mine", "chris.falloon@dell.com").workstreams.map((w) => w.gid)).toEqual(["w1"]);
    expect(scopeMomentum(input, "team", "chris.falloon@dell.com").targets).toHaveLength(2);
  });
});