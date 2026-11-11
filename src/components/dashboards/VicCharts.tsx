// "Build a chart with V.I.C.": V.I.C. drafts a ChartSpec, the teammate reviews the live
// preview, then saves it for the whole team (Cloud dashboard_charts, shared read).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, Sparkles, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { draftDashboardChart } from "@/utils/dashboard-charts.functions";
import { CHART_DATASETS, buildChartData, chartSpecSchema, datasetsFor, describeSpec, specProblems, type ChartRecord, type ChartSpec, type DashboardKey, type DatasetKey } from "@/lib/dashboard-charts";
import { canonicalOwnerName } from "@/lib/user-ownership";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--planner-sky)", "var(--planner-lime)", "var(--planner-rose)", "var(--planner-amber)", "var(--planner-violet)"];
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tip = { background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 };

export type DatasetRecords = Partial<Record<DatasetKey, ChartRecord[]>>;

/** Live chart from a spec over real rows. */
export function SpecChart({ spec, records, colorFor, height = 260 }: { spec: ChartSpec; records: ChartRecord[]; colorFor?: (series: string) => string | undefined; height?: number }) {
  const data = useMemo(() => buildChartData(records, spec), [records, spec]);
  const color = (s: string, i: number) => colorFor?.(s) ?? PALETTE[i % PALETTE.length];
  if (!data.rows.length) return <p className="text-xs text-muted-foreground py-10 text-center">No matching rows for this chart.</p>;
  if (spec.chart === "pie") {
    const slices = data.rows.map((r) => ({ name: r.label, value: r.total }));
    return <ResponsiveContainer width="100%" height={height}><PieChart>
      <Pie data={slices} dataKey="value" nameKey="name" outerRadius="75%" label={{ fontSize: 11 }}>{slices.map((s, i) => <Cell key={s.name} fill={color(s.name, i)} />)}</Pie>
      <Tooltip contentStyle={tip} />
    </PieChart></ResponsiveContainer>;
  }
  const keys = spec.series ? data.series : ["value"];
  const legend = spec.series ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null;
  if (spec.chart === "line") {
    return <ResponsiveContainer width="100%" height={height}><LineChart data={data.rows} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
      <Tooltip contentStyle={tip} />{legend}
      {keys.map((k, i) => <Line key={k} dataKey={k} name={k === "value" ? spec.measure === "sum" ? spec.sumField || "total" : "count" : k} stroke={color(k, i)} strokeWidth={2} dot={false} />)}
    </LineChart></ResponsiveContainer>;
  }
  const angled = data.rows.length > 6 || data.rows.some((r) => r.label.length > 14);
  return <ResponsiveContainer width="100%" height={height + (angled ? 40 : 0)}><BarChart data={data.rows} margin={{ top: 8, right: 12, left: angled ? 24 : -16, bottom: 0 }}>
    <CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={0} angle={angled ? -30 : 0} textAnchor={angled ? "end" : "middle"} height={angled ? 90 : 30} tickFormatter={(l: string) => (l.length > 22 ? `${l.slice(0, 21)}…` : l)} />
    <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
    <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tip} />{legend}
    {keys.map((k, i) => <Bar key={k} dataKey={k} name={k === "value" ? spec.measure === "sum" ? spec.sumField || "total" : "count" : k} stackId={spec.chart === "stacked" || spec.series ? "s" : undefined} fill={color(k, i)}>
      {!spec.series && data.rows.map((r) => <Cell key={r.label} fill={colorFor?.(r.label) ?? PALETTE[0]} />)}
    </Bar>)}
  </BarChart></ResponsiveContainer>;
}

/** Up to 15 most common values per field, so V.I.C. can filter with exact spelling. */
function samplesFor(records: DatasetRecords): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const [k, rows] of Object.entries(records) as [DatasetKey, ChartRecord[]][]) {
    out[k] = {};
    for (const field of Object.keys(CHART_DATASETS[k].fields)) {
      const n = new Map<string, number>();
      for (const r of rows) { const v = r[field]; for (const x of Array.isArray(v) ? v : v === undefined || v === "" ? [] : [String(v)]) n.set(String(x).slice(0, 80), (n.get(String(x).slice(0, 80)) || 0) + 1); }
      out[k][field] = [...n].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([v]) => v);
    }
  }
  return out;
}

interface SavedChart { id: string; title: string; prompt: string; spec: ChartSpec; createdBy: string; userId: string; createdAt: string }

