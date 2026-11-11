import type { ContactType, Temperature } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PulseTemperature } from "@/components/pulse/PulseRing";

interface TemperatureBadgeProps {
  temperature: Temperature;
  className?: string;
  /** Prefer Pulse mark (default). Set false for legacy pill only. */
  pulse?: boolean;
  showLabel?: boolean;
  /** PortCo people show a PortCo tag instead of a Network tier. */
  portco?: boolean;
  prospect?: boolean;
  /** Dell and Partner people show their type tag beside the rating. */
  kind?: ContactType;
}

const tagClass = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground";

export function TemperatureBadge(props: TemperatureBadgeProps) {
  const { kind, portco, prospect, className } = props;
  if (portco || kind === "PortCo" || (kind !== "Dell" && kind !== "Partner")) return <RatingBadge {...props} />;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className={tagClass} title={kind === "Dell" ? "Dell person" : "Works at a Partner"}>{kind}</span>
      <RatingBadge {...props} className={undefined} kind={undefined} prospect={prospect} />
    </span>
  );
}

function RatingBadge({
  temperature,
  className,
  pulse = true,
  showLabel = true,
  portco = false,
  prospect = false,
  kind,
}: TemperatureBadgeProps) {
  if (prospect) {
    return <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground", className)} title="Prospect — open the profile for pipeline stage">Prospect</span>;
  }
  if (portco || kind === "PortCo") {
    return <span className={cn(tagClass, className)} title="PortCo person — not rated">PortCo</span>;
  }
  if (pulse) {
    return (
      <PulseTemperature
        temperature={temperature}
        className={className}
        showLabel={showLabel}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        temperature === "Council" && "bg-council text-council-foreground",
        temperature === "Hot" && "bg-hot text-hot-foreground",
        temperature === "Warm" && "bg-warm text-warm-foreground",
        temperature === "Cold" && "bg-cold text-cold-foreground",
        className,
      )}
    >
      {temperature}
    </span>
  );
}
