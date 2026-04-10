import { NextResponse } from "next/server";
import {
  geocodePlace,
  getGeocodingProviderLabel,
  hasGeoapifyApiKey
} from "@/lib/geocoding";

export const runtime = "nodejs";

type StopPayload = {
  id?: string;
  label?: string;
  query?: string;
  queryCandidates?: string[];
  destinationHint?: string;
  kind?: string;
  sortValue?: string;
  subtitle?: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTokenText(value: string) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[()（）]/g, " ")
    .replace(/[,&/／、・]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WEAK_DESTINATION_TOKENS = new Set([
  "台湾",
  "taiwan",
  "日本",
  "japan",
  "タイ",
  "thailand",
  "韓国",
  "korea",
  "hong",
  "kong",
  "香港"
]);

function extractPriorityDestinationTokens(destinationHint: string) {
  const normalized = normalizeTokenText(destinationHint);
  if (!normalized) {
    return [];
  }
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
        .filter((token) => !WEAK_DESTINATION_TOKENS.has(token))
    )
  );
}

function extractPrimaryDestinationQuery(destinationHint: string) {
  const tokens = extractPriorityDestinationTokens(destinationHint);
  if (tokens.length === 0) {
    return cleanString(destinationHint);
  }
  return tokens.slice(0, 2).join(" ");
}

function hasStrongDestinationMatch(placeName: string, destinationHint: string) {
  const normalizedPlace = normalizeTokenText(placeName);
  const destinationTokens = extractPriorityDestinationTokens(destinationHint);
  if (destinationTokens.length === 0) {
    return true;
  }
  return destinationTokens.some((token) => normalizedPlace.includes(token));
}

function scoreResolvedPoint(
  placeName: string,
  candidate: string,
  destinationHint: string
) {
  const normalizedPlace = normalizeTokenText(placeName);
  const normalizedCandidate = normalizeTokenText(candidate);
  let score = 0;
  if (normalizedCandidate && normalizedPlace.includes(normalizedCandidate)) {
    score += 80;
  }

  const destinationTokens = extractPriorityDestinationTokens(destinationHint);
  destinationTokens.forEach((token) => {
    if (normalizedPlace.includes(token)) {
      score += 30;
    } else {
      score -= 15;
    }
  });
  return score;
}

async function resolveStop(stop: StopPayload) {
  const candidates = [
    ...((Array.isArray(stop.queryCandidates) ? stop.queryCandidates : []).map((item) =>
      cleanString(item)
    )),
    cleanString(stop.query)
  ].filter(Boolean);

  let bestResolved: Awaited<ReturnType<typeof geocodePlace>> | null = null;
  let bestMatchedQuery = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const resolved = await geocodePlace(candidate);
    if (!resolved) {
      continue;
    }
    const score = scoreResolvedPoint(
      resolved.placeName,
      candidate,
      cleanString(stop.destinationHint)
    );
    if (score > bestScore) {
      bestScore = score;
      bestResolved = resolved;
      bestMatchedQuery = candidate;
    }
  }

  if (
    bestResolved &&
    cleanString(stop.destinationHint) &&
    !hasStrongDestinationMatch(bestResolved.placeName, cleanString(stop.destinationHint))
  ) {
    const fallbackQuery = extractPrimaryDestinationQuery(cleanString(stop.destinationHint));
    if (fallbackQuery) {
      const fallbackResolved = await geocodePlace(fallbackQuery);
      if (fallbackResolved) {
        bestResolved = fallbackResolved;
        bestMatchedQuery = fallbackQuery;
      }
    }
  }

  if (!bestResolved) {
    return {
      warning: `「${cleanString(stop.label)}」の位置を地図化できませんでした。`
    } as const;
  }

  return {
    point: {
      id: cleanString(stop.id),
      label: cleanString(stop.label),
      query: bestMatchedQuery || cleanString(stop.query),
      kind: cleanString(stop.kind),
      sortValue: cleanString(stop.sortValue),
      subtitle: cleanString(stop.subtitle),
      destinationHint: cleanString(stop.destinationHint),
      placeName: bestResolved.placeName,
      lng: bestResolved.lng,
      lat: bestResolved.lat
    }
  } as const;
}

export async function POST(request: Request) {
  let body: { stops?: StopPayload[] } | null = null;
  try {
    body = (await request.json()) as { stops?: StopPayload[] };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawStops = Array.isArray(body?.stops) ? body.stops : [];
  const uniqueStops: StopPayload[] = [];
  const seenQueries = new Set<string>();

  for (const stop of rawStops) {
    const query = cleanString(stop?.query);
    const label = cleanString(stop?.label);
    if (!query || !label) {
      continue;
    }
    const key = `${cleanString(stop?.kind)}:${label.toLowerCase()}`;
    if (seenQueries.has(key)) {
      continue;
    }
    seenQueries.add(key);
    uniqueStops.push({
      id: cleanString(stop?.id) || key,
      label,
      query,
      queryCandidates: Array.isArray(stop?.queryCandidates)
        ? stop.queryCandidates
            .map((item) => cleanString(item))
            .filter(Boolean)
            .slice(0, 5)
        : [],
      kind: cleanString(stop?.kind),
      sortValue: cleanString(stop?.sortValue),
      subtitle: cleanString(stop?.subtitle),
      destinationHint: cleanString(stop?.destinationHint)
    });
    if (uniqueStops.length >= 12) {
      break;
    }
  }

  const warnings: string[] = [];
  const resolvedStops = await Promise.all(uniqueStops.map((stop) => resolveStop(stop)));
  const points = resolvedStops.flatMap((result) => {
    if ("warning" in result && typeof result.warning === "string") {
      warnings.push(result.warning);
      return [];
    }
    return [result.point];
  });

  if (points.length === 0 && !hasGeoapifyApiKey()) {
    warnings.push(
      "無料表示はできますが、位置検索は公開Nominatimだと不安定です。.env.local に GEOAPIFY_API_KEY を入れると安定して表示できます。"
    );
  }

  return NextResponse.json({
    points,
    warnings,
    provider: getGeocodingProviderLabel()
  });
}
