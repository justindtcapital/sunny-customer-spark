import { describe, expect, it } from "vitest";
import { allowedTeamEmail, granolaAuthor, granolaCursorKey } from "../src/lib/team-access";

describe("personal Granola isolation", () => {
  it("accepts verified roster emails, not names or unknown users", () => {
    expect(allowedTeamEmail("Chris Falloon")).toBeNull();
    expect(allowedTeamEmail("unknown@example.com")).toBeNull();
    expect(allowedTeamEmail("chrisf@dt-capital.net")).toBe("chris.falloon@dell.com");
    expect(allowedTeamEmail("julia.beech@dell.com")).toBe("julia.beech@dell.com");
  });
  it("keeps personal cursors separate from each other and legacy imports", () => {
    expect(granolaCursorKey("julia-id")).toBe("granola:notes:user:julia-id");
    expect(granolaCursorKey("shane-id")).not.toBe(granolaCursorKey("julia-id"));
    expect(granolaCursorKey()).toBe("granola:notes");
  });
  it("uses the note owner without inventing an author when absent", () => {
    expect(granolaAuthor({ name: "Julia Beech", email: "JULIA@dt-capital.net" })).toBe("Julia Beech <julia@dt-capital.net>");
    expect(granolaAuthor()).toBe("");
  });
});