import { formatPortcoList, type PortcoListEntry } from "./portco-list";

export type ActionTone = "formal" | "informal";
export type ActionLength = "short" | "long";

export function actionStyle(tone: ActionTone, length: ActionLength): string {
  return `${tone === "formal" ? "Professional, formal tone" : "Conversational, informal tone"}. ${length === "short" ? "Short form: concise, under 170 words" : "Long form: detailed paragraphs, without inventing facts"}.`;
}

/** Correct case/punctuation only for known names; never guess a different company. */
export function canonicalActionNames(text: string, names: string[]): string {
  let result = text;
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    const words = name.match(/[a-z0-9]+/gi);
    if (!words?.length) continue;
    const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s.-]*");
    result = result.replace(new RegExp(`(?<![\\w@/])${pattern}(?![\\w@])`, "gi"), name);
  }
  return result;
}

/** Replace only approved list bullets for the currently selected companies. */
export function withActionPortcos(body: string, list: PortcoListEntry[], names: string[]): { body: string; missing: string[] } {
  const { text, missing } = formatPortcoList(list, names);
  const bullets = new Set(text.split("\n").filter(Boolean));
  const clean = stripActionPortcoBullets(body, names).split("\n").filter((line) => !bullets.has(line.trim())).join("\n").trimEnd();
  return { body: text ? `${clean}\n\n${text}\n` : clean, missing };
}

/** Generated portfolio bullets are untrusted, even when the model ignores instructions. */
export function stripActionPortcoBullets(body: string, names: string[]): string {
  return body.split("\n").filter((line) => {
    if (!/^\s*[•*-]\s+/.test(line)) return true;
    const text = line.replace(/^\s*[•*-]\s+/, "").toLowerCase();
    return !names.some((name) => text === name.toLowerCase() || text.startsWith(`${name.toLowerCase()} `) || text.startsWith(`${name.toLowerCase()} (`));
  }).join("\n").trimEnd();
}