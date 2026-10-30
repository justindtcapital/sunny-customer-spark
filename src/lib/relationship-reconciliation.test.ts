import { describe, it, expect } from "vitest";
import { reconcileRelationships, prospectProjection } from "./relationship-reconciliation";
const source = { urid:"one",name:"Person One",email:"one@example.com","relationship status":"Warm",custom:"retain" };
const ch = Object.keys(source), row = Object.values(source);
const projection = { urid:"one",...prospectProjection(source),"network profile":JSON.stringify(source) };
const th = Object.keys(projection), target = Object.values(projection);
const selected = { urid:"one",email:"one@example.com",temperature:"Warm",destination:"Prospecting" };
describe("saved relationship reconciliation", () => {
  it("verifies completed transfer only when the source is absent and profile matches", () => {
    expect(reconcileRelationships([selected],[ch],[th,target])[0].status).toBe("already_complete");
    const bad = [...target]; bad[th.indexOf("email")]="other@example.com";
    expect(reconcileRelationships([selected],[ch],[th,bad])[0].status).toBe("blocked");
  });
  it("classifies retained unchanged sources as unfinished, never complete", () => {
    expect(reconcileRelationships([selected],[ch,row],[th])[0]).toMatchObject({status:"failed",retryable:true});
    expect(reconcileRelationships([selected],[ch,row],[th,target])[0]).toMatchObject({status:"failed",retryable:true});
  });
  it("blocks changed source profiles and duplicate IDs", () => {
    const changed=[...row];changed[ch.indexOf("custom")]="new";
    expect(reconcileRelationships([selected],[ch,changed],[th,target])[0].status).toBe("blocked");
    expect(reconcileRelationships([selected],[ch,row,row],[th])[0].status).toBe("blocked");
  });
  it("checks all 22 requested contacts, including 11 absent checkpoints", () => {
    const people=Array.from({length:22},(_,i)=>({...selected,urid:String(i)}));
    const network=people.slice(12).map(s=>({...source,urid:s.urid})).map(p=>ch.map(h=>p[h as keyof typeof p]));
    const targets=people.slice(0,12).map(s=>{const p={...source,urid:s.urid};const t:Record<string,string>={urid:s.urid,...prospectProjection(p),"network profile":JSON.stringify(p)};return th.map(h=>t[h]);});
    const outcomes=reconcileRelationships(people,[ch,...network],[th,...targets]);
    expect(outcomes).toHaveLength(22);expect(outcomes.filter(o=>o.status==="already_complete")).toHaveLength(12);expect(outcomes.filter(o=>o.retryable)).toHaveLength(10);
  });
  it("blocks missing IDs and headers rather than guessing", () => {
    expect(reconcileRelationships([{...selected,urid:undefined}],[ch,row],[th])[0].status).toBe("blocked");
    expect(()=>reconcileRelationships([selected],[ch.concat("urid")],[th])).toThrow();
  });
});