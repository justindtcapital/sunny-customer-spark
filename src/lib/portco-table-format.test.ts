import { describe, expect, it } from "vitest";
import { displayProfileValue, editDraftValue, storedFromDraft } from "./portco-table-format";

describe("portco table formatting", () => {
  it("shows DTC investment with a dollar sign in millions", () => {
    expect(displayProfileValue("DTC Investment ($M)", "2.5")).toBe("$2.5M");
  });
  it("shows DTC ownership as a percentage", () => {
    expect(displayProfileValue("DTC Ownership", "0.125")).toBe("12.5%");
  });
  it("leaves unset values empty", () => {
    expect(displayProfileValue("DTC Ownership", "")).toBe("");
    expect(displayProfileValue("Help / Influence", "")).toBe("");
  });
  it("edits ownership as a percent and stores the fraction", () => {
    expect(editDraftValue("DTC Ownership", "0.125")).toBe("12.5");
    expect(storedFromDraft("DTC Ownership", "12.5%")).toBe("0.125");
  });
  it("stores investment typed with $ and M as plain millions", () => {
    expect(storedFromDraft("DTC Investment ($M)", "$3M")).toBe("3");
  });
});
