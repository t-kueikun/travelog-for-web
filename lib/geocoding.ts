const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

type CachedEntry = {
  expiresAt: number;
  point: GeocodingPoint | null;
};

const searchCache = new Map<string, CachedEntry>();

export type GeocodingPoint = {
  placeName: string;
  lng: number;
  lat: number;
  source: "geoapify" | "nominatim";
};

function cleanQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getCountryBias(query: string) {
  const normalized = cleanQuery(query);
  if (!normalized) {
    return "";
  }
  const countryPatterns: Array<{ code: string; pattern: RegExp }> = [
    {
      code: "th",
      pattern:
        /タイ|ประเทศไทย|thailand|bangkok|バンコク|スワンナプーム|ドンムアン|ワット・ポー|ワット・アルン|チャトゥチャック|カオサン/i
    },
    {
      code: "tw",
      pattern: /台湾|taiwan|台北|taipei|高雄|桃園|松山/i
    },
    {
      code: "kr",
      pattern: /韓国|korea|ソウル|seoul|釜山|busan|仁川|金浦/i
    },
    {
      code: "sg",
      pattern: /シンガポール|singapore|チャンギ/i
    },
    {
      code: "hk",
      pattern: /香港|hong kong|hkia/i
    },
    {
      code: "qa",
      pattern: /カタール|qatar|ドーハ|doha|ハマド/i
    },
    {
      code: "us",
      pattern:
        /アメリカ|米国|usa|united states|ニューヨーク|new york|ロサンゼルス|los angeles|サンフランシスコ|san francisco/i
    },
    {
      code: "gb",
      pattern: /イギリス|英国|united kingdom|ロンドン|london/i
    },
    {
      code: "fr",
      pattern: /フランス|france|パリ|paris/i
    },
    {
      code: "au",
      pattern: /オーストラリア|australia|シドニー|sydney|メルボルン|melbourne/i
    },
    {
      code: "nz",
      pattern: /ニュージーランド|new zealand|オークランド|auckland/i
    },
    {
      code: "jp",
      pattern:
        /日本|東京都|大阪府|京都府|北海道|羽田|成田|伊丹|関西国際|梅田|新世界|道頓堀|錦市場|福岡|博多|大阪国際空港|空港|駅/i
    }
  ];

  return countryPatterns.find(({ pattern }) => pattern.test(normalized))?.code ?? "";
}

function getGeoapifyApiKey() {
  return (
    process.env.GEOAPIFY_API_KEY ||
    process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ||
    ""
  ).trim();
}

async function searchWithGeoapify(query: string) {
  const apiKey = getGeoapifyApiKey();
  if (!apiKey) {
    return null;
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("lang", "ja");
  url.searchParams.set("limit", "1");
  const countryBias = getCountryBias(query);
  if (countryBias) {
    url.searchParams.set("filter", `countrycode:${countryBias}`);
    url.searchParams.set("bias", `countrycode:${countryBias}`);
  }
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url.toString(), {
    cache: "force-cache"
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] | number[] };
      properties?: {
        formatted?: string;
        address_line1?: string;
        address_line2?: string;
      };
    }>;
  };

  const feature = Array.isArray(payload.features) ? payload.features[0] : null;
  const coordinates = Array.isArray(feature?.geometry?.coordinates)
    ? feature.geometry?.coordinates
    : null;
  const lng = typeof coordinates?.[0] === "number" ? coordinates[0] : null;
  const lat = typeof coordinates?.[1] === "number" ? coordinates[1] : null;
  if (lng === null || lat === null) {
    return null;
  }

  return {
    placeName:
      feature?.properties?.formatted?.trim() ||
      [feature?.properties?.address_line1, feature?.properties?.address_line2]
        .filter(Boolean)
        .join(", ") ||
      query,
    lng,
    lat,
    source: "geoapify" as const
  };
}

async function searchWithNominatim(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "ja");
  const countryBias = getCountryBias(query);
  if (countryBias) {
    url.searchParams.set("countrycodes", countryBias);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "TraveLog/1.0"
    },
    cache: "force-cache"
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Array<{
    display_name?: string;
    lon?: string;
    lat?: string;
  }>;
  const first = Array.isArray(payload) ? payload[0] : null;
  const lng = first?.lon ? Number(first.lon) : NaN;
  const lat = first?.lat ? Number(first.lat) : NaN;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return {
    placeName: first?.display_name?.trim() || query,
    lng,
    lat,
    source: "nominatim" as const
  };
}

export function getGeocodingProviderLabel() {
  return getGeoapifyApiKey() ? "Geoapify" : "Nominatim";
}

export async function geocodePlace(query: string) {
  const normalizedQuery = cleanQuery(query);
  if (!normalizedQuery) {
    return null;
  }

  const cacheKey = normalizedQuery.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.point;
  }

  const point =
    (await searchWithGeoapify(normalizedQuery)) ||
    (await searchWithNominatim(normalizedQuery));

  searchCache.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    point
  });
  return point;
}

export function hasGeoapifyApiKey() {
  return Boolean(getGeoapifyApiKey());
}
