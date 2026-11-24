import { describe, expect, it } from "vitest";
import { contextPeople, resolveInContext } from "./action-context-people";
import type { DirectoryPerson } from "./action-people";

const dir: DirectoryPerson[] = [
  { name: "Travis Kelly", email: "travis.kelly@dell.com", company: "Dell", title: "VP Storage", where: "Network" },
  { name: "Travis Brown", email: "travis@acme.com", company: "Acme", title: "CTO", where: "Network" },
  { name: "Sara Lin", email: "sara@dell.com", company: "Dell Technologies", title: "Director", where: "Network" },
  { name: "Maya Chen", email: "maya@glencoco.ai", company: "Glen Coco", title: "CEO", where: "Network" },
  { name: "Raj Patel", email: "raj@glencoco.ai", company: "Glen Coco", title: "VP Sales", where: "Network" },
  { name: "Ann Other", email: "ann@dell.com", company: "Dell", title: "CEO Office", where: "Network" },
];
const ctx = contextPeople(dir, { company: "Glen Coco", stakeholders: "Travis Kelly, Sara Lin, Pat Unknown" });

describe("contextPeople", () => {
  it("links stakeholders by full name and keeps unknown names name-only", () => {
    expect(ctx.filter((p) => p.why === "Dell stakeholder").map((p) => [p.name, p.email])).toEqual([
      ["Travis Kelly", "travis.kelly@dell.com"], ["Sara Lin", "sara@dell.com"], ["Pat Unknown", ""],
    ]);
  });
  it("adds the PortCo's saved contacts", () => {
    expect(ctx.filter((p) => p.why === "PortCo contact").map((p) => p.name)).toEqual(["Maya Chen", "Raj Patel"]);
  });
  it("never pulls every Dell person in as company contacts", () => {
    expect(contextPeople(dir, { company: "Dell" })).toEqual([]);
  });
});

describe("resolveInContext", () => {
  it("a first name resolves to the workstream's stakeholder, not a namesake elsewhere", () => {
    const r = resolveInContext({ phrase: "Travis", name: "Travis" }, dir, ctx);
    expect(r.candidates.map((c) => c.email)).toEqual(["travis.kelly@dell.com"]);
    expect(r.preselected).toEqual(["travis.kelly@dell.com"]);
  });
  it("their CEO resolves to the PortCo CEO", () => {
    const r = resolveInContext({ phrase: "their CEO", company: "Glen Coco", role: "CEO" }, dir, ctx);
    expect(r.preselected).toEqual(["maya@glencoco.ai"]);
  });
  it("'the Dell stakeholders' preselects every linked stakeholder", () => {
    const r = resolveInContext({ phrase: "the Dell stakeholders", company: "Dell" }, dir, ctx);
    expect(r.preselected).toEqual(["travis.kelly@dell.com", "sara@dell.com", "Pat Unknown"]);
  });
  it("Dell people are scoped to the workstream's stakeholders", () => {
    const r = resolveInContext({ phrase: "the Dell folks", company: "Dell" }, dir, ctx);
    expect(r.candidates.map((c) => c.name)).toEqual(["Travis Kelly", "Sara Lin", "Pat Unknown"]);
  });
  it("falls back to the whole directory when nobody on the workstream matches", () => {
    const r = resolveInContext({ phrase: "Ann", name: "Ann Other" }, dir, ctx);
    expect(r.preselected).toEqual(["ann@dell.com"]);
  });
});
