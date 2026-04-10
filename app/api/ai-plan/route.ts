import { NextResponse } from "next/server";
import {
  extractResponseText,
  sanitizeAiPlanSuggestion,
  type AiPlanSuggestion
} from "@/lib/ai-plan";

export const runtime = "nodejs";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_AUTO_APPLY_HOTELS = 1;

type PlannerEnvelope = {
  summary?: string;
  warnings?: string[];
  plan?: AiPlanSuggestion;
};

type AssistantMode = "plan" | "consult";

type ChatHistoryEntry = {
  role?: string;
  text?: string;
};

type ResponseSource = {
  title: string;
  url: string;
  snippet?: string;
};

type HotelRecommendation = {
  name: string;
  price: number | null;
  currency: string | null;
  score: number | null;
  reviewCount: number | null;
  address: string | null;
  link: string | null;
  source?: string;
};

type HotelRecommendationsResponse = {
  destinationResolved?: {
    name?: string;
  };
  hotels?: HotelRecommendation[];
  warnings?: string[];
  detail?: string;
  error?: string;
};

type FlightRecommendation = {
  airline?: string | null;
  flightNumber?: string | null;
  from?: string | null;
  to?: string | null;
  depTime?: string | null;
  arrTime?: string | null;
  price?: number | null;
  currency?: string | null;
  stops?: number | null;
  via?: string[] | null;
  transfers?: Array<{
    station?: string | null;
    serviceName?: string | null;
    depTime?: string | null;
    arrTime?: string | null;
  }> | null;
  link?: string | null;
  source?: string;
};

type FlightRecommendationsResponse = {
  fromResolved?: {
    code?: string;
    name?: string;
    type?: string;
  };
  toResolved?: {
    code?: string;
    name?: string;
    type?: string;
  };
  flights?: FlightRecommendation[];
  warnings?: string[];
  detail?: string;
  error?: string;
};

type TransitSupplement = {
  transportations: Array<Record<string, unknown>>;
  warnings: string[];
  sources: ResponseSource[];
};

const PLAN_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    plan: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: ["string", "null"] },
        destination: { type: ["string", "null"] },
        memo: { type: ["string", "null"] },
        startDate: { type: ["string", "null"] },
        endDate: { type: ["string", "null"] },
        transportations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: ["string", "null"] },
              name: { type: ["string", "null"] },
              serviceName: { type: ["string", "null"] },
              seatNumber: { type: ["string", "null"] },
              from: { type: ["string", "null"] },
              to: { type: ["string", "null"] },
              depTime: { type: ["string", "null"] },
              arrTime: { type: ["string", "null"] },
              price: { type: ["number", "null"] },
              currency: { type: ["string", "null"] },
              paid: { type: ["boolean", "null"] },
              notes: { type: ["string", "null"] },
              link: { type: ["string", "null"] },
              transfers: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    station: { type: ["string", "null"] },
                    depTime: { type: ["string", "null"] },
                    arrTime: { type: ["string", "null"] }
                  },
                  required: ["station", "depTime", "arrTime"]
                }
              }
            },
            required: [
              "type",
              "name",
              "serviceName",
              "seatNumber",
              "from",
              "to",
              "depTime",
              "arrTime",
              "price",
              "currency",
              "paid",
              "notes",
              "link",
              "transfers"
            ]
          }
        },
        hotels: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: ["string", "null"] },
              price: { type: ["number", "null"] },
              currency: { type: ["string", "null"] },
              paid: { type: ["boolean", "null"] },
              checkIn: { type: ["string", "null"] },
              checkOut: { type: ["string", "null"] },
              notes: { type: ["string", "null"] },
              link: { type: ["string", "null"] }
            },
            required: ["name", "price", "currency", "paid", "checkIn", "checkOut", "notes", "link"]
          }
        },
        activities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: ["string", "null"] },
              date: { type: ["string", "null"] },
              notes: { type: ["string", "null"] },
              link: { type: ["string", "null"] }
            },
            required: ["title", "date", "notes", "link"]
          }
        },
        packingList: {
          type: "array",
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  checked: { type: ["boolean", "null"] }
                },
                required: ["name", "checked"]
              }
            ]
          }
        }
      },
      required: [
        "name",
        "destination",
        "memo",
        "startDate",
        "endDate",
        "transportations",
        "hotels",
        "activities",
        "packingList"
      ]
    }
  },
  required: ["summary", "warnings", "plan"]
} as const;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBoolean(value: unknown) {
  const normalized = cleanString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function extractJsonCandidate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function parseEnvelope(text: string): PlannerEnvelope | null {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return {
      summary: cleanString(parsed.summary),
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      plan: sanitizeAiPlanSuggestion(parsed.plan ?? parsed)
    };
  } catch {
    return null;
  }
}

function extractErrorDetail(value: unknown) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "object") {
    const source = value as {
      error?: { message?: string; code?: string; type?: string };
      message?: string;
    };
    return (
      cleanString(source.error?.message) ||
      cleanString(source.message) ||
      cleanString(source.error?.code) ||
      cleanString(source.error?.type) ||
      ""
    );
  }

  return "";
}

function extractIncompleteDetail(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const source = value as {
    status?: string;
    incomplete_details?: { reason?: string } | null;
  };
  if (source.status === "completed") {
    return "";
  }
  const reason = cleanString(source.incomplete_details?.reason);
  if (reason === "max_output_tokens") {
    return "AIの出力が長すぎて途中で切れました。入力テキストを少し短くするか、画像枚数を減らして再試行してください。";
  }
  if (reason) {
    return `AIの出力が完了しませんでした: ${reason}`;
  }
  if (source.status) {
    return `AIの出力状態: ${source.status}`;
  }
  return "";
}

