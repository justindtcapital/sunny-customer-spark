/** Table columns follow the saved selection order, not the schema's field order. */
export function orderedColumns<T extends { key: string }>(options: readonly T[], keys: readonly string[]): T[] {
  const byKey = new Map(options.map((option) => [option.key, option]));
  return [...new Set(keys)].flatMap((key) => {
    const option = byKey.get(key);
    return option ? [option] : [];
  });
}

export function moveColumn(keys: readonly string[], active: string, over: string): string[] {
  const from = keys.indexOf(active), to = keys.indexOf(over);
  const next = [...keys];
  if (from < 0 || to < 0 || from === to) return next;
  next.splice(from, 1);
  next.splice(to, 0, active);
  return next;
}