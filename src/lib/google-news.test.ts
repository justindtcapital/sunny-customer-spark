import { describe, expect, it } from "vitest";
import { dailySlice, googleNewsRssUrl, parseGoogleNewsRss, parseGroundedLines, pickArticleUrl } from "./google-news";

const NOW = Date.parse("2026-11-20T12:00:00Z");

describe("Google News RSS", () => {
  const xml = `<rss><channel>
<item><title>Cribl named a Leader in Gartner MQ - Business Wire</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Tue, 17 Nov 2026 14:00:00 GMT</pubDate><source url="https://www.businesswire.com">Business Wire</source></item>
<item><title>Cribbage tips for winter - Blog</title><link>https://news.google.com/rss/articles/def</link><pubDate>Tue, 17 Nov 2026 14:00:00 GMT</pubDate><source url="https://x.com">Blog</source></item>
<item><title>Vanta &amp; partners expand - TechCrunch</title><link>https://news.google.com/rss/articles/old</link><pubDate>Tue, 01 Sep 2026 14:00:00 GMT</pubDate><source url="https://techcrunch.com">TechCrunch</source></item>
</channel></rss>`;

  it("keeps only recent stories whose headline names a company, without the source suffix", () => {
    const items = parseGoogleNewsRss(xml, ["Cribl", "Vanta"], 14, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.company).toBe("Cribl");
    expect(items[0]?.title).toBe("Cribl named a Leader in Gartner MQ");
    expect(items[0]?.source).toBe("Business Wire");
  });

  it("builds an exact-name OR query capped at 30 days", () => {
    const u = decodeURIComponent(googleNewsRssUrl(["Cribl", "Fly.io"], 90));
    expect(u).toContain('"Cribl" OR "Fly.io" when:30d');
  });
});

describe("Google-grounded search lines", () => {
  const text = [
    "Cribl | Cribl named a Leader | 2026-11-17 | Recognized in the first observability pipelines MQ.",
    "Acme | Unrelated company story | 2026-11-18 | Not in the batch.",
    "Vanta | Vanta buys Pillar | 2026-11-19 | No Google source backs this line.",
  ].join("\n");
  const supports = [
    { text: "Cribl | Cribl named a Leader | 2026-11-17 | Recognized in the first observability pipelines MQ.", chunks: [0, 2] },
    { text: "Acme | Unrelated company story | 2026-11-18 | Not in the batch.", chunks: [1] },
  ];

  it("keeps a story only when Google sourced it and it names a batch company", () => {
    const lines = parseGroundedLines(text, supports, ["Cribl", "Vanta"], "companies");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ company: "Cribl", date: "2026-11-17", chunks: [0, 2] });
  });

  it("topic mode accepts the company the story is about", () => {
    const lines = parseGroundedLines(text, supports, ["Robotics"], "topics");
    expect(lines.map((l) => l.company)).toEqual(["Cribl", "Acme"]);
  });

  it("prefers a source whose address names the company over an off-topic page", () => {
    expect(
      pickArticleUrl(
        ["https://pluang.com/en/news-feed/hasil-keuangan-operasional", "https://www.alation.com/news/gartner-leader-2026"],
        "Alation",
      ),
    ).toBe("https://www.alation.com/news/gartner-leader-2026");
  });

  it("falls back to Google's first source when none names the company", () => {
    expect(pickArticleUrl(["https://first.com/story/a", "https://second.com/a/much/longer/story/path"], "Cribl")).toBe(
      "https://first.com/story/a",
    );
  });
});

describe("dailySlice", () => {
  it("rotates through a long list so every name is covered over successive days", () => {
    const names = ["a", "b", "c", "d", "e"];
    const seen = new Set([...dailySlice(names, 2, 0), ...dailySlice(names, 2, 1), ...dailySlice(names, 2, 2)]);
    expect(seen.size).toBe(5);
  });
});
