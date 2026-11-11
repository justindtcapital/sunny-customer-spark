import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";
import { CHART_DATASETS, chartSpecSchema, datasetsFor, specProblems, type ChartSpec, type DatasetDef } from "@/lib/dashboard-charts";

const input = z.object({
  dashboard: z.enum(["events", "network"]),
  prompt: z.string().trim().min(3).max(1000),
  /** A few real values per field so filters use exact spelling. */
  samples: z.record(z.record(z.array(z.string().max(80)).max(25))).optional(),
  /** The chart being refined, if any. */
  current: chartSpecSchema.nullable().optional(),
});

/** V.I.C. describes a chart (never code, never data); a teammate reviews it before saving. */
export const draftDashboardChart = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: z.input<typeof input>) => input.parse(d))
  .handler(async ({ data }): Promise<{ spec: ChartSpec | null; error: string | null }> => {
    const { generateText, Output } = await import("ai");
    const { createVicProvider } = await import("./vic-ai.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const catalog = datasetsFor(data.dashboard).map((k) => {
      const def: DatasetDef = CHART_DATASETS[k];
      const samples = data.samples?.[k] || {};
      return [
        `Dataset "${k}" (${def.label}): ${def.description}`,
        ...Object.entries(def.fields).map(([f, d]) => `  - ${f}: ${d}${samples[f]?.length ? ` e.g. ${samples[f].slice(0, 12).join(" | ")}` : ""}`),
        ...Object.entries(def.numbers || {}).map(([f, d]) => `  - ${f} (number field — only valid as sumField): ${d}`),
      ].join("\n");
    }).join("\n\n");
    const system = [
      "You are V.I.C., DTC's assistant. Turn the teammate's request into ONE chart description over the datasets below.",
      "Use only listed datasets and field names. x is the grouping field; series optionally splits bars (use chart 'stacked' when series is set, 'line' for trends over a time field, 'pie' only for a few parts of a whole).",
      "measure 'count' counts rows; 'sum' adds a listed number field (sumField). Filters must use exact example values when given.",
      "days limits to the last N days for dated datasets (null = all dates; people has no dates, use null). limit caps categories (null = default).",
      "Write a short plain title. Never invent data.",
      "",
      catalog,
    ].join("\n");
    const prompt = data.current
      ? `Current chart: ${JSON.stringify(data.current)}\nChange it as follows: ${data.prompt}`
      : data.prompt;
    try {
      const { provider } = createVicProvider(getRequest());
      const result = await generateText({
        model: provider.responses("openai/gpt-6-astra"),
        system,
        prompt,
        output: Output.object({ schema: chartSpecSchema }),
        providerOptions: { openai: { store: false, reasoningEffort: "low" } },
      });
      const raw = result.output as ChartSpec;
      const clean = (f: string | null) => (f ? f.replace(/^(number|field)\s+/i, "").trim() : f);
      const spec: ChartSpec = { ...raw, x: clean(raw.x) || raw.x, series: clean(raw.series), sumField: clean(raw.sumField) };
      const problems = specProblems(spec, data.dashboard);
      if (problems.length) return { spec: null, error: `V.I.C. couldn't build that chart: ${problems.join(" ")}` };
      return { spec, error: null };
    } catch (e) {
      console.error("draftDashboardChart failed", e);
      const msg = e instanceof Error ? e.message : "";
      if (/429|rate/i.test(msg)) return { spec: null, error: "V.I.C. is busy right now. Try again in a minute." };
      if (/402|credit/i.test(msg)) return { spec: null, error: "AI credits have run out for this workspace." };
      return { spec: null, error: "V.I.C. couldn't build that chart. Try describing it differently." };
    }
  });
