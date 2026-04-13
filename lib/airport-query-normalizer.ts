import { extractResponseText } from "@/lib/ai-plan";

type AirportQueryNormalization = {
  searchQueries: string[];
  airportCodes: string[];
};

const NORMALIZER_MODEL =
  process.env.OPENAI_AIRPORT_NORMALIZER_MODEL ??
  process.env.OPENAI_PLANNER_MODEL ??
  "gpt-4.1-mini";

const NORMALIZATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    searchQueries: {
      type: "array",
      items: { type: "string" },
      default: []
    },
    airportCodes: {
      type: "array",
      items: { type: "string" },
      default: []
    }
  },
  required: ["searchQueries", "airportCodes"]
} as const;

const localNormalizationCache = new Map<string, Promise<AirportQueryNormalization | null>>();

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

function looksLikeIataCode(value: string) {
  return /^[A-Z]{3}$/.test(cleanString(value).toUpperCase());
}

async function requestOpenAiResponse(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  let payload: unknown = raw;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {}

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

function parseNormalization(text: string): AirportQueryNormalization | null {
  if (!text.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as {
      searchQueries?: unknown;
      airportCodes?: unknown;
    };
    const searchQueries = Array.isArray(parsed.searchQueries)
      ? dedupeStrings(
          parsed.searchQueries.map((item) => cleanString(item)),
          8
        )
      : [];
    const airportCodes = Array.isArray(parsed.airportCodes)
      ? dedupeStrings(
          parsed.airportCodes
            .map((item) => cleanString(item).toUpperCase())
            .filter((item) => looksLikeIataCode(item)),
          6
        )
      : [];
    if (searchQueries.length === 0 && airportCodes.length === 0) {
      return null;
    }
    return {
      searchQueries,
      airportCodes
    };
  } catch {
    return null;
  }
}

async function normalizeAirportQueryInternal(query: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const body: Record<string, unknown> = {
    model: NORMALIZER_MODEL,
    max_output_tokens: 250,
    text: {
      format: {
        type: "json_schema",
        name: "airport_query_normalization",
        strict: true,
        schema: NORMALIZATION_SCHEMA
      }
    },
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "Normalize a travel destination/origin for airport search. " +
              "Input can be in Japanese or any language. " +
              "Return only JSON. " +
              "searchQueries must contain English or internationally searchable airport/city queries. " +
              "airportCodes must contain only IATA airport codes you are confident about. " +
              "Prefer major commercial airports. " +
              "Do not invent codes. " +
              "Keep searchQueries short and useful for airport lookup."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Query: ${query}`
          }
        ]
      }
    ]
  };

  const result = await requestOpenAiResponse(apiKey, body);
  if (!result.ok) {
    return null;
  }

  return parseNormalization(extractResponseText(result.payload));
}

export async function normalizeAirportQueryWithAi(query: string) {
  const normalized = cleanString(query);
  if (!normalized) {
    return null;
  }
  if (localNormalizationCache.has(normalized)) {
    return localNormalizationCache.get(normalized) ?? null;
  }
  const pending = normalizeAirportQueryInternal(normalized).catch(() => null);
  localNormalizationCache.set(normalized, pending);
  return pending;
}
