import { NextResponse } from "next/server";

type FlightResponse = unknown;

function buildEndpoints(apiHost: string, flight: string, date: string) {
  const encodedDate = encodeURIComponent(date);
  const endpoints: string[] = [
    `https://${apiHost}/flights/number/${encodeURIComponent(
      flight
    )}/${encodedDate}`
  ];
  const match = flight.match(/^([A-Z]{2,3})(\d{1,4})$/);
  if (match) {
    const airline = match[1];
    const number = match[2];
    endpoints.push(
      `https://${apiHost}/flights/number/${encodeURIComponent(
        airline
      )}/${encodeURIComponent(number)}/${encodedDate}`
    );
    const padded = number.padStart(4, "0");
    if (padded !== number) {
      endpoints.push(
        `https://${apiHost}/flights/number/${encodeURIComponent(
          airline + padded
        )}/${encodedDate}`
      );
      endpoints.push(
        `https://${apiHost}/flights/number/${encodeURIComponent(
          airline
        )}/${encodeURIComponent(padded)}/${encodedDate}`
      );
    }
  }
  endpoints.push(
    `https://${apiHost}/flights/number/${encodeURIComponent(flight)}`
  );
  if (match) {
    const airline = match[1];
    const number = match[2];
    endpoints.push(
      `https://${apiHost}/flights/number/${encodeURIComponent(
        airline
      )}/${encodeURIComponent(number)}`
    );
    const padded = number.padStart(4, "0");
    if (padded !== number) {
      endpoints.push(
        `https://${apiHost}/flights/number/${encodeURIComponent(
          airline + padded
        )}`
      );
      endpoints.push(
        `https://${apiHost}/flights/number/${encodeURIComponent(
          airline
        )}/${encodeURIComponent(padded)}`
      );
    }
  }
  return Array.from(new Set(endpoints));
}

function isEmptyFlightData(data: unknown) {
  if (!data) {
    return true;
  }
  if (Array.isArray(data)) {
    return data.length === 0;
  }
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data.length === 0;
    }
    if (Array.isArray(record.flights)) {
      return record.flights.length === 0;
    }
  }
  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flightParam = searchParams.get("flight");
  const date = searchParams.get("date");

  if (!flightParam) {
    return NextResponse.json({ error: "flight_required" }, { status: 400 });
  }
  const flight = flightParam.replace(/\s+/g, "").toUpperCase().trim();
  if (!flight) {
    return NextResponse.json({ error: "flight_required" }, { status: 400 });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  const rawHost = process.env.RAPIDAPI_HOST ?? "aerodatabox.p.rapidapi.com";
  const apiHost = rawHost
    .trim()
    .replace(/^https?:\/\//, "")
    .split("/")[0];

  if (!apiKey) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 500 });
  }

  const flightDate = date && date.trim() ? date.trim() : new Date().toISOString().slice(0, 10);
  const endpoints = buildEndpoints(apiHost, flight, flightDate);

  for (const endpoint of endpoints) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": apiHost
        },
        cache: "no-store"
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }

    if (!response.ok) {
      if (response.status === 404) {
        continue;
      }
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error: "upstream_error",
          status: response.status,
          detail: detail ? detail.slice(0, 400) : null
        },
        { status: response.status }
      );
    }

    const rawText = await response.text().catch(() => "");
    if (!rawText.trim()) {
      continue;
    }
    try {
      const data = JSON.parse(rawText) as FlightResponse;
      if (isEmptyFlightData(data)) {
        continue;
      }
      return NextResponse.json({ data });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: "invalid_json", detail: rawText.slice(0, 400) },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
