import { describe, expect, it } from "vitest";
import { extractSnippets, kbQueryClause, kbTerms } from "./vic-kb";

describe("vic knowledge base helpers", () => {
  it("drops filler words from the question", () => {
    expect(kbTerms("Do any PortCos work with vector databases?")).toEqual(["portcos", "work", "vector", "databases"]);
  });
  it("requires every term and escapes quotes", () => {
    expect(kbQueryClause("O'Brien deck")).toBe("fullText contains 'o\\'brien' and fullText contains 'deck'");
  });
  it("returns the passage that contains the terms", () => {
    const text = "x ".repeat(500) + "Maven uses vector search for support. " + "y ".repeat(500);
    const [s] = extractSnippets(text, "vector search");
    expect(s).toContain("Maven uses vector search");
  });
});
