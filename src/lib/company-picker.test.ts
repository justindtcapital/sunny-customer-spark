import { describe, expect, it } from "vitest";
import { exactCompany, rankCompanies, type CompanyOption } from "./company-picker";

const opts: CompanyOption[] = [
  { name: "GlenCoCo", kind: "Partner" },
  { name: "Tetrate", kind: "PortCo" },
  { name: "Terra", kind: "PortCo" },
  { name: "Bland AI", kind: "PortCo" },
];

describe("rankCompanies", () => {
  it("finds GlenCoCo when typed with a space", () => {
    expect(rankCompanies("Glen Coco", opts)[0]?.name).toBe("GlenCoCo");
  });
  it("puts names that start with the text before ones that only contain it", () => {
    expect(rankCompanies("te", opts).map((o) => o.name)).toEqual(["Terra", "Tetrate"]);
  });
  it("matches letters in order once three are typed", () => {
    expect(rankCompanies("ttrt", opts).map((o) => o.name)).toEqual(["Tetrate"]);
  });
  it("returns nothing for unrelated text", () => {
    expect(rankCompanies("zebra", opts)).toEqual([]);
  });
});

describe("exactCompany", () => {
  it("treats glen-coco as the listed GlenCoCo partner", () => {
    expect(exactCompany("glen-coco", opts)).toEqual({ name: "GlenCoCo", kind: "Partner" });
  });
});
