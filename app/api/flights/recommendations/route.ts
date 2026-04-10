import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const SCRAPELESS_SCRAPER_ENDPOINT = "https://api.scrapeless.com/api/v1/scraper/request";
const DEFAULT_LOCALE = process.env.BOOKING_DEFAULT_LOCALE ?? "ja";
const DEFAULT_CURRENCY = process.env.BOOKING_DEFAULT_CURRENCY ?? "JPY";
const DEFAULT_GL = process.env.SERPAPI_GL ?? "jp";
const SERPAPI_NO_CACHE = process.env.SERPAPI_NO_CACHE === "true";
const LOCAL_RESPONSE_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.FLIGHT_RECOMMEND_CACHE_TTL_MS ?? 10 * 60 * 1000)
);
const RETRY_DELAYS_MS = [300, 800] as const;
const TRANSIENT_UPSTREAM_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const localResponseCache = new Map<string, { expiresAt: number; payload: unknown }>();

type RecommendationsRequest = {
  from?: string;
  to?: string;
  date?: string;
  adults?: number;
  locale?: string;
  currency?: string;
  limit?: number;
};

type AirportCandidate = {
  code: string;
  name: string;
  cityName?: string;
};

type FlightTransfer = {
  station: string | null;
  serviceName: string | null;
  arrTime: string | null;
  depTime: string | null;
};

type FlightRecommendation = {
  airline: string | null;
  flightNumber: string | null;
  from: string | null;
  to: string | null;
  depTime: string | null;
  arrTime: string | null;
  price: number | null;
  currency: string | null;
  stops: number | null;
  via: string[] | null;
  transfers: FlightTransfer[];
  link: string | null;
  source: "serpapi/google_flights" | "scrapeless/google_flights";
};

type UpstreamResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  detail: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function looksLikeIataCode(value: string) {
  return /^[A-Za-z]{3}$/.test(cleanString(value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorDetail(value: unknown) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "object") {
    const source = value as {
      message?: string;
      error?: string | { message?: string; detail?: string };
      detail?: string;
    };
    const nestedError =
      source.error && typeof source.error === "object" ? source.error : null;
    return (
      cleanString(source.message) ||
      cleanString(source.detail) ||
      cleanString(typeof source.error === "string" ? source.error : "") ||
      cleanString(nestedError?.message) ||
      cleanString(nestedError?.detail) ||
      ""
    );
  }
  return "";
}

function isTransientFailure(result: UpstreamResult | null | undefined) {
  if (!result || result.ok) {
    return false;
  }
  return TRANSIENT_UPSTREAM_STATUS.has(result.status);
}

function isQuotaFailure(result: UpstreamResult | null | undefined) {
  if (!result) {
    return false;
  }
  if (result.status === 429) {
    return true;
  }
  const detail = cleanString(result.detail).toLowerCase();
  return detail.includes("quota") || detail.includes("rate limit") || detail.includes("too many requests");
}

async function fetchUpstream(url: URL): Promise<UpstreamResult> {
  try {
    const response = await fetch(url.toString(), {
      cache: "no-store"
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {}
    const detail = extractErrorDetail(payload);
    return {
      ok: response.ok,
      status: response.status,
      payload,
      detail
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Network error while contacting upstream API.";
    return {
      ok: false,
      status: 503,
      payload: null,
      detail
    };
  }
}

async function fetchUpstreamWithRetry(url: URL, maxAttempts = 3): Promise<UpstreamResult> {
  let lastResult: UpstreamResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await fetchUpstream(url);
    if (result.ok) {
      return result;
    }
    lastResult = result;
    if (!isTransientFailure(result) || attempt >= maxAttempts) {
      break;
    }
    const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
    await sleep(delay);
  }

  return (
    lastResult ?? {
      ok: false,
      status: 503,
      payload: null,
      detail: "Unknown upstream failure."
    }
  );
}

function buildAirportAutocompleteUrl({
  apiKey,
  query,
  hl,
  gl
}: {
  apiKey: string;
  query: string;
  hl: string;
  gl: string;
}) {
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google_flights_autocomplete");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", hl);
  url.searchParams.set("gl", gl);
  return url;
}

function extractAirportCandidates(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as Record<string, unknown>;
  const candidates: AirportCandidate[] = [];

  const addCandidate = (codeRaw: unknown, nameRaw: unknown, cityRaw?: unknown) => {
    const code = cleanString(codeRaw).toUpperCase();
    const name = cleanString(nameRaw);
    const cityName = cleanString(cityRaw) || undefined;
    if (!looksLikeIataCode(code) || !name) {
      return;
    }
    candidates.push({ code, name, cityName });
  };

  toArray(source.airports).forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    addCandidate(
      record.airport_id ?? record.code ?? record.iata,
      record.airport_name ?? record.name,
      record.city ?? record.city_name
    );
  });

  toArray(source.cities).forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    addCandidate(
      record.airport_id ?? record.code ?? record.id,
      record.name ?? record.city,
      record.city ?? record.name
    );
  });

  toArray(source.suggestions).forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    addCandidate(
      record.airport_id ?? record.code ?? record.iata ?? record.id,
      record.name ?? record.airport_name,
      record.city ?? record.city_name
    );
  });

  const deduped = new Map<string, AirportCandidate>();
  candidates.forEach((candidate) => {
    if (!deduped.has(candidate.code)) {
      deduped.set(candidate.code, candidate);
    }
  });
  return Array.from(deduped.values());
}

