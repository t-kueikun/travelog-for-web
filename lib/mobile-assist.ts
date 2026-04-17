import type { AiPlanSuggestion } from "@/lib/ai-plan";

export const DESTINATION_SCOPE_OPTIONS = ["海外", "国内"] as const;
export const TRAVEL_STYLE_OPTIONS = ["節約", "標準", "快適", "プレミアム"] as const;

export type DestinationScope = (typeof DESTINATION_SCOPE_OPTIONS)[number];
export type TravelStyle = (typeof TRAVEL_STYLE_OPTIONS)[number];

export type AssistFollowUpQuestion = {
  id:
    | "travelStyle"
    | "transport"
    | "hotel"
    | "focus"
    | "earlyDeparture"
    | "departureAirport"
    | "destinationAirport";
  prompt: string;
  options: string[];
  helper?: string;
};

export type FlightTransferRecommendation = {
  station: string | null;
  serviceName: string | null;
  arrTime: string | null;
  depTime: string | null;
};

export type FlightRecommendation = {
  airline: string | null;
  airlineLogo: string | null;
  flightNumber: string | null;
  from: string | null;
  to: string | null;
  depTime: string | null;
  arrTime: string | null;
  price: number | null;
  currency: string | null;
  stops: number | null;
  via: string[] | null;
  transfers: FlightTransferRecommendation[];
  totalDurationMinutes: number | null;
  link: string | null;
  source: string;
};

export type MobileAssistInput = {
  departure?: string;
  destination?: string;
  departureAirportPreference?: string | null;
  destinationAirportPreference?: string | null;
  startDate?: string;
  endDate?: string;
  travelerCount?: number | string;
  travelStyle?: string;
  travelerType?: string;
  budget?: number | string;
  pace?: string;
  transportPreference?: string;
  hotelPreference?: string;
  interests?: string[];
  mustDo?: string;
  avoid?: string;
  notes?: string;
  transportModePriority?: string;
  routePolicy?: string;
  transferLimit?: string;
  departureTimeBand?: string;
  arrivalTimeBand?: string;
  outboundPreferredDepartureTime?: string | null;
  outboundPreferredArrivalTime?: string | null;
  returnPreferredDepartureTime?: string | null;
  returnPreferredArrivalTime?: string | null;
  hotelGradePreference?: string;
  hotelAreaPreference?: string;
  requiredSpots?: string;
};

export function cleanString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

export function cleanStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function parseAssistNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function describeTravelStyle(value: string) {
  switch (value) {
    case "節約":
      return "LCCやコスパ重視。移動・ホテルは価格優先。";
    case "快適":
      return "FSC優先。移動は楽さと時間効率を重視。";
    case "プレミアム":
      return "FSC優先。ホテルも快適性とグレードを重視。";
    default:
      return "価格・快適性・移動効率のバランス重視。";
  }
}

export function extractTimeOnly(value?: string | null) {
  if (!value) {
    return "";
  }
  const match = value.match(/\b(\d{1,2}):(\d{1,2})(?::\d{2})?\b/);
  if (!match) {
    return "";
  }
  const [, hh, mm] = match;
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
}

export function formatFlightDuration(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return "";
  }
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) {
    return `${remain}分`;
  }
  return `${hours}時間${remain > 0 ? ` ${remain}分` : ""}`;
}

export function formatFlightPrice(price?: number | null, currency?: string | null) {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return "価格未取得";
  }
  const normalizedCurrency = (currency || "JPY").toUpperCase() === "USD" ? "USD" : "JPY";
  return `${normalizedCurrency} ${Math.round(price).toLocaleString("ja-JP")}`;
}

export function inferRequestedFlightClassPreference(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (/ファースト|first class/.test(normalized)) {
    return "first";
  }
  if (/ビジネス|business class/.test(normalized)) {
    return "business";
  }
  if (/プレミアムエコノミー|premium economy/.test(normalized)) {
    return "premium_economy";
  }
  if (/エコノミー|economy class/.test(normalized)) {
    return "economy";
  }
  return "";
}

export function inferRequestedNonstopOnly(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return /直行便|ノンストップ|nonstop|direct flight/.test(normalized);
}

