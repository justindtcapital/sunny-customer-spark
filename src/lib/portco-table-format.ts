// Pure display/edit conversions for the Edit PortCos table (money as $M, ownership as %).

const num = (s: string) => {
  const n = Number((s || "").replace(/[$,%\s]/g, "").replace(/m$/i, ""));
  return (s || "").trim() && Number.isFinite(n) ? n : null;
};
const tidy = (n: number) => String(parseFloat(n.toFixed(2)));

/** Stored value → what the cell shows ("2.5" → "$2.5M", "0.125" → "12.5%"); blanks stay blank. */
export function displayProfileValue(field: string, raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  const n = num(v);
  if (field === "DTC Investment ($M)") return n == null ? v : `$${tidy(n)}M`;
  if (field === "DTC Ownership") return n == null ? v : `${tidy(n <= 1 ? n * 100 : n)}%`;
  return v;
}

/** Stored value → the number typed while editing (ownership is edited as a percent). */
export function editDraftValue(field: string, raw: string): string {
  const n = num(raw);
  if (n == null) return (raw || "").trim();
  if (field === "DTC Ownership") return tidy(n <= 1 ? n * 100 : n);
  if (field === "DTC Investment ($M)") return tidy(n);
  return (raw || "").trim();
}

/** What the person typed → stored value ("12.5" or "12.5%" ownership → "0.125"; "$3M" → "3"). */
export function storedFromDraft(field: string, draft: string): string {
  const v = (draft || "").trim();
  if (!v) return "";
  const n = num(v);
  if (n == null) return v;
  if (field === "DTC Ownership") return String(parseFloat((n / 100).toFixed(6)));
  if (field === "DTC Investment ($M)") return String(n);
  return v;
}
