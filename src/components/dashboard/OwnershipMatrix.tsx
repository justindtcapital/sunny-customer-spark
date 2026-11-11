import { useMemo } from "react";
import type { MatrixPoint } from "@/lib/portco-matrix";
import { ownershipLayout } from "@/lib/portco-ownership";
import { Bubble } from "@/components/dashboard/PortcoMatrix";

const W = 1100;
const H = 594;
const PAD = { top: 24, right: 40, bottom: 58, left: 80 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

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
  const layout = useMemo(() => ownershipLayout(points), [points]);
  const x = (v: number) => PAD.left + (v / layout.maxInvestment) * PW;
  const y = (v: number) => PAD.top + PH - (v / layout.maxOwnership) * PH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onClick={() => onSelect(null)} role="img" aria-label="Ownership and investment chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t * layout.maxOwnership)} y2={y(t * layout.maxOwnership)} stroke="var(--border)" strokeDasharray={t ? "3 4" : undefined} />
            <line y1={PAD.top} y2={PAD.top + PH} x1={x(t * layout.maxInvestment)} x2={x(t * layout.maxInvestment)} stroke="var(--border)" strokeDasharray={t ? "3 4" : undefined} />
            {!compact && (
              <>
                <text x={PAD.left - 10} y={y(t * layout.maxOwnership)} dy="0.35em" textAnchor="end" className="fill-muted-foreground" fontSize={12}>
                  {(t * layout.maxOwnership * 100).toFixed(1).replace(/\.0$/, "")}%
                </text>
                <text x={x(t * layout.maxInvestment)} y={PAD.top + PH + 20} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
                  ${(t * layout.maxInvestment).toFixed(1).replace(/\.0$/, "")}M
                </text>
              </>
            )}
          </g>
        ))}
        {!compact && (
          <>
            <text x={PAD.left + PW / 2} y={H - 10} textAnchor="middle" className="fill-foreground font-medium" fontSize={13}>DTC invested ($M)</text>
            <text transform={`translate(20 ${PAD.top + PH / 2}) rotate(-90)`} textAnchor="middle" className="fill-foreground font-medium" fontSize={13}>DTC ownership</text>
          </>
        )}
        {layout.plotted.map((p) => (
          <Bubble
            key={p.key}
            p={p}
            cx={x(p.investment ?? 0)}
            cy={y(p.ownership ?? 0)}
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
