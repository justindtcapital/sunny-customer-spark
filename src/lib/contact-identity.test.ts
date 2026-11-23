import { describe, expect, it } from "vitest";
import { findExistingContact, findExistingContacts } from "./contact-identity";

const H = ["URID", "Name", "Company", "Email", "LinkedIn", "Relationship Status"];
const rows = [
  H,
  ["u1", "Jill Targonski", "Wells Fargo", "jill.targonski@wellsfargo.com", "", "Prospecting"],
  ["u2", "Jill Targonski", "Wells Fargo", "jill.targonski@wellsfargo.com", "", "Cold"],
  ["u3", "James Sullivan", "Genentech", "", "https://www.linkedin.com/in/jsullivan/", "Warm"],
  ["u4", "Esther Kim", "Mass General Brigham, Inc.", "", "", "Cold"],
  ["u5", "Old Copy", "Acme", "old@acme.com", "", "Merged"],
];

describe("findExistingContact (every add path checks this before appending)", () => {
  it("reuses a saved person with the same email, preferring the Network record over Prospecting", () => {
    const hit = findExistingContact(rows, { name: "Jill T", email: "JILL.TARGONSKI@wellsfargo.com" });
    expect(hit?.urid).toBe("u2");
    expect(hit?.reason).toBe("email");
    expect(findExistingContacts(rows, { email: "jill.targonski@wellsfargo.com" }).map((h) => h.urid)).toEqual(["u2", "u1"]);
  });
  it("matches one of several addresses in a cell", () => {
    expect(findExistingContact(rows, { email: "x@y.com; jill.targonski@wellsfargo.com" })?.urid).toBe("u2");
  });
  it("matches the same LinkedIn profile written differently", () => {
    expect(findExistingContact(rows, { name: "Jim Sullivan", linkedin: "linkedin.com/in/jsullivan" })?.urid).toBe("u3");
  });
  it("matches the same full name at the same company, ignoring Inc./punctuation", () => {
    expect(findExistingContact(rows, { name: "esther  kim", company: "Mass General Brigham" })?.urid).toBe("u4");
  });
  it("treats the same name at a different company, or a first name alone, as a new person", () => {
    expect(findExistingContact(rows, { name: "Esther Kim", company: "Stanford" })).toBeNull();
    expect(findExistingContact(rows, { name: "Esther", company: "Mass General Brigham" })).toBeNull();
  });
  it("ignores archived merged records", () => {
    expect(findExistingContact(rows, { email: "old@acme.com" })).toBeNull();
  });
});