export function VicChartBuilder({ dashboard, records, colorFor, loading = false }: { dashboard: DashboardKey; records: DatasetRecords; colorFor?: (series: string) => string | undefined; loading?: boolean }) {
  const draft = useServerFn(draftDashboardChart);
  const queryClient = useQueryClient();
  const { email } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const examples = dashboard === "events"
    ? ["Attendees by event type this year", "Events per month split by DTC status", "Which cities host Dell-led events?"]
    : ["Outreach per week by source", "Promotions by owner over the last 6 months", "People by market split by level"];

  const userQuery = useQuery({ queryKey: ["auth-user-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null, staleTime: Infinity });
  const savedQuery = useQuery({
    queryKey: ["dashboard-charts", dashboard],
    queryFn: async (): Promise<SavedChart[]> => {
      const { data, error } = await supabase.from("dashboard_charts").select("id, title, prompt, spec, created_by, user_id, created_at").eq("dashboard", dashboard).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []).flatMap((r) => {
        const parsed = chartSpecSchema.safeParse(r.spec);
        return parsed.success ? [{ id: r.id, title: r.title, prompt: r.prompt, spec: parsed.data, createdBy: r.created_by, userId: r.user_id, createdAt: r.created_at }] : [];
      });
    },
  });

  const build = async (text: string, refine: boolean) => {
    const p = text.trim();
    if (p.length < 3) return;
    setBusy(true); setError(null);
    try {
      const res = await draft({ data: { dashboard, prompt: p, samples: samplesFor(records), current: refine ? spec : null } });
      if (res.error || !res.spec) { setError(res.error || "V.I.C. couldn't build that chart."); return; }
      setSpec(res.spec); setLastPrompt(refine && lastPrompt ? `${lastPrompt} — then: ${p}` : p); setPrompt("");
    } catch (e) {
      setError(e instanceof Error && /sign-in/i.test(e.message) ? "Please sign in again to build charts." : "V.I.C. couldn't build that chart. Try again.");
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!spec || specProblems(spec, dashboard).length) return;
    setSaving(true);
    const { error } = await supabase.from("dashboard_charts").insert({ dashboard, title: spec.title, prompt: lastPrompt, spec: spec as unknown as Json, created_by: canonicalOwnerName(email) || email || "" });
    setSaving(false);
    if (error) { toast.error("Couldn't save the chart"); return; }
    toast.success("Chart saved for the team");
    setSpec(null); setLastPrompt("");
    await queryClient.invalidateQueries({ queryKey: ["dashboard-charts", dashboard] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("dashboard_charts").delete().eq("id", id);
    if (error) { toast.error("Couldn't remove the chart"); return; }
    await queryClient.invalidateQueries({ queryKey: ["dashboard-charts", dashboard] });
  };

  const available = datasetsFor(dashboard).map((k) => CHART_DATASETS[k].label.toLowerCase()).join(", ");
  return (
    <section className="space-y-4" aria-label="Charts built with V.I.C.">
      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <h2 className="font-display text-sm font-semibold text-foreground">Build a chart with V.I.C.</h2>
              <p className="text-xs text-muted-foreground">Describe the view you want using {available}. You'll see it before anything is saved; saved charts are shared with the team.</p>
            </div>
          </div>
          <Textarea aria-label="Describe a chart" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder={spec ? "Ask for a change, e.g. 'split by owner' or 'only the last 30 days'" : `e.g. ${examples[0]}`}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) build(prompt, !!spec); }} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => build(prompt, !!spec)} disabled={busy || loading || prompt.trim().length < 3}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{spec ? "Change chart" : "Build chart"}
            </Button>
            {!spec && examples.map((ex) => <Button key={ex} size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={busy || loading} onClick={() => { setPrompt(ex); build(ex, false); }}>{ex}</Button>)}
            {loading && <span className="text-xs text-muted-foreground">Loading data…</span>}
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {spec && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground">{spec.title}</h3>
                  <p className="text-[11px] text-muted-foreground">{describeSpec(spec)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save to dashboard</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSpec(null); setLastPrompt(""); setError(null); }}><X />Discard</Button>
                </div>
              </div>
              <SpecChart spec={spec} records={records[spec.dataset] || []} colorFor={colorFor} />
            </div>
          )}
        </CardContent>
      </Card>
      {savedQuery.data && savedQuery.data.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-display text-sm font-semibold text-foreground">Team charts</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {savedQuery.data.map((c) => (
              <Card key={c.id} className="border-border"><CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-semibold text-foreground truncate">{c.title}</h3>
                    <p className="text-[11px] text-muted-foreground">{describeSpec(c.spec)}{c.createdBy ? ` · by ${canonicalOwnerName(c.createdBy)}` : ""}</p>
                  </div>
                  {userQuery.data === c.userId && <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Remove ${c.title}`} onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
                <SpecChart spec={c.spec} records={records[c.spec.dataset] || []} colorFor={colorFor} height={220} />
              </CardContent></Card>
            ))}
          </div>
        </div>
      )}
      {savedQuery.error && <p className="text-xs text-muted-foreground">Saved team charts are unavailable right now.</p>}
    </section>
  );
}
