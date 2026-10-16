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
  it("recognizes Julia's two DT Capital addresses and Chris Hillock's DT Capital address", () => {
    expect(teamMemberFor("julia@dt-capital.net")?.displayName).toBe("Julia Beech");
    expect(teamMemberFor("juliab@dt-capital.net")?.displayName).toBe("Julia Beech");
    expect(teamProfile("juliab@dt-capital.net")?.email).toBe("julia.beech@dell.com");
    expect(teamMemberFor("chrish@dt-capital.net")?.displayName).toBe("Chris Hillock");
    expect(teamProfile("chrish@dt-capital.net")?.email).toBe("chris.hillock@dell.com");
  });
});
