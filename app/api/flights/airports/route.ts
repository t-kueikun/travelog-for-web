import { NextResponse } from "next/server";

import { searchAirportMaster } from "@/lib/airport-master";

export const runtime = "nodejs";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = (await request.json()) as { query?: string; limit?: number };
  const query = cleanString(body.query);
  if (!query) {
    return NextResponse.json({ airports: [] });
  }

  const limit = Math.max(1, Math.min(8, Math.floor(Number(body.limit) || 5)));

  try {
    const airports = await searchAirportMaster(query, limit);
    return NextResponse.json({
      airports: airports.map((airport) => ({
        code: airport.code,
        name: airport.name,
        cityName: airport.cityName || null,
        label: `${airport.name} (${airport.code})`
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "airport_autocomplete_failed",
        detail: error instanceof Error ? error.message : "unknown airport autocomplete failure"
      },
      { status: 502 }
    );
  }
}
