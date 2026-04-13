import {
  searchAirportMasterWithQueries,
  type AirportMasterRecord
} from "@/lib/airport-master";
import { normalizeAirportQueryWithAi } from "@/lib/airport-query-normalizer";

type ResolveAirportResult = {
  airports: AirportMasterRecord[];
  normalizationUsed: boolean;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeStrings(values: string[], max: number) {
  const deduped: string[] = [];
  values.forEach((value) => {
    const normalized = cleanString(value);
    if (!normalized || deduped.includes(normalized)) {
      return;
    }
    deduped.push(normalized);
  });
  return deduped.slice(0, max);
}

export async function resolveAirportsFromQuery(query: string, limit = 5): Promise<ResolveAirportResult> {
  const normalizedQuery = cleanString(query);
  if (!normalizedQuery) {
    return { airports: [], normalizationUsed: false };
  }

  const directMatches = await searchAirportMasterWithQueries({
    queries: [normalizedQuery],
    limit
  });
  if (directMatches.length > 0) {
    return { airports: directMatches, normalizationUsed: false };
  }

  const normalized = await normalizeAirportQueryWithAi(normalizedQuery);
  if (!normalized) {
    return { airports: [], normalizationUsed: false };
  }

  const queries = dedupeStrings([normalizedQuery, ...normalized.searchQueries], 10);
  const airports = await searchAirportMasterWithQueries({
    queries,
    preferredCodes: normalized.airportCodes,
    limit
  });
  return {
    airports,
    normalizationUsed: airports.length > 0
  };
}
