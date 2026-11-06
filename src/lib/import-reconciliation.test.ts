import { describe, expect, it } from "vitest";
import { planImportReconciliation } from "./import-reconciliation";

const saved = [
  { urid: "u1", email: "a@x.com", name: "A", company: "X", status: "Prospecting" },
  { urid: "u2", email: "d@x.com", name: "D", company: "X", status: "Prospecting" },
  { urid: "u3", email: "D@x.com", name: "D", company: "X", status: "Cold" },
];

describe("planImportReconciliation", () => {
  it("marks a person found once as saved", () => {
    expect(planImportReconciliation([{ key: "0", label: "A", email: "A@x.com" }], [], saved)[0].status).toBe("changed");
  });
  it("marks a missing person as not saved and retryable", () => {
    const [o] = planImportReconciliation([{ key: "0", label: "B", email: "b@x.com" }], [], saved);
    expect(o.status).toBe("failed");
    expect(o.retryable).toBe(true);
  });
  it("sends duplicates to review", () => {
    expect(planImportReconciliation([{ key: "0", label: "D", email: "d@x.com" }], [], saved)[0].status).toBe("review");
  });
  it("keeps earlier review decisions instead of counting existing people as saved", () => {
    const prior = [{ key: "0", label: "A", status: "review" as const, reason: "Already in Network" }];
    expect(planImportReconciliation([{ key: "0", label: "A", email: "a@x.com" }], prior, saved)[0].reason).toBe("Already in Network");
  });
});
