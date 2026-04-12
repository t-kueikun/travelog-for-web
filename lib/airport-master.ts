import { readFile } from "node:fs/promises";

const AIRPORTS_CSV_PATH =
  process.env.AIRPORTS_CSV_PATH || "/Users/tokuei/Downloads/airports.csv";

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
  const raw = await readFile(AIRPORTS_CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    return [] as AirportMasterRecord[];
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
  return Array.from(deduped.values());
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
  const airports = await getAirportMaster();
  return airports
    .map((record) => ({
      record,
      score: scoreAirportRecord(record, normalizedQuery)
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
