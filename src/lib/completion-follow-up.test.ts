import { describe, expect, it } from "vitest";
import { completionFollowUp } from "./completion-follow-up";

describe("optional future follow-up on completion", () => {
  it("does not schedule when the flag is off", () => {
    expect(completionFollowUp(false, "2026-11-20", "Call again", "2026-11-10")).toBeUndefined();
  });
  it("keeps the selected future date and note", () => {
    expect(completionFollowUp(true, "2026-11-20", " Call again ", "2026-11-10")).toEqual({ date: "2026-11-20", note: "Call again" });
  });
  it("requires a future date when flagged", () => {
    for (const date of ["", "2026-11-09", "2026-11-10", "2026-02-30"]) {
      expect(() => completionFollowUp(true, date, "", "2026-11-10")).toThrow("Choose a future follow-up date.");
    }
  });
});