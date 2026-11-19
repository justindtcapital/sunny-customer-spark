import { describe, expect, it } from "vitest";
import { matchesRadar, radarCounts, radarKeys, ringFor } from "./signal-radar";

const card = (company: string, extra: Partial<{ sourceType: string; segmentBucket: string; industry: string }> = {}) => ({
  company, headline: "", summary: "", sortTs: 1, sourceType: "Industry News", segmentBucket: "AI", ...extra,
});
const keys = radarKeys(["Entro"], ["IBM"]);

describe("signal radar", () => {
  it("puts PortCo stories in the PortCo ring", () => expect(ringFor(card("Entro Inc."), keys)).toBe("PortCo"));
  it("puts watched employers in the Network ring", () => expect(ringFor(card("IBM"), keys)).toBe("Network"));
  it("puts everything else in Market", () => expect(ringFor(card("Acme"), keys)).toBe("Market"));
  it("counts by ring and domain column, unknown segments as Other", () => {
    const { cells, rings } = radarCounts([card("IBM"), card("IBM", { segmentBucket: "Weird" }), card("Acme")], "domain", keys);
    expect(rings.get("Network")).toBe(2);
    expect(cells.get("Network|Other")).toBe(1);
    expect(cells.get("Market|AI")).toBe(1);
  });
  it("filters by ring and column", () => {
    expect(matchesRadar(card("IBM"), { ring: "Network", view: "domain", col: "AI" }, keys)).toBe(true);
    expect(matchesRadar(card("IBM"), { ring: "Market" }, keys)).toBe(false);
  });
});

describe("signal domain columns", () => {
  it("uses the same six domains as PortCos, plus Other", async () => {
    const { radarColumns } = await import("./signal-radar");
    expect(radarColumns("domain")).toEqual(["Data", "AI", "Cloud", "Security", "Supply Chain", "Silicon", "Other"]);
  });
  it("folds Logistics into Supply Chain and keeps Cloud and Silicon", async () => {
    const { bucketOf } = await import("./signal-feed");
    expect(bucketOf("Logistics")).toBe("Supply Chain");
    expect(bucketOf("Cloud")).toBe("Cloud");
    expect(bucketOf("Silicon")).toBe("Silicon");
    expect(bucketOf("Fintech")).toBe("Other");
  });
});
