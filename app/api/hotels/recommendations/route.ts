import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_HOST = "booking-com-api5.p.rapidapi.com";
const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const DEFAULT_LOCALE = process.env.BOOKING_DEFAULT_LOCALE ?? "ja";
const DEFAULT_CURRENCY = process.env.BOOKING_DEFAULT_CURRENCY ?? "JPY";
const DEFAULT_GL = process.env.SERPAPI_GL ?? "jp";
const SERPAPI_NO_CACHE = process.env.SERPAPI_NO_CACHE === "true";
const RETRY_DELAYS_MS = [300, 800] as const;
const TRANSIENT_UPSTREAM_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const CACHE_TTL_MS = 1000 * 60 * 60;
const DESTINATION_ALIASES: Record<string, string[]> = {
  博多: ["hakata", "fukuoka"],
  福岡: ["fukuoka", "hakata"],
  鹿児島: ["kagoshima"],
  東京: ["tokyo"],
  大阪: ["osaka"],
  京都: ["kyoto"],
  札幌: ["sapporo"],
  那覇: ["naha", "okinawa"],
  沖縄: ["okinawa", "naha"]
};

type RecommendationsRequest = {
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  rooms?: number;
  locale?: string;
  currency?: string;
  limit?: number;
};

type LocationCandidate = {
  destId: string;
  name: string;
  type?: string;
};

type HotelRecommendation = {
  name: string;
  price: number | null;
  currency: string | null;
  score: number | null;
  reviewCount: number | null;
  address: string | null;
  link: string | null;
  source: "booking-com-api5" | "serpapi/google_hotels";
};

type UpstreamResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  detail: string;
};

type RecommendationsCacheEntry = {
  destinationResolved: LocationCandidate;
  hotels: HotelRecommendation[];
  cachedAt: number;
};

const recommendationsCache = new Map<string, RecommendationsCacheEntry>();

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeHotelAddress(value: unknown) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }
  if (/^(hotel|hotels|vacation rental|hostel|apartment|apartments|guest house|guesthouse)$/i.test(text)) {
    return "";
  }
  return text;
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
    const nestedError = source.error && typeof source.error === "object"
      ? source.error
      : null;
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

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCacheKey(
  destination: string,
  currency: string,
  checkIn: string,
  checkOut: string,
  adults: number
) {
  return [
    cleanString(destination).toLowerCase(),
    currency.toUpperCase(),
    cleanString(checkIn),
    cleanString(checkOut),
    String(adults)
  ].join("|");
}

function getCachedRecommendations(cacheKey: string) {
  const entry = recommendationsCache.get(cacheKey);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    recommendationsCache.delete(cacheKey);
    return null;
  }
  return entry;
}

function setCachedRecommendations(
  cacheKey: string,
  destinationResolved: LocationCandidate,
  hotels: HotelRecommendation[]
) {
  if (hotels.length === 0) {
    return;
  }
  recommendationsCache.set(cacheKey, {
    destinationResolved,
    hotels,
    cachedAt: Date.now()
  });
}

function isTransientFailure(result: UpstreamResult | null | undefined) {
  if (!result || result.ok) {
    return false;
  }
  return TRANSIENT_UPSTREAM_STATUS.has(result.status);
}

function isQuotaFailure(result: UpstreamResult | null | undefined) {
  if (!result || result.ok) {
    return false;
  }
  const detail = cleanString(result.detail).toLowerCase();
  const hasQuotaSignal =
    detail.includes("quota") ||
    detail.includes("exceeded the monthly quota") ||
    detail.includes("upgrade your plan") ||
    detail.includes("monthly");
  if (hasQuotaSignal) {
    return true;
  }
  if (result.status === 429 && !detail) {
    return true;
  }
  return false;
}

function buildTransientWarning(detail?: string) {
  const normalized = cleanString(detail);
  if (normalized) {
    return `外部ホテルAPIが一時的に不安定です（${normalized}）。少し待って再試行してください。`;
  }
  return "外部ホテルAPIが一時的に不安定です。少し待って再試行してください。";
}

