import { describe, expect, it } from "vitest";
import { SEED_PARTNERS, detectPartners, matchPartner, type Partner } from "../src/lib/partners";

const partners: Partner[] = SEED_PARTNERS.map((p) => ({ ...p, notes: "", aliases: p.aliases || [] }));

describe("partner matching", () => {
  it("tags Dell contacts to the Dell partner", () => {
    expect(matchPartner("Dell Technologies", partners)?.name).toBe("Dell");
    expect(matchPartner("Dell Technologies", partners)?.category).toBe("Dell");
  });
  it("tags reseller/integrator contacts", () => {
    expect(matchPartner("Trace3", partners)?.category).toBe("Resellers & Integrators");
    expect(matchPartner("World Wide Technology", partners)?.name).toBe("WWT");
  });
  it("tags tech partner contacts", () => {
    expect(matchPartner("NVIDIA Corporation", partners)?.category).toBe("Tech Partners");
    expect(matchPartner("Amazon Web Services", partners)?.name).toBe("AWS");
  });
  it("puts GetProven under Vendors", () => {
    expect(matchPartner("GetProven", partners)?.category).toBe("Vendors");
  });
  it("does not tag unrelated companies", () => {
    expect(matchPartner("Delleville Farms", partners)).toBeNull();
    expect(matchPartner("Intelligent Systems", partners)).toBeNull();
    expect(matchPartner("", partners)).toBeNull();
  });
  it("suggests partners named in note text", () => {
    expect(detectPartners("Call with Trace3 and NVIDIA about the pilot", partners)).toEqual(["Trace3", "NVIDIA"]);
  });
});
