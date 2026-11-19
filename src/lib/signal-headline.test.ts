import { describe, expect, it } from "vitest";
import { acceptableHeadline, cardHeadline, isLabelTitle, shortenHeadline, summaryBelowHeadline, HEADLINE_MAX } from "./signal-headline";

describe("signal headlines", () => {
  it("never uses a Company — Category label as the headline", () => {
    expect(isLabelTitle("IBM — Funding/M&A", "IBM")).toBe(true);
    expect(isLabelTitle("Siemens — industry research", "Siemens")).toBe(true);
    const h = cardHeadline({ company: "IBM", title: "IBM — Funding/M&A", signal: "IBM agreed to acquire identity security startup AuthMind. The deal closes in Q1." });
    expect(h).toBe("IBM agreed to acquire identity security startup AuthMind");
  });

  it("prefers the written headline, then a real article title", () => {
    expect(cardHeadline({ company: "Vanta", headline: "Vanta buys Pillar Security", title: "Blog post", signal: "x" })).toBe("Vanta buys Pillar Security");
    expect(cardHeadline({ company: "Fly.io", title: "Re-engineering 6PN for VM lookups", signal: "Long text." })).toBe("Re-engineering 6PN for VM lookups");
  });

  it("keeps headlines to one or two lines", () => {
    const long = "Cequence highlights a sharp surge in AI booking agents and automated bots hitting online travel sites, which is forcing airlines to rethink API defenses across every channel";
    const h = shortenHeadline(long);
    expect(h.length).toBeLessThanOrEqual(HEADLINE_MAX + 1);
    expect(h).toBe("Cequence highlights a sharp surge in AI booking agents and automated bots hitting online…");
    // A natural clause break wins over a mid-phrase cut.
    expect(shortenHeadline("Cymulate launches its exposure platform on AWS in Singapore, which gives regulated APAC buyers in-region hosting for every module they run"))
      .toBe("Cymulate launches its exposure platform on AWS in Singapore");
  });

  it("rejects model output that is a label or too long", () => {
    expect(acceptableHeadline("IBM — Funding/M&A", "IBM")).toBe("");
    expect(acceptableHeadline("x".repeat(140))).toBe("");
    expect(acceptableHeadline("“IBM acquires AuthMind to bolster identity security.”")).toBe("IBM acquires AuthMind to bolster identity security");
  });

  it("doesn't repeat the headline in the summary line", () => {
    expect(summaryBelowHeadline("IBM agreed to acquire AuthMind.", "IBM agreed to acquire AuthMind")).toBe("");
    expect(summaryBelowHeadline("IBM agreed to acquire AuthMind. The deal adds identity threat detection to Verify.", "IBM agreed to acquire AuthMind"))
      .toBe("The deal adds identity threat detection to Verify.");
    expect(summaryBelowHeadline("A different summary entirely.", "IBM buys AuthMind")).toBe("A different summary entirely.");
  });
});
