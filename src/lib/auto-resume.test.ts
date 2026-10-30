import { describe, it, expect } from "vitest";
import { autoResume } from "./auto-resume";
import type { BulkOutcome } from "./bulk-operation";

const o = (n: number, pending: number) => Array.from({ length: n }, (_, i) => ({ status: i < pending ? "pending" : "moved" }) as BulkOutcome);

describe("autoResume", () => {
  it("keeps stepping until nothing is pending", async () => {
    let left = 6, calls = 0;
    const r = await autoResume({ outcomes: o(6, left), pauseMs: 0, step: async () => { calls++; left = Math.max(0, left - 2); return { outcomes: o(6, left) }; } });
    expect(calls).toBe(3);
    expect(r.stalled).toBe(false);
  });
  it("stops after two steps with no progress", async () => {
    let calls = 0;
    const r = await autoResume({ outcomes: o(4, 4), pauseMs: 0, step: async () => { calls++; return { outcomes: o(4, 4) }; } });
    expect(calls).toBe(2);
    expect(r.stalled).toBe(true);
  });
});
