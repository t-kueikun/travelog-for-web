import { NextResponse } from "next/server";
import {
  cleanString,
  inferRequestedFlightClassPreference,
  inferRequestedNonstopOnly,
  normalizeFlightRecommendation,
  parseAssistNumber,
  type FlightRecommendation,
  type MobileAssistInput
} from "@/lib/mobile-assist";

export const runtime = "nodejs";

type FlightRecommendationsResponse = {
  flights?: FlightRecommendation[];
  warnings?: string[];
  detail?: string;
  error?: string;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

async function requestFlightRecommendations(
  request: Request,
  input: MobileAssistInput,
  params: {
    from: string;
    to: string;
    date: string;
    preferredDepartureTime?: string;
    preferredArrivalTime?: string;
  }
) {
  const promptHints = [
    cleanString(input.mustDo),
    cleanString(input.avoid),
    cleanString(input.notes),
    cleanString(input.requiredSpots)
  ]
    .filter(Boolean)
    .join("\n");
  const url = new URL("/api/flights/recommendations", request.url);
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      date: params.date,
      adults: Math.max(1, parseAssistNumber(input.travelerCount) || 1),
      locale: "ja",
      currency: "JPY",
      limit: 12,
      budget: parseAssistNumber(input.budget) || undefined,
      travelStyle: cleanString(input.travelStyle) || "標準",
      travelClass: inferRequestedFlightClassPreference(promptHints),
      nonstopOnly: inferRequestedNonstopOnly(promptHints),
      preferredDepartureTime: cleanString(params.preferredDepartureTime) || undefined,
      preferredArrivalTime: cleanString(params.preferredArrivalTime) || undefined
    })
  });
  const payload = await readJsonResponse<FlightRecommendationsResponse>(response);

  if (!response.ok) {
    throw new Error(
      payload.detail?.trim() ||
        payload.error?.trim() ||
        "フライト候補の取得に失敗しました。"
    );
  }

  return {
    recommendations: Array.isArray(payload.flights)
      ? payload.flights
          .filter((item): item is FlightRecommendation => normalizeFlightRecommendation(item) !== null)
          .map((item) => normalizeFlightRecommendation(item) as FlightRecommendation)
      : [],
    warnings: Array.isArray(payload.warnings)
      ? payload.warnings.map((item) => item.trim()).filter(Boolean)
      : []
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as MobileAssistInput;

  const departure = cleanString(body.departureAirportPreference) || cleanString(body.departure);
  const destination = cleanString(body.destinationAirportPreference) || cleanString(body.destination);
  const startDate = cleanString(body.startDate);
  const endDate = cleanString(body.endDate);

  if (!departure || !destination || !startDate) {
    return NextResponse.json(
      { error: "departure_destination_start_date_required" },
      { status: 400 }
    );
  }

  try {
    const outbound = await requestFlightRecommendations(request, body, {
      from: departure,
      to: destination,
      date: startDate,
      preferredDepartureTime: cleanString(body.outboundPreferredDepartureTime),
      preferredArrivalTime: cleanString(body.outboundPreferredArrivalTime)
    });
    const inboundNeeded = Boolean(endDate && endDate !== startDate);
    const inbound = inboundNeeded
      ? await requestFlightRecommendations(request, body, {
          from: destination,
          to: departure,
          date: endDate,
          preferredDepartureTime: cleanString(body.returnPreferredDepartureTime),
          preferredArrivalTime: cleanString(body.returnPreferredArrivalTime)
        })
      : { recommendations: [] as FlightRecommendation[], warnings: [] as string[] };

    return NextResponse.json({
      outbound: outbound.recommendations,
      inbound: inbound.recommendations,
      outboundWarnings: outbound.warnings,
      inboundWarnings: inbound.warnings,
      hasAny: outbound.recommendations.length > 0 || inbound.recommendations.length > 0,
      hasOutbound: outbound.recommendations.length > 0,
      hasInbound: inbound.recommendations.length > 0
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "flight_options_failed",
        detail: error instanceof Error ? error.message : "候補便の取得に失敗しました。"
      },
      { status: 502 }
    );
  }
}
