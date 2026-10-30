import { describe, expect, it } from "vitest";
import { meetingTitleDefaults, reviewCompanyName, reviewCompanyOptions, reviewPeopleFromRows, uniqueReviewPerson } from "../src/lib/review-tagging";

describe("meeting review defaults", () => {
  it("prefills Investor calls from the title", () => {
    expect(meetingTitleDefaults("Investor: Hillock 1:1")).toMatchObject({ folder: "investor", investor: "Hillock" });
    expect(meetingTitleDefaults("Investor - Raman PortCo 1:1").investor).toBe("Raman");
    expect(meetingTitleDefaults("Re: Investor – Daniel 1:1").investor).toBe("Daniel");
  });
  it("routes NWK titles and parses person/company", () => {
    expect(meetingTitleDefaults("NWK - Brian Cobb - CVG Airport")).toEqual({ folder: "network", investor: "", people: [{ name: "Brian Cobb", email: "", company: "CVG Airport" }] });
    expect(meetingTitleDefaults("NWK: Ananta Nair").people[0]?.name).toBe("Ananta Nair");
  });
  it("supports a company followed by multiple named people", () => {
    expect(meetingTitleDefaults("NWK: Societe Generale - Sinclair Ridley Thomas & Sohan Talwalker").people.map((p) => p.name)).toEqual(["Sinclair Ridley Thomas", "Sohan Talwalker"]);
  });
  it("does not classify other meetings as investor calls", () => {
    expect(meetingTitleDefaults("PortCo investor relations").folder).toBe("portco");
  });
});

describe("safe contact defaults", () => {
  const dir = [{ name: "Ananta Nair", email: "ananta@example.com", company: "Dell", where: "Network" }];
  it("links a unique full name without an email", () => {
    expect(uniqueReviewPerson({ name: " ANANTA  NAIR " }, dir)?.email).toBe("ananta@example.com");
  });
  it("keeps first names and placeholders for review", () => {
    expect(uniqueReviewPerson({ name: "Ananta" }, dir)).toBeUndefined();
    expect(uniqueReviewPerson({ name: "Speaker B" }, [{ ...dir[0], name: "Speaker B" }])).toBeUndefined();
  });
  it("does not link ambiguous full names or shared emails", () => {
    const duplicate = [...dir, { ...dir[0], company: "Other" }];
    expect(uniqueReviewPerson({ name: "Ananta Nair" }, duplicate)).toBeUndefined();
    expect(uniqueReviewPerson({ name: "Ananta Nair", email: "ananta@example.com" }, duplicate)).toBeUndefined();
  });
  it("never substitutes a name match when a different email is present", () => {
    expect(uniqueReviewPerson({ name: "Ananta Nair", email: "other@example.com" }, dir)).toBeUndefined();
  });
  it("reads both views once from unified Contacts status flags", () => {
    expect(reviewPeopleFromRows([["Name", "Email", "Company", "Relationship Status"], ["Brian Cobb", "brian@example.com", "CVG", "Cold"], ["Ananta Nair", "ananta@example.com", "Dell", "Prospecting"]]).map((p) => p.where)).toEqual(["Network", "Prospecting"]);
  });
});

describe("complete company and workstream options", () => {
  it("keeps canonical companies with no Asana workstreams, including potential companies", () => {
    expect(reviewCompanyOptions(["Aidaptive", "Bland AI", "doubleAI"], ["Bland"])).toEqual(["Aidaptive", "Bland AI", "doubleAI"]);
  });
  it("resolves punctuation and suffix variants without substring guessing", () => {
    expect(reviewCompanyName("Tag-N-Trac", ["TagnTrac"])).toBe("TagnTrac");
    expect(reviewCompanyName("Misa Labs", ["MisaLabs"])).toBe("MisaLabs");
    expect(reviewCompanyName("Bland", ["Bland AI"])).toBe("Bland AI");
    expect(reviewCompanyName("Aid", ["Aidaptive"])).toBe("Aid");
  });
  it("leaves equal-score company collisions separate for review", () => {
    expect(reviewCompanyName("Bland", ["Bland AI", "Bland Labs"])).toBe("Bland");
  });
});