export function normalizeFlightRecommendation(raw: unknown): FlightRecommendation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const depTime =
    cleanString(record.depTime) ||
    cleanString(record.dep_time) ||
    cleanString(record.departureTime) ||
    cleanString(record.departure_time) ||
    cleanString(
      record.departure_airport &&
        typeof record.departure_airport === "object" &&
        !Array.isArray(record.departure_airport)
        ? (record.departure_airport as Record<string, unknown>).time
        : ""
    ) ||
    null;
  const arrTime =
    cleanString(record.arrTime) ||
    cleanString(record.arr_time) ||
    cleanString(record.arrivalTime) ||
    cleanString(record.arrival_time) ||
    cleanString(
      record.arrival_airport &&
        typeof record.arrival_airport === "object" &&
        !Array.isArray(record.arrival_airport)
        ? (record.arrival_airport as Record<string, unknown>).time
        : ""
    ) ||
    null;

  const via = Array.isArray(record.via)
    ? record.via.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : null;
  const transfers = Array.isArray(record.transfers)
    ? record.transfers
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object" && !Array.isArray(item))
        )
        .map((item) => ({
          station: cleanString(item.station) || null,
          serviceName: cleanString(item.serviceName ?? item.service_name) || null,
          arrTime: cleanString(item.arrTime ?? item.arr_time) || null,
          depTime: cleanString(item.depTime ?? item.dep_time) || null
        }))
    : [];

  return {
    airline: cleanString(record.airline) || null,
    airlineLogo: cleanString(record.airlineLogo ?? record.airline_logo) || null,
    flightNumber:
      cleanString(record.flightNumber ?? record.flight_number ?? record.serviceName) || null,
    from: cleanString(record.from) || null,
    to: cleanString(record.to) || null,
    depTime,
    arrTime,
    price: parseAssistNumber(record.price),
    currency: cleanString(record.currency) || null,
    stops: parseAssistNumber(record.stops),
    via: via && via.length > 0 ? via : null,
    transfers,
    totalDurationMinutes:
      parseAssistNumber(record.totalDurationMinutes ?? record.total_duration ?? record.duration),
    link: cleanString(record.link ?? record.url ?? record.googleFlightsUrl) || null,
    source: cleanString(record.source) || "serpapi/google_flights"
  };
}

export function buildSelectedFlightSummary(label: string, flight: FlightRecommendation) {
  const depTime = extractTimeOnly(flight.depTime);
  const arrTime = extractTimeOnly(flight.arrTime);
  const viaText =
    Array.isArray(flight.via) && flight.via.length > 0 ? ` / 経由: ${flight.via.join(" / ")}` : "";
  return [
    `${label}: ${flight.airline || "航空会社未取得"} ${flight.flightNumber || ""}`.trim(),
    `${flight.from || "出発地未取得"} → ${flight.to || "到着地未取得"}`,
    depTime || arrTime ? `${depTime || "--:--"} → ${arrTime || "--:--"}` : "時刻未取得",
    `${formatFlightDuration(flight.totalDurationMinutes) || "所要時間未取得"}${
      typeof flight.stops === "number"
        ? flight.stops === 0
          ? " / 直行便"
          : ` / ${flight.stops}回経由`
        : ""
    }${viaText}`,
    `価格: ${formatFlightPrice(flight.price, flight.currency)}`
  ].join(" / ");
}

export function buildTransportFromFlightRecommendation(flight: FlightRecommendation) {
  return {
    type: "飛行機",
    name: flight.airline ?? null,
    airlineLogo: flight.airlineLogo ?? null,
    serviceName: flight.flightNumber ?? null,
    seatNumber: null,
    from: flight.from ?? null,
    to: flight.to ?? null,
    depTime: flight.depTime ?? null,
    arrTime: flight.arrTime ?? null,
    price: typeof flight.price === "number" ? flight.price : null,
    currency: (flight.currency || "JPY").toUpperCase() === "USD" ? "USD" : "JPY",
    paid: false,
    notes:
      typeof flight.stops === "number"
        ? flight.stops === 0
          ? "直行便"
          : `${flight.stops}回経由`
        : null,
    link: flight.link ?? null,
    transfers: Array.isArray(flight.transfers)
      ? flight.transfers.map((transfer) => ({
          station: transfer.station ?? null,
          serviceName: transfer.serviceName ?? null,
          depTime: transfer.depTime ?? null,
          arrTime: transfer.arrTime ?? null
        }))
      : []
  };
}

