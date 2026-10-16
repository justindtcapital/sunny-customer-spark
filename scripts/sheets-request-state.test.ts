import { beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ request: new Request("https://example.com/first") }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => context.request }));
import { createRequestState } from "../src/utils/request-state.server";
import { sheetsFetch } from "../src/utils/sheets.server";

beforeEach(() => {
  context.request = new Request("https://example.com/first");
  vi.restoreAllMocks();
});

describe("Sheets request isolation", () => {
  it("deduplicates state within a request without sharing pending work across requests", () => {
    const state = createRequestState(() => ({ pending: Promise.resolve() }));
    const first = state();
    expect(state()).toBe(first);
    context.request = new Request("https://example.com/second");
    expect(state()).not.toBe(first);
  });

  it("lets a new request save even when a previous request's write never settles", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(new Response("saved"));
    const first = sheetsFetch("https://sheets.googleapis.com/first", { method: "PUT" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    context.request = new Request("https://example.com/second");
    const second = await sheetsFetch("https://sheets.googleapis.com/second", { method: "PUT" });
    expect(await second.text()).toBe("saved");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveFirst?.(new Response("finished"));
    await first;
  });

  it("attaches a deadline and preserves caller cancellation on upstream requests", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await sheetsFetch("https://sheets.googleapis.com/read", { signal: controller.signal });
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });
});