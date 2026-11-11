import { describe, expect, it } from "vitest";
import { toCampaignCandidate } from "./campaign-preload";

describe("campaign preload", () => {
  it("network people join as network, prospects as prospect, keeping their ID", () => {
    expect(toCampaignCandidate({ name: "Ann Lee", email: "ann@x.com; ann@y.com", urid: "u1" })).toMatchObject({ origin: "network", email: "ann@x.com", urid: "u1" });
    expect(toCampaignCandidate({ name: "Bo Ray", prospect: true, urid: "u2" }).origin).toBe("prospect");
  });
});
