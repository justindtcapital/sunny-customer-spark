import { describe, expect, it } from "vitest";
import { dellStatusTone } from "@/lib/dell-status-tone";

describe("dellStatusTone", () => {
  it("colors each dashboard stage", () => {
    expect(dellStatusTone("1 - Interested")).toContain("stage-interested");
    expect(dellStatusTone("2 - Working to Engage")).toContain("stage-working");
    expect(dellStatusTone("3 - Engaged / Stalled")).toContain("stage-stalled");
    expect(dellStatusTone("4 - Engaged / Progressing")).toContain("stage-progressing");
    expect(dellStatusTone("5 - Existing - New")).toContain("stage-existing");
    expect(dellStatusTone("8 - Existing - Services Enabled / Dell Delivered")).toContain("stage-existing");
  });

  it("falls back to muted for blank or unknown values", () => {
    expect(dellStatusTone("")).toContain("bg-muted");
    expect(dellStatusTone("Something else")).toContain("bg-muted");
  });
});
