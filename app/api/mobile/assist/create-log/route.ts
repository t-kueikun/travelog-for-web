import { NextResponse } from "next/server";
import type { AiPlanSuggestion } from "@/lib/ai-plan";
import {
  buildAiPlanCurrentPlan,
  buildAssistBootPrompt,
  cleanString,
  extractList,
  normalizeFlightRecommendation,
  toDateOnly,
  type FlightRecommendation,
  type MobileAssistInput
} from "@/lib/mobile-assist";

export const runtime = "nodejs";

type CreateLogRequest = MobileAssistInput & {
  selectedFlights?: {
    outbound?: unknown;
    inbound?: unknown;
  };
};

type AiPlanApiResponse = {
  plan?: AiPlanSuggestion;
  warnings?: string[];
  sources?: Array<{ title: string; url: string; snippet?: string }>;
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CreateLogRequest;
  const selectedFlights = {
    outbound: normalizeFlightRecommendation(body.selectedFlights?.outbound) as FlightRecommendation | null,
    inbound: normalizeFlightRecommendation(body.selectedFlights?.inbound) as FlightRecommendation | null
  };

  const prompt = buildAssistBootPrompt(body, selectedFlights);
  const currentPlan = buildAiPlanCurrentPlan(body, selectedFlights);
  const formData = new FormData();
  formData.set("prompt", prompt);
  formData.set("assistantMode", "plan");
  formData.set("enableWebSearch", "true");
  formData.set("currentPlan", JSON.stringify(currentPlan));

  const url = new URL("/api/ai-plan", request.url);
  const response = await fetch(url, {
    method: "POST",
    body: formData,
    cache: "no-store"
  });
  const payload = await readJsonResponse<AiPlanApiResponse>(response);

  if (!response.ok || !payload.plan) {
    return NextResponse.json(
      {
        error: payload.error || "create_log_failed",
        detail: payload.detail || "AIプランの生成に失敗しました。"
      },
      { status: response.ok ? 502 : response.status }
    );
  }

  const plan = payload.plan;
  const destination = cleanString(plan.destination) || cleanString(body.destination);

  return NextResponse.json({
    plan,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    persistablePlan: {
      name: cleanString(plan.name) || `${destination}旅行`,
      destination,
      memo: cleanString(plan.memo) || null,
      startDate: toDateOnly(plan.startDate) || cleanString(body.startDate),
      endDate: toDateOnly(plan.endDate) || cleanString(body.endDate),
      transportations: extractList(plan.transportations) as Array<Record<string, unknown>>,
      hotels: extractList(plan.hotels) as Array<Record<string, unknown>>,
      activities: extractList(plan.activities) as Array<Record<string, unknown>>,
      packingList: extractList(plan.packingList) as Array<Record<string, unknown> | string>
    }
  });
}
