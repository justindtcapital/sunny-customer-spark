import { useMemo, useState } from "react";
import type { MatrixPoint } from "@/lib/portco-matrix";
import { bubbleRadius } from "@/lib/portco-matrix";
import { formatInvestment, formatOwnership, ownershipLayout, type AxisKind } from "@/lib/portco-ownership";
import { Bubble } from "@/components/dashboard/PortcoMatrix";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const W = 1100;
const H = 594;
const PAD = { top: 24, right: 40, bottom: 58, left: 80 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;
/** Keeps the largest logo circles inside the plot at the ends of each axis. */
const INSET = 30;
/** Width of the left "Under $2M" column in the log view. */
const BAND = 90;
/** Height of the bottom "Under 1%" row in the log view. */
const LOW_H = 104;
/** Vertical nudge between crowded companies in that row. */
const STRIP_DY = 11;

/** Alternates two rows so crowded companies in the bottom row don't stack exactly. */
function stripOffsets(
  points: MatrixPoint[],
  cxOf: (p: MatrixPoint) => number,
): Map<string, number> {
  const sorted = [...points].sort((a, b) => cxOf(a) - cxOf(b));
  const ends = [-Infinity, -Infinity];
  const out = new Map<string, number>();
  for (const p of sorted) {
    const r = bubbleRadius(p.investment);
    const cx = cxOf(p);
    const row = cx - r >= ends[0] ? 0 : cx - r >= ends[1] ? 1 : ends[0] <= ends[1] ? 0 : 1;
    ends[row] = cx + r;
    out.set(p.key, row === 0 ? -STRIP_DY : STRIP_DY);
  }
  return out;
}

/** DTC invested dollars (x) vs DTC ownership % (y), same logo circles as the maturity view. */
export function OwnershipMatrix({
  points,
  visible,
  selectedKey,
  onSelect,
  compact = false,
}: {
  points: MatrixPoint[];
  /** Keys passing the page filters; others are dimmed. */
  visible?: (p: MatrixPoint) => boolean;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  compact?: boolean;
}) {
  const [scale, setScale] = useState<AxisKind>("log");
  const layout = useMemo(() => ownershipLayout(points, scale), [points, scale]);
  const xa = layout.investment;
  const ya = layout.ownership;
  const band = layout.lowBandBelow != null ? BAND : 0;
  const lowH = layout.lowOwnershipBelow != null ? LOW_H : 0;
  const plotLeft = PAD.left + band;
  const plotBottom = PAD.top + PH - lowH;
  const x = (v: number) => plotLeft + INSET + xa.unit(v) * (PW - band - 2 * INSET);
  const bandX = PAD.left + BAND / 2;
  const stripY = PAD.top + PH - lowH / 2;
  const isLow = (p: MatrixPoint) => layout.lowBandBelow != null && (p.investment ?? 0) < layout.lowBandBelow;
  const isLowOwn = (p: MatrixPoint) => layout.lowOwnershipBelow != null && (p.ownership ?? 0) < layout.lowOwnershipBelow;
  const cxOf = (p: MatrixPoint) => (isLow(p) ? bandX : x(p.investment ?? 0));
  const stripDy = layout.lowOwnership.length ? stripOffsets(layout.lowOwnership, cxOf) : new Map<string, number>();
  const y = (v: number) => plotBottom - INSET - ya.unit(v) * (PH - lowH - 2 * INSET);
  const logNote = scale === "log" ? " · log scale" : "";
  return (
    <div>
      {!compact && (
        <div className="flex justify-end mb-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={scale}
            onValueChange={(v) => v && setScale(v as AxisKind)}
            aria-label="Axis scale"
          >
            <ToggleGroupItem value="log" className="text-xs px-3">Log scale</ToggleGroupItem>
            <ToggleGroupItem value="linear" className="text-xs px-3">Linear scale</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onClick={() => onSelect(null)} role="img" aria-label="Ownership and investment chart">
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + PH} y2={PAD.top + PH} stroke="var(--border)" />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PH} stroke="var(--border)" />
        {band > 0 && (
          <>
            <rect x={PAD.left} y={PAD.top} width={BAND} height={PH} fill="var(--muted)" opacity={0.5} />
            <line x1={plotLeft} x2={plotLeft} y1={PAD.top} y2={PAD.top + PH} stroke="var(--border)" />
            {!compact && (
              <text x={bandX} y={PAD.top + PH + 20} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
                Under {formatInvestment(layout.lowBandBelow ?? 0)}
              </text>
            )}
          </>
        )}
        {lowH > 0 && (
          <>
            <rect x={plotLeft} y={plotBottom} width={PW - band} height={lowH} fill="var(--muted)" opacity={0.5} />
            <line x1={PAD.left} x2={W - PAD.right} y1={plotBottom} y2={plotBottom} stroke="var(--border)" />
            {!compact && (
              <text x={PAD.left - 10} y={stripY} dy="0.35em" textAnchor="end" className="fill-muted-foreground" fontSize={11}>
                Under {formatOwnership(layout.lowOwnershipBelow ?? 0)}
              </text>
            )}
          </>
        )}
        {ya.ticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" />
            {!compact && (
              <text x={PAD.left - 10} y={y(t)} dy="0.35em" textAnchor="end" className="fill-muted-foreground" fontSize={12}>
                {formatOwnership(t)}
              </text>
            )}
          </g>
        ))}
        {xa.ticks.map((t) => (
          <g key={`x${t}`}>
            <line y1={PAD.top} y2={plotBottom} x1={x(t)} x2={x(t)} stroke="var(--border)" strokeDasharray="3 4" />
            {!compact && (
              <text x={x(t)} y={PAD.top + PH + 20} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
                {formatInvestment(t)}
              </text>
            )}
          </g>
        ))}
        {!compact && (
          <>
            <text x={PAD.left + PW / 2} y={H - 10} textAnchor="middle" className="fill-foreground font-medium" fontSize={13}>DTC invested ($M){logNote}</text>
            <text transform={`translate(20 ${PAD.top + PH / 2}) rotate(-90)`} textAnchor="middle" className="fill-foreground font-medium" fontSize={13}>DTC ownership{logNote}</text>
          </>
        )}
        {layout.plotted.map((p) => (
          <Bubble
            key={p.key}
            p={p}
            cx={cxOf(p)}
            cy={isLowOwn(p) ? stripY + (stripDy.get(p.key) ?? 0) : y(p.ownership ?? 0)}
            dim={visible ? !visible(p) : false}
            active={selectedKey === p.key}
            onSelect={() => onSelect(selectedKey === p.key ? null : p.key)}
            onHover={() => {}}
          />
        ))}
      </svg>
      {!compact && layout.notPlotted.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          <span className="font-medium text-foreground">Not plotted</span> (no investment or ownership in Asana):{" "}
          {layout.notPlotted.map((p) => p.name).join(", ")}
        </p>
      )}
    </div>
  );
}
