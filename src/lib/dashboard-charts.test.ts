import { describe, expect, it } from "vitest";
import { buildChartData, specProblems, type ChartSpec } from "./dashboard-charts";

const base: ChartSpec = { title: "t", dataset: "events", chart: "bar", x: "type", series: null, measure: "count", sumField: null, filters: [], days: null, limit: null };

describe("charts built with V.I.C.", () => {
  it("rejects fields outside the dataset or dashboard", () => {
    expect(specProblems({ ...base, x: "salary" })).toHaveLength(1);
    expect(specProblems({ ...base, dataset: "outreach", x: "owner" }, "events")).toHaveLength(1);
    expect(specProblems(base, "events")).toEqual([]);
  });

  it("counts multi-value fields once per value and applies filters", () => {
    const rows = [
      { _date: "2026-01-02", type: "Briefing", domain: ["AI", "Security"] },
      { _date: "2026-02-02", type: "Briefing", domain: ["AI"] },
      { _date: "2026-03-02", type: "Dell-led", domain: ["AI"] },
    ];
    const d = buildChartData(rows, { ...base, x: "domain", filters: [{ field: "type", values: ["briefing"] }] });
    expect(d.rows.map((r) => [r.label, r.total])).toEqual([["AI", 2], ["Security", 1]]);
  });

  it("sums a number field and limits to the last N days", () => {
    const now = Date.parse("2026-03-10T00:00:00Z");
    const rows = [
      { _date: "2026-01-02", type: "Briefing", attendees: 10 },
      { _date: "2026-03-01", type: "Briefing", attendees: 4 },
    ];
    const d = buildChartData(rows, { ...base, measure: "sum", sumField: "attendees", days: 30 }, now);
    expect(d.rows[0].total).toBe(4);
  });
});
