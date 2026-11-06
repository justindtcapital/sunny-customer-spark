import { describe, expect, it } from "vitest";
import { parsePastedContacts, singleNameReport } from "./paste-parse";

// Rows shaped like Shane's Nov 5 paste: First \t Last \t Title \t Company \t Email \t LinkedIn
const SHANE = [
  "Anu\tOladele\tCo-Founder\tAfterData.ai\tanu@afterdata.ai\thttp://www.linkedin.com/in/anu-oladele-8341ba39",
  "Jessica\tJolly\tGlobal Head\tAlexion\tjessica.jolly@alexion.com\thttp://www.linkedin.com/in/jessica-jolly-data",
  "Kevin\tRichards\tSr Director\tAstraZeneca\tkevin.richards@astrazeneca.com\t",
].join("\n");

describe("paste parsing", () => {
  it("joins separate first/last name columns instead of saving the surname as company", () => {
    const r = parsePastedContacts(SHANE);
    expect(r.firstLastDetected).toBe(true);
    expect(r.rows[0]).toMatchObject({ name: "Anu Oladele", company: "AfterData.ai", title: "Co-Founder", email: "anu@afterdata.ai" });
    expect(r.rows[2]).toMatchObject({ name: "Kevin Richards", company: "AstraZeneca" });
  });

  it("uses a First Name / Last Name header row to map columns", () => {
    const r = parsePastedContacts("First Name\tLast Name\tCompany\tEmail\nAnu\tOladele\tAfterData.ai\tanu@afterdata.ai");
    expect(r.headerMapped).toBe(true);
    expect(r.rows[0]).toMatchObject({ name: "Anu Oladele", company: "AfterData.ai" });
  });

  it("keeps 'Full Name, Company' lines unchanged", () => {
    const r = parsePastedContacts("Jane Doe, Acme Corp, jane@acme.com");
    expect(r.firstLastDetected).toBe(false);
    expect(r.rows[0]).toMatchObject({ name: "Jane Doe", company: "Acme Corp" });
  });

  it("can be told not to combine the first two columns", () => {
    const r = parsePastedContacts(SHANE, false);
    expect(r.rows[0]).toMatchObject({ name: "Anu", company: "Oladele" });
  });
});

describe("single-name warning", () => {
  it("flags one-word names and surnames saved as company", () => {
    const rep = singleNameReport([
      { name: "Anu", company: "Oladele", email: "anu@afterdata.ai", linkedin: "http://www.linkedin.com/in/anu-oladele-8341ba39" },
      { name: "Jessica", company: "Jolly", email: "jessica.jolly@alexion.com" },
      { name: "Avalon", company: "D'Souza", email: "avalon.ds@gmail.com" },
      { name: "Grace Hopper", company: "NavyTech", email: "grace@navy.mil" },
      { name: "Cher", company: "Acme Corp", email: "cher@acme.com" },
    ]);
    expect(rep.singles).toEqual([0, 1, 2, 4]);
    expect(rep.surnameInCompany).toEqual([0, 1]);
  });
});
