import { readFile } from "node:fs/promises";

const AIRPORTS_CSV_PATH =
  process.env.AIRPORTS_CSV_PATH || "/Users/tokuei/Downloads/airports.csv";

const FALLBACK_AIRPORT_MASTER: AirportMasterRecord[] = [
  { code: "HND", name: "Haneda Airport", cityName: "Tokyo", countryCode: "JP", countryName: "Japan", type: "large_airport", scheduledService: true },
  { code: "NRT", name: "Narita International Airport", cityName: "Tokyo", countryCode: "JP", countryName: "Japan", type: "large_airport", scheduledService: true },
  { code: "ITM", name: "Osaka International Airport", cityName: "Osaka", countryCode: "JP", countryName: "Japan", type: "medium_airport", scheduledService: true },
  { code: "KIX", name: "Kansai International Airport", cityName: "Osaka", countryCode: "JP", countryName: "Japan", type: "large_airport", scheduledService: true },
  { code: "UKB", name: "Kobe Airport", cityName: "Kobe", countryCode: "JP", countryName: "Japan", type: "medium_airport", scheduledService: true },
  { code: "CTS", name: "New Chitose Airport", cityName: "Sapporo", countryCode: "JP", countryName: "Japan", type: "large_airport", scheduledService: true },
  { code: "FUK", name: "Fukuoka Airport", cityName: "Fukuoka", countryCode: "JP", countryName: "Japan", type: "large_airport", scheduledService: true },
  { code: "OKA", name: "Naha Airport", cityName: "Naha", countryCode: "JP", countryName: "Japan", type: "medium_airport", scheduledService: true },
  { code: "ICN", name: "Incheon International Airport", cityName: "Seoul", countryCode: "KR", countryName: "South Korea", type: "large_airport", scheduledService: true },
  { code: "GMP", name: "Gimpo International Airport", cityName: "Seoul", countryCode: "KR", countryName: "South Korea", type: "large_airport", scheduledService: true },
  { code: "TPE", name: "Taiwan Taoyuan International Airport", cityName: "Taipei", countryCode: "TW", countryName: "Taiwan", type: "large_airport", scheduledService: true },
  { code: "TSA", name: "Taipei Songshan Airport", cityName: "Taipei", countryCode: "TW", countryName: "Taiwan", type: "medium_airport", scheduledService: true },
  { code: "BKK", name: "Suvarnabhumi Airport", cityName: "Bangkok", countryCode: "TH", countryName: "Thailand", type: "large_airport", scheduledService: true },
  { code: "DMK", name: "Don Mueang International Airport", cityName: "Bangkok", countryCode: "TH", countryName: "Thailand", type: "large_airport", scheduledService: true },
  { code: "SIN", name: "Singapore Changi Airport", cityName: "Singapore", countryCode: "SG", countryName: "Singapore", type: "large_airport", scheduledService: true },
  { code: "FCO", name: "Leonardo da Vinci–Fiumicino Airport", cityName: "Rome", countryCode: "IT", countryName: "Italy", type: "large_airport", scheduledService: true },
  { code: "CIA", name: "Ciampino–G. B. Pastine International Airport", cityName: "Rome", countryCode: "IT", countryName: "Italy", type: "medium_airport", scheduledService: true },
  { code: "CAI", name: "Cairo International Airport", cityName: "Cairo", countryCode: "EG", countryName: "Egypt", type: "large_airport", scheduledService: true },
  { code: "SPX", name: "Sphinx International Airport", cityName: "Cairo", countryCode: "EG", countryName: "Egypt", type: "medium_airport", scheduledService: true },
  { code: "SFO", name: "San Francisco International Airport", cityName: "San Francisco", countryCode: "US", countryName: "United States", type: "large_airport", scheduledService: true },
  { code: "JFK", name: "John F. Kennedy International Airport", cityName: "New York", countryCode: "US", countryName: "United States", type: "large_airport", scheduledService: true },
  { code: "EWR", name: "Newark Liberty International Airport", cityName: "New York", countryCode: "US", countryName: "United States", type: "large_airport", scheduledService: true },
  { code: "LGA", name: "LaGuardia Airport", cityName: "New York", countryCode: "US", countryName: "United States", type: "large_airport", scheduledService: true },
  { code: "LHR", name: "Heathrow Airport", cityName: "London", countryCode: "GB", countryName: "United Kingdom", type: "large_airport", scheduledService: true },
  { code: "LGW", name: "Gatwick Airport", cityName: "London", countryCode: "GB", countryName: "United Kingdom", type: "large_airport", scheduledService: true },
  { code: "CDG", name: "Charles de Gaulle Airport", cityName: "Paris", countryCode: "FR", countryName: "France", type: "large_airport", scheduledService: true },
  { code: "ORY", name: "Paris Orly Airport", cityName: "Paris", countryCode: "FR", countryName: "France", type: "large_airport", scheduledService: true },
  { code: "HKG", name: "Hong Kong International Airport", cityName: "Hong Kong", countryCode: "HK", countryName: "Hong Kong", type: "large_airport", scheduledService: true }
];

