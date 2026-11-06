import { describe, expect, it } from "vitest";
import { isDellContact, matchesDellVisibility } from "./dell-contacts";

describe("Dell contacts", () => {
  it("recognises Dell by company name starting with Dell", () => {
    expect(isDellContact({ company: "Dell Technologies", email: "" })).toBe(true);
    expect(isDellContact({ company: "Dell EMC", email: "" })).toBe(true);
    expect(isDellContact({ company: "Dell", email: "" })).toBe(true);
  });

  it("recognises Dell by email domain", () => {
    expect(isDellContact({ company: "", email: "jane.doe@dell.com" })).toBe(true);
    expect(isDellContact({ company: "", email: "a@x.com; jane@Dell.com" })).toBe(true);
  });

  it("recognises the manual Dell contact type", () => {
    expect(isDellContact({ company: "Acme", email: "", contactType: "Dell" })).toBe(true);
  });

  it("does not match other companies that merely contain 'dell'", () => {
    expect(isDellContact({ company: "Mandell Partners", email: "x@mandell.com" })).toBe(false);
    expect(isDellContact({ company: "Acme", email: "x@notdell.com" })).toBe(false);
  });

  it("hides Dell people only when the toggle is off", () => {
    const dell = { company: "Dell Technologies", email: "" };
    expect(matchesDellVisibility(dell, false)).toBe(false);
    expect(matchesDellVisibility(dell, true)).toBe(true);
    expect(matchesDellVisibility({ company: "Acme", email: "" }, false)).toBe(true);
  });
});