function buildQuotaWarning(detail?: string) {
  const normalized = cleanString(detail);
  if (normalized) {
    return `Google Hotels API のクォータ上限に達しました（${normalized}）。SerpApi プランの更新、またはリセット後に再試行してください。`;
  }
  return "Google Hotels API のクォータ上限に達しました。SerpApi プランの更新、またはリセット後に再試行してください。";
}

function buildSerpHotelSearchUrl({
  apiKey,
  query,
  checkIn,
  checkOut,
  adults,
  currency,
  locale,
  gl
}: {
  apiKey: string;
  query: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
  locale: string;
  gl: string;
}) {
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google_hotels");
  url.searchParams.set("q", query);
  url.searchParams.set("check_in_date", checkIn);
  url.searchParams.set("check_out_date", checkOut);
  url.searchParams.set("adults", String(adults));
  url.searchParams.set("currency", currency);
  url.searchParams.set("hl", locale === "ja" ? "ja" : "en");
  url.searchParams.set("gl", gl);
  url.searchParams.set("no_cache", SERPAPI_NO_CACHE ? "true" : "false");
  return url;
}

function buildPublicGoogleHotelsUrl({
  query,
  checkIn,
  checkOut,
  adults,
  currency,
  locale,
  gl
}: {
  query: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
  locale: string;
  gl: string;
}) {
  const url = new URL("https://www.google.com/travel/hotels");
  url.searchParams.set("q", query);
  url.searchParams.set("check_in_date", checkIn);
  url.searchParams.set("check_out_date", checkOut);
  url.searchParams.set("adults", String(adults));
  url.searchParams.set("hl", locale === "ja" ? "ja" : "en");
  url.searchParams.set("gl", gl);
  url.searchParams.set("curr", currency.toUpperCase());
  return url.toString();
}

function buildDestinationQueries(destination: string) {
  const queries: string[] = [];
  const push = (value: string) => {
    const normalized = cleanString(value);
    if (!normalized || queries.includes(normalized)) {
      return;
    }
    queries.push(normalized);
  };
  const splitSegments = (value: string) =>
    value
      .split(/[・,，、/／|｜]/)
      .map((entry) => cleanString(entry))
      .filter(Boolean);

  const normalized = cleanString(destination);
  push(normalized);
  splitSegments(normalized).slice(0, 4).forEach(push);

  const withoutBrackets = normalized.replace(/[（(][^）)]*[）)]/g, " ").replace(/\s+/g, " ");
  push(withoutBrackets);
  splitSegments(withoutBrackets).slice(0, 4).forEach(push);

  const innerParts = Array.from(normalized.matchAll(/[（(]([^）)]+)[）)]/g))
    .map((match) => cleanString(match[1]))
    .filter(Boolean);
  innerParts.slice(0, 3).forEach((part) => {
    push(part);
    splitSegments(part).slice(0, 4).forEach(push);
  });

  return queries.slice(0, 8);
}

function normalizeLocationText(value: string) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[（）。・,，、/／|｜\-\s]/g, "");
}

function stripDestinationSuffix(value: string) {
  return cleanString(value).replace(
    /(周辺|付近|近辺|周り|あたり|エリア|方面|市内|観光|旅行|ホテル|宿泊|滞在)$/g,
    ""
  );
}

