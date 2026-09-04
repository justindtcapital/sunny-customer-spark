import { useMemo, useState } from "react";
import {
  bubbleRadius,
  GTM_LABELS,
  SALES_LABELS,
  type MatrixPoint,
} from "@/lib/portco-matrix";
import { companyLogoSources, resolveCompanyLogoDomain } from "@/lib/domain-utils";

interface Props {
  points: MatrixPoint[];
  /** Selected investor ("" = all). Non-matching companies are hidden. */
  investor: string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

const W = 1100;
const H = 660;
const PAD = { top: 40, right: 160, bottom: 66, left: 150 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const x = (v: number) => PAD.left + ((v - 0.6) / 4.8) * PLOT_W;
const y = (v: number) => PAD.top + PLOT_H - ((v - 0.6) / 4.8) * PLOT_H;

const ZONES = [
  {
    label: "GTM Assist",
    x0: 0.8,
    x1: 3.2,
    y0: 0.8,
    y1: 3.15,
    color: "oklch(0.62 0.14 300)",
  },
  {
    label: "BD & Exposure Assist",
    x0: 2.6,
    x1: 4.3,
    y0: 1.75,
    y1: 4.55,
    color: "oklch(0.68 0.15 128)",
  },
  {
    label: "Power of Association",
    x0: 3.75,
    x1: 5.25,
    y0: 3.7,
    y1: 5.35,
    color: "oklch(0.65 0.2 20)",
  },
];

/** Deterministic spread so companies sharing a cell don't stack exactly. */
function offsetFor(index: number): { dx: number; dy: number } {
  const golden = 2.399963;
  const a = index * golden;
  const r = 25 * Math.sqrt(index);
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

function Bubble({
  p,
  cx,
  cy,
  dim,
  active,
  onSelect,
  onHover,
}: {
  p: MatrixPoint;
  cx: number;
  cy: number;
  dim: boolean;
  active: boolean;
  onSelect: () => void;
  onHover: (v: MatrixPoint | null) => void;
}) {
  const [srcIdx, setSrcIdx] = useState(0);
  const resolved = resolveCompanyLogoDomain({ website: p.website, company: p.name });
  const sources = resolved ? companyLogoSources(resolved.domain, resolved.confidence) : [];
  const src = sources[srcIdx];
  const r = bubbleRadius(p.investment);
  const id = `logo-${p.key.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <g
      transform={`translate(${cx} ${cy})`}
      opacity={dim ? 0.18 : 1}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseEnter={() => onHover(p)}
      onMouseLeave={() => onHover(null)}
    >
      <clipPath id={id}>
        <circle r={r - 2} />
      </clipPath>
      <circle
        r={r}
        fill="var(--card)"
        stroke={active ? "var(--primary)" : "var(--border)"}
        strokeWidth={active ? 2.5 : 1.25}
      />
      {src ? (
        <image
          href={src}
          x={-(r - 2)}
          y={-(r - 2)}
          width={(r - 2) * 2}
          height={(r - 2) * 2}
          clipPath={`url(#${id})`}
          preserveAspectRatio="xMidYMid slice"
          onError={() => setSrcIdx((i) => i + 1)}
        />
      ) : (
        <text
          textAnchor="middle"
          dy="0.35em"
          className="fill-foreground font-semibold"
          fontSize={Math.max(9, r * 0.55)}
        >
          {p.name.slice(0, 2).toUpperCase()}
        </text>
      )}
    </g>
  );
}

export function PortcoMatrix({ points, investor, selectedKey, onSelect }: Props) {
  const [hover, setHover] = useState<MatrixPoint | null>(null);

  const { plotted, unscored } = useMemo(() => {
    const plotted: { p: MatrixPoint; cx: number; cy: number }[] = [];
    const unscored: MatrixPoint[] = [];
    const cellCount = new Map<string, number>();
    for (const p of points) {
      if (p.gtm === null || p.sales === null) {
        unscored.push(p);
        continue;
      }
      const cell = `${p.gtm}:${p.sales}`;
      const idx = cellCount.get(cell) ?? 0;
      cellCount.set(cell, idx + 1);
      const { dx, dy } = offsetFor(idx);
      const r = bubbleRadius(p.investment);
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      plotted.push({
        p,
        cx: clamp(x(p.gtm) + dx, PAD.left + r, PAD.left + PLOT_W - r),
        cy: clamp(y(p.sales) + dy, PAD.top + r, PAD.top + PLOT_H - r),
      });

    }
    return { plotted, unscored };
  }, [points]);

  const isDim = (p: MatrixPoint) => !!selectedKey && p.key !== selectedKey;
  const hiddenByInvestor = (p: MatrixPoint) => !!investor && p.investor !== investor;


  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="PortCo prioritization by sales maturity, GTM maturity and investment"
        onClick={() => onSelect(null)}
      >
        <text
          x={W / 2}
          y={20}
          textAnchor="middle"
          className="fill-foreground font-medium"
          fontSize={14}
        >
          PortCo Prioritization: Sales Maturity / GTM Maturity / Investment
        </text>

        {/* horizontal gridlines at each sales level */}
        {[1, 2, 3, 4, 5].map((v) => (
          <line
            key={v}
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* zones */}
        {ZONES.map((z) => (
          <g key={z.label}>
            <rect
              x={x(z.x0)}
              y={y(z.y1)}
              width={x(z.x1) - x(z.x0)}
              height={y(z.y0) - y(z.y1)}
              rx={22}
              fill="none"
              stroke={z.color}
              strokeWidth={1.25}
              strokeDasharray="6 5"
              opacity={0.75}
            />
            <text
              x={x(z.x0) + 12}
              y={y(z.y1) - 8}
              fontSize={12}
              fontWeight={600}
              fill={z.color}
            >
              {z.label}
            </text>
          </g>
        ))}

        {/* axes */}
        <line
          x1={PAD.left}
          x2={PAD.left}
          y1={PAD.top}
          y2={PAD.top + PLOT_H}
          stroke="var(--primary)"
          strokeWidth={1.5}
        />
        <line
          x1={PAD.left}
          x2={PAD.left + PLOT_W}
          y1={PAD.top + PLOT_H + 18}
          y2={PAD.top + PLOT_H + 18}
          stroke="var(--primary)"
          strokeWidth={1.5}
        />

        {SALES_LABELS.map((label, i) => (
          <text
            key={label}
            x={PAD.left - 12}
            y={y(i + 1)}
            textAnchor="end"
            dy="0.35em"
            fontSize={11}
            className="fill-muted-foreground"
          >
            {label}
          </text>
        ))}
        {GTM_LABELS.map((label, i) => (
          <text
            key={label}
            x={x(i + 1)}
            y={PAD.top + PLOT_H + 38}
            textAnchor="middle"
            fontSize={11}
            className="fill-muted-foreground"
          >
            {label}
          </text>
        ))}
        <text
          x={PAD.left + PLOT_W / 2}
          y={H - 6}
          textAnchor="middle"
          fontSize={12}
          className="fill-foreground"
        >
          GTM Maturity (PMF) Score
        </text>
        <text
          x={22}
          y={PAD.top + PLOT_H / 2}
          textAnchor="middle"
          fontSize={12}
          className="fill-foreground"
          transform={`rotate(-90 22 ${PAD.top + PLOT_H / 2})`}
        >
          Sales Maturity Score
        </text>

        {/* bubbles — larger first so small ones stay clickable on top */}
        {[...plotted]
          .filter(({ p }) => !hiddenByInvestor(p))
          .sort((a, b) => (b.p.investment ?? 0) - (a.p.investment ?? 0))
          .map(({ p, cx, cy }) => (
            <Bubble
              key={p.key}
              p={p}
              cx={cx}
              cy={cy}
              dim={isDim(p)}
              active={selectedKey === p.key}
              onSelect={() => onSelect(selectedKey === p.key ? null : p.key)}
              onHover={setHover}
            />
          ))}

        {/* investment legend */}
        <g transform={`translate(${PAD.left + PLOT_W + 18} ${PAD.top + PLOT_H - 96})`}>
          <text fontSize={10} className="fill-muted-foreground" y={-10}>
            Invested
          </text>
          {[
            { label: "Under $5M", v: 3 },
            { label: "$5–15M", v: 10 },
            { label: "$15M+", v: 25 },
          ].map((s, i) => (
            <g key={s.label} transform={`translate(0 ${i * 32})`}>
              <circle
                cx={bubbleRadius(s.v) / 2 + 4}
                cy={12}
                r={bubbleRadius(s.v) / 2}
                fill="none"
                stroke="var(--border)"
              />
              <text x={44} y={16} fontSize={10} className="fill-muted-foreground">
                {s.label}
              </text>
            </g>
          ))}
        </g>

        {hover && (
          <g pointerEvents="none">
            <rect
              x={PAD.left + 6}
              y={PAD.top + 4}
              width={280}
              height={44}
              rx={8}
              fill="var(--popover)"
              stroke="var(--border)"
            />
            <text x={PAD.left + 18} y={PAD.top + 22} fontSize={12} className="fill-foreground">
              {hover.name}
            </text>
            <text
              x={PAD.left + 18}
              y={PAD.top + 38}
              fontSize={10}
              className="fill-muted-foreground"
            >
              {`Sales ${hover.sales ?? "—"} · GTM ${hover.gtm ?? "—"}`}
              {hover.investment !== null ? ` · $${hover.investment}M` : ""}
              {hover.investor ? ` · ${hover.investor}` : ""}
            </text>
          </g>
        )}
      </svg>

      {unscored.length > 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            Not scored yet in Asana ({unscored.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscored.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => onSelect(selectedKey === p.key ? null : p.key)}
                className={`text-[11px] rounded-full border px-2 py-0.5 transition-colors ${
                  selectedKey === p.key
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:bg-accent"
                } ${investor && p.investor !== investor ? "opacity-40" : ""}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
