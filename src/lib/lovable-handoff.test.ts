import { describe, it, expect } from "vitest";
import { buildHandoffPrompt, buildHandoffUrl, LOVABLE_PROJECT_URL } from "./lovable-handoff";

const r = (title: string, priority: string) => ({ title, priority, description: "d", lovable_prompt: "p", effort: "small", status: "open", requested_by: "a@b", created_at: "2026-10-28T00:00:00Z" });

describe("lovable handoff", () => {
  it("asks for a plan first and orders by priority", () => {
    const p = buildHandoffPrompt("fix", [r("Low one", "low"), r("High one", "high")]);
    expect(p).toContain("wait for my approval");
    expect(p.indexOf("High one")).toBeLessThan(p.indexOf("Low one"));
  });
  it("falls back to bare project URL when prompt is too long", () => {
    expect(buildHandoffUrl("x".repeat(10000))).toEqual({ url: LOVABLE_PROJECT_URL, prefilled: false });
    expect(buildHandoffUrl("short").prefilled).toBe(true);
  });
});
