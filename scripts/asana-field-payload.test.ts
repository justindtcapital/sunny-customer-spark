import { describe, it, expect } from "vitest";
import { buildCustomFieldsPayload, sameValue } from "../src/lib/asana-field-payload";

describe("buildCustomFieldsPayload", () => {
  it("maps each Asana type", () => {
    expect(
      buildCustomFieldsPayload([
        { gid: "1", type: "text", original: "", value: "a, b" },
        { gid: "2", type: "number", original: "", value: "1,200" },
        { gid: "3", type: "enum", original: "x", value: "" },
        { gid: "4", type: "multi_enum", original: [], value: ["9", "8"] },
        { gid: "5", type: "date", original: "", value: "2026-10-07" },
        { gid: "6", type: "date", original: "2026-01-01", value: "" },
      ]),
    ).toEqual({ "1": "a, b", "2": 1200, "3": null, "4": ["9", "8"], "5": { date: "2026-10-07" }, "6": null });
  });
  it("rejects bad numbers", () => {
    expect(() => buildCustomFieldsPayload([{ gid: "1", type: "number", original: "", value: "abc" }])).toThrow();
  });
  it("compares multi values order-insensitively", () => {
    expect(sameValue(["a", "b"], ["b", "a"])).toBe(true);
  });
});
