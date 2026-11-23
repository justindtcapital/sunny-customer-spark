import { describe, expect, it } from "vitest";
import { finalizeLinkedInPost } from "./linkedin-post";

const URL = "https://example.com/news/acme-raises";

describe("finalizeLinkedInPost", () => {
  it("adds the article link above the hashtags when the draft omits it", () => {
    const out = finalizeLinkedInPost("Great news from Acme.\n\n#AI #DTC", URL);
    expect(out).toBe(`Great news from Acme.\n\n${URL}\n\n#AI #DTC`);
  });

  it("does not add the link twice", () => {
    const out = finalizeLinkedInPost(`Read more: ${URL}\n\n#AI #DTC`, URL);
    expect(out.split(URL).length - 1).toBe(1);
  });

  it("replaces #DellTechCapital with #DTC", () => {
    const out = finalizeLinkedInPost("Big step.\n\n#AI #DellTechCapital", URL);
    expect(out).toContain("#DTC");
    expect(out).not.toMatch(/DellTechCapital/i);
  });

  it("adds #DTC when the draft has no DTC hashtag", () => {
    const out = finalizeLinkedInPost("Big step.\n\n#AI #Security");
    expect(out).toBe("Big step.\n\n#AI #Security #DTC");
  });

  it("skips non-web links", () => {
    expect(finalizeLinkedInPost("Hi.\n\n#DTC", "not a url")).toBe("Hi.\n\n#DTC");
  });
});
