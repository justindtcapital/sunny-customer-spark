// Serve real data or nothing: when a live read fails (e.g. a Google Sheets
// rate limit), return the last successful result from this server instance,
// otherwise rethrow so the page shows its own "unavailable / retry" state.
// Never substitute made-up records.
export function lastGoodReader<T>(load: () => Promise<T>, label: string) {
  let lastGood: { value: T } | null = null;
  return async (): Promise<T> => {
    try {
      const value = await load();
      lastGood = { value };
      return value;
    } catch (error) {
      console.error(`Failed to read ${label} from Google Sheets:`, error);
      if (lastGood) return lastGood.value;
      throw new Error(`${label} are temporarily unavailable. Please try again in a moment.`);
    }
  };
}
