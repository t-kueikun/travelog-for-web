import { NextResponse } from "next/server";
import { resolveAirportsFromQuery } from "@/lib/airport-search";
import {
  buildAssistFollowUpQuestions,
  cleanString,
  DESTINATION_SCOPE_OPTIONS,
  type DestinationScope
} from "@/lib/mobile-assist";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    scope?: string;
    departure?: string;
    destination?: string;
  };

  const scope = DESTINATION_SCOPE_OPTIONS.includes(body.scope as DestinationScope)
    ? (body.scope as DestinationScope)
    : "海外";
  const departure = cleanString(body.departure);
  const destination = cleanString(body.destination);

  const [departureResolved, destinationResolved] = await Promise.all([
    departure ? resolveAirportsFromQuery(departure, 5).catch(() => ({ airports: [] })) : Promise.resolve({ airports: [] }),
    destination ? resolveAirportsFromQuery(destination, 5).catch(() => ({ airports: [] })) : Promise.resolve({ airports: [] })
  ]);

  const departureAirportOptions = departureResolved.airports.map((item) => `${item.name} (${item.code})`);
  const destinationAirportOptions = destinationResolved.airports.map((item) => `${item.name} (${item.code})`);
  const questions = buildAssistFollowUpQuestions({
    scope,
    departure,
    destination,
    departureAirportOptions,
    destinationAirportOptions
  });

  return NextResponse.json({
    scope,
    departureAirportOptions,
    destinationAirportOptions,
    questions
  });
}
