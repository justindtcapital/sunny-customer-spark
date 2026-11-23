// Pure, browser-safe finishing for drafted LinkedIn posts about a signal.
// The model is asked to include these, but we enforce them so every draft
// carries the article link (LinkedIn builds its preview from it) and #DTC.

export const DTC_HASHTAG = "#DTC";

/** Old/variant DTC tags the model may produce; all become #DTC. */
const OLD_DTC_TAGS = /#(?:DellTechCapital|DellTechnologiesCapital|DellTechCap|DellTech)\b/gi;

const HASHTAG_LINE = /^\s*(#[\p{L}\p{N}_]+\s*)+$/u;

export function finalizeLinkedInPost(post: string, sourceUrl?: string): string {
  let text = (post || "").replace(OLD_DTC_TAGS, DTC_HASHTAG).trim();

  // Collapse duplicate #DTC tags left after replacement.
  let seen = false;
  text = text.replace(/#DTC\b/g, (m) => {
    if (seen) return "";
    seen = true;
    return m;
  });
  text = text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n");

  const lines = text.split("\n");
  // Find the trailing hashtag line (if any) so link/tag go in the right place.
  let tagIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i] ?? "";
    if (!l.trim()) continue;
    if (HASHTAG_LINE.test(l)) tagIdx = i;
    break;
  }

  if (!/#DTC\b/.test(text)) {
    if (tagIdx >= 0) lines[tagIdx] = `${(lines[tagIdx] ?? "").trim()} ${DTC_HASHTAG}`;
    else {
      lines.push("", DTC_HASHTAG);
      tagIdx = lines.length - 1;
    }
  }

  const url = sourceUrl && /^https?:\/\//i.test(sourceUrl.trim()) ? sourceUrl.trim() : "";
  if (url && !lines.join("\n").includes(url)) {
    // Link sits on its own line just above the hashtags.
    lines.splice(tagIdx, 0, url, "");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