function buildPrompt({
  prompt,
  currentPlan,
  imageCount,
  conversationContext
}: {
  prompt: string;
  currentPlan: AiPlanSuggestion;
  imageCount: number;
  conversationContext: string;
}) {
  return [
    "あなたは旅行プラン作成アシスタントです。",
    "ユーザーの文章と画像から、旅行プラン管理アプリに保存できる下書きを日本語で作成してください。",
    "複数日程の旅行では、主要な往路と復路の移動手段を plan.transportations に必ず含めてください。片道だけで終わらせないでください。",
    "事実として確定できない内容でも、候補として提案できるものは具体名を plan に入れてください（notes に候補/要確認と明記）。",
    "抽象的なプレースホルダーは禁止です。『逗子駅周辺の評判店を要調査』『予約推奨』『詳細未定』のような曖昧表現は出さず、店名・施設名・エリア名・おすすめ理由を具体的に書いてください。",
    "notes には、何が良いのか、どの時間帯に向くか、どのエリアにあるかを短く具体的に入れてください。",
    "warnings は本当に重要な未確定項目のみを短く出してください。冗長な注意書きは避け、最大4件程度にしてください。",
    "画像から読める交通機関、ホテル、観光予定、持ち物、日付、金額があれば抽出してください。",
    "ホテル・移動・観光は、入力から合理的に推定できる候補を優先して埋めてください。",
    "出発地と目的地は旅程全体の主要な起点・終点として扱ってください。最寄駅アクセスを勝手に細かい複数移動へ分解しないでください。",
    "長距離の国内移動では、主要な飛行機または新幹線の1本を優先して入れてください。ローカル移動だけで全体移動を埋めないでください。",
    "出力は必ずJSONのみで、Markdownや説明文を混ぜないでください。",
    "日付は原則 YYYY-MM-DD、日時が必要なら YYYY-MM-DDTHH:mm にしてください。",
    "通貨は JPY または USD のみを使ってください。",
    "plan.transportations の要素は type, name, serviceName, seatNumber, from, to, depTime, arrTime, price, currency, paid, notes, transfers を必要に応じて使ってください。",
    "plan.hotels の要素は name, price, currency, paid, checkIn, checkOut, notes, link を必要に応じて使ってください。",
    "plan.activities の要素は title, date, notes, link を必要に応じて使ってください。",
    "plan.packingList は文字列または {\"name\":\"...\",\"checked\":false} の配列にしてください。",
    "出力フォーマットはJSON Schemaで強制されます。説明文やMarkdownは不要です。",
    `現在のプラン情報: ${JSON.stringify(currentPlan)}`,
    conversationContext ? `直近の会話履歴: ${conversationContext}` : "",
    `ユーザーの入力文: ${prompt}`,
    `画像枚数: ${imageCount}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildConsultPrompt({
  prompt,
  currentPlan,
  imageCount,
  useWebSearch,
  conversationContext
}: {
  prompt: string;
  currentPlan: AiPlanSuggestion;
  imageCount: number;
  useWebSearch: boolean;
  conversationContext: string;
}) {
  return [
    "あなたは旅行相談アシスタントです。",
    "ユーザーと相談しながら、現実的で実行しやすい旅行案を日本語で提案してください。",
    "必要なら複数の選択肢を比較し、予算・移動負荷・家族向け/一人旅向けの観点を入れてください。",
    "抽象的な候補名は避け、施設名・店名・エリア名をできるだけ具体的に出してください。",
    "『評判店を要調査』『予約推奨』だけのような薄い説明は禁止です。何がおすすめで、いつ向いていて、予約が必要なら理由まで簡潔に書いてください。",
    useWebSearch
      ? "外部検索を使って最新情報を確認し、回答の最後に参照したURLを自然な形で添えてください。"
      : "外部検索は使わず、一般知識と入力情報をもとに提案してください。",
    "事実として断定できない情報は『目安』『要確認』として明示してください。",
    "回答はプレーンテキストで、見出しと短い箇条書き中心にしてください。",
    `現在のプラン情報: ${JSON.stringify(currentPlan)}`,
    conversationContext ? `直近の会話履歴: ${conversationContext}` : "",
    `ユーザーの相談内容: ${prompt}`,
    `画像枚数: ${imageCount}`
  ]
    .filter(Boolean)
    .join("\n");
}

function extractTransportationDateCandidates(item: Record<string, unknown>) {
  const values = [
    cleanString(item.depTime ?? item.departureTime),
    cleanString(item.arrTime ?? item.arrivalTime)
  ].filter(Boolean);
  return values
    .map((value) => toDateOnly(value))
    .filter((value): value is string => Boolean(value));
}

function hasTransportationOnDate(records: Record<string, unknown>[], date: string) {
  if (!date) {
    return false;
  }
  return records.some((item) => extractTransportationDateCandidates(item).includes(date));
}

function needsRoundTripTransportCoverage(
  records: Record<string, unknown>[],
  startDate: string,
  endDate: string
) {
  if (!startDate || !endDate || startDate === endDate) {
    return false;
  }
  if (records.length === 0) {
    return true;
  }
  const hasOutbound = hasTransportationOnDate(records, startDate);
  const hasInbound = hasTransportationOnDate(records, endDate);
  return !hasOutbound || !hasInbound;
}

function buildTransportationMergeKey(item: Record<string, unknown>) {
  return [
    cleanString(item.type ?? item.mode ?? item.kind),
    cleanString(item.name),
    cleanString(item.serviceName),
    cleanString(item.from),
    cleanString(item.to),
    cleanString(item.depTime ?? item.departureTime),
    cleanString(item.arrTime ?? item.arrivalTime)
  ]
    .map((part) => part.toLowerCase())
    .join("|");
}

const TRANSPORT_LOCATION_ALIASES: Array<{ canonical: string; patterns: RegExp[] }> = [
  {
    canonical: "tokyo",
    patterns: [
      /東京|tokyo/i,
      /羽田|haneda|hnd/i,
      /成田|narita|nrt/i,
      /品川|shinagawa/i,
      /神奈川|kanagawa/i,
      /横浜|yokohama/i,
      /川崎|kawasaki/i,
      /鎌倉|kamakura/i,
      /逗子|zushi/i,
      /湘南|shonan/i
    ]
  },
  {
    canonical: "osaka",
    patterns: [
      /大阪|osaka/i,
      /伊丹|itami|itm/i,
      /関西|kansai|kix/i,
      /新大阪|shin-?osaka/i,
      /梅田|umeda/i,
      /難波|なんば|namba/i
    ]
  },
  {
    canonical: "kyoto",
    patterns: [/京都|kyoto/i]
  },
  {
    canonical: "hiroshima",
    patterns: [/広島|hiroshima/i]
  },
  {
    canonical: "fukuoka",
    patterns: [/福岡|fukuoka/i, /博多|hakata/i]
  },
  {
    canonical: "sapporo",
    patterns: [/札幌|sapporo/i, /新千歳|chitose|cts/i]
  },
  {
    canonical: "naha",
    patterns: [/那覇|naha/i, /沖縄|okinawa/i, /oka\b/i]
  },
  {
    canonical: "bangkok",
    patterns: [/バンコク|bangkok/i, /bkk\b/i, /ドンムアン|don mueang|dmk/i, /スワンナプーム|suvarnabhumi/i]
  },
  {
    canonical: "taipei",
    patterns: [/台北|taipei/i, /tpe\b/i, /松山空港|tsa\b/i]
  },
  {
    canonical: "rome",
    patterns: [/ローマ|rome/i, /fco\b/i, /cia\b/i]
  },
  {
    canonical: "london",
    patterns: [/ロンドン|london/i, /lhr\b/i, /lgw\b/i]
  }
];

const FLIGHT_SEARCH_LOCATION_HINTS: Array<{
  replacement: string;
  patterns: RegExp[];
}> = [
  {
    replacement: "羽田空港",
    patterns: [
      /神奈川|kanagawa/i,
      /横浜|yokohama/i,
      /川崎|kawasaki/i,
      /鎌倉|kamakura/i,
      /逗子|zushi/i,
      /湘南|shonan/i,
      /品川|shinagawa/i,
      /東京|tokyo/i,
      /羽田|haneda|hnd/i
    ]
  },
  {
    replacement: "成田空港",
    patterns: [/成田|narita|nrt/i, /千葉|chiba/i]
  },
  {
    replacement: "新千歳空港",
    patterns: [/札幌|sapporo/i, /北海道|hokkaido/i, /新千歳|chitose|cts/i]
  },
  {
    replacement: "伊丹空港",
    patterns: [/大阪|osaka/i, /伊丹|itami|itm/i, /新大阪|shin-?osaka/i, /梅田|umeda/i]
  },
  {
    replacement: "関西国際空港",
    patterns: [/関西|kansai|kix/i]
  },
  {
    replacement: "福岡空港",
    patterns: [/福岡|fukuoka/i, /博多|hakata/i]
  },
  {
    replacement: "那覇空港",
    patterns: [/那覇|naha/i, /沖縄|okinawa/i]
  }
];

function normalizeTransportationLocation(value: unknown) {
  const raw = cleanString(value);
  if (!raw) {
    return "";
  }
  for (const alias of TRANSPORT_LOCATION_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(raw))) {
      return alias.canonical;
    }
  }
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/空港|駅|港|国際|国内|airport|station|terminal/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function isPrimaryLongDistanceTransportation(item: Record<string, unknown>) {
  const type = cleanString(item.type ?? item.mode ?? item.kind);
  return /飛行機|flight|航空|新幹線|shinkansen|特急|limited\s*express|夜行バス|高速バス/i.test(
    type
  );
}

function isSameTransportationDay(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const leftDate = toDateOnly(cleanString(left.depTime ?? left.departureTime ?? left.arrTime ?? left.arrivalTime));
  const rightDate = toDateOnly(cleanString(right.depTime ?? right.departureTime ?? right.arrTime ?? right.arrivalTime));
  return Boolean(leftDate && rightDate && leftDate === rightDate);
}

function isCompetingPrimaryTransportation(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  if (!isSameTransportationDay(left, right)) {
    return false;
  }
  const leftFrom = normalizeTransportationLocation(left.from);
  const leftTo = normalizeTransportationLocation(left.to);
  const rightFrom = normalizeTransportationLocation(right.from);
  const rightTo = normalizeTransportationLocation(right.to);
  if (!leftFrom || !leftTo || !rightFrom || !rightTo) {
    return false;
  }
  return (
    leftFrom === rightFrom &&
    leftTo === rightTo &&
    (isPrimaryLongDistanceTransportation(left) || isPrimaryLongDistanceTransportation(right))
  );
}

function getTransportationMergeScore(item: Record<string, unknown>) {
  let score = 0;
  if (hasApiBackedFlightSignal(item)) {
    score += 100;
  }
  if (hasReliableFlightTransportation(item)) {
    score += 80;
  }
  if (!isLikelyEstimatedTransportation(item)) {
    score += 30;
  }
  if (cleanString(item.depTime ?? item.departureTime) && cleanString(item.arrTime ?? item.arrivalTime)) {
    score += 20;
  }
  const rawPrice =
    typeof item.price === "number"
      ? item.price
      : typeof item.price === "string"
        ? Number(item.price.replace(/[^\d.-]/g, ""))
        : NaN;
  if (Number.isFinite(rawPrice) && rawPrice > 0) {
    score += 10;
  }
  if (isPrimaryLongDistanceTransportation(item)) {
    score += 5;
  }
  return score;
}

function mergeTransportationCandidates(
  current: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>
) {
  const merged = new Map<string, Record<string, unknown>>();
  [...current, ...incoming].forEach((item) => {
    const key = buildTransportationMergeKey(item);
    if (!key.replace(/\|/g, "")) {
      return;
    }
    const competingEntry = Array.from(merged.entries()).find(([, existing]) =>
      isCompetingPrimaryTransportation(existing, item)
    );
    if (competingEntry) {
      const [competingKey, existing] = competingEntry;
      if (getTransportationMergeScore(item) > getTransportationMergeScore(existing)) {
        merged.delete(competingKey);
        merged.set(key, item);
      }
      return;
    }
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  });
  return Array.from(merged.values()).sort((a, b) => {
    const aTime =
      Date.parse(cleanString(a.depTime ?? a.departureTime ?? a.arrTime ?? a.arrivalTime)) ||
      Number.POSITIVE_INFINITY;
    const bTime =
      Date.parse(cleanString(b.depTime ?? b.departureTime ?? b.arrTime ?? b.arrivalTime)) ||
      Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

function collectObjects(value: unknown, maxDepth = 6) {
  const results: Array<Record<string, unknown>> = [];

  function walk(current: unknown, depth: number) {
    if (depth > maxDepth || current === null || current === undefined) {
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      results.push(record);
      Object.values(record).forEach((item) => walk(item, depth + 1));
    }
  }

  walk(value, 0);
  return results;
}

function normalizeSourceUrl(value: unknown) {
  const raw = cleanString(value);
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function shortenSnippet(value: string, max = 180) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function buildSourceTitle(url: string, rawTitle: unknown) {
  const title = cleanString(rawTitle);
  if (title) {
    return title;
  }
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function extractResponseSources(payload: unknown) {
  const records = collectObjects(payload, 7);
  const byUrl = new Map<string, ResponseSource>();

  for (const record of records) {
    const candidates = [
      record.url,
      record.uri,
      record.link,
      record.source_url,
      record.sourceUrl,
      record.webpage_url,
      record.webpageUrl
    ];

    for (const candidate of candidates) {
      const url = normalizeSourceUrl(candidate);
      if (!url || byUrl.has(url)) {
        continue;
      }

      const title = buildSourceTitle(
        url,
        record.title ?? record.source_title ?? record.sourceTitle ?? record.domain
      );
      const snippetRaw = cleanString(record.snippet ?? record.excerpt ?? record.quote);
      byUrl.set(url, {
        title,
        url,
        snippet: snippetRaw ? shortenSnippet(snippetRaw) : undefined
      });
      if (byUrl.size >= 8) {
        return Array.from(byUrl.values());
      }
    }
  }

  return Array.from(byUrl.values());
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

function toDateOnly(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, 10);
}

function cleanWarnings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => cleanString(item))
    .filter(Boolean)
    .slice(0, 8);
}

function parseChatHistory(value: string) {
  if (!value.trim()) {
    return [] as Array<{ role: "user" | "assistant"; text: string }>;
  }
  try {
    const parsed = JSON.parse(value) as ChatHistoryEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => {
        const role = cleanString(item?.role).toLowerCase();
        const text = cleanString(item?.text);
        if (!text || (role !== "user" && role !== "assistant")) {
          return null;
        }
        return {
          role: role as "user" | "assistant",
          text
        };
      })
      .filter((item): item is { role: "user" | "assistant"; text: string } => Boolean(item))
      .slice(-12);
  } catch {
    return [];
  }
}

function buildUserHistoryText(history: Array<{ role: "user" | "assistant"; text: string }>) {
  return history
    .filter((item) => item.role === "user")
    .map((item) => item.text)
    .join("\n");
}

function extractDateRangeFromText(value: string) {
  const matches = value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  const unique = Array.from(new Set(matches));
  if (unique.length >= 2) {
    return {
      startDate: unique[0] ?? "",
      endDate: unique[1] ?? ""
    };
  }
  return {
    startDate: unique[0] ?? "",
    endDate: ""
  };
}

function buildClarificationResponse({
  prompt,
  currentPlan,
  currentPlanSource,
  history
}: {
  prompt: string;
  currentPlan: AiPlanSuggestion;
  currentPlanSource: Record<string, unknown>;
  history: Array<{ role: "user" | "assistant"; text: string }>;
}) {
  const historyText = buildUserHistoryText(history);
  const combinedText = [historyText, prompt].filter(Boolean).join("\n");
  const destinationCandidate =
    cleanString(currentPlan.destination) ||
    extractDestinationFromRawCurrentPlan(currentPlanSource) ||
    extractDestinationFromPrompt(combinedText);
  const departureCandidate =
    extractDepartureFromCurrentPlan(currentPlan) ||
    extractDepartureFromRawCurrentPlan(currentPlanSource) ||
    extractDepartureFromPrompt(combinedText);
  const inferredDates = extractDateRangeFromText(combinedText);
  const startDate = toDateOnly(currentPlan.startDate) || inferredDates.startDate;
  const endDate = toDateOnly(currentPlan.endDate) || inferredDates.endDate;
  const questions: string[] = [];

  if (!destinationCandidate) {
    questions.push("目的地はどこですか？都市名かエリア名で教えてください。");
  }
  if (!startDate || !endDate) {
    questions.push("旅行日程を教えてください。開始日と終了日を YYYY-MM-DD 形式でお願いします。");
  }

  const wantsFlightDetail =
    hasFlightSearchIntent(combinedText) ||
    hasFlightPriorityPreference(combinedText) ||
    hasLikelyInternationalSignal(combinedText, destinationCandidate || "");
  if (wantsFlightDetail && !departureCandidate) {
    questions.push("出発地はどこですか？都市名だけでなく、可能なら空港名（例: 羽田、成田、関空）で教えてください。");
  }

  if (questions.length === 0) {
    return null;
  }

  return {
    mode: "plan" as const,
    requiresClarification: true,
    answer: "より具体的に作るため、先に不足情報を確認します。",
    questions
  };
}

function hasFlightSearchIntent(prompt: string) {
  return /飛行機|フライト|航空便|航空|flight|airline|airport|空港/i.test(prompt);
}

function hasFlightPriorityPreference(prompt: string) {
  return /飛行機優先|空路優先|flight\s*priority|prefer\s*flight/i.test(prompt);
}

function hasLikelyInternationalSignal(prompt: string, destination: string) {
  const joined = `${cleanString(prompt)} ${cleanString(destination)}`.toLowerCase();
  return /海外|international|渡航|出国|入国|台湾|台北|韓国|ソウル|香港|シンガポール|バンコク|ドーハ|doha|qatar|欧州|ヨーロッパ|アメリカ|米国|ハワイ|オーストラリア|ニュージーランド/i.test(
    joined
  );
}

function hasAirportSignalText(value: string) {
  const normalized = cleanString(value);
  if (!normalized) {
    return false;
  }
  return /空港|airport/i.test(normalized) || /\b[A-Z]{3}\b/.test(normalized);
}

function inferFlightSearchLocation(value: string) {
  const normalized = cleanString(value);
  if (!normalized) {
    return "";
  }
  if (hasAirportSignalText(normalized)) {
    return normalized;
  }
  for (const hint of FLIGHT_SEARCH_LOCATION_HINTS) {
    if (hint.patterns.some((pattern) => pattern.test(normalized))) {
      return hint.replacement;
    }
  }
  return normalized;
}

function extractLabeledLineValue(prompt: string, labels: string[]) {
  const lines = prompt.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    for (const label of labels) {
      const pattern = new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, "i");
      const match = line.match(pattern);
      if (match?.[1]) {
        const value = cleanString(match[1]);
        if (value) {
          return value;
        }
      }
    }
  }
  return "";
}

function isFlightLikeTransportation(item: Record<string, unknown>) {
  const type = cleanString(item.type ?? item.mode ?? item.category ?? item.kind);
  if (/飛行機|flight|air|plane|航空|便/i.test(type)) {
    return true;
  }
  const service = cleanString(
    item.serviceName ??
      item.name ??
      item.flightNumber ??
      item.flightNo ??
      item.title
  );
  return /\b[a-z]{2,3}\s?\d{2,4}\b/i.test(service) || /flight|airline|航空|便/i.test(service);
}

function isLikelyEstimatedTransportation(item: Record<string, unknown>) {
  const text = [
    cleanString(item.name),
    cleanString(item.serviceName),
    cleanString(item.notes),
    cleanString(item.memo),
    cleanString(item.detail)
  ]
    .join(" ")
    .trim();
  if (!text) {
    return false;
  }
  return /推定|要確認|未確定|不明|候補|目安|仮|要調整|調整中|確認|モデル|想定|暫定|参考|例[:：]|サンプル|example/i.test(
    text
  );
}

function hasApiBackedFlightSignal(item: Record<string, unknown>) {
  const notes = cleanString(item.notes);
  const link = cleanString(item.link);
  return (
    /source:\s*(serpapi\/google_flights|scrapeless\/google_flights)/i.test(notes) ||
    /https?:\/\/www\.google\.com\/travel\/flights\?/i.test(notes) ||
    /https?:\/\/www\.google\.com\/travel\/flights\?/i.test(link)
  );
}

function hasFlightNumberLikeSignal(item: Record<string, unknown>) {
  const service = cleanString(item.serviceName ?? item.name ?? item.flightNumber ?? item.flightNo);
  if (!service) {
    return false;
  }
  if (/例[:：]|サンプル|example/i.test(service)) {
    return false;
  }
  return /\b[A-Z0-9]{2,3}\s?\d{1,4}\b/i.test(service);
}

function hasReliableFlightTransportation(item: Record<string, unknown>) {
  if (!isFlightLikeTransportation(item)) {
    return false;
  }
  const from = cleanString(item.from);
  const to = cleanString(item.to);
  const depTime = cleanString(item.depTime ?? item.departureTime);
  const arrTime = cleanString(item.arrTime ?? item.arrivalTime);
  const price =
    typeof item.price === "number"
      ? item.price
      : typeof item.price === "string"
        ? Number(item.price.replace(/[^\d.-]/g, ""))
        : NaN;
  const hasPrice = Number.isFinite(price) && price > 0;
  const hasStrongIdentity = hasApiBackedFlightSignal(item) || hasFlightNumberLikeSignal(item);
  return Boolean(
    from &&
      to &&
      depTime &&
      arrTime &&
      hasPrice &&
      hasStrongIdentity &&
      !isLikelyEstimatedTransportation(item)
  );
}

function mergeTransportationsWithFlightCandidates(
  current: Array<Record<string, unknown>>,
  flights: Array<Record<string, unknown>>
) {
  const nonFlight = current.filter((item) => !isFlightLikeTransportation(item));
  return mergeTransportationCandidates(nonFlight, flights);
}

function stripUnreliableFlightTransportations(current: Array<Record<string, unknown>>) {
  return current.filter(
    (item) => !isFlightLikeTransportation(item) || hasReliableFlightTransportation(item)
  );
}

function extractDepartureFromPrompt(prompt: string) {
  const normalized = cleanString(prompt);
  if (!normalized) {
    return "";
  }
  const labeled = extractLabeledLineValue(normalized, [
    "出発地",
    "出発",
    "from",
    "departure",
    "origin"
  ]);
  if (labeled) {
    return labeled;
  }
  const arrowMatch = normalized.match(/([^\n→]+?)\s*(?:→|->|⇒)\s*([^\n]+)/);
  if (arrowMatch?.[1]) {
    return cleanString(arrowMatch[1]);
  }
  const jpMatch = normalized.match(/([^\s、。,.]{1,24})から/);
  if (jpMatch?.[1]) {
    return cleanString(jpMatch[1]);
  }
  const enMatch = normalized.match(/\bfrom\s+([a-zA-Z][a-zA-Z\s-]{1,40})\b/i);
  if (enMatch?.[1]) {
    return cleanString(enMatch[1]);
  }
  return "";
}

function extractDestinationFromPrompt(prompt: string) {
  const normalized = cleanString(prompt);
  if (!normalized) {
    return "";
  }
  const labeled = extractLabeledLineValue(normalized, [
    "目的地",
    "行き先",
    "to",
    "destination",
    "arrival"
  ]);
  if (labeled) {
    return labeled;
  }
  const arrowMatch = normalized.match(/([^\n→]+?)\s*(?:→|->|⇒)\s*([^\n]+)/);
  if (arrowMatch?.[2]) {
    return cleanString(arrowMatch[2]);
  }
  const enMatch = normalized.match(/\bto\s+([a-zA-Z][a-zA-Z\s-]{1,40})\b/i);
  if (enMatch?.[1]) {
    return cleanString(enMatch[1]);
  }
  return "";
}

function extractHotelAreaPreferenceFromPrompt(prompt: string) {
  const normalized = cleanString(prompt);
  if (!normalized) {
    return "";
  }
  const labeled = extractLabeledLineValue(normalized, [
    "ホテルエリアの希望",
    "宿泊希望地",
    "宿泊エリア",
    "hotel area",
    "preferred hotel area"
  ]);
  const candidate = cleanString(labeled) || cleanString(normalized.match(/宿泊希望地\s*[:：]?\s*([^\n]+)/)?.[1]);
  if (!candidate) {
    return "";
  }
  if (/^(未指定|指定なし|なし|n\/a|null)$/i.test(candidate)) {
    return "";
  }
  return candidate;
}

function extractArrivalFromCurrentPlan(currentPlan: AiPlanSuggestion) {
  const transports = Array.isArray(currentPlan.transportations)
    ? currentPlan.transportations
    : [];
  for (const item of transports) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const to = cleanString((item as Record<string, unknown>).to);
    if (to) {
      return to;
    }
  }
  return "";
}

function pickPreferredFlightLocation(candidates: string[]) {
  const cleaned = candidates.map((value) => cleanString(value)).filter(Boolean);
  if (cleaned.length === 0) {
    return "";
  }
  return cleaned.find((value) => hasAirportSignalText(value)) || cleaned[0];
}

function hasLikelyDomesticLongDistanceSignal(from: string, to: string) {
  const normalizedFrom = normalizeTransportationLocation(from);
  const normalizedTo = normalizeTransportationLocation(to);
  if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) {
    return false;
  }
  const pair = new Set([normalizedFrom, normalizedTo]);
  if (pair.has("sapporo") || pair.has("naha")) {
    return true;
  }
  return (
    (pair.has("tokyo") && pair.has("osaka")) ||
    (pair.has("tokyo") && pair.has("fukuoka")) ||
    (pair.has("tokyo") && pair.has("hiroshima")) ||
    (pair.has("osaka") && pair.has("sapporo")) ||
    (pair.has("fukuoka") && pair.has("sapporo"))
  );
}

function normalizeMatchText(value: string) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[（）。・,，、/／|｜\-\s]/g, "");
}

function buildAreaTokens(area: string) {
  const raw = cleanString(area);
  if (!raw) {
    return [];
  }
  const parts = raw
    .split(/[・,，、/／|｜\s]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const tokenSet = new Set<string>();
  [raw, ...parts].forEach((item) => {
    const cleaned = cleanString(item).replace(
      /(周辺|付近|近辺|周り|あたり|エリア|方面|市内|観光|旅行|ホテル|宿泊|滞在)$/g,
      ""
    );
    const normalized = normalizeMatchText(cleaned);
    if (normalized.length >= 2) {
      tokenSet.add(normalized);
    }
  });
  return Array.from(tokenSet);
}

function isLikelyEstimatedHotel(item: Record<string, unknown>) {
  const text = [
    cleanString(item.name),
    cleanString(item.notes),
    cleanString(item.memo),
    cleanString(item.detail)
  ]
    .join(" ")
    .trim();
  if (!text) {
    return false;
  }
  return /推定|要確認|未確定|不明|候補|目安|仮|要調整|調整中|確認|想定|暫定|参考/i.test(text);
}

function containsGenericSuggestionText(value: string) {
  return /要調査|予約推奨|詳細未定|現地で確認|周辺の評判店|おすすめ店を探す|候補を探す|あとで決める|要確認/.test(
    cleanString(value)
  );
}

function isGenericActivityRecord(item: Record<string, unknown>) {
  const title = cleanString(item.title ?? item.name);
  const notes = cleanString(item.notes ?? item.memo ?? item.detail);
  const joined = `${title} ${notes}`.trim();
  if (!joined) {
    return false;
  }
  if (containsGenericSuggestionText(joined)) {
    return true;
  }
  if (/周辺/.test(title) && /店|グルメ|ランチ|ディナー|観光/.test(title)) {
    return true;
  }
  return /評判店|人気店|食べ歩き候補|おすすめスポット/.test(title) && !/「|『|（|hotel|cafe|restaurant/i.test(title);
}

function isBookingComLink(link: string) {
  const normalized = cleanString(link);
  if (!normalized) {
    return false;
  }
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    return hostname === "booking.com" || hostname.endsWith(".booking.com");
  } catch {
    return false;
  }
}

function isGoogleHotelsLink(link: string) {
  const normalized = cleanString(link);
  if (!normalized) {
    return false;
  }
  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    return (
      hostname === "www.google.com" &&
      pathname.startsWith("/travel/hotels")
    );
  } catch {
    return false;
  }
}

function hasApiBackedHotelSignal(item: Record<string, unknown>) {
  const notes = cleanString(item.notes);
  if (/source:\s*serpapi\/google_hotels/i.test(notes)) {
    return true;
  }
  const link = cleanString(item.link);
  return isGoogleHotelsLink(link);
}

function hasReliableHotelRecord(item: Record<string, unknown>) {
  const name = cleanString(item.name);
  return Boolean(name && !isLikelyEstimatedHotel(item) && hasApiBackedHotelSignal(item));
}

function isHotelMatchingArea(item: Record<string, unknown>, preferredArea: string) {
  const tokens = buildAreaTokens(preferredArea);
  if (tokens.length === 0) {
    return true;
  }
  const blob = normalizeMatchText(
    [
      cleanString(item.name),
      cleanString(item.notes),
      cleanString(item.memo),
      cleanString(item.detail)
    ]
      .join(" ")
      .trim()
  );
  if (!blob) {
    return false;
  }
  return tokens.some((token) => blob.includes(token));
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

function extractText(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      cleanString(record.text) ||
      cleanString(record.Name) ||
      cleanString(record.value) ||
      cleanString(record._text) ||
      ""
    );
  }
  return "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = extractText(value);
  if (!text) {
    return null;
  }
  const normalized = text.replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveStationName(point: unknown) {
  if (!point || typeof point !== "object") {
    return "";
  }
  const record = point as Record<string, unknown>;
  if (record.Station && typeof record.Station === "object") {
    return extractText((record.Station as Record<string, unknown>).Name);
  }
  return "";
}

function extractDepartureDatetime(line: Record<string, unknown>) {
  const departureState = line.DepartureState;
  if (!departureState || typeof departureState !== "object") {
    return "";
  }
  const datetime = (departureState as Record<string, unknown>).Datetime;
  if (!datetime) {
    return "";
  }
  if (typeof datetime === "string") {
    return datetime.trim();
  }
  if (typeof datetime === "object") {
    const record = datetime as Record<string, unknown>;
    return extractText(record.text ?? record);
  }
  return "";
}

function extractArrivalDatetime(line: Record<string, unknown>) {
  const arrivalState = line.ArrivalState;
  if (!arrivalState || typeof arrivalState !== "object") {
    return "";
  }
  const datetime = (arrivalState as Record<string, unknown>).Datetime;
  if (!datetime) {
    return "";
  }
  if (typeof datetime === "string") {
    return datetime.trim();
  }
  if (typeof datetime === "object") {
    const record = datetime as Record<string, unknown>;
    return extractText(record.text ?? record);
  }
  return "";
}

function normalizeTransportType(lineName: string, lineTypeText: string, lineTypeDetail: string) {
  const lowerType = lineTypeText.toLowerCase();
  const lowerDetail = lineTypeDetail.toLowerCase();
  if (lowerType === "train" && lowerDetail.includes("shinkansen")) {
    return "新幹線";
  }
  if (lowerType === "train" && /特急|limited|express/i.test(lineName)) {
    return "特急";
  }
  if (lowerType === "train") {
    return "在来線";
  }
  if (lowerType === "bus") {
    return "バス";
  }
  if (lowerType === "plane") {
    return "飛行機";
  }
  if (lowerType === "ship") {
    return "船";
  }
  return "移動";
}

function extractRouteTotalPrice(course: Record<string, unknown>) {
  const prices = toArray(course.Price);
  let fareSummary: number | null = null;
  let chargeSummary: number | null = null;
  for (const raw of prices) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const price = raw as Record<string, unknown>;
    const kind = extractText(price.kind ?? price.Kind);
    const oneway = toNumber(price.Oneway);
    if (oneway === null) {
      continue;
    }
    if (kind === "FareSummary") {
      fareSummary = oneway;
      continue;
    }
    if (kind === "ChargeSummary") {
      chargeSummary = oneway;
      continue;
    }
  }
  if (fareSummary !== null || chargeSummary !== null) {
    return (fareSummary ?? 0) + (chargeSummary ?? 0);
  }
  for (const raw of prices) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const oneway = toNumber((raw as Record<string, unknown>).Oneway);
    if (oneway !== null) {
      return oneway;
    }
  }
  return null;
}

function extractDepartureFromCurrentPlan(currentPlan: AiPlanSuggestion) {
  const transports = Array.isArray(currentPlan.transportations)
    ? currentPlan.transportations
    : [];
  for (const item of transports) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const from = cleanString((item as Record<string, unknown>).from);
    if (from) {
      return from;
    }
  }
  return "";
}

function extractDepartureFromRawCurrentPlan(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const record = value as Record<string, unknown>;
  return cleanString(record.departure ?? record.origin ?? record.from);
}

function extractDestinationFromRawCurrentPlan(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const record = value as Record<string, unknown>;
  return cleanString(record.destination ?? record.to ?? record.arrival);
}

function mapEkispertCoursesToTransportations(payload: unknown, fallbackFrom: string, fallbackTo: string) {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const resultSet = (payload as Record<string, unknown>).ResultSet;
  if (!resultSet || typeof resultSet !== "object") {
    return [];
  }
  const coursesRaw = (resultSet as Record<string, unknown>).Course;
  const courses = toArray(coursesRaw)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  const mapped: Array<Record<string, unknown>> = [];
  courses.slice(0, 3).forEach((course, index) => {
    const route = course.Route;
    if (!route || typeof route !== "object") {
      return;
    }
    const routeRecord = route as Record<string, unknown>;
    const points = toArray(routeRecord.Point);
    const lines = toArray(routeRecord.Line)
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    if (lines.length === 0) {
      return;
    }
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    const firstType = firstLine.Type;
    const lineTypeText =
      typeof firstType === "string"
        ? firstType
        : firstType && typeof firstType === "object"
          ? extractText((firstType as Record<string, unknown>).text)
          : "";
    const lineTypeDetail =
      firstType && typeof firstType === "object"
        ? extractText((firstType as Record<string, unknown>).detail)
        : "";
    const lineNames = lines
      .map((line) => extractText(line.Name))
      .filter(Boolean)
      .slice(0, 6);
    const fromStation = resolveStationName(points[0]) || fallbackFrom;
    const toStation = resolveStationName(points[points.length - 1]) || fallbackTo;
    const depTime = extractDepartureDatetime(firstLine);
    const arrTime = extractArrivalDatetime(lastLine);
    const totalPrice = extractRouteTotalPrice(course);
    const transferPoints = points
      .slice(1, Math.max(1, points.length - 1))
      .map((point) => resolveStationName(point))
      .filter(Boolean)
      .slice(0, 6)
      .map((station) => ({ station }));

    mapped.push({
      type: normalizeTransportType(lineNames[0] ?? "", lineTypeText, lineTypeDetail),
      name: lineNames[0] ? `${lineNames[0]}${lineNames.length > 1 ? " ほか" : ""}` : `経路候補${index + 1}`,
      serviceName: `駅すぱあと候補${index + 1}`,
      from: fromStation,
      to: toStation,
      depTime: depTime || undefined,
      arrTime: arrTime || undefined,
      price: totalPrice ?? undefined,
      currency: "JPY",
      paid: false,
      notes: `経路: ${lineNames.join(" → ")} / source: ekispert`,
      transfers: transferPoints
    });
  });
  return mapped;
}

async function fetchTransitCandidatesFromEkispert({
  from,
  to,
  date
}: {
  from: string;
  to: string;
  date: string;
}): Promise<TransitSupplement> {
  const apiKey =
    process.env.EKISPERT_API_KEY ||
    process.env.EKISPERT_ACCESS_KEY ||
    process.env.EKISPERT_KEY ||
    "";
  if (!apiKey || !from || !to) {
    return {
      transportations: [],
      warnings: [],
      sources: []
    };
  }
  const url = new URL("https://api.ekispert.jp/v1/json/search/course");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  if (date) {
    url.searchParams.set("date", date.replace(/-/g, ""));
    url.searchParams.set("time", "0900");
  }
  url.searchParams.set("searchType", "departure");
  url.searchParams.set("shinkansen", "true");
  url.searchParams.set("limitedExpress", "true");
  url.searchParams.set("bus", "true");
  url.searchParams.set("plane", "true");

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store"
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      return {
        transportations: [],
        warnings: [],
        sources: []
      };
    }
    const transportations = mapEkispertCoursesToTransportations(payload, from, to);
    return {
      transportations,
      warnings: [],
      sources:
        transportations.length > 0
          ? [
              {
                title: "駅すぱあと API 経路簡易探索",
                url: "https://docs.ekispert.com/v1/api/search/course.html"
              }
            ]
          : []
    };
  } catch {
    return {
      transportations: [],
      warnings: [],
      sources: []
    };
  }
}

function buildHotelNote(hotel: HotelRecommendation) {
  const parts: string[] = [];
  if (typeof hotel.score === "number") {
    const review =
      typeof hotel.reviewCount === "number"
        ? `レビュー ${hotel.score.toFixed(1)} (${Math.round(hotel.reviewCount)}件)`
        : `レビュー ${hotel.score.toFixed(1)}`;
    parts.push(review);
  }
  if (hotel.source) {
    parts.push(`source: ${hotel.source}`);
  }
  return parts.join(" / ");
}

function mapHotelCandidates(
  hotels: HotelRecommendation[],
  checkIn: string,
  checkOut: string
) {
  return hotels.slice(0, MAX_AUTO_APPLY_HOTELS).map((hotel) => ({
    name: hotel.name,
    address: cleanString(hotel.address) || undefined,
    price: typeof hotel.price === "number" ? hotel.price : null,
    currency: cleanString(hotel.currency).toUpperCase() === "USD" ? "USD" : "JPY",
    paid: false,
    checkIn,
    checkOut,
    notes: buildHotelNote(hotel) || undefined,
    link: cleanString(hotel.link) || undefined
  }));
}

function buildHotelPlaceholderForArea(preferredArea: string, checkIn: string, checkOut: string) {
  const area = cleanString(preferredArea) || "希望エリア";
  return {
    name: `${area}ホテル（要確認）`,
    price: null,
    currency: "JPY",
    paid: false,
    checkIn,
    checkOut,
    notes: `${area}に一致する候補の取得に失敗しました。予約API制限または検索条件を確認してください。`
  };
}

function buildFlightNote(flight: FlightRecommendation) {
  const source = cleanString(flight.source);
  const via = Array.isArray(flight.via)
    ? flight.via.map((item) => cleanString(item)).filter(Boolean)
    : [];
  if (via.length > 0) {
    return `経由: ${via.join(" / ")}${source ? ` / source: ${source}` : ""}`;
  }
  if ((flight.stops ?? 0) === 0) {
    return source ? `直行便 / source: ${source}` : "直行便";
  }
  if (typeof flight.stops === "number" && flight.stops > 0) {
    return source ? `${flight.stops}回乗継 / source: ${source}` : `${flight.stops}回乗継`;
  }
  return source ? `source: ${source}` : "";
}

function mapFlightTransfers(flight: FlightRecommendation) {
  const transfers = Array.isArray(flight.transfers) ? flight.transfers : [];
  return transfers
    .map((transfer) => ({
      station: cleanString(transfer?.station) || null,
      serviceName: cleanString(transfer?.serviceName) || null,
      arrTime: cleanString(transfer?.arrTime) || null,
      depTime: cleanString(transfer?.depTime) || null
    }))
    .filter(
      (transfer) =>
        transfer.station || transfer.serviceName || transfer.arrTime || transfer.depTime
    );
}

function mapFlightCandidates(flights: FlightRecommendation[]) {
  return flights.slice(0, 1).map((flight, index) => ({
    type: "飛行機",
    name:
      cleanString(flight.airline) ||
      `フライト候補${index + 1}`,
    serviceName: cleanString(flight.flightNumber) || undefined,
    seatNumber: undefined,
    from: cleanString(flight.from) || undefined,
    to: cleanString(flight.to) || undefined,
    depTime: cleanString(flight.depTime) || undefined,
    arrTime: cleanString(flight.arrTime) || undefined,
    price: typeof flight.price === "number" ? flight.price : null,
    currency: cleanString(flight.currency).toUpperCase() === "USD" ? "USD" : "JPY",
    paid: false,
    notes: buildFlightNote(flight) || undefined,
    link: cleanString(flight.link) || undefined,
    transfers: mapFlightTransfers(flight)
  }));
}

async function fetchHotelCandidatesFromApi({
  request,
  destination,
  checkIn,
  checkOut
}: {
  request: Request;
  destination: string;
  checkIn: string;
  checkOut: string;
}) {
  if (!destination || !checkIn || !checkOut) {
    return {
      hotels: [] as Array<Record<string, unknown>>,
      warnings: [] as string[]
    };
  }

  const url = new URL("/api/hotels/recommendations", request.url);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destination,
        checkIn,
        checkOut,
        adults: 2,
        rooms: 1,
        locale: "ja",
        currency: "JPY",
        limit: 5
      }),
      cache: "no-store"
    });

    const payload = (await response.json()) as HotelRecommendationsResponse;
    if (!response.ok) {
      const detail =
        cleanString(payload.detail) ||
        cleanString(payload.error) ||
        "ホテル候補の自動補完に失敗しました。";
      return {
        hotels: [] as Array<Record<string, unknown>>,
        warnings: [detail]
      };
    }
    const hotels = Array.isArray(payload.hotels) ? payload.hotels : [];
    const appliedHotels = mapHotelCandidates(hotels, checkIn, checkOut);
    const warnings = cleanWarnings(payload.warnings);
    if (hotels.length > appliedHotels.length) {
      warnings.push("ホテル候補は複数見つかりましたが、プランには上位1件のみ自動反映しています。");
    }
    return {
      hotels: appliedHotels,
      warnings
    };
  } catch {
    return {
      hotels: [] as Array<Record<string, unknown>>,
      warnings: ["ホテル候補APIの呼び出しに失敗しました。"]
    };
  }
}

async function fetchFlightCandidatesFromApi({
  request,
  from,
  to,
  date
}: {
  request: Request;
  from: string;
  to: string;
  date: string;
}) {
  if (!from || !to || !date) {
    return {
      transportations: [] as Array<Record<string, unknown>>,
      warnings: [] as string[]
    };
  }

  const url = new URL("/api/flights/recommendations", request.url);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        date,
        adults: 1,
        locale: "ja",
        currency: "JPY",
        limit: 1
      }),
      cache: "no-store"
    });

    const payload = (await response.json()) as FlightRecommendationsResponse;
    if (!response.ok) {
      const detail =
        cleanString(payload.detail) ||
        cleanString(payload.error) ||
        "フライト候補の自動補完に失敗しました。";
      return {
        transportations: [] as Array<Record<string, unknown>>,
        warnings: [detail]
      };
    }
    const flights = Array.isArray(payload.flights) ? payload.flights : [];
    return {
      transportations: mapFlightCandidates(flights),
      warnings: cleanWarnings(payload.warnings)
    };
  } catch {
    return {
      transportations: [] as Array<Record<string, unknown>>,
      warnings: ["フライト候補APIの呼び出しに失敗しました。"]
    };
  }
}

async function fetchRoundTripFlightCandidatesFromApi({
  request,
  from,
  to,
  departureDate,
  returnDate
}: {
  request: Request;
  from: string;
  to: string;
  departureDate: string;
  returnDate?: string;
}) {
  const outbound = await fetchFlightCandidatesFromApi({
    request,
    from,
    to,
    date: departureDate
  });
  const hasReturnDate =
    Boolean(returnDate) &&
    cleanString(returnDate) !== cleanString(departureDate);
  if (!hasReturnDate) {
    return {
      transportations: outbound.transportations,
      warnings: outbound.warnings
    };
  }

  const inbound = await fetchFlightCandidatesFromApi({
    request,
    from: to,
    to: from,
    date: returnDate as string
  });

  return {
    transportations: [
      ...outbound.transportations,
      ...inbound.transportations
    ],
    warnings: [...outbound.warnings, ...inbound.warnings]
  };
}

function parseSearchEnrichment(text: string) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const plan = sanitizeAiPlanSuggestion({
      transportations: parsed.transportations,
      activities: parsed.activities
    });
    return {
      transportations: plan.transportations ?? [],
      activities: plan.activities ?? [],
      warnings: cleanWarnings(parsed.warnings)
    };
  } catch {
    return null;
  }
}

async function enrichPlanFromWebSearch({
  apiKey,
  model,
  prompt,
  currentPlan,
  plan,
  useWebSearch
}: {
  apiKey: string;
  model: string;
  prompt: string;
  currentPlan: AiPlanSuggestion;
  plan: AiPlanSuggestion;
  useWebSearch: boolean;
}) {
  if (!useWebSearch) {
    return {
      transportations: [] as Array<Record<string, unknown>>,
      activities: [] as Array<Record<string, unknown>>,
      warnings: [] as string[],
      sources: [] as ResponseSource[]
    };
  }

  const destination = cleanString(plan.destination) || cleanString(currentPlan.destination);
  const startDate = toDateOnly(plan.startDate) || toDateOnly(currentPlan.startDate);
  const endDate = toDateOnly(plan.endDate) || toDateOnly(currentPlan.endDate);
  const existingTransports = Array.isArray(plan.transportations) ? plan.transportations : [];
  const existingActivities = Array.isArray(plan.activities) ? plan.activities : [];
  const existingTransportRecords = existingTransports
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => item as Record<string, unknown>);
  const missingTransportCoverage = needsRoundTripTransportCoverage(
    existingTransportRecords,
    startDate,
    endDate
  );
  const missingTransports = existingTransports.length === 0 || missingTransportCoverage;
  const missingActivities = existingActivities.length === 0;
  const hasGenericActivities = existingActivities.some((item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? isGenericActivityRecord(item as Record<string, unknown>)
      : false
  );
  if (!missingTransports && !missingActivities && !hasGenericActivities) {
    return {
      transportations: [] as Array<Record<string, unknown>>,
      activities: [] as Array<Record<string, unknown>>,
      warnings: [] as string[],
      sources: [] as ResponseSource[]
    };
  }

  const inputPrompt = [
    "旅行プランの補完をしてください。",
    `目的地: ${destination || "未指定"}`,
    `日程: ${startDate || "未指定"} 〜 ${endDate || "未指定"}`,
    `ユーザー要望: ${prompt || "未指定"}`,
    `現在のプラン: ${JSON.stringify(plan)}`,
    missingTransports
      ? "移動手段が不足しています。往路と復路の主要移動を含む具体的な移動候補を2〜5件提案してください。"
      : "移動候補は不足していません。",
    missingActivities
      ? "観光/食事などの予定が不足しているので、具体的な候補を3〜8件提案してください。"
      : hasGenericActivities
        ? "観光/食事の候補が抽象的すぎるので、施設名や店名が入った具体候補で置き換えてください。"
        : "予定候補は不足していません。",
    "出力はJSONのみ: {\"transportations\":[...],\"activities\":[...],\"warnings\":[...]}",
    "候補として提案する内容には、名称やルート、時間帯の目安をできるだけ含めてください。",
    "『要調査』『予約推奨』だけで終わる説明は禁止です。具体的な店名・施設名・エリア・おすすめ理由を必ず入れてください。"
  ].join("\n");

  const body: Record<string, unknown> = {
    model,
    max_output_tokens: 1400,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: inputPrompt }]
      }
    ],
    tools: [{ type: "web_search_preview" }]
  };

  const result = await requestOpenAiResponse(apiKey, body);
  if (!result.ok) {
    return {
      transportations: [] as Array<Record<string, unknown>>,
      activities: [] as Array<Record<string, unknown>>,
      warnings: [] as string[],
      sources: [] as ResponseSource[]
    };
  }
  const payload = result.payload as Record<string, unknown>;
  const parsed = parseSearchEnrichment(extractResponseText(payload));
  return {
    transportations: parsed?.transportations ?? [],
    activities: parsed?.activities ?? [],
    warnings: parsed?.warnings ?? [],
    sources: extractResponseSources(payload)
  };
}

async function fileToDataUrl(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "missing_openai_api_key" }, { status: 500 });
  }

  const formData = await request.formData();
  const prompt = cleanString(formData.get("prompt"));
  const currentPlanRaw = cleanString(formData.get("currentPlan"));
  const chatHistoryRaw = cleanString(formData.get("chatHistory"));
  const modeRaw = cleanString(formData.get("assistantMode")).toLowerCase();
  const assistantMode: AssistantMode = modeRaw === "consult" ? "consult" : "plan";
  const useWebSearch = formData.has("enableWebSearch")
    ? cleanBoolean(formData.get("enableWebSearch"))
    : assistantMode === "consult";
  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (!prompt && files.length === 0) {
    return NextResponse.json({ error: "prompt_or_image_required" }, { status: 400 });
  }

  if (files.length > MAX_IMAGES) {
    return NextResponse.json({ error: "too_many_images" }, { status: 400 });
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "invalid_image_type" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "image_too_large" }, { status: 400 });
    }
  }

  let currentPlanSource: Record<string, unknown> = {};
  let currentPlan = sanitizeAiPlanSuggestion({});
  if (currentPlanRaw) {
    try {
      const parsed = JSON.parse(currentPlanRaw) as Record<string, unknown>;
      currentPlanSource = parsed;
      currentPlan = sanitizeAiPlanSuggestion(parsed);
    } catch {
      currentPlanSource = {};
      currentPlan = sanitizeAiPlanSuggestion({});
    }
  }
  const chatHistory = parseChatHistory(chatHistoryRaw);
  const conversationContext = chatHistory
    .map((item) => `${item.role === "user" ? "ユーザー" : "AI"}: ${item.text}`)
    .join("\n");

  const imageInputs = await Promise.all(
    files.map(async (file) => ({
      type: "input_image" as const,
      image_url: await fileToDataUrl(file)
    }))
  );

  const model = process.env.OPENAI_PLANNER_MODEL ?? "gpt-4.1";
  if (assistantMode === "consult") {
    const consultBody: Record<string, unknown> = {
      model,
      max_output_tokens: 2200,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildConsultPrompt({
                prompt,
                currentPlan,
                imageCount: files.length,
                useWebSearch,
                conversationContext
              })
            },
            ...imageInputs
          ]
        }
      ]
    };
    if (useWebSearch) {
      consultBody.tools = [{ type: "web_search_preview" }];
    }

    let result = await requestOpenAiResponse(apiKey, consultBody);
    if (!result.ok && useWebSearch && (result.status === 400 || result.status === 404)) {
      const fallbackBody = { ...consultBody };
      delete fallbackBody.tools;
      result = await requestOpenAiResponse(apiKey, fallbackBody);
    }
    if (!result.ok) {
      const detail = extractErrorDetail(result.payload);
      console.error("openai_consult_error", result.status, result.payload);
      return NextResponse.json(
        {
          error: "openai_request_failed",
          status: result.status,
          detail: detail || "OpenAI API request failed."
        },
        { status: 502 }
      );
    }

    const payload = result.payload as Record<string, unknown>;
    const incompleteDetail = extractIncompleteDetail(payload);
    if (incompleteDetail) {
      return NextResponse.json(
        { error: "ai_output_incomplete", detail: incompleteDetail },
        { status: 502 }
      );
    }

    const answer = extractResponseText(payload).trim();
    if (!answer) {
      return NextResponse.json(
        { error: "invalid_ai_response", detail: "AI response could not be parsed." },
        { status: 502 }
      );
    }

    const sources = extractResponseSources(payload);
    const warnings: string[] = [];

    return NextResponse.json({
      mode: "consult",
      model,
      answer,
      warnings,
      sources
    });
  }

  const clarification = buildClarificationResponse({
    prompt,
    currentPlan,
    currentPlanSource,
    history: chatHistory
  });
  if (clarification) {
    return NextResponse.json(clarification);
  }

  const plannerBody: Record<string, unknown> = {
    model,
    max_output_tokens: 2200,
    text: {
      format: {
        type: "json_schema",
        name: "travel_plan_response",
        strict: false,
        schema: PLAN_RESPONSE_SCHEMA
      }
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildPrompt({
              prompt,
              currentPlan,
              imageCount: files.length,
              conversationContext
            })
          },
          ...imageInputs
        ]
      }
    ]
  };
  if (useWebSearch) {
    plannerBody.tools = [{ type: "web_search_preview" }];
  }

  let result = await requestOpenAiResponse(apiKey, plannerBody);
  if (!result.ok && useWebSearch && (result.status === 400 || result.status === 404)) {
    const fallbackBody = { ...plannerBody };
    delete fallbackBody.tools;
    result = await requestOpenAiResponse(apiKey, fallbackBody);
  }
  if (!result.ok) {
    const detail = extractErrorDetail(result.payload);
    console.error("openai_plan_error", result.status, result.payload);
    return NextResponse.json(
      {
        error: "openai_request_failed",
        status: result.status,
        detail: detail || "OpenAI API request failed."
      },
      { status: 502 }
    );
  }

  const payload = result.payload as Record<string, unknown>;
  const incompleteDetail = extractIncompleteDetail(payload);
  if (incompleteDetail) {
    return NextResponse.json(
      { error: "ai_output_incomplete", detail: incompleteDetail },
      { status: 502 }
    );
  }
  const text = extractResponseText(payload);
  const parsed = parseEnvelope(text);

  if (!parsed?.plan) {
    const detail = extractResponseText(payload);
    console.error("openai_plan_parse_failed", payload);
    return NextResponse.json(
      { error: "invalid_ai_response", detail: detail || "AI response could not be parsed." },
      { status: 502 }
    );
  }

  const sources = extractResponseSources(payload);
  const mergedWarnings = [...(parsed.warnings ?? [])];
  const mergedSources = [...sources];
  let mergedPlan = parsed.plan;

  const destination = cleanString(mergedPlan.destination) || cleanString(currentPlan.destination);
  const checkIn = toDateOnly(mergedPlan.startDate) || toDateOnly(currentPlan.startDate);
  const checkOut = toDateOnly(mergedPlan.endDate) || toDateOnly(currentPlan.endDate);
  const hotels = Array.isArray(mergedPlan.hotels) ? mergedPlan.hotels : [];
  const hotelRecords = hotels
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => item as Record<string, unknown>);
  const hotelAreaPreference = extractHotelAreaPreferenceFromPrompt(prompt);
  const hotelSearchDestination = hotelAreaPreference || destination;
  const hasAnyReliableHotel = hotelRecords.some((item) => hasReliableHotelRecord(item));
  const hasReliableHotelForPreference = hotelRecords.some(
    (item) =>
      hasReliableHotelRecord(item) &&
      (!hotelAreaPreference || isHotelMatchingArea(item, hotelAreaPreference))
  );
  const shouldTryHotelSupplement = Boolean(hotelSearchDestination && checkIn && checkOut) && !hasReliableHotelForPreference;
  const transports = Array.isArray(mergedPlan.transportations)
    ? mergedPlan.transportations
    : [];
  const transportRecords = transports
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => item as Record<string, unknown>);
  const flightLikeCount = transportRecords.filter((item) => isFlightLikeTransportation(item)).length;
  const hasAnyFlightTransport = transportRecords.some((item) => isFlightLikeTransportation(item));
  const hasReliableFlightTransport = transportRecords.some((item) =>
    hasReliableFlightTransportation(item)
  );
  const hasApiBackedFlightTransport = transportRecords.some((item) =>
    isFlightLikeTransportation(item) && hasApiBackedFlightSignal(item)
  );
  const departureCandidate = pickPreferredFlightLocation([
    extractDepartureFromCurrentPlan(mergedPlan),
    extractDepartureFromCurrentPlan(currentPlan),
    extractDepartureFromRawCurrentPlan(currentPlanSource),
    extractDepartureFromPrompt(prompt)
  ]);
  const destinationCandidate = pickPreferredFlightLocation([
    extractArrivalFromCurrentPlan(mergedPlan),
    extractArrivalFromCurrentPlan(currentPlan),
    extractDestinationFromRawCurrentPlan(currentPlanSource),
    extractDestinationFromPrompt(prompt),
    destination
  ]);
  const flightSearchFrom = inferFlightSearchLocation(departureCandidate);
  const flightSearchTo = inferFlightSearchLocation(destinationCandidate || destination);
  const hasAirportSignal =
    hasAirportSignalText(destinationCandidate) || hasAirportSignalText(departureCandidate);
  const hasDomesticLongDistanceSignal = hasLikelyDomesticLongDistanceSignal(
    departureCandidate,
    destinationCandidate || destination
  );
  const shouldTryFlightSupplement =
    Boolean(destination && checkIn) &&
    (hasFlightSearchIntent(prompt) ||
      hasFlightPriorityPreference(prompt) ||
      hasAnyFlightTransport ||
      hasAirportSignal ||
      hasDomesticLongDistanceSignal ||
      hasLikelyInternationalSignal(prompt, destination)) &&
    (!hasReliableFlightTransport || !hasApiBackedFlightTransport || flightLikeCount !== 1);
  if (shouldTryHotelSupplement && hotelSearchDestination && checkIn && checkOut) {
    const hotelSupplement = await fetchHotelCandidatesFromApi({
      request,
      destination: hotelSearchDestination,
      checkIn,
      checkOut
    });
    if (hotelSupplement.hotels.length > 0) {
      mergedPlan = sanitizeAiPlanSuggestion({
        ...mergedPlan,
        hotels: hotelSupplement.hotels
      });
    } else if (hotelAreaPreference) {
      mergedWarnings.push(
        `宿泊希望地「${hotelAreaPreference}」に一致するホテル候補を取得できませんでした。地名を具体化して再試行してください。`
      );
      const hasReliableAreaMatchInCurrent = hotelRecords.some(
        (item) => hasReliableHotelRecord(item) && isHotelMatchingArea(item, hotelAreaPreference)
      );
      if (!hasReliableAreaMatchInCurrent) {
        mergedPlan = sanitizeAiPlanSuggestion({
          ...mergedPlan,
          hotels: [buildHotelPlaceholderForArea(hotelAreaPreference, checkIn, checkOut)]
        });
        mergedWarnings.push(
          "APIで実在確認できるホテルが見つからないため、候補はプレースホルダーのみを表示しています。"
        );
      }
    } else if (!hasAnyReliableHotel) {
      mergedPlan = sanitizeAiPlanSuggestion({
        ...mergedPlan,
        hotels: []
      });
      mergedWarnings.push(
        "ホテル候補は外部APIで実在確認できなかったため、AI推定のホテル名は反映していません。"
      );
    }
    mergedWarnings.push(...hotelSupplement.warnings);
  }
  if (shouldTryFlightSupplement && destination && checkIn) {
    const from = flightSearchFrom;
    const to = flightSearchTo;
    if (from && to) {
      const roundTripSupplement = await fetchRoundTripFlightCandidatesFromApi({
        request,
        from,
        to,
        departureDate: checkIn,
        returnDate: checkOut || undefined
      });
      if (roundTripSupplement.transportations.length > 0) {
        const existingTransportations = transportRecords;
        mergedPlan = sanitizeAiPlanSuggestion({
          ...mergedPlan,
          transportations: mergeTransportationsWithFlightCandidates(
            existingTransportations,
            roundTripSupplement.transportations
          )
        });
        mergedSources.push({
          title: "Google Flights API (SerpApi / Scrapeless fallback)",
          url: "https://serpapi.com/google-flights-api"
        });
      } else {
        const nextTransportations = stripUnreliableFlightTransportations(transportRecords);
        if (nextTransportations.length !== transportRecords.length) {
          mergedPlan = sanitizeAiPlanSuggestion({
            ...mergedPlan,
            transportations: nextTransportations
          });
          mergedWarnings.push(
            "フライト候補を外部APIで取得できなかったため、AIが作成した仮の便情報は反映していません。"
          );
        }
      }
      mergedWarnings.push(...roundTripSupplement.warnings);
    } else {
      const nextTransportations = stripUnreliableFlightTransportations(transportRecords);
      if (nextTransportations.length !== transportRecords.length) {
        mergedPlan = sanitizeAiPlanSuggestion({
          ...mergedPlan,
          transportations: nextTransportations
        });
      }
      mergedWarnings.push(
        "フライト候補の取得には出発地と到着地が必要です。"
      );
    }
  }

  const enrichment = await enrichPlanFromWebSearch({
    apiKey,
    model,
    prompt,
    currentPlan,
    plan: mergedPlan,
    useWebSearch
  });
  if (enrichment.transportations.length > 0 || enrichment.activities.length > 0) {
    const nextTransportations = Array.isArray(mergedPlan.transportations)
      ? mergedPlan.transportations
      : [];
    const nextTransportRecords = nextTransportations
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => item as Record<string, unknown>);
    const shouldMergeTransportations = nextTransportations.length === 0;
    const nextActivities = Array.isArray(mergedPlan.activities) ? mergedPlan.activities : [];
    const nonGenericActivities = nextActivities.filter((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? !isGenericActivityRecord(item as Record<string, unknown>)
        : true
    );
    const shouldReplaceActivities =
      enrichment.activities.length > 0 &&
      (nextActivities.length === 0 || nonGenericActivities.length !== nextActivities.length);
    mergedPlan = sanitizeAiPlanSuggestion({
      ...mergedPlan,
      transportations:
        shouldMergeTransportations
          ? mergeTransportationCandidates(nextTransportRecords, enrichment.transportations)
          : nextTransportations,
      activities: shouldReplaceActivities
        ? [...nonGenericActivities, ...enrichment.activities].slice(0, 8)
        : nextActivities.length > 0
          ? nextActivities
          : enrichment.activities
    });
  }
  mergedWarnings.push(...enrichment.warnings);
  if (enrichment.sources.length > 0) {
    mergedSources.push(...enrichment.sources);
  }

  const uniqueWarningSet = Array.from(new Set(mergedWarnings.map((item) => item.trim()).filter(Boolean))).slice(0, 8);
  const uniqueSources = Array.from(
    new Map(
      mergedSources
        .filter((item) => item.url)
        .map((item) => [item.url, item] as const)
    ).values()
  ).slice(0, 8);

  return NextResponse.json({
    mode: "plan",
    model,
    summary: parsed.summary ?? "",
    warnings: uniqueWarningSet,
    sources: uniqueSources,
    plan: mergedPlan
  });
}
