import { describe, expect, it } from "vitest";
import { briefSignals, readableSummary, filterSignals, signalNewsEmail, SIGNAL_MARKER_RE, validateSignalsSearch } from "./signals-page";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const day = 86_400_000;
const card = (over: Partial<Parameters<typeof filterSignals>[0][number]> = {}) => ({
  storedId: "s1", company: "Cequence", segmentBucket: "Security", industry: "Finance", sourceType: "PortCo News",
  headline: "Cequence launches API guard", summary: "New product", sortTs: NOW - day, ...over,
});

describe("Signals filters", () => {
  it("defaults to the last 30 days and drops older signals", () => {
    const s = validateSignalsSearch({});
    const list = filterSignals([card(), card({ storedId: "old", sortTs: NOW - 40 * day })], s, NOW);
    expect(list.map((c) => c.storedId)).toEqual(["s1"]);
  });

  it("keeps old signals when All time is picked", () => {
    const s = validateSignalsSearch({ days: "all" });
    expect(filterSignals([card({ sortTs: NOW - 400 * day })], s, NOW)).toHaveLength(1);
  });

  it("matches any picked PortCo (multi-select) and ANDs other groups", () => {
    const cards = [card(), card({ storedId: "t", company: "Tetrate", segmentBucket: "Data" })];
    expect(filterSignals(cards, validateSignalsSearch({ pc: "Cequence,Tetrate" }), NOW)).toHaveLength(2);
    expect(filterSignals(cards, validateSignalsSearch({ pc: "Cequence,Tetrate", seg: "Data" }), NOW).map((c) => c.storedId)).toEqual(["t"]);
  });

  it("always keeps the deep-linked signal even when filters would hide it", () => {
    const s = validateSignalsSearch({ open: "old", seg: "AI" });
    expect(filterSignals([card({ storedId: "old", sortTs: NOW - 400 * day })], s, NOW)).toHaveLength(1);
  });
});

describe("Morning Brief signals", () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id, dateFound: "2026-11-19", company: "Acme", signal: `Story ${id}`, subject: "", sourceType: "Industry News",
    sourceUrl: `https://news.example.com/${id}`, relevance: 5, rankScore: null as number | null, ...over,
  });

  it("only includes signals found since yesterday", () => {
    const out = briefSignals([row("a", { dateFound: "2026-11-18" }), row("b", { dateFound: "2026-11-17" })], { today: "2026-11-19", meetingPortcos: [] });
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("puts PortCos in today's meetings first, then the highest ranked", () => {
    const out = briefSignals(
      [row("high", { rankScore: 90 }), row("meet", { company: "Tetrate", rankScore: 10 }), row("mid", { rankScore: 50 })],
      { today: "2026-11-19", meetingPortcos: ["Tetrate"] },
    );
    expect(out.map((s) => s.id)).toEqual(["meet", "high", "mid"]);
    expect(out[0].inMeeting).toBe(true);
  });

  it("lists each story once", () => {
    const out = briefSignals([row("a"), row("b", { sourceUrl: "https://news.example.com/a" })], { today: "2026-11-19", meetingPortcos: [] });
    expect(out).toHaveLength(1);
  });
});

describe("Send to news@", () => {
  it("carries the signal ID marker so ingest skips it", () => {
    const m = signalNewsEmail({ id: "s1234abcd", kind: "PortCo", company: "Cequence", headline: "Launch", sourceUrl: "https://x.com/a" });
    expect(m.subject).toBe("PortCo news — Cequence: Launch");
    expect(m.body.match(SIGNAL_MARKER_RE)?.[1]).toBe("s1234abcd");
    expect(m.body).toContain("Source: https://x.com/a");
  });
});

describe("readableSummary", () => {
  it("drops the scan's scoring breakdown and keeps the reason", () => {
    const t = "Attribution 6.3/10 — relationship 2.8/3 (Hot), LLM prior 8/10 weighted 25%. — Highly relevant thought leadership.";
    expect(readableSummary(t)).toBe("Highly relevant thought leadership.");
  });
  it("leaves ordinary summaries alone", () => {
    expect(readableSummary("Cribl has acquired Tero.")).toBe("Cribl has acquired Tero.");
  });
});
