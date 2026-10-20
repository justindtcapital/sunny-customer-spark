// Metro-area expansion for people searches: a typed city fans out to the
// surrounding cities so "San Francisco" doesn't miss Oakland, San Jose, etc.
// Apollo person_locations accepts "City, State, Country" strings.

const METROS: Record<string, { label: string; cities: string[] }> = {
  "san francisco": {
    label: "San Francisco Bay Area",
    cities: ["San Francisco", "Oakland", "San Jose", "Palo Alto", "Mountain View", "Sunnyvale", "Santa Clara", "Redwood City", "Menlo Park", "San Mateo", "Fremont", "Berkeley"].map((c) => `${c}, California, United States`),
  },
  "new york": {
    label: "New York Metro",
    cities: ["New York, New York", "Brooklyn, New York", "Jersey City, New Jersey", "Hoboken, New Jersey", "Stamford, Connecticut", "White Plains, New York", "Newark, New Jersey"].map((c) => `${c}, United States`),
  },
  boston: {
    label: "Greater Boston",
    cities: ["Boston", "Cambridge", "Somerville", "Waltham", "Burlington", "Lexington", "Newton", "Woburn"].map((c) => `${c}, Massachusetts, United States`),
  },
  "los angeles": {
    label: "Greater Los Angeles",
    cities: ["Los Angeles", "Santa Monica", "Pasadena", "Burbank", "Irvine", "Long Beach", "Culver City", "El Segundo", "Glendale"].map((c) => `${c}, California, United States`),
  },
  seattle: {
    label: "Greater Seattle",
    cities: ["Seattle", "Bellevue", "Redmond", "Kirkland", "Tacoma", "Everett"].map((c) => `${c}, Washington, United States`),
  },
  austin: {
    label: "Greater Austin",
    cities: ["Austin", "Round Rock", "Cedar Park", "Georgetown", "San Marcos"].map((c) => `${c}, Texas, United States`),
  },
  dallas: {
    label: "Dallas–Fort Worth",
    cities: ["Dallas", "Fort Worth", "Plano", "Irving", "Frisco", "Arlington", "Richardson"].map((c) => `${c}, Texas, United States`),
  },
  chicago: {
    label: "Chicagoland",
    cities: ["Chicago", "Evanston", "Naperville", "Schaumburg", "Oak Brook", "Deerfield"].map((c) => `${c}, Illinois, United States`),
  },
  washington: {
    label: "Washington DC Metro",
    cities: ["Washington, District of Columbia", "Arlington, Virginia", "Reston, Virginia", "McLean, Virginia", "Tysons, Virginia", "Bethesda, Maryland", "Alexandria, Virginia"].map((c) => `${c}, United States`),
  },
  atlanta: {
    label: "Metro Atlanta",
    cities: ["Atlanta", "Alpharetta", "Sandy Springs", "Marietta", "Duluth"].map((c) => `${c}, Georgia, United States`),
  },
  denver: {
    label: "Denver Metro",
    cities: ["Denver", "Boulder", "Aurora", "Englewood", "Broomfield", "Lakewood"].map((c) => `${c}, Colorado, United States`),
  },
  miami: {
    label: "South Florida",
    cities: ["Miami", "Fort Lauderdale", "Boca Raton", "Coral Gables", "West Palm Beach"].map((c) => `${c}, Florida, United States`),
  },
};

const ALIASES: Record<string, string> = {
  sf: "san francisco", "bay area": "san francisco", "san francisco bay area": "san francisco", "silicon valley": "san francisco",
  nyc: "new york", "new york city": "new york", manhattan: "new york",
  la: "los angeles", dc: "washington", "washington dc": "washington", dfw: "dallas",
};

function metroKey(raw: string): string | null {
  const city = raw.split(",")[0].trim().toLowerCase().replace(/^greater\s+/, "").replace(/\s+(metro|area|metro area)$/, "");
  const key = ALIASES[city] || city;
  return METROS[key] ? key : null;
}

/** Label for the metro a typed location expands to, or null. */
export function metroLabel(raw: string): string | null {
  const k = metroKey(raw);
  return k ? METROS[k].label : null;
}

/** Expand comma/semicolon-free location entries into Apollo location strings. */
export function expandLocations(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const t = r.trim();
    if (!t) continue;
    const k = metroKey(t);
    if (k) out.push(...METROS[k].cities);
    else out.push(t);
  }
  return [...new Set(out)];
}
