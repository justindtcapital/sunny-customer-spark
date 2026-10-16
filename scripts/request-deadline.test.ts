import { describe, expect, it } from "vitest";
import { withDeadline } from "../src/utils/request-deadline.server";

describe("withDeadline", () => {
  it("returns the work's result when it finishes in time", async () => {
    await expect(withDeadline("t", 1000, async (step) => { step("a"); return 42; })).resolves.toBe(42);
  });

  it("fails with the step that stalled instead of hanging", async () => {
    const stuck = withDeadline("t", 30, async (step) => {
      step("filing the Drive copy");
      await new Promise(() => {});
    });
    await expect(stuck).rejects.toThrow("stuck while filing the Drive copy");
  });

  it("lets slow work that resolves before the deadline succeed", async () => {
    const r = await withDeadline("t", 200, () => new Promise<string>((res) => setTimeout(() => res("ok"), 50)));
    expect(r).toBe("ok");
  });
});
