import { describe, expect, it } from "vitest";
import { classifyImportRows, normalizePhone } from "./import-preflight";

const r = (name: string, email: string, phone = "") => ({ name, email, phone });

describe("import pre-flight", () => {
  it("keeps the + on phone numbers", () => {
    expect(normalizePhone(" +1-416-555-0100 ")).toBe("+1-416-555-0100");
    expect(normalizePhone("'+44 20 7946 0000")).toBe("+44 20 7946 0000");
  });
  it("flags emails missing a domain ending for attention", () => {
    const [item] = classifyImportRows([r("John", "john@company")], []);
    expect(item.status).toBe("attention");
  });
  it("marks people already in contacts as existing, not ready", () => {
    const [item] = classifyImportRows([r("Eugene", "Eugene@x.com")], ["eugene@x.com"]);
    expect(item.status).toBe("existing");
  });
  it("skips a repeated email within the same file", () => {
    const items = classifyImportRows([r("A", "a@x.com"), r("A2", "A@x.com")], []);
    expect(items.map(i => i.status)).toEqual(["ready", "skipped"]);
  });
  it("an on-screen fix makes a flagged row ready", () => {
    const [item] = classifyImportRows([r("John", "john@company")], [], { 0: { email: "john@company.com" } });
    expect(item.status).toBe("ready");
  });
  it("a row the user skips is never ready", () => {
    const [item] = classifyImportRows([r("A", "a@x.com")], [], { 0: { skip: true } });
    expect(item.status).toBe("skipped");
  });
});
