// Extracts the dominant brand color from a company logo so list bullets can
// echo the logo's primary color. Falls back to null when the logo is
// grayscale or the image can't be read cross-origin (CORS-tainted canvas).

import { useEffect, useState } from "react";
import { companyLogoSources, resolveCompanyLogoDomain } from "@/lib/domain-utils";

export interface LogoColor {
  /** Saturated color for rings and icons. */
  fg: string;
  /** Light tint of the same hue for the bullet background. */
  bg: string;
}

const cache = new Map<string, LogoColor | null>();

/** Average the logo's colorful pixels and return their hue as a readable color pair. */
async function extractColor(url: string): Promise<LogoColor | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 3000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 16;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        // Bucket colorful pixels by hue; ignore white/gray/black background pixels.
        const buckets = new Map<number, number>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]! / 255, g = data[i + 1]! / 255, b = data[i + 2]! / 255, a = data[i + 3]! / 255;
          if (a < 0.5) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const l = (max + min) / 2;
          const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
          if (s < 0.25 || l < 0.15 || l > 0.9) continue;
          let h = 0;
          if (max !== min) {
            if (max === r) h = ((g - b) / (max - min)) % 6;
            else if (max === g) h = (b - r) / (max - min) + 2;
            else h = (r - g) / (max - min) + 4;
            h = Math.round(h * 60);
            if (h < 0) h += 360;
          }
          const bucket = Math.round(h / 20) * 20 % 360;
          buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
        }
        if (!buckets.size) return resolve(null);
        const hue = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]![0];
        resolve({ fg: `hsl(${hue} 70% 42%)`, bg: `hsl(${hue} 80% 93%)` });
      } catch {
        resolve(null); // CORS-tainted canvas
      }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/** Dominant color of a company's logo, cached per company. Null until loaded or when unavailable. */
export function useLogoColor(company: string, website: string): LogoColor | null {
  const [color, setColor] = useState<LogoColor | null>(cache.get(company) ?? null);
  useEffect(() => {
    if (!company) return;
    if (cache.has(company)) { setColor(cache.get(company) ?? null); return; }
    let alive = true;
    const resolved = resolveCompanyLogoDomain({ website, company });
    const sources = resolved ? companyLogoSources(resolved.domain, resolved.confidence) : [];
    void (async () => {
      for (const url of sources) {
        const c = await extractColor(url);
        if (c) {
          cache.set(company, c);
          if (alive) setColor(c);
          return;
        }
      }
      cache.set(company, null);
    })();
    return () => { alive = false; };
  }, [company, website]);
  return color;
}
