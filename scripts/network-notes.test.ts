import { describe, expect, it } from "vitest";
import { isNetworkTitle, personInText } from "../src/lib/network-notes";

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
