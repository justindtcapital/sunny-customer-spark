import { getRequest } from "@tanstack/react-start/server";

/** Pending I/O belongs to its originating request, never a reused Worker isolate. */
export function createRequestState<T>(create: () => T): () => T {
  const states = new WeakMap<Request, T>();
  return () => {
    let request: Request;
    try {
      request = getRequest();
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