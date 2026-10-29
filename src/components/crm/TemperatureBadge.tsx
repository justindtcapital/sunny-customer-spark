import type { Temperature } from "@/lib/types";
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
}

export function TemperatureBadge({
  temperature,
  className,
  pulse = true,
  showLabel = true,
  portco = false,
}: TemperatureBadgeProps) {
  if (portco) {
    return <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground", className)} title="Works at a PortCo — not counted in Network tiers">PortCo</span>;
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
