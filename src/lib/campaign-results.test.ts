import { describe, expect, it } from "vitest";
import { attendeesToRegister, campaignTypeOf, latestResults, ownerInitials, resultCounts } from "./campaign-results";

describe("campaign results", () => {
  it("only three types: Event, Network outreach, Business development", () => {
    expect(["Event outreach", "Event follow-up", "Network outreach", "Business development"].map(campaignTypeOf))
      .toEqual(["Event", "Event", "Network", "BD"]);
  });
  it("older purposes fold into the three types (demand is an event)", () => {
    expect(["PortCo demand gen", "Network development", "General outreach", ""].map(campaignTypeOf))
      .toEqual(["Event", "Network", "Network", "Network"]);
  });
  it("owner initials use full team names", () => {
    expect(ownerInitials("Chris Falloon")).toBe("CF");
    expect(ownerInitials("Shane Earley")).toBe("SE");
  });
  it("latest mark per person wins, so changes never duplicate", () => {
    const m = latestResults([
      { campaignId: "c", personKey: "a@x.com", result: "no-reply", followUpOwner: "", followUpDue: "", by: "", at: "2026-01-01" },
      { campaignId: "c", personKey: "A@x.com", result: "attending", followUpOwner: "", followUpDue: "", by: "", at: "2026-01-02" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get("c|a@x.com")?.result).toBe("attending");
    expect(resultCounts(["a@x.com", "b@x.com"], m, "c")).toMatchObject({ attending: 1, unmarked: 1 });
  });
  it("registering skips people already on the event by email or full name", () => {
    const out = attendeesToRegister(
      [{ name: "Ann Lee", email: "ann@x.com" }, { name: "Bob Ray", email: "" }, { name: "Cy Do", email: "cy@x.com" }, { name: "Cy Do", email: "cy@x.com" }],
      [{ name: "Someone", email: "ANN@x.com" }, { name: "bob  ray", email: "" }],
    );
    expect(out).toEqual([{ name: "Cy Do", email: "cy@x.com" }]);
  });
});
