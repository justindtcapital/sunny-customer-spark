import { describe, expect, it } from "vitest";
import { planMissingUrids } from "./contact-ids";

describe("planMissingUrids", () => {
  const rows = [["Name", "Email", "URID"], ["A", "a@x.com", "id-1"], ["B", "b@x.com", ""], ["", "", ""], ["C", "c@x.com", "  "]];

  it("fills only blank IDs on rows with content, keeping existing IDs", () => {
    let n = 0;
    const fills = planMissingUrids(rows, 2, () => `new-${++n}`);
    expect(fills).toEqual([{ row: 3, urid: "new-1" }, { row: 5, urid: "new-2" }]);
  });

  it("never reuses an existing ID", () => {
    const ids = ["id-1", "fresh-1", "fresh-2"];
    const fills = planMissingUrids(rows, 2, () => ids.shift()!);
    expect(fills.map((f) => f.urid)).toEqual(["fresh-1", "fresh-2"]);
  });

  it("is a no-op once every row has an ID", () => {
    const filled = rows.map((r, i) => (i === 0 ? r : [r[0], r[1], r[2]?.trim() || (r[0] ? `x${i}` : "")]));
    expect(planMissingUrids(filled, 2)).toEqual([]);
  });
});
