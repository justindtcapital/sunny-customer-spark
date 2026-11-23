import { describe, expect, it } from "vitest";
import { uniqueReviewPerson } from "./review-tagging";
import { suggestPeople, type DirPerson } from "./meeting-roster";

const dir: DirPerson[] = [
  { name: "Ana Ruiz", email: "ana@acme.com", company: "Acme", where: "Network" },
  { name: "Ben Ito", email: "ben@zeta.io; b.ito@gmail.com", company: "Zeta", where: "Network" },
  { name: "Sam Lee", email: "sam@one.com", company: "One", where: "Network" },
  { name: "Sam Lee", email: "sam@two.com", company: "Two", where: "Network" },
  { name: "Pat Shared", email: "team@shared.com", company: "Shared", where: "Network" },
  { name: "Pia Shared", email: "team@shared.com", company: "Shared", where: "Network" },
];

describe("review people matching (indexed)", () => {
  it("links a unique email, including a second address on the record", () => {
    expect(uniqueReviewPerson({ name: "", email: "ana@acme.com" }, dir)?.name).toBe("Ana Ruiz");
    expect(uniqueReviewPerson({ name: "", email: "b.ito@gmail.com" }, dir)?.email).toBe("b.ito@gmail.com");
  });
  it("links a unique full name to its primary email", () => {
    expect(uniqueReviewPerson({ name: "ben  ito" }, dir)?.email).toBe("ben@zeta.io");
  });
  it("never links ambiguous names, shared emails or first names", () => {
    expect(uniqueReviewPerson({ name: "Sam Lee" }, dir)).toBeUndefined();
    expect(uniqueReviewPerson({ name: "", email: "team@shared.com" }, dir)).toBeUndefined();
    expect(uniqueReviewPerson({ name: "Ana" }, dir)).toBeUndefined();
  });
  it("suggests by first name, ranking company hints first", () => {
    expect(suggestPeople({ name: "Sam" }, dir, ["Two"]).map((p) => p.company)).toEqual(["Two", "One"]);
    expect(suggestPeople({ name: "Sam Lee" }, dir).length).toBe(2);
    expect(suggestPeople({ name: "Speaker B" }, dir)).toEqual([]);
  });
});
