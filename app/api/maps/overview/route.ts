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
  kind?: string;
  sortValue?: string;
  subtitle?: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveStop(stop: StopPayload) {
  const candidates = [
    ...((Array.isArray(stop.queryCandidates) ? stop.queryCandidates : []).map((item) =>
      cleanString(item)
    )),
    cleanString(stop.query)
  ].filter(Boolean);

  let resolved = null;
  let matchedQuery = "";
  for (const candidate of candidates) {
    resolved = await geocodePlace(candidate);
    if (resolved) {
      matchedQuery = candidate;
      break;
    }
  }

  if (!resolved) {
    return {
      warning: `「${cleanString(stop.label)}」の位置を地図化できませんでした。`
    } as const;
  }

  return {
    point: {
      id: cleanString(stop.id),
      label: cleanString(stop.label),
      query: matchedQuery || cleanString(stop.query),
      kind: cleanString(stop.kind),
      sortValue: cleanString(stop.sortValue),
      subtitle: cleanString(stop.subtitle),
      placeName: resolved.placeName,
      lng: resolved.lng,
      lat: resolved.lat
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
      subtitle: cleanString(stop?.subtitle)
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
