import { describe, expect, it } from "vitest";
import { lastGoodReader } from "./last-good";

describe("lastGoodReader", () => {
  it("throws instead of inventing data when the first read fails", async () => {
    const read = lastGoodReader<string[]>(async () => { throw new Error("429"); }, "Portfolio companies");
    await expect(read()).rejects.toThrow("Portfolio companies are temporarily unavailable");
  });

  it("returns the last real result when a later read fails", async () => {
    let fail = false;
    const read = lastGoodReader(async () => { if (fail) throw new Error("429"); return ["Cequence", "Tetrate"]; }, "Portfolio companies");
    expect(await read()).toEqual(["Cequence", "Tetrate"]);
    fail = true;
    expect(await read()).toEqual(["Cequence", "Tetrate"]);
  });
});