function scoreAirportCandidate(candidate: AirportCandidate, query: string) {
  const normalizedQuery = cleanString(query).toLowerCase();
  const code = candidate.code.toLowerCase();
  const name = cleanString(candidate.name).toLowerCase();
  const city = cleanString(candidate.cityName).toLowerCase();
  let score = 0;
  if (normalizedQuery === code) {
    score += 100;
  }
  if (name.includes(normalizedQuery)) {
    score += 35;
  }
  if (city.includes(normalizedQuery)) {
    score += 25;
  }
  return score;
}

function buildAirportQueries(value: string) {
  const queries: string[] = [];
  const push = (entry: string) => {
    const normalized = cleanString(entry);
    if (!normalized || queries.includes(normalized)) {
      return;
    }
    queries.push(normalized);
  };
  const normalized = cleanString(value);
  push(normalized);
  Array.from(normalized.matchAll(/[（(]([^）)]+)[）)]/g))
    .map((match) => cleanString(match[1]))
    .filter(Boolean)
    .forEach(push);
  const withoutBrackets = normalized
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\s+/g, " ");
  push(withoutBrackets);
  normalized
    .split(/[・,，、/／|｜]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach(push);
  withoutBrackets
    .split(/[・,，、/／|｜]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach(push);
  return queries.slice(0, 8);
}

const IATA_ALIAS_MAP: Record<string, string> = {
  東京: "TYO",
  羽田: "HND",
  羽田空港: "HND",
  成田: "NRT",
  成田空港: "NRT",
  成田国際空港: "NRT",
  大阪: "OSA",
  伊丹: "ITM",
  伊丹空港: "ITM",
  大阪国際空港: "ITM",
  関西: "KIX",
  関西空港: "KIX",
  関西国際空港: "KIX",
  福岡: "FUK",
  福岡空港: "FUK",
  博多: "FUK",
  札幌: "CTS",
  新千歳: "CTS",
  新千歳空港: "CTS",
  那覇: "OKA",
  沖縄: "OKA",
  台北: "TPE",
  桃園: "TPE",
  桃園空港: "TPE",
  松山: "TSA",
  松山空港: "TSA",
  ソウル: "SEL",
  仁川: "ICN",
  仁川空港: "ICN",
  仁川国際空港: "ICN",
  金浦: "GMP",
  釜山: "PUS",
  香港: "HKG",
  バンコク: "BKK",
  シンガポール: "SIN",
  パリ: "PAR",
  ロンドン: "LON",
  ローマ: "FCO",
  フィウミチーノ: "FCO",
  フィウミチーノ空港: "FCO",
  ローマフィウミチーノ空港: "FCO",
  レオナルドダヴィンチ国際空港: "FCO",
  ニューヨーク: "NYC",
  ロサンゼルス: "LAX",
  オークランド: "AKL",
  サンフランシスコ: "SFO",
  サンフランシスコ国際空港: "SFO",
  SF: "SFO",
  SFO: "SFO",
  sf: "SFO",
  sfo: "SFO"
};

const METRO_AIRPORT_CODES = new Set(["TYO", "OSA", "SEL", "PAR", "LON", "NYC"]);
const METRO_AIRPORT_FALLBACKS: Record<string, string[]> = {
  TYO: ["HND", "NRT"],
  OSA: ["ITM", "KIX"],
  SEL: ["ICN", "GMP"],
  PAR: ["CDG", "ORY"],
  LON: ["LHR", "LGW"],
  NYC: ["JFK", "EWR", "LGA"]
};

function resolveIataFallback(value: string) {
  const normalized = cleanString(value);
  if (!normalized) {
    return "";
  }
  const iataMatch =
    normalized.match(/\(([A-Za-z]{3})\)/)?.[1] ||
    normalized.match(/\b([A-Za-z]{3})\b/)?.[1];
  if (iataMatch) {
    return iataMatch.toUpperCase();
  }
  let bestCode = "";
  let bestKeyLength = -1;
  let bestIsMetro = true;
  for (const [key, code] of Object.entries(IATA_ALIAS_MAP)) {
    if (normalized.includes(key)) {
      const keyLength = key.length;
      const isMetro = METRO_AIRPORT_CODES.has(code);
      const shouldReplace =
        keyLength > bestKeyLength || (keyLength === bestKeyLength && bestIsMetro && !isMetro);
      if (shouldReplace) {
        bestCode = code;
        bestKeyLength = keyLength;
        bestIsMetro = isMetro;
      }
    }
  }
  return bestCode;
}

async function resolveAirportCode({
  query,
  apiKey,
  hl,
  gl
}: {
  query: string;
  apiKey: string;
  hl: string;
  gl: string;
}) {
  if (!query) {
    return { candidate: null as AirportCandidate | null, failure: null as UpstreamResult | null };
  }
  if (looksLikeIataCode(query)) {
    return {
      candidate: { code: query.toUpperCase(), name: query.toUpperCase() },
      failure: null as UpstreamResult | null
    };
  }
  const fallbackCode = resolveIataFallback(query);
  if (looksLikeIataCode(fallbackCode) && !METRO_AIRPORT_CODES.has(fallbackCode)) {
    return {
      candidate: { code: fallbackCode.toUpperCase(), name: fallbackCode.toUpperCase() },
      failure: null as UpstreamResult | null
    };
  }

  let lastFailure: UpstreamResult | null = null;
  for (const q of buildAirportQueries(query)) {
    const url = buildAirportAutocompleteUrl({ apiKey, query: q, hl, gl });
    const result = await fetchUpstreamWithRetry(url);
    if (!result.ok) {
      lastFailure = result;
      continue;
    }
    const candidates = extractAirportCandidates(result.payload);
    if (candidates.length === 0) {
      continue;
    }
    const sorted = [...candidates].sort(
      (a, b) => scoreAirportCandidate(b, query) - scoreAirportCandidate(a, query)
    );
    return { candidate: sorted[0], failure: null as UpstreamResult | null };
  }
  if (looksLikeIataCode(fallbackCode)) {
    const fallbackSpecificCodes = METRO_AIRPORT_FALLBACKS[fallbackCode] ?? [fallbackCode];
    const chosenCode = fallbackSpecificCodes[0];
    return {
      candidate: { code: chosenCode.toUpperCase(), name: chosenCode.toUpperCase() },
      failure: lastFailure
    };
  }
  return { candidate: null as AirportCandidate | null, failure: lastFailure };
}

function formatAirportLabel(airport: Record<string, unknown> | undefined) {
  if (!airport || typeof airport !== "object") {
    return null;
  }
  const code = cleanString(airport.id ?? airport.code ?? airport.iata).toUpperCase();
  const name = cleanString(airport.name ?? airport.airport_name ?? airport.city);
  if (name && looksLikeIataCode(code)) {
    return `${name} (${code})`;
  }
  if (name) {
    return name;
  }
  if (looksLikeIataCode(code)) {
    return code;
  }
  return null;
}

function toIsoLikeDateTime(value: unknown) {
  const text = cleanString(value);
  if (!text) {
    return null;
  }
  return text.includes("T") ? text : text.replace(" ", "T");
}

function extractViaAirports(group: Record<string, unknown>) {
  const layovers = toArray(group.layovers).filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
  );
  if (layovers.length === 0) {
    return [] as string[];
  }
  const names = layovers
    .map((layover) => {
      const name = cleanString(layover.name);
      const id = cleanString(layover.id).toUpperCase();
      if (name && looksLikeIataCode(id)) {
        return `${name} (${id})`;
      }
      return name || (looksLikeIataCode(id) ? id : "");
    })
    .filter(Boolean);
  return Array.from(new Set(names)).slice(0, 3);
}

