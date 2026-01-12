import { NextResponse } from "next/server";

type FlightResponse = unknown;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flight = searchParams.get("flight");
  const date = searchParams.get("date");

  if (!flight) {
    return NextResponse.json({ error: "flight_required" }, { status: 400 });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST ?? "aerodatabox.p.rapidapi.com";

  if (!apiKey) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 500 });
  }

  const flightDate = date && date.trim() ? date.trim() : new Date().toISOString().slice(0, 10);
  const endpoint = `https://${apiHost}/flights/number/${encodeURIComponent(
    flight.trim()
  )}/${encodeURIComponent(flightDate)}`;

  const response = await fetch(endpoint, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": apiHost
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "upstream_error", status: response.status },
      { status: response.status }
    );
  }

  const data = (await response.json()) as FlightResponse;
  return NextResponse.json({ data });
}
