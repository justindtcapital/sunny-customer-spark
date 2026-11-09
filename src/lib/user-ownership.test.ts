import { describe, expect, it } from "vitest";
import { canonicalOwnerName, ownerMatches, teamProfile } from "./user-ownership";

describe("canonicalOwnerName", () => {
  it("turns every Chris Falloon address and short name into his full name", () => {
    for (const v of ["chris.falloon@dell.com", "chris.falloon@del.com", "chrisf@dt-capital.net", "Falloon", "Falloon, Chris <chris.falloon@dell.com>", "Chris Falloon <chrisf@dt-capital.net>"]) {
      expect(canonicalOwnerName(v)).toBe("Chris Falloon");
    }
  });

  it("uses full names for the rest of the DTC team", () => {
    expect(canonicalOwnerName("Hillock")).toBe("Chris Hillock");
    expect(canonicalOwnerName("Julia")).toBe("Julia Beech");
    expect(canonicalOwnerName("julia.beech@dell.com")).toBe("Julia Beech");
    expect(canonicalOwnerName("shane@dt-capital.net")).toBe("Shane Earley");
    expect(canonicalOwnerName("Earley, Shane <shane.earley@dell.com>")).toBe("Shane Earley");
  });

  it("names every teammate in shared ownership", () => {
    expect(canonicalOwnerName("Falloon, Beech")).toBe("Chris Falloon, Julia Beech");
  });

  it("leaves people outside the team and placeholders unchanged", () => {
    expect(canonicalOwnerName("Unassigned")).toBe("Unassigned");
    expect(canonicalOwnerName("bd-tracking@dt-capital.net")).toBe("bd-tracking@dt-capital.net");
    expect(canonicalOwnerName("iddo.avneri@treeverse.io")).toBe("iddo.avneri@treeverse.io");
    expect(canonicalOwnerName("Vation")).toBe("Vation");
  });

  it("still credits Chris when an old row holds a bare surname", () => {
    expect(ownerMatches("Falloon", teamProfile("chris.falloon@dell.com")!)).toBe(true);
    expect(ownerMatches("Hillock", teamProfile("chris.falloon@dell.com")!)).toBe(false);
  });
});
