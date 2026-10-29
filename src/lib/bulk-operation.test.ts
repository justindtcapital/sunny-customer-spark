import { describe,it,expect } from "vitest";
import { activityEvidence, operationStatus, outcomeTotals,snapshotEqual } from "./bulk-operation";
import { emailIdentities,peopleCandidates,suppliedFieldsMatch } from "./import-dedupe";
describe("bulk outcomes and duplicate prevention",()=>{
 it("reports changed, already-moved and blocked contacts separately",()=>{
  const outcomes=[{key:"a",label:"A",status:"changed" as const,reason:"saved"},{key:"b",label:"B",status:"already_complete" as const,reason:"already moved"},{key:"c",label:"C",status:"blocked" as const,reason:"missing ID"}];
  expect(outcomeTotals(outcomes)).toEqual({updated:1,moved:0,alreadyComplete:1,duplicates:0,skipped:1});expect(operationStatus(outcomes)).toBe("partial");
 });
 it("never calls an uncertain save a success",()=>expect(operationStatus([{key:"a",label:"A",status:"uncertain",reason:"timeout"}])).toBe("uncertain"));
 it("normalizes individual email aliases across separators",()=>expect(emailIdentities("B@EXAMPLE.COM | a@example.com; b@example.com")).toEqual(["a@example.com","b@example.com"]));
 it("matches overlapping email aliases without collapsing different people by name only",()=>{
  const saved=[{name:"Sam",company:"One",email:"a@example.com; b@example.com"},{name:"Sam",company:"Two",email:"other@example.com"}];
  expect(peopleCandidates({name:"Sam",email:"b@example.com"},saved)).toHaveLength(1);expect(peopleCandidates({name:"Sam"},saved)).toHaveLength(0);
 });
 it("holds conflicting tags rather than silently skipping them",()=>{
  expect(suppliedFieldsMatch({name:"Briefing",portcos:["Maven","Other"]},{name:"Briefing",portcos:["Maven"]})).toBe(false);
  expect(suppliedFieldsMatch({name:"Briefing",portcos:["Other","Maven"]},{name:"Briefing",portcos:["Maven","Other"]})).toBe(true);
 });
 it("compares complete transfer snapshots structurally",()=>{
  expect(snapshotEqual('{"urid":"one","custom":"retain"}','{"custom":"retain","urid":"one"}')).toBe(true);
  expect(snapshotEqual('{"urid":"one","custom":"retain"}','{"urid":"one","custom":"lost"}')).toBe(false);
 });
 it("keeps personal labels out of assistant evidence",()=>{
  const evidence=activityEvidence({id:"id",actor:"team",kind:"import",page:"/crm",status:"failed",summary:"1 unresolved",created_at:"2026-10-29",updated_at:"2026-10-29",attempts:[],outcomes:[{key:"private@example.com",label:"Private Person",status:"blocked",reason:"missing stable ID"}]});
  expect(evidence).not.toContain("private@example.com");expect(evidence).not.toContain("Private Person");expect(evidence).toContain("missing stable ID");
 });
});