function buildDestinationTokens(destination: string) {
  const tokenSet = new Set<string>();
  const queries = buildDestinationQueries(destination);
  const pushToken = (raw: string) => {
    const cleaned = stripDestinationSuffix(raw);
    if (!cleaned) {
      return;
    }
    const normalized = normalizeLocationText(cleaned);
    if (normalized.length >= 2) {
      tokenSet.add(normalized);
    }
    Object.entries(DESTINATION_ALIASES).forEach(([key, aliases]) => {
      if (cleaned.includes(key)) {
        tokenSet.add(normalizeLocationText(key));
        aliases.forEach((alias) => tokenSet.add(normalizeLocationText(alias)));
      }
    });
  };

  queries.forEach((query) => {
    pushToken(query);
    query
      .split(/[・,，、/／|｜\s]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(pushToken);
  });

  return Array.from(tokenSet).slice(0, 12);
}

function getLocationTypePriority(type?: string) {
  const normalized = cleanString(type).toUpperCase();
  if (normalized === "CITY") {
    return 0;
  }
  if (normalized === "DISTRICT" || normalized === "REGION") {
    return 1;
  }
  if (normalized === "LANDMARK") {
    return 2;
  }
  if (normalized === "HOTEL") {
    return 3;
  }
  return 4;
}

function scoreLocationCandidateForDestination(
  candidate: LocationCandidate,
  destinationTokens: string[]
) {
  const normalizedName = normalizeLocationText(candidate.name);
  let score = 0;
  for (const token of destinationTokens) {
    if (normalizedName === token) {
      score = Math.max(score, 100);
      continue;
    }
    if (normalizedName.includes(token) || token.includes(normalizedName)) {
      score = Math.max(score, 70);
      continue;
    }
  }
  score += Math.max(0, 20 - getLocationTypePriority(candidate.type) * 4);
  return score;
}

function rankLocationCandidatesForDestination(
  candidates: LocationCandidate[],
  destination: string
) {
  const destinationTokens = buildDestinationTokens(destination);
  return [...candidates].sort((a, b) => {
    const scoreA = scoreLocationCandidateForDestination(a, destinationTokens);
    const scoreB = scoreLocationCandidateForDestination(b, destinationTokens);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return getLocationTypePriority(a.type) - getLocationTypePriority(b.type);
  });
}

function filterHotelsByDestination(
  hotels: HotelRecommendation[],
  destination: string,
  selectedLocationName: string
) {
  if (hotels.length === 0) {
    return hotels;
  }
  const destinationTokens = buildDestinationTokens(destination);
  if (destinationTokens.length === 0) {
    return hotels;
  }
  const selectedNormalized = normalizeLocationText(selectedLocationName);
  const matched = hotels.filter((hotel) => {
    const blob = normalizeLocationText(`${hotel.name} ${hotel.address ?? ""}`);
    if (!blob) {
      return false;
    }
    if (selectedNormalized && blob.includes(selectedNormalized)) {
      return true;
    }
    return destinationTokens.some((token) => blob.includes(token));
  });
  if (matched.length > 0) {
    return matched;
  }
  return [];
}

function resolveSearchType(value: unknown) {
  const normalized = cleanString(value).toUpperCase();
  if (normalized === "CITY") {
    return "CITY";
  }
  if (normalized === "DISTRICT" || normalized === "REGION") {
    return "DISTRICT";
  }
  if (normalized === "LANDMARK") {
    return "LANDMARK";
  }
  if (normalized === "HOTEL") {
    return "HOTEL";
  }
  return "CITY";
}

async function fetchUpstream(url: URL, apiKey: string, host: string): Promise<UpstreamResult> {
  try {
    const response = await fetch(url.toString(), {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": host
      },
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

async function fetchSerpUpstream(url: URL): Promise<UpstreamResult> {
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
      error instanceof Error ? error.message : "Network error while contacting SerpApi.";
    return {
      ok: false,
      status: 503,
      payload: null,
      detail
    };
  }
}

async function fetchSerpUpstreamWithRetry(url: URL, maxAttempts = 3): Promise<UpstreamResult> {
  let lastResult: UpstreamResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await fetchSerpUpstream(url);
    if (result.ok) {
      return result;
    }
    lastResult = result;
    if (isQuotaFailure(result)) {
      break;
    }
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

async function fetchUpstreamWithRetry(
  url: URL,
  apiKey: string,
  host: string,
  maxAttempts = 3
): Promise<UpstreamResult> {
  let lastResult: UpstreamResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await fetchUpstream(url, apiKey, host);
    if (result.ok) {
      return result;
    }
    lastResult = result;
    if (isQuotaFailure(result)) {
      break;
    }
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

function collectObjects(value: unknown, maxDepth = 4): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  function walk(current: unknown, depth: number) {
    if (depth > maxDepth || current === null || current === undefined) {
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      results.push(record);
      Object.values(record).forEach((item) => walk(item, depth + 1));
    }
  }

  walk(value, 0);
  return results;
}

function extractLocationCandidates(payload: unknown) {
  const directResults = (
    payload &&
    typeof payload === "object" &&
    Array.isArray(
      (
        payload as {
          data?: {
            data?: {
              autoCompleteSuggestions?: {
                results?: unknown[];
              };
            };
          };
        }
      ).data?.data?.autoCompleteSuggestions?.results
    )
  )
    ? (
        payload as {
          data: {
            data: {
              autoCompleteSuggestions: {
                results: unknown[];
              };
            };
          };
        }
      ).data.data.autoCompleteSuggestions.results
    : [];

  const prioritizedCandidates: LocationCandidate[] = [];
  directResults.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const entry = item as {
      destination?: { destId?: string; destType?: string };
      displayInfo?: { title?: string };
    };
    const destId = cleanString(entry.destination?.destId);
    const name = cleanString(entry.displayInfo?.title);
    if (!destId || !name) {
      return;
    }
    prioritizedCandidates.push({
      destId,
      name,
      type: cleanString(entry.destination?.destType) || undefined
    });
  });

  if (prioritizedCandidates.length > 0) {
    return prioritizedCandidates.sort((a, b) => {
      const priority = (candidate: LocationCandidate) => {
        const type = (candidate.type || "").toUpperCase();
        if (type === "CITY") {
          return 0;
        }
        if (type === "DISTRICT" || type === "REGION") {
          return 1;
        }
        if (type === "LANDMARK") {
          return 2;
        }
        if (type === "HOTEL") {
          return 3;
        }
        return 4;
      };
      return priority(a) - priority(b);
    });
  }

  const records = collectObjects(payload, 5);
  const candidates: LocationCandidate[] = [];

  records.forEach((record) => {
    const destId = cleanString(
      record.dest_id ?? record.destId ?? record.city_ufi ?? record.id
    );
    const name = cleanString(
      record.name ?? record.city_name ?? record.label ?? record.region ?? record.country
    );
    if (!destId || !name) {
      return;
    }
    const type = cleanString(record.dest_type ?? record.type) || undefined;
    candidates.push({ destId, name, type });
  });

  const ranked = candidates.sort((a, b) => {
    const priority = (candidate: LocationCandidate) => {
      const type = (candidate.type || "").toLowerCase();
      if (type.includes("city")) {
        return 0;
      }
      if (type.includes("district") || type.includes("region")) {
        return 1;
      }
      if (type.includes("hotel")) {
        return 2;
      }
      return 3;
    };
    return priority(a) - priority(b);
  });

  const deduped = new Map<string, LocationCandidate>();
  ranked.forEach((candidate) => {
    if (!deduped.has(candidate.destId)) {
      deduped.set(candidate.destId, candidate);
    }
  });

  return Array.from(deduped.values());
}

function isHotelLike(record: Record<string, unknown>) {
  if (cleanString(record.hotel_name)) {
    return true;
  }
  const hasName = Boolean(cleanString(record.name));
  const hasHotelSignal = Boolean(
    cleanString(record.url) ||
      cleanString(record.url_without_tracking) ||
      cleanString(record.hotel_id) ||
      cleanString(record.property_id) ||
      parseNumber(record.review_score) !== null ||
      parseNumber(record.reviewScore) !== null ||
      parseNumber(record.reviewCount) !== null ||
      parseNumber(record.min_total_price) !== null ||
      parseNumber(record.price) !== null ||
      (record.price_breakdown && typeof record.price_breakdown === "object")
  );
  return hasName && hasHotelSignal;
}

function extractPrice(record: Record<string, unknown>) {
  const direct =
    parseNumber(record.min_total_price) ??
    parseNumber(record.price) ??
    parseNumber(record.price_breakdown);
  if (direct !== null) {
    return direct;
  }

  const nested = [
    record.price_breakdown,
    record.composite_price_breakdown,
    record.total_price,
    record.price_details
  ];

  for (const entry of nested) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const object = entry as Record<string, unknown>;
    const value =
      parseNumber(object.gross_price) ??
      parseNumber((object.gross_price as Record<string, unknown> | undefined)?.value) ??
      parseNumber(object.all_inclusive_price) ??
      parseNumber((object.gross_amount as Record<string, unknown> | undefined)?.value) ??
      parseNumber(object.value);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function extractSerpPropertyObjects(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [] as Record<string, unknown>[];
  }
  const root = payload as Record<string, unknown>;
  const properties = Array.isArray(root.properties) ? root.properties : [];
  return properties.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item))
  );
}

