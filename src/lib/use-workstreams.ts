// Shared client-side loader for Asana workstreams (subtasks under each portco
// task). Module-level cache + in-flight promise dedupe the fetch across panels;
// the server read is itself cached 5 min. Refreshes once per page load.

import { useCallback, useEffect, useState } from "react";
import { fetchPortcoWorkstreamsFn } from "@/utils/asana.functions";
import type { Workstream } from "@/lib/workstream-parse";

let cache: Workstream[] | null = null;
let inflight: Promise<Workstream[]> | null = null;

function load(): Promise<Workstream[]> {
  if (!inflight) {
    inflight = fetchPortcoWorkstreamsFn()
      .then((w) => {
        cache = w;
        return w;
      })
      .catch(() => {
        cache = [];
        return [] as Workstream[];
      });
  }
  return inflight;
}

export function useWorkstreams() {
  const [workstreams, setWorkstreams] = useState<Workstream[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (cache !== null) return;
    let cancelled = false;
    load().then((w) => {
      if (!cancelled) {
        setWorkstreams(w);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    cache = null;
    inflight = null;
    setLoading(true);
    const w = await load();
    setWorkstreams(w);
    setLoading(false);
  }, []);

  return { workstreams, loading, refresh };
}
