import { describe, expect, it } from "vitest";
import { portcosMentioned, resolvePersonQuery } from "../src/lib/action-people";

const dir = [
  { name: "Ann Lee", email: "ann@aka.ai", company: "Aka", title: "Chief Executive Officer", where: "Network" },
  { name: "Bo Kim", email: "bo@aka.ai", company: "Aka", title: "CTO", where: "Network" },
  { name: "X One", email: "x1@exxon.com", company: "ExxonMobil", title: "VP", where: "Network" },
  { name: "X Two", email: "x2@exxon.com", company: "ExxonMobil", title: "Director", where: "Prospecting" },
  { name: "X Three", email: "x3@exxon.com", company: "ExxonMobil", title: "Manager", where: "Network" },
];

describe("resolvePersonQuery", () => {
  it("pre-selects the single CEO of a company", () => {
    const r = resolvePersonQuery({ phrase: "CEO of Aka", company: "Aka", role: "CEO" }, dir);
    expect(r.preselected).toEqual(["ann@aka.ai"]);
  });
  it("pre-selects all when the requested count equals people at the company", () => {
    const r = resolvePersonQuery({ phrase: "three people from Exxon", company: "Exxon", count: 3 }, dir);
    expect(r.preselected).toHaveLength(3);
  });
  it("requires confirmation when count differs", () => {
    const r = resolvePersonQuery({ phrase: "two people from Exxon", company: "Exxon", count: 2 }, dir);
    expect(r.candidates).toHaveLength(3);
    expect(r.preselected).toEqual([]);
  });
  it("returns no candidates for an unknown company", () => {
    expect(resolvePersonQuery({ phrase: "CEO of Nope", company: "Nope", role: "CEO" }, dir).candidates).toEqual([]);
  });
});

describe("portcosMentioned", () => {
  it("finds whole-word PortCo names only", () => {
    expect(portcosMentioned("intro Aka to Exxon", ["Aka", "Akamai"])).toEqual(["Aka"]);
  });
});