const BLOCKED_HOTEL_LINK_HOSTS = ["bluepillow.com", "vrbo.com"];

function isInternalGoogleTravelUrl(value: string) {
  return /\/_\/TravelFrontendUi\/data\/batchexecute/i.test(value);
}

function sanitizePublicGoogleHotelsLink(link: string) {
  const normalized = cleanString(link);
  if (!normalized) {
    return "";
  }
  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    if (!(hostname === "www.google.com" || hostname.endsWith(".google.com"))) {
      return "";
    }
    if (isInternalGoogleTravelUrl(normalized)) {
      return "";
    }
    if (!/\/travel\/hotels/i.test(url.pathname) && !/\/travel\/search/i.test(url.pathname)) {
      return "";
    }
    return normalized;
  } catch {
    return "";
  }
}

function isAllowedSerpHotelType(value: unknown) {
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) {
    return true;
  }
  return !/(vacation rental|apartment|condo|villa|holiday rental|hostel|campground|cabin)/i.test(
    normalized
  );
}

function sanitizeSerpHotelLink(link: string, fallbackLink: string) {
  const normalized = cleanString(link);
  if (!normalized) {
    return fallbackLink;
  }
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    if (
      BLOCKED_HOTEL_LINK_HOSTS.some(
        (blockedHost) => hostname === blockedHost || hostname.endsWith(`.${blockedHost}`)
      )
    ) {
      return fallbackLink;
    }
  } catch {
    return fallbackLink;
  }
  return normalized;
}

