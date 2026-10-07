import { describe, expect, it } from "vitest";
import { workstreamBarStatus } from "../src/lib/workstream-parse";

describe("workstream bar status", () => {
  it("uses the shared Asana status", () => {
    expect(workstreamBarStatus({ completed: false, workstreamStatus: "In progress" })).toBe("In progress");
  });
  it("normalizes either completion signal", () => {
    expect(workstreamBarStatus({ completed: true, workstreamStatus: "In progress" })).toBe("Completed");
    expect(workstreamBarStatus({ completed: false, workstreamStatus: "Complete" })).toBe("Completed");
    expect(workstreamBarStatus({ completed: false, workstreamStatus: " completed " })).toBe("Completed");
  });
  it("does not mistake incomplete work for completed", () => {
    expect(workstreamBarStatus({ completed: false, workstreamStatus: "Working to Complete" })).toBe("Working to Complete");
    expect(workstreamBarStatus({ completed: false, workstreamStatus: "" })).toBe("Not set");
  });
});