export function buildAssistFollowUpQuestions({
  scope,
  departure,
  destination,
  departureAirportOptions,
  destinationAirportOptions
}: {
  scope: DestinationScope;
  departure: string;
  destination: string;
  departureAirportOptions: string[];
  destinationAirportOptions: string[];
}) {
  const transportQuestion: AssistFollowUpQuestion =
    scope === "国内"
      ? {
          id: "transport",
          prompt: "移動はどれ寄りで考えますか？",
          helper: "国内旅行なら飛行機寄りか、新幹線寄りかを先に合わせます。",
          options: ["飛行機寄り", "新幹線寄り", "価格重視", "こだわらない"]
        }
      : {
          id: "transport",
          prompt: "フライト条件はどれを優先しますか？",
          helper: "直行便、FSC、価格重視のどれを優先するかで候補便がかなり変わります。",
          options: ["直行便優先", "FSC優先", "価格重視", "こだわらない"]
        };
  const questions: AssistFollowUpQuestion[] = [
    {
      id: "travelStyle",
      prompt: "今回の旅行タイプはどれに近いですか？",
      helper: "予算の使い方と移動・ホテルの基準をここで決めます。",
      options: [...TRAVEL_STYLE_OPTIONS]
    },
    transportQuestion,
    {
      id: "hotel",
      prompt: "ホテルは何を重視しますか？",
      helper: "候補ホテルの並び順に効きます。",
      options: ["駅近重視", "コスパ重視", "高級ホテル重視", "朝食付き重視"]
    },
    {
      id: "focus",
      prompt: "旅全体の軸はどれですか？",
      helper: "予定の提案内容をここで絞ります。",
      options: ["観光メイン", "グルメメイン", "買い物メイン", "バランス重視"]
    },
    {
      id: "earlyDeparture",
      prompt: "朝早すぎる移動は避けますか？",
      helper: "候補便や移動時間帯の寄せ方に使います。",
      options: ["避けたい", "気にしない"]
    }
  ];

  if (departureAirportOptions.length > 1) {
    questions.splice(2, 0, {
      id: "departureAirport",
      prompt: "出発空港はどれで考えますか？",
      helper: `${departure || "出発地"} は空港候補が複数あります。指定がなければ自動で選びます。`,
      options: ["自動でOK", ...departureAirportOptions]
    });
  }

  if (destinationAirportOptions.length > 1) {
    questions.splice(3, 0, {
      id: "destinationAirport",
      prompt: "到着空港はどれで考えますか？",
      helper: `${destination || "目的地"} は空港候補が複数あります。指定がなければ自動で選びます。`,
      options: ["自動でOK", ...destinationAirportOptions]
    });
  }

  return questions;
}