function extractFlightTransfers(segments: Record<string, unknown>[]) {
  if (segments.length <= 1) {
    return [] as FlightTransfer[];
  }
  const transfers: FlightTransfer[] = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    const currentArrAirport =
      current.arrival_airport && typeof current.arrival_airport === "object"
        ? (current.arrival_airport as Record<string, unknown>)
        : undefined;
    const nextDepAirport =
      next.departure_airport && typeof next.departure_airport === "object"
        ? (next.departure_airport as Record<string, unknown>)
        : undefined;
    const station =
      formatAirportLabel(currentArrAirport) ||
      formatAirportLabel(nextDepAirport) ||
      null;
    const arrivalFlightNumber = cleanString(current.flight_number);
    const departureFlightNumber = cleanString(next.flight_number);
    const serviceName = departureFlightNumber || arrivalFlightNumber || null;
    const arrTime = toIsoLikeDateTime(currentArrAirport?.time);
    const depTime = toIsoLikeDateTime(nextDepAirport?.time);
    if (!station && !serviceName && !arrTime && !depTime) {
      continue;
    }
    transfers.push({
      station,
      serviceName,
      arrTime,
      depTime
    });
  }
  return transfers;
}

function mapSerpFlights(payload: unknown, limit: number, currency: string) {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const groups = [...toArray(root.best_flights), ...toArray(root.other_flights)];
  const flights: FlightRecommendation[] = [];

  groups.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const group = item as Record<string, unknown>;
    const segments = toArray(group.flights).filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
    );
    if (segments.length === 0) {
      return;
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    const depAirport =
      first.departure_airport && typeof first.departure_airport === "object"
        ? (first.departure_airport as Record<string, unknown>)
        : undefined;
    const arrAirport =
      last.arrival_airport && typeof last.arrival_airport === "object"
        ? (last.arrival_airport as Record<string, unknown>)
        : undefined;

    const segmentAirlines = segments
      .map((segment) => cleanString(segment.airline))
      .filter(Boolean);
    const uniqueAirlines = Array.from(new Set(segmentAirlines));
    const airline =
      uniqueAirlines.length > 0
        ? uniqueAirlines.slice(0, 3).join(" / ")
        : cleanString(first.airline) || null;
    const segmentFlightNumbers = segments
      .map((segment) => cleanString(segment.flight_number))
      .filter(Boolean);
    const uniqueFlightNumbers = Array.from(new Set(segmentFlightNumbers));
    const flightNumber =
      cleanString(first.flight_number) ||
      (uniqueFlightNumbers.length > 0 ? uniqueFlightNumbers[0] : null);
    const from = formatAirportLabel(depAirport);
    const to = formatAirportLabel(arrAirport);
    const depTime = toIsoLikeDateTime(depAirport?.time);
    const arrTime = toIsoLikeDateTime(arrAirport?.time);
    const price = parseNumber(group.price);
    const stopsValue = parseNumber(group.layovers_count);
    const stops =
      stopsValue !== null
        ? Math.max(0, Math.floor(stopsValue))
        : Math.max(0, segments.length - 1);
    const transfers = extractFlightTransfers(segments);
    const transferStations = transfers
      .map((transfer) => cleanString(transfer.station))
      .filter(Boolean);
    const via = transferStations.length > 0 ? transferStations.slice(0, 3) : extractViaAirports(group);
    const token = cleanString(root.search_metadata && typeof root.search_metadata === "object"
      ? (root.search_metadata as Record<string, unknown>).google_flights_url
      : "");

    if (!from || !to || !depTime) {
      return;
    }

    flights.push({
      airline,
      flightNumber,
      from,
      to,
      depTime,
      arrTime,
      price,
      currency: currency || null,
      stops,
      via: via.length > 0 ? via : null,
      transfers,
      link: token || null,
      source: "serpapi/google_flights"
    });
  });

  const deduped = new Map<string, FlightRecommendation>();
  flights.forEach((flight) => {
    const key = [
      flight.flightNumber ?? "",
      flight.depTime ?? "",
      flight.from ?? "",
      flight.to ?? ""
    ].join("|");
    if (!deduped.has(key)) {
      deduped.set(key, flight);
    }
  });

  return Array.from(deduped.values())
    .sort((a, b) => {
      const pa = typeof a.price === "number" ? a.price : Number.POSITIVE_INFINITY;
      const pb = typeof b.price === "number" ? b.price : Number.POSITIVE_INFINITY;
      return pa - pb;
    })
    .slice(0, limit);
}

function unwrapScrapelessPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.best_flights) || Array.isArray(root.other_flights)) {
    return root;
  }
  if (root.data && typeof root.data === "object") {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.best_flights) || Array.isArray(data.other_flights)) {
      return data;
    }
  }
  if (root.result && typeof root.result === "object") {
    const result = root.result as Record<string, unknown>;
    if (Array.isArray(result.best_flights) || Array.isArray(result.other_flights)) {
      return result;
    }
  }
  return root;
}

function mapScrapelessFlights(payload: unknown, limit: number, currency: string) {
  const root = unwrapScrapelessPayload(payload);
  const groups = [...toArray(root.best_flights), ...toArray(root.other_flights)];
  const flights: FlightRecommendation[] = [];

  groups.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const group = item as Record<string, unknown>;
    const segments = toArray(group.flights).filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
    );
    if (segments.length === 0) {
      return;
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    const depAirport =
      first.departure_airport && typeof first.departure_airport === "object"
        ? (first.departure_airport as Record<string, unknown>)
        : undefined;
    const arrAirport =
      last.arrival_airport && typeof last.arrival_airport === "object"
        ? (last.arrival_airport as Record<string, unknown>)
        : undefined;

    const segmentAirlines = segments
      .map((segment) => cleanString(segment.airline))
      .filter(Boolean);
    const uniqueAirlines = Array.from(new Set(segmentAirlines));
    const airline =
      uniqueAirlines.length > 0
        ? uniqueAirlines.slice(0, 3).join(" / ")
        : cleanString(first.airline) || null;
    const segmentFlightNumbers = segments
      .map((segment) => cleanString(segment.flight_number))
      .filter(Boolean);
    const uniqueFlightNumbers = Array.from(new Set(segmentFlightNumbers));
    const flightNumber =
      cleanString(first.flight_number) ||
      (uniqueFlightNumbers.length > 0 ? uniqueFlightNumbers[0] : null);
    const from = formatAirportLabel(depAirport);
    const to = formatAirportLabel(arrAirport);
    const depTime = toIsoLikeDateTime(depAirport?.time);
    const arrTime = toIsoLikeDateTime(arrAirport?.time);
    const price = parseNumber(group.price);
    const stopsValue = parseNumber(group.layovers_count);
    const stops =
      stopsValue !== null
        ? Math.max(0, Math.floor(stopsValue))
        : Math.max(0, segments.length - 1);
    const transfers = extractFlightTransfers(segments);
    const transferStations = transfers
      .map((transfer) => cleanString(transfer.station))
      .filter(Boolean);
    const via = transferStations.length > 0 ? transferStations.slice(0, 3) : extractViaAirports(group);

    if (!from || !to || !depTime) {
      return;
    }

    flights.push({
      airline,
      flightNumber,
      from,
      to,
      depTime,
      arrTime,
      price,
      currency: currency || null,
      stops,
      via: via.length > 0 ? via : null,
      transfers,
      link: null,
      source: "scrapeless/google_flights"
    });
  });

  const deduped = new Map<string, FlightRecommendation>();
  flights.forEach((flight) => {
    const key = [
      flight.flightNumber ?? "",
      flight.depTime ?? "",
      flight.from ?? "",
      flight.to ?? ""
    ].join("|");
    if (!deduped.has(key)) {
      deduped.set(key, flight);
    }
  });

  return Array.from(deduped.values())
    .sort((a, b) => {
      const pa = typeof a.price === "number" ? a.price : Number.POSITIVE_INFINITY;
      const pb = typeof b.price === "number" ? b.price : Number.POSITIVE_INFINITY;
      return pa - pb;
    })
    .slice(0, limit);
}

