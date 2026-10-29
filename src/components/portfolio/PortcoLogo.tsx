import { useEffect, useMemo, useState } from "react";
import { companyLogoSources, resolveCompanyLogoDomain } from "@/lib/domain-utils";
import { linkedinIdentity } from "@/lib/import-dedupe";

const SHARED_HOSTS = /(^|\.)(linkedin\.com|crunchbase\.com|pitchbook\.com|angel\.co|wellfound\.com|twitter\.com|x\.com|facebook\.com)$/i;
void linkedinIdentity;

/** Company logo from its website via the shared source ladder; initials fallback. */
export function PortcoLogo({
  name,
  website,
  size = "md",
}: {
  name: string;
  website?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sources = useMemo(() => {
    const r = resolveCompanyLogoDomain({ website });
    if (!r || r.source !== "website" || SHARED_HOSTS.test(r.domain)) return [];
    return companyLogoSources(r.domain, "high");
  }, [website]);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [sources]);

  const box = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const img = size === "lg" ? "h-9 w-9" : size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const text = size === "lg" ? "text-lg font-bold" : "text-sm font-semibold";
  const src = sources[idx];
  const initials = (name || "?").trim().split(/\s+/).map((n) => n[0]).join("").slice(0, 2);

  return (
    <div className={`${box} rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0`}>
      {src ? (
        <img key={src} src={src} alt={name} className={`${img} object-contain`} onError={() => setIdx((i) => i + 1)} />
      ) : (
        <span className={`${text} text-primary`}>{initials}</span>
      )}
    </div>
  );
}