export function buildAssistBootPrompt(
  input: MobileAssistInput,
  selectedFlights?: {
    outbound?: FlightRecommendation | null;
    inbound?: FlightRecommendation | null;
  }
) {
  const destination = cleanString(input.destination);
  const departure = cleanString(input.departure);
  const departureAirportPreference = cleanString(input.departureAirportPreference);
  const destinationAirportPreference = cleanString(input.destinationAirportPreference);
  const startDate = cleanString(input.startDate);
  const endDate = cleanString(input.endDate);
  const travelerCount = cleanString(input.travelerCount);
  const travelStyle = cleanString(input.travelStyle) || "標準";
  const travelerType = cleanString(input.travelerType) || "大人のみ";
  const budget = cleanString(input.budget);
  const pace = cleanString(input.pace) || "標準";
  const transportPreference = cleanString(input.transportPreference) || "公共交通優先";
  const hotelPreference = cleanString(input.hotelPreference) || "コスパ重視";
  const interests = cleanStringArray(input.interests);
  const mustDo = cleanString(input.mustDo) || "特になし";
  const avoid = cleanString(input.avoid) || "特になし";
  const notes = cleanString(input.notes) || "特になし";
  const transportModePriority = cleanString(input.transportModePriority) || "指定なし";
  const routePolicy = cleanString(input.routePolicy) || "バランス重視";
  const transferLimit = cleanString(input.transferLimit) || "制限なし";
  const departureTimeBand = cleanString(input.departureTimeBand) || "指定なし";
  const arrivalTimeBand = cleanString(input.arrivalTimeBand) || "指定なし";
  const outboundPreferredDepartureTime = cleanString(input.outboundPreferredDepartureTime) || "指定なし";
  const outboundPreferredArrivalTime = cleanString(input.outboundPreferredArrivalTime) || "指定なし";
  const returnPreferredDepartureTime = cleanString(input.returnPreferredDepartureTime) || "指定なし";
  const returnPreferredArrivalTime = cleanString(input.returnPreferredArrivalTime) || "指定なし";
  const hotelGradePreference = cleanString(input.hotelGradePreference) || "指定なし";
  const hotelAreaPreference = cleanString(input.hotelAreaPreference) || "指定なし";
  const requiredSpots = cleanString(input.requiredSpots) || "指定なし";
  const budgetLine = budget ? `${budget}円` : "未指定";
  const travelStyleLine = describeTravelStyle(travelStyle);
  const interestsLine = interests.length > 0 ? interests.join("、") : "未指定";

  return [
    "以下の旅行条件で、実行しやすい旅行プランの下書きを作成してください。",
    "不明な情報はwarningsに要確認として出してください。",
    `目的地: ${destination}`,
    `出発地: ${departure || "未指定"}`,
    `出発空港の希望: ${departureAirportPreference || "自動"}`,
    `旅行日程: ${startDate || "未指定"} 〜 ${endDate || "未指定"}`,
    `到着空港の希望: ${destinationAirportPreference || "自動"}`,
    `同行人数: ${travelerCount || "2"}名`,
    `旅行タイプ: ${travelStyle}`,
    `同行者タイプ: ${travelerType}`,
    `予算目安: ${budgetLine}`,
    `旅行ペース: ${pace}`,
    `移動の希望: ${transportPreference}`,
    `ホテル条件: ${hotelPreference}`,
    `重視したいこと: ${interestsLine}`,
    `必ずやりたいこと: ${mustDo}`,
    `避けたいこと: ${avoid}`,
    "詳細条件（任意）:",
    `主要移動手段の優先: ${transportModePriority}`,
    `経路方針: ${routePolicy}`,
    `乗換の上限: ${transferLimit}`,
    `出発時間帯の希望: ${departureTimeBand}`,
    `到着時間帯の希望: ${arrivalTimeBand}`,
    `往路の出発希望時刻: ${outboundPreferredDepartureTime}`,
    `往路の到着希望時刻: ${outboundPreferredArrivalTime}`,
    `復路の出発希望時刻: ${returnPreferredDepartureTime}`,
    `復路の到着希望時刻: ${returnPreferredArrivalTime}`,
    `ホテルグレードの希望: ${hotelGradePreference}`,
    `ホテルエリアの希望: ${hotelAreaPreference}`,
    `必ず含めたい訪問地・駅: ${requiredSpots}`,
    `その他メモ: ${notes}`,
    `旅行タイプの解釈: ${travelStyleLine}`,
    travelStyle === "節約"
      ? "航空券はLCCや価格優先でよい。ホテルもコスパ重視で提案してください。"
      : travelStyle === "快適"
        ? "航空券はFSC優先、LCCは避けめで、移動時間と快適性を重視してください。"
        : travelStyle === "プレミアム"
          ? "航空券はFSC優先、乗継は少なめ、ホテルは高級帯も含めて快適性重視で提案してください。"
          : "航空券とホテルは価格・快適性・移動効率のバランスを取って提案してください。",
    selectedFlights?.outbound || selectedFlights?.inbound
      ? "ユーザーは事前に候補便を選択済みです。以下の便を plan.transportations に必ず反映し、別の便へ置き換えないでください。"
      : "",
    selectedFlights?.outbound ? buildSelectedFlightSummary("往路", selectedFlights.outbound) : "",
    selectedFlights?.inbound ? buildSelectedFlightSummary("復路", selectedFlights.inbound) : "",
    "出力は旅行管理用の下書きとして、移動・ホテル・予定・持ち物を可能な範囲で埋めてください。"
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAiPlanCurrentPlan(
  input: MobileAssistInput,
  selectedFlights?: {
    outbound?: FlightRecommendation | null;
    inbound?: FlightRecommendation | null;
  }
) {
  const promptHints = [cleanString(input.mustDo), cleanString(input.avoid), cleanString(input.notes), cleanString(input.requiredSpots)]
    .filter(Boolean)
    .join("\n");
  const selectedTransportations = [
    selectedFlights?.outbound ? buildTransportFromFlightRecommendation(selectedFlights.outbound) : null,
    selectedFlights?.inbound ? buildTransportFromFlightRecommendation(selectedFlights.inbound) : null
  ].filter(Boolean);

  return {
    departure: cleanString(input.departure),
    destination: cleanString(input.destination),
    departureAirportPreference: cleanString(input.departureAirportPreference) || null,
    destinationAirportPreference: cleanString(input.destinationAirportPreference) || null,
    startDate: cleanString(input.startDate),
    endDate: cleanString(input.endDate),
    budget: cleanString(input.budget),
    travelStyle: cleanString(input.travelStyle) || "標準",
    flightClassPreference: inferRequestedFlightClassPreference(promptHints),
    nonstopOnly: inferRequestedNonstopOnly(promptHints),
    outboundPreferredDepartureTime: cleanString(input.outboundPreferredDepartureTime) || null,
    outboundPreferredArrivalTime: cleanString(input.outboundPreferredArrivalTime) || null,
    returnPreferredDepartureTime: cleanString(input.returnPreferredDepartureTime) || null,
    returnPreferredArrivalTime: cleanString(input.returnPreferredArrivalTime) || null,
    transportations: selectedTransportations
  };
}

export function toDateOnly(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.trim().slice(0, 10);
}

export function extractList(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item) => typeof item === "string" || (item && typeof item === "object" && !Array.isArray(item))
      )
    : [];
}

export type MobileCreateLogResponse = {
  plan: AiPlanSuggestion;
  warnings?: string[];
  sources?: Array<{ title: string; url: string; snippet?: string }>;
  persistablePlan: {
    name: string;
    destination: string;
    memo: string | null;
    startDate: string;
    endDate: string;
    transportations: Array<Record<string, unknown>>;
    hotels: Array<Record<string, unknown>>;
    activities: Array<Record<string, unknown>>;
    packingList: Array<Record<string, unknown> | string>;
  };
};
