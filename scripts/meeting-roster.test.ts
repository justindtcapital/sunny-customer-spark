import { describe, expect, it } from "vitest";
import { resolveWho, suggestPeople } from "../src/lib/meeting-roster";

const dir = [
  { name: "Brent Smith", email: "brent@arctiq.com", company: "Arctiq", where: "Network" },
  { name: "Brent Jones", email: "bj@other.com", company: "Other Co", where: "Prospecting" },
  { name: "Sami Shalabi", email: "sami@mavenagi.com", company: "MavenAGI", where: "Network" },
];

describe("meeting roster", () => {
  it("suggests first-name matches ranked by company hints", () => {
    expect(suggestPeople({ name: "Brent" }, dir, ["Arctiq"])[0]!.email).toBe("brent@arctiq.com");
  });
  it("never suggests anyone for transcript placeholders", () => {
    expect(suggestPeople({ name: "Speaker B" }, dir)).toEqual([]);
  });
  it("assigns a next step to the roster person by first name", () => {
    expect(resolveWho("Sami (MavenAGI)", [{ name: "Chris Falloon" }, { name: "Sami Shalabi", heard: "Sami" }])).toBe(1);
  });
  it("leaves ambiguous first names unassigned", () => {
    expect(resolveWho("Brent", [{ name: "Brent Smith" }, { name: "Brent Jones" }])).toBe(-1);
  });
});
