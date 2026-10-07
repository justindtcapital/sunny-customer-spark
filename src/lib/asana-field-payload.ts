// Pure helpers for writing Asana custom fields. Values are typed per Asana's
// own field type so enum choices go out by option gid and text stays verbatim.

export type AsanaFieldType = "text" | "number" | "enum" | "multi_enum" | "date" | "other";

export interface WorkstreamFieldMeta {
  gid: string;
  name: string;
  type: AsanaFieldType;
  options?: { gid: string; name: string }[];
  /** Normalized current value: text/number/date string, enum gid, or multi gids. */
  value: string | string[];
  editable: boolean;
}

export interface FieldChange {
  gid: string;
  type: AsanaFieldType;
  /** Original value the user started from, for conflict detection. */
  original: string | string[];
  value: string | string[];
}

export function sameValue(a: string | string[], b: string | string[]): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = [...(Array.isArray(a) ? a : a ? [a] : [])].sort();
    const y = [...(Array.isArray(b) ? b : b ? [b] : [])].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? "").trim() === (b ?? "").trim();
}

/** Build Asana's `custom_fields` payload; throws on invalid input. */
export function buildCustomFieldsPayload(changes: FieldChange[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of changes) {
    const v = c.value;
    switch (c.type) {
      case "text":
        out[c.gid] = typeof v === "string" ? v : v.join(", ");
        break;
      case "number": {
        const s = typeof v === "string" ? v.trim() : "";
        if (!s) out[c.gid] = null;
        else {
          const n = Number(s.replace(/,/g, ""));
          if (!Number.isFinite(n)) throw new Error(`"${s}" is not a number`);
          out[c.gid] = n;
        }
        break;
      }
      case "enum":
        out[c.gid] = typeof v === "string" && v ? v : null;
        break;
      case "multi_enum":
        out[c.gid] = Array.isArray(v) ? v : v ? [v] : [];
        break;
      case "date": {
        const s = typeof v === "string" ? v.trim() : "";
        if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`"${s}" is not a valid date`);
        out[c.gid] = s ? { date: s } : null;
        break;
      }
      default:
        throw new Error("This field type can't be edited from the app");
    }
  }
  return out;
}
