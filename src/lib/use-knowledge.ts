// Shared client-side loader for Knowledge Base data (records, harvested
// activities, workstream links, suggested contacts). Module-level cache +
// in-flight dedupe, same pattern as use-workstreams.

import { useCallback, useEffect, useState } from "react";
import { fetchKnowledgeDataFn } from "@/utils/knowledge.functions";
import type {
  HarvestedActivity,
  KnowledgeRecord,
  SuggestedContact,
  WorkstreamLink,
} from "@/utils/knowledge.server";

export interface KnowledgeData {
  records: KnowledgeRecord[];
  activities: HarvestedActivity[];
  links: WorkstreamLink[];
  suggested: SuggestedContact[];
}

const EMPTY: KnowledgeData = { records: [], activities: [], links: [], suggested: [] };

let cache: KnowledgeData | null = null;
let inflight: Promise<KnowledgeData> | null = null;

function load(): Promise<KnowledgeData> {
  if (!inflight) {
    inflight = fetchKnowledgeDataFn()
      .then((d) => {
        cache = d;
        return d;
      })
      .catch(() => {
        cache = EMPTY;
        return EMPTY;
      });
  }
  return inflight;
}

export function useKnowledge() {
  const [data, setData] = useState<KnowledgeData>(cache ?? EMPTY);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (cache !== null) return;
    let cancelled = false;
    load().then((d) => {
      if (!cancelled) {
        setData(d);
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
    const d = await load();
    setData(d);
    setLoading(false);
  }, []);

  return { ...data, loading, refresh };
}

/** Is this record about this company? Handles multi-PortCo tags ("Skan, MavenAGI") and spacing variants. */
export function portcoMatches(recordPortco: string, company: string): boolean {
  const a = (recordPortco || "").trim().toLowerCase();
  const b = (company || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const compact = (x: string) => x.replace(/[^a-z0-9]/g, "");
  const cb = compact(b);
  return a.split(/[,;|]/).some((part) => { const cp = compact(part); return !!cp && (cp === cb || (cp.length > 3 && (cp.includes(cb) || cb.includes(cp)))); });
}
