import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// The factory can be imported transitively; the request API cannot enter the browser.
const currentRequest = createServerOnlyFn(() => getRequest());

/** Pending I/O belongs to its originating request, never a reused Worker isolate. */
export function createRequestState<T>(create: () => T): () => T {
  const states = new WeakMap<Request, T>();
  return () => {
    let request: Request;
    try {
      request = currentRequest();
    } catch {
      // Standalone scripts have no HTTP lifecycle; don't share pending work there.
      return create();
    }
    let state = states.get(request);
    if (!state) {
      state = create();
      states.set(request, state);
    }
    return state;
  };
}