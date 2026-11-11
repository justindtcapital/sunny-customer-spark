import { describe, expect, it } from "vitest";
import { asanaReadPath, clipJson } from "./vic-asana";

describe("asanaReadPath", () => {
  it("accepts relative API paths with query strings", () => {
    expect(asanaReadPath("/tasks/123?opt_fields=name,notes")).toBe("/tasks/123?opt_fields=name,notes");
    expect(asanaReadPath("projects/42/tasks")).toBe("/projects/42/tasks");
    expect(asanaReadPath("/api/1.0/users/me")).toBe("/users/me");
  });
  it("rejects absolute URLs, traversal and whitespace", () => {
    expect(asanaReadPath("https://evil.example/x")).toBeNull();
    expect(asanaReadPath("//evil.example/x")).toBeNull();
    expect(asanaReadPath("/tasks/../users")).toBeNull();
    expect(asanaReadPath("/tasks/1 2")).toBeNull();
    expect(asanaReadPath("")).toBeNull();
  });
});

describe("clipJson", () => {
  it("marks long payloads as truncated", () => {
    expect(clipJson({ a: "x".repeat(50) }, 20).truncated).toBe(true);
    expect(clipJson({ a: 1 }, 20)).toEqual({ json: '{"a":1}', truncated: false });
  });
});