function preferGoogleHotelsLink(payloadLink: string, providerLink: string, fallbackLink: string) {
  const primary = sanitizePublicGoogleHotelsLink(payloadLink) || sanitizePublicGoogleHotelsLink(fallbackLink);
  if (primary) {
    return primary;
  }
  return sanitizeSerpHotelLink(providerLink, fallbackLink);
}

function extractSerpHotelRecommendations(
  payload: unknown,
  limit: number,
  {
    query,
    checkIn,
    checkOut,
    adults,
    currency,
    locale,
    gl
  }: {
    query: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    currency: string;
    locale: string;
    gl: string;
  }
) {
  const properties = extractSerpPropertyObjects(payload);
  const fallbackLink =
    rootSearchUrlFromPayload(payload) ||
    buildPublicGoogleHotelsUrl({
      query,
      checkIn,
      checkOut,
      adults,
      currency,
      locale,
      gl
    });
  const hotels = properties
    .map((property): HotelRecommendation | null => {
      const name = cleanString(property.name);
      if (!name || !isAllowedSerpHotelType(property.type)) {
        return null;
      }
      const ratePerNight =
        property.rate_per_night && typeof property.rate_per_night === "object"
          ? (property.rate_per_night as Record<string, unknown>)
          : null;
      const totalRate =
        property.total_rate && typeof property.total_rate === "object"
          ? (property.total_rate as Record<string, unknown>)
          : null;
      const gps =
        property.gps_coordinates && typeof property.gps_coordinates === "object"
          ? (property.gps_coordinates as Record<string, unknown>)
          : null;
      const price =
        parseNumber(ratePerNight?.lowest) ??
        parseNumber(ratePerNight?.extracted_lowest) ??
        parseNumber(totalRate?.lowest) ??
        parseNumber(totalRate?.extracted_lowest) ??
        parseNumber(property.price);
      const currency =
        cleanString(ratePerNight?.currency) ||
        cleanString(totalRate?.currency) ||
        cleanString(property.currency) ||
        null;
      const score =
        parseNumber(property.overall_rating) ??
        parseNumber(property.rating) ??
        parseNumber(property.reviews);
      const reviewCount =
        parseNumber(property.reviews) ??
        parseNumber(property.extracted_total_reviews) ??
        parseNumber(property.total_reviews);
      const addressParts = [
        sanitizeHotelAddress(property.address),
        sanitizeHotelAddress(property.neighborhood)
      ].filter(Boolean);
      const address = addressParts.length > 0 ? addressParts.join(", ") : null;
      const googleHotelsLink = cleanString(
        fallbackLink ||
          (gps?.latitude && gps?.longitude
            ? `https://www.google.com/travel/hotels?q=${encodeURIComponent(name)}`
            : "")
      );
      const link =
        preferGoogleHotelsLink(
          cleanString(property.google_hotels_url ?? property.googleHotelsUrl),
          cleanString(property.link),
          googleHotelsLink
        ) || null;

      return {
        name,
        price,
        currency,
        score,
        reviewCount,
        address,
        link,
        source: "serpapi/google_hotels"
      };
    })
    .filter((item): item is HotelRecommendation => Boolean(item));

  const deduped = new Map<string, HotelRecommendation>();
  hotels.forEach((hotel) => {
    const key = `${hotel.name}|${hotel.address ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, hotel);
    }
  });

  return Array.from(deduped.values()).slice(0, limit);
}

function rootSearchUrlFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const root = payload as Record<string, unknown>;
  const metadata =
    root.search_metadata && typeof root.search_metadata === "object"
      ? (root.search_metadata as Record<string, unknown>)
      : null;
  return sanitizePublicGoogleHotelsLink(cleanString(metadata?.google_hotels_url));
}

function extractHotelRecommendations(payload: unknown, limit: number) {
  const fromOpenProperty = collectObjects(payload, 24)
    .filter((record) => cleanString(record.type) === "abu.search.OpenPropertyPage")
    .map((record) =>
      (record.props && typeof record.props === "object"
        ? (record.props as Record<string, unknown>).property
        : null)
    )
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((property): HotelRecommendation | null => {
      const name = cleanString(property.name);
      if (!name) {
        return null;
      }
      const priceBreakdown =
        property.priceBreakdown && typeof property.priceBreakdown === "object"
          ? (property.priceBreakdown as Record<string, unknown>)
          : null;
      const grossPrice =
        priceBreakdown?.grossPrice && typeof priceBreakdown.grossPrice === "object"
          ? (priceBreakdown.grossPrice as Record<string, unknown>)
          : null;
      const price =
        parseNumber(grossPrice?.value) ??
        parseNumber(grossPrice?.amountRounded) ??
        parseNumber(property.price);
      const currency =
        cleanString(grossPrice?.currency) ||
        cleanString(property.currency) ||
        null;
      const score = parseNumber(property.reviewScore);
      const reviewCount = parseNumber(property.reviewCount);
      const address: string | null = null;
      const propertyId = cleanString(property.id);
      const link = propertyId ? `https://www.booking.com/hotel/tw/${propertyId}.html` : null;

      return {
        name,
        price,
        currency,
        score,
        reviewCount,
        address,
        link,
        source: "booking-com-api5" as const
      };
    })
    .filter((item): item is HotelRecommendation => Boolean(item));

  if (fromOpenProperty.length > 0) {
    const deduped = new Map<string, HotelRecommendation>();
    fromOpenProperty.forEach((hotel) => {
      if (!deduped.has(hotel.name)) {
        deduped.set(hotel.name, hotel);
      }
    });
    return Array.from(deduped.values()).slice(0, limit);
  }

  const records = collectObjects(payload, 6).filter(isHotelLike);
  const hotels: HotelRecommendation[] = [];

  records.forEach((record) => {
    const name = cleanString(record.hotel_name ?? record.name);
    if (!name) {
      return;
    }

    const addressParts = [
      sanitizeHotelAddress(record.address),
      sanitizeHotelAddress(record.city),
      sanitizeHotelAddress(record.country_trans ?? record.country)
    ].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(", ") : null;
    const link =
      cleanString(record.url ?? record.deep_link ?? record.hotel_url ?? record.url_without_tracking) || null;
    const score =
      parseNumber(record.review_score) ??
      parseNumber(record.reviewScore) ??
      parseNumber(record.score);
    const reviewCount =
      parseNumber(record.review_nr) ??
      parseNumber(record.reviewCount) ??
      parseNumber(record.number_of_reviews);
    const currency =
      cleanString(record.currencycode ?? record.currency_code ?? record.currency) || null;

    hotels.push({
      name,
      price: extractPrice(record),
      currency,
      score,
      reviewCount,
      address,
      link,
      source: "booking-com-api5"
    });
  });

  const deduped = new Map<string, HotelRecommendation>();
  hotels.forEach((hotel) => {
    const key = `${hotel.name}|${hotel.address ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, hotel);
    }
  });

  return Array.from(deduped.values()).slice(0, limit);
}

export async function POST(request: Request) {
  const serpApiKey = process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || "";
  if (!serpApiKey) {
    return NextResponse.json({ error: "missing_hotel_api_key" }, { status: 500 });
  }

  const body = (await request.json()) as RecommendationsRequest;
  const destination = cleanString(body.destination);
  const checkIn = cleanString(body.checkIn);
  const checkOut = cleanString(body.checkOut);
  const locale = cleanString(body.locale) || DEFAULT_LOCALE;
  const currency = (cleanString(body.currency) || DEFAULT_CURRENCY).toUpperCase();
  const adults = Math.max(1, Math.min(8, Math.floor(body.adults ?? 2)));
  const limit = Math.max(1, Math.min(10, Math.floor(body.limit ?? 5)));
  const gl = DEFAULT_GL;

  if (!destination) {
    return NextResponse.json({ error: "destination_required" }, { status: 400 });
  }
  if (!checkIn || !checkOut || !isValidDate(checkIn) || !isValidDate(checkOut)) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }
  const cacheKey = buildCacheKey(destination, currency, checkIn, checkOut, adults);

  let serpFailure: UpstreamResult | null = null;
  for (const query of buildDestinationQueries(destination)) {
    const searchUrl = buildSerpHotelSearchUrl({
      apiKey: serpApiKey,
      query,
      checkIn,
      checkOut,
      adults,
      currency,
      locale,
      gl
    });
    const result = await fetchSerpUpstreamWithRetry(searchUrl);
    if (!result.ok) {
      serpFailure = result;
      continue;
    }
    const hotels = extractSerpHotelRecommendations(result.payload, limit, {
      query,
      checkIn,
      checkOut,
      adults,
      currency,
      locale,
      gl
    });
    const filteredHotels = filterHotelsByDestination(hotels, destination, query);
    if (filteredHotels.length > 0) {
      const destinationResolved = {
        destId: query,
        name: query,
        type: "CITY"
      };
      setCachedRecommendations(cacheKey, destinationResolved, filteredHotels);
      return NextResponse.json({
        destinationResolved,
        hotels: filteredHotels,
        warnings: []
      });
    }
  }

  if (isQuotaFailure(serpFailure)) {
    const cached = getCachedRecommendations(cacheKey);
    if (cached) {
      return NextResponse.json({
        destinationResolved: cached.destinationResolved,
        hotels: cached.hotels.slice(0, limit),
        warnings: [buildQuotaWarning(serpFailure?.detail), "直近の候補を表示しています。"]
      });
    }
    return NextResponse.json(
      {
        error: "hotel_api_quota_exceeded",
        status: 429,
        detail: buildQuotaWarning(serpFailure?.detail)
      },
      { status: 429 }
    );
  }

  if (isTransientFailure(serpFailure)) {
    const cached = getCachedRecommendations(cacheKey);
    if (cached) {
      return NextResponse.json({
        destinationResolved: cached.destinationResolved,
        hotels: cached.hotels.slice(0, limit),
        warnings: [buildTransientWarning(serpFailure?.detail), "直近の候補を表示しています。"]
      });
    }
    return NextResponse.json({
      hotels: [],
      warnings: [buildTransientWarning(serpFailure?.detail)]
    });
  }

  return NextResponse.json(
    {
      error: "hotel_search_failed",
      status: serpFailure?.status ?? 502,
      detail:
        serpFailure?.detail || "Google Hotels からホテル候補を取得できませんでした。"
    },
    { status: 502 }
  );
}