export type AirportMasterRecord = {
  code: string;
  name: string;
  cityName: string;
  countryCode: string;
  countryName: string;
  type: string;
  scheduledService: boolean;
};

let airportMasterCache: Promise<AirportMasterRecord[]> | null = null;

const AIRPORT_QUERY_ALIASES: Record<string, string[]> = {
  東京: ["tokyo", "haneda", "narita", "hnd", "nrt"],
  大阪: ["osaka", "itami", "kansai", "kobe", "itm", "kix", "ukb"],
  札幌: ["sapporo", "chitose", "cts"],
  ソウル: ["seoul", "incheon", "gimpo", "icn", "gmp"],
  台北: ["taipei", "taoyuan", "songshan", "tpe", "tsa"],
  バンコク: ["bangkok", "suvarnabhumi", "don mueang", "bkk", "dmk"],
  シンガポール: ["singapore", "changi", "sin"],
  ローマ: ["rome", "fiumicino", "ciampino", "fco", "cia"],
  カイロ: ["cairo", "cai", "sphinx", "spx", "egypt"],
  サンフランシスコ: ["san francisco", "sfo"],
  ニューヨーク: ["new york", "jfk", "ewr", "lga"],
  ロンドン: ["london", "heathrow", "gatwick", "lhr", "lgw"],
  パリ: ["paris", "charles de gaulle", "orly", "cdg", "ory"],
  香港: ["hong kong", "hkg"],
  那覇: ["naha", "okinawa", "oka"],
  福岡: ["fukuoka", "fuk", "hakata"],
  京都: ["kyoto", "itami", "kansai", "itm", "kix"]
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeIataCode(value: string) {
  return /^[A-Z]{3}$/.test(cleanString(value).toUpperCase());
}

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function buildCountryName(countryCode: string) {
  const normalized = cleanString(countryCode).toUpperCase();
  if (!normalized) {
    return "";
  }
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return display.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

function buildQueryVariants(query: string) {
  const normalized = cleanString(query);
  if (!normalized) {
    return [] as string[];
  }
  const variants: string[] = [];
  const push = (value: string) => {
    const next = cleanString(value);
    if (!next || variants.includes(next)) {
      return;
    }
    variants.push(next);
  };

  push(normalized);
  push(normalized.toLowerCase());

  for (const [alias, related] of Object.entries(AIRPORT_QUERY_ALIASES)) {
    if (normalized.includes(alias)) {
      related.forEach(push);
    }
  }

  return variants;
}

function scoreAirportRecord(record: AirportMasterRecord, query: string) {
  const normalizedQuery = cleanString(query).toLowerCase();
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const code = record.code.toLowerCase();
  const name = record.name.toLowerCase();
  const city = record.cityName.toLowerCase();
  const country = record.countryName.toLowerCase();
  const haystacks = [name, city, country, `${city} ${name}`];
  let score = 0;
  let matched = false;

  if (!normalizedQuery) {
    return score;
  }
  if (code === normalizedQuery || code === compactQuery.toUpperCase().toLowerCase()) {
    score += 160;
    matched = true;
  }
  if (city === normalizedQuery) {
    score += 90;
    matched = true;
  }
  if (name === normalizedQuery) {
    score += 80;
    matched = true;
  }
  if (haystacks.some((text) => text.includes(normalizedQuery))) {
    score += 40;
    matched = true;
  }
  if (compactQuery && haystacks.some((text) => text.replace(/\s+/g, "").includes(compactQuery))) {
    score += 24;
    matched = true;
  }
  if (!matched) {
    return 0;
  }
  if (record.scheduledService) {
    score += 18;
  }
  if (record.type === "large_airport") {
    score += 18;
  } else if (record.type === "medium_airport") {
    score += 12;
  } else if (record.type === "small_airport") {
    score += 4;
  }
  return score;
}

async function loadAirportMaster() {
  let raw = "";
  try {
    raw = await readFile(AIRPORTS_CSV_PATH, "utf8");
  } catch (error) {
    console.error("airport_master_csv_unavailable", {
      path: AIRPORTS_CSV_PATH,
      code: error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined
    });
    return FALLBACK_AIRPORT_MASTER;
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    return FALLBACK_AIRPORT_MASTER;
  }

  const header = parseCsvLine(lines[0]);
  const indexByName = new Map<string, number>();
  header.forEach((column, index) => {
    indexByName.set(cleanString(column).replace(/^"|"$/g, ""), index);
  });

  const readField = (fields: string[], name: string) => {
    const index = indexByName.get(name);
    if (index === undefined) {
      return "";
    }
    return cleanString(fields[index]);
  };

  const records: AirportMasterRecord[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const fields = parseCsvLine(lines[lineIndex]);
    const code = readField(fields, "iata_code").toUpperCase();
    const name = readField(fields, "name");
    const cityName = readField(fields, "municipality");
    const countryCode = readField(fields, "iso_country").toUpperCase();
    const type = readField(fields, "type");
    const scheduledService = readField(fields, "scheduled_service") === "yes";

    if (!looksLikeIataCode(code) || !name || !cityName) {
      continue;
    }
    if (!["large_airport", "medium_airport", "small_airport"].includes(type)) {
      continue;
    }

    records.push({
      code,
      name,
      cityName,
      countryCode,
      countryName: buildCountryName(countryCode),
      type,
      scheduledService
    });
  }

  const deduped = new Map<string, AirportMasterRecord>();
  for (const record of records) {
    const existing = deduped.get(record.code);
    if (!existing || scoreAirportRecord(record, record.cityName) > scoreAirportRecord(existing, existing.cityName)) {
      deduped.set(record.code, record);
    }
  }
  const parsed = Array.from(deduped.values());
  return parsed.length > 0 ? parsed : FALLBACK_AIRPORT_MASTER;
}

export async function getAirportMaster() {
  if (!airportMasterCache) {
    airportMasterCache = loadAirportMaster();
  }
  return airportMasterCache;
}

export async function searchAirportMaster(query: string, limit = 5) {
  const normalizedQuery = cleanString(query);
  if (!normalizedQuery) {
    return [] as AirportMasterRecord[];
  }
  return searchAirportMasterWithQueries({
    queries: [normalizedQuery],
    limit
  });
}

export async function searchAirportMasterWithQueries({
  queries,
  preferredCodes = [],
  limit = 5
}: {
  queries: string[];
  preferredCodes?: string[];
  limit?: number;
}) {
  const normalizedQueries = queries.map((query) => cleanString(query)).filter(Boolean);
  if (normalizedQueries.length === 0) {
    return [] as AirportMasterRecord[];
  }
  const queryVariants = normalizedQueries.flatMap((query) => buildQueryVariants(query));
  const preferredCodeSet = new Set(
    preferredCodes.map((code) => cleanString(code).toUpperCase()).filter(looksLikeIataCode)
  );
  const airports = await getAirportMaster();
  return airports
    .map((record) => ({
      record,
      score:
        queryVariants.reduce(
        (best, variant) => Math.max(best, scoreAirportRecord(record, variant)),
        0
      ) + (preferredCodeSet.has(record.code) ? 240 : 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.record.cityName !== b.record.cityName) {
        return a.record.cityName.localeCompare(b.record.cityName, "ja");
      }
      return a.record.name.localeCompare(b.record.name, "ja");
    })
    .slice(0, Math.max(1, Math.min(12, limit)))
    .map((item) => item.record);
}
