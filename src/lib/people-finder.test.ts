import { describe, expect, it } from "vitest";
import { duplicateClusters, rankPeopleMatches } from "./people-finder";

const people = [
  { urid: "a", name: "Brent Smith", email: "brent@acme.com", company: "Acme", where: "Network" },
  { urid: "b", name: "Sam Brentwood", email: "sam@x.com", company: "X", where: "Network" },
  { urid: "c", name: "Brent Smith", email: "bsmith@acme.com", company: "Acme Inc", where: "Prospecting" },
  { urid: "d", name: "Zoë Brent", email: "zoe@beta.io", company: "Beta", where: "Network" },
  { urid: "e", name: "Ann Lee", email: "brent@acme.com", company: "", where: "Prospecting" },
];

describe("rankPeopleMatches", () => {
  it("puts exact names first, then names starting with the query, then other matches", () => {
    const names = rankPeopleMatches("brent smith", people).map((p) => p.urid);
    expect(names.slice(0, 2)).toEqual(["a", "c"]);
  });
  it("ranks an exact email above everything", () => {
    expect(rankPeopleMatches("bsmith@acme.com", people)[0]?.urid).toBe("c");
  });
  it("ignores accents and boosts people at the meeting's companies", () => {
    expect(rankPeopleMatches("zoe", people)[0]?.urid).toBe("d");
    const hinted = rankPeopleMatches("brent", [people[0]!, { urid: "j", name: "Brent Jones", email: "bj@beta.io", company: "Beta", where: "Network" }], ["beta"]);
    expect(hinted[0]?.urid).toBe("j");
  });
  it("requires every word to appear somewhere", () => {
    expect(rankPeopleMatches("brent zzz", people)).toEqual([]);
  });
});

describe("duplicateClusters", () => {
  it("groups records sharing an email, and same full name at the same company", () => {
    const groups = duplicateClusters(people).map((g) => ({ ids: g.people.map((p) => p.urid).sort(), reason: g.reason }));
    expect(groups).toEqual([{ ids: ["a", "c", "e"], reason: "Same email" }]);
  });
  it("never groups teammates or rows without a record ID", () => {
    expect(duplicateClusters([
      { name: "Chris Falloon", email: "c@dt.com", company: "DT", where: "Team", urid: "t" },
      { name: "Chris Falloon", email: "c@dt.com", company: "DT", where: "Network" },
    ])).toEqual([]);
  });
  it("keeps the same name at two different companies apart", () => {
    expect(duplicateClusters([
      { urid: "1", name: "Esther Kim", email: "", company: "MGB", where: "Network" },
      { urid: "2", name: "Esther Kim", email: "", company: "Stanford", where: "Network" },
    ])).toEqual([]);
  });
});
