import { describe, expect, it } from "vitest";
import {
  addProspectEvent,
  prospectEventNames,
  removeProspectEvent,
  resolveProspectEvents,
} from "./prospect-events";

describe("prospect events", () => {
  it("shows multiple distinct events and dedupes repeated links case-insensitively", () => {
    const r = resolveProspectEvents([
      { eventName: "RSA 2026", type: "attended" },
      { eventName: "rsa 2026", type: "attended" },
      { eventName: "AI4", type: "attended" },
      { eventName: "Manifest Dinner", type: "invited" },
    ]);
    expect(r.eventsAttended).toEqual(["RSA 2026", "AI4"]);
    expect(r.eventsInvited).toEqual(["Manifest Dinner"]);
  });

  it("keeps the legacy Event tag as an Invited link", () => {
    const r = resolveProspectEvents([{ eventName: "AI4", type: "attended" }], "Illumyn Dinner");
    expect(r.eventsInvited).toEqual(["Illumyn Dinner"]);
    expect(r.eventsAttended).toEqual(["AI4"]);
  });

  it("adding an event keeps existing links and ignores duplicates", () => {
    const start = { eventsAttended: ["RSA 2026"], eventsInvited: ["AI4"] };
    const added = addProspectEvent(start, "Manifest Dinner", "attended");
    expect(added.eventsAttended).toEqual(["RSA 2026", "Manifest Dinner"]);
    expect(added.eventsInvited).toEqual(["AI4"]);
    expect(addProspectEvent(added, "rsa 2026", "attended")).toBe(added);
  });

  it("removing hides only that link", () => {
    const r = resolveProspectEvents([
      { eventName: "RSA 2026", type: "attended", removedAt: "2026-11-09" },
      { eventName: "AI4", type: "attended" },
    ]);
    expect(r.eventsAttended).toEqual(["AI4"]);
    const local = removeProspectEvent({ eventsAttended: ["RSA 2026", "AI4"], eventsInvited: [] }, "rsa 2026", "attended");
    expect(local.eventsAttended).toEqual(["AI4"]);
  });

  it("a removed legacy tag stays hidden without clearing the tag; re-adding shows it again", () => {
    const removed = resolveProspectEvents(
      [{ eventName: "Illumyn Dinner", type: "invited", removedAt: "2026-11-09" }],
      "Illumyn Dinner",
    );
    expect(removed.eventsInvited).toEqual([]);
    const readded = resolveProspectEvents(
      [
        { eventName: "Illumyn Dinner", type: "invited", removedAt: "2026-11-09" },
        { eventName: "Illumyn Dinner", type: "invited" },
      ],
      "Illumyn Dinner",
    );
    expect(readded.eventsInvited).toEqual(["Illumyn Dinner"]);
  });

  it("event filter names cover every linked event", () => {
    expect(
      prospectEventNames({ event: "AI4", eventsAttended: ["RSA 2026"], eventsInvited: ["AI4", "ai4"] }),
    ).toEqual(["RSA 2026", "AI4"]);
  });
});