async function fetchScrapelessFlights({
  apiKey,
  departureId,
  arrivalId,
  outboundDate,
  limit,
  currency
}: {
  apiKey: string;
  departureId: string;
  arrivalId: string;
  outboundDate: string;
  limit: number;
  currency: string;
}) {
  const response = await fetch(SCRAPELESS_SCRAPER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-token": apiKey,
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      actor: "scraper.google.flights",
      input: {
        departure_id: departureId,
        arrival_id: arrivalId,
        data_type: 2,
        outbound_date: outboundDate
      }
    }),
    cache: "no-store"
  });
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {}
  const detail = extractErrorDetail(payload);
  const result: UpstreamResult = {
    ok: response.ok,
    status: response.status,
    payload,
    detail
  };
  if (!result.ok) {
    return {
      ok: false as const,
      result,
      flights: [] as FlightRecommendation[]
    };
  }
  const flights = mapScrapelessFlights(payload, limit, currency);
  return {
    ok: true as const,
    result,
    flights
  };
}

function buildFlightsUrl({
  apiKey,
  fromCode,
  toCode,
  date,
  adults,
  currency,
  hl,
  gl
}: {
  apiKey: string;
  fromCode: string;
  toCode: string;
  date: string;
  adults: number;
  currency: string;
  hl: string;
  gl: string;
}) {
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google_flights");
  url.searchParams.set("departure_id", fromCode);
  url.searchParams.set("arrival_id", toCode);
  url.searchParams.set("outbound_date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("adults", String(adults));
  url.searchParams.set("currency", currency);
  url.searchParams.set("hl", hl);
  url.searchParams.set("gl", gl);
  url.searchParams.set("no_cache", SERPAPI_NO_CACHE ? "true" : "false");
  return url;
}

function buildLocalCacheKey(params: {
  from: string;
  to: string;
  date: string;
  adults: number;
  locale: string;
  currency: string;
  limit: number;
}) {
  return [
    params.from.trim().toLowerCase(),
    params.to.trim().toLowerCase(),
    params.date.trim(),
    params.adults,
    params.locale.trim().toLowerCase(),
    params.currency.trim().toUpperCase(),
    params.limit
  ].join("|");
}

function getCachedPayload(key: string) {
  if (!key || SERPAPI_NO_CACHE || LOCAL_RESPONSE_CACHE_TTL_MS <= 0) {
    return null;
  }
  const cached = localResponseCache.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() > cached.expiresAt) {
    localResponseCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setCachedPayload(key: string, payload: unknown) {
  if (!key || SERPAPI_NO_CACHE || LOCAL_RESPONSE_CACHE_TTL_MS <= 0) {
    return;
  }
  localResponseCache.set(key, {
    payload,
    expiresAt: Date.now() + LOCAL_RESPONSE_CACHE_TTL_MS
  });
}

export async function POST(request: Request) {
  const serpApiKey = process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY;
  const scrapelessApiKey = process.env.SCRAPELESS_API_KEY || process.env.SCRAPELESS_KEY || "";
  if (!serpApiKey && !scrapelessApiKey) {
    return NextResponse.json({ error: "missing_flight_api_key" }, { status: 500 });
  }

  const body = (await request.json()) as RecommendationsRequest;
  const from = cleanString(body.from);
  const to = cleanString(body.to);
  const date = cleanString(body.date);
  const locale = cleanString(body.locale) || DEFAULT_LOCALE;
  const currency = (cleanString(body.currency) || DEFAULT_CURRENCY).toUpperCase();
  const adults = Math.max(1, Math.min(8, Math.floor(body.adults ?? 1)));
  const limit = Math.max(1, Math.min(8, Math.floor(body.limit ?? 5)));
  const hl = locale === "ja" ? "ja" : "en";
  const gl = DEFAULT_GL;

  if (!from || !to || !date) {
    return NextResponse.json({ error: "from_to_date_required" }, { status: 400 });
  }
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  const cacheKey = buildLocalCacheKey({
    from,
    to,
    date,
    adults,
    locale,
    currency,
    limit
  });
  const cachedPayload = getCachedPayload(cacheKey);
  if (cachedPayload) {
    return NextResponse.json(cachedPayload);
  }

  let fromResolved: AirportCandidate | null = null;
  let toResolved: AirportCandidate | null = null;
  let serpFailure: UpstreamResult | null = null;
  let shouldTryScrapelessFallback = !serpApiKey;

  if (serpApiKey) {
    const [fromResult, toResult] = await Promise.all([
      resolveAirportCode({ query: from, apiKey: serpApiKey, hl, gl }),
      resolveAirportCode({ query: to, apiKey: serpApiKey, hl, gl })
    ]);
    fromResolved = fromResult.candidate;
    toResolved = toResult.candidate;
    serpFailure =
      (fromResolved ? null : fromResult.failure) ||
      (toResolved ? null : toResult.failure);

    if (fromResolved && toResolved) {
      const flightsUrl = buildFlightsUrl({
        apiKey: serpApiKey,
        fromCode: fromResolved.code,
        toCode: toResolved.code,
        date,
        adults,
        currency,
        hl,
        gl
      });
      const result = await fetchUpstreamWithRetry(flightsUrl);
      if (result.ok) {
        const flights = mapSerpFlights(result.payload, limit, currency);
        if (flights.length > 0) {
          const payload = {
            fromResolved: {
              code: fromResolved.code,
              name: fromResolved.name,
              type: "AIRPORT"
            },
            toResolved: {
              code: toResolved.code,
              name: toResolved.name,
              type: "AIRPORT"
            },
            flights,
            warnings: []
          };
          setCachedPayload(cacheKey, payload);
          return NextResponse.json(payload);
        }
        serpFailure = {
          ok: false,
          status: 404,
          payload: result.payload,
          detail: "No Flight Found"
        };
      } else {
        serpFailure = result;
      }
    }

    shouldTryScrapelessFallback = isQuotaFailure(serpFailure);
  }

  if (shouldTryScrapelessFallback && scrapelessApiKey) {
    const departureId = (fromResolved?.code || resolveIataFallback(from)).toUpperCase();
    const arrivalId = (toResolved?.code || resolveIataFallback(to)).toUpperCase();
    if (looksLikeIataCode(departureId) && looksLikeIataCode(arrivalId)) {
      const fallback = await fetchScrapelessFlights({
        apiKey: scrapelessApiKey,
        departureId,
        arrivalId,
        outboundDate: date,
        limit,
        currency
      });
      if (fallback.ok && fallback.flights.length > 0) {
        const warnings = serpFailure
          ? ["SerpApiのクォータ制限のため、Scrapelessでフライト候補を取得しました。"]
          : [];
        const payload = {
          fromResolved: {
            code: departureId,
            name: fromResolved?.name || departureId,
            type: "AIRPORT"
          },
          toResolved: {
            code: arrivalId,
            name: toResolved?.name || arrivalId,
            type: "AIRPORT"
          },
          flights: fallback.flights,
          warnings
        };
        setCachedPayload(cacheKey, payload);
        return NextResponse.json(payload);
      }
      const detail = cleanString(fallback.result.detail);
      if (detail) {
        return NextResponse.json(
          {
            error: "scrapeless_flight_search_failed",
            detail
          },
          { status: 502 }
        );
      }
    }
  }

  if (serpFailure?.status === 429 && !scrapelessApiKey) {
    return NextResponse.json(
      {
        error: "serpapi_quota_exceeded",
        detail:
          "SerpApiのクォータ上限に達しています。Scrapeless APIキーを設定すると自動フォールバックできます。"
      },
      { status: 429 }
    );
  }
  if (serpFailure && isTransientFailure(serpFailure)) {
    return NextResponse.json({
      flights: [],
      warnings: [
        `外部フライトAPIが一時的に不安定です（${cleanString(serpFailure.detail) || `status ${serpFailure.status}`}）。少し待って再試行してください。`
      ]
    });
  }
  if (serpFailure) {
    return NextResponse.json(
      {
        error: "flight_search_failed",
        detail: cleanString(serpFailure.detail) || "フライト候補の取得に失敗しました。"
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      error: "no_flight_found",
      detail: "該当するフライト候補が見つかりませんでした。"
    },
    { status: 404 }
  );
}
