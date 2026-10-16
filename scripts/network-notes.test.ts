import { describe, expect, it } from "vitest";
import { emailMatchesName, extractEmails, isNetworkTitle, personInText } from "../src/lib/network-notes";

describe("NWK notes", () => {
  it("detects NWK as a word in the title", () => {
    expect(isNetworkTitle("NWK - coffee with Jane")).toBe(true);
    expect(isNetworkTitle("[NWK] catch-up")).toBe(true);
    expect(isNetworkTitle("Network sync")).toBe(false);
    expect(isNetworkTitle("BD call with Maven")).toBe(false);
  });
  it("matches people by email or full name, not first name alone", () => {
    expect(personInText({ email: "jane@acme.com" }, "Jane <jane@acme.com>")).toBe(true);
    expect(personInText({ name: "Jane Doe" }, "met with jane doe today")).toBe(true);
    expect(personInText({ name: "Jane" }, "met with jane today")).toBe(false);
  });
});

describe("email backfill for review rosters", () => {
  it("extracts and dedupes emails from mail text", () => {
    expect(extractEmails("From: Shane <Shane.Doyle@TokaGroup.com>; cc shane.doyle@tokagroup.com, jane@acme.com"))
      .toEqual(["shane.doyle@tokagroup.com", "jane@acme.com"]);
    expect(extractEmails("no mail here")).toEqual([]);
  });
  it("matches emails to names by local-part", () => {
    expect(emailMatchesName("shane.doyle@tokagroup.com", "Shane Doyle")).toBe(true);
    expect(emailMatchesName("sdoyle@tokagroup.com", "Shane Doyle")).toBe(true);
    expect(emailMatchesName("shane@tokagroup.com", "Shane")).toBe(true);
    expect(emailMatchesName("shan@tokagroup.com", "Shane")).toBe(false);
    expect(emailMatchesName("jane@acme.com", "Shane Doyle")).toBe(false);
    expect(emailMatchesName("sales@acme.com", "Shane")).toBe(false);
  });
});
