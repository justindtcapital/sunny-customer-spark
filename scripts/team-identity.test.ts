import { describe, expect, it } from "vitest";
import { teamMemberFor, teamProfile } from "../src/lib/user-ownership";
import { ownerMatches } from "../src/lib/action-owners";

describe("team identity", () => {
  it("treats Chris's DT Capital address, Dell address and name as one person", () => {
    expect(teamMemberFor("chrisf@dt-capital.net")?.displayName).toBe("Chris Falloon");
    expect(teamMemberFor("Chris Falloon <chris.falloon@dell.com>")?.displayName).toBe("Chris Falloon");
    expect(teamProfile("chrisf@dt-capital.net")?.email).toBe("chris.falloon@dell.com");
  });
  it("matches the action owner filter on a DT Capital sender address", () => {
    expect(ownerMatches("chrisf@dt-capital.net", "Chris Falloon")).toBe(true);
    expect(ownerMatches("shane@dt-capital.net", "Chris Falloon")).toBe(false);
  });
});
