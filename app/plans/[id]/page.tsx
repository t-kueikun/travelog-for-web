"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { useParams, useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import TripOverviewMapCanvas from "@/components/TripOverviewMapCanvas";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isSameDay,
  startOfDay,
  startOfMonth
} from "date-fns";
import CommentForm from "@/components/CommentForm";
import CommentList from "@/components/CommentList";
import { type AiPlanSuggestion } from "@/lib/ai-plan";
import {
  deleteComment,
  getPlanById,
  getPlanByPath,
  postComment,
  subscribeComments,
  updatePlan,
  type Comment,
  type PlanUpdate,
  type TravelPlan
} from "@/lib/firestore";
import { formatDate, formatDateTime, formatYen } from "@/lib/format";

function getPlanProgress(plan: TravelPlan) {
  if (typeof plan.totalCost !== "number") {
    return null;
  }
  const savedAmount =
    Array.isArray(plan.savingsHistory)
      ? sumSavingsHistory(plan.savingsHistory)
      : typeof plan.savedAmount === "number"
        ? plan.savedAmount
        : typeof plan.amount === "number"
          ? plan.amount
          : 0;
  const remaining = Math.max(0, plan.totalCost - savedAmount);
  const percent =
    plan.totalCost > 0
      ? Math.min(100, Math.round((savedAmount / plan.totalCost) * 100))
      : 0;
  return { remaining, percent };
}

type ItemRecord = Record<string, unknown>;

type FieldDraft = {
  key: string;
  value: string;
  original: string;
};

type NumberDraft = {
  key: string;
  value: string;
  original: string;
};

type PriceCurrency = "JPY" | "USD";

type BooleanDraft = {
  key: string;
  value: boolean | null;
  original: boolean | null;
};

type TransferDraft = {
  raw: ItemRecord;
  id: string;
  station: FieldDraft;
  serviceName: FieldDraft;
  depTime: FieldDraft;
  arrTime: FieldDraft;
};

type TransportationDraft = {
  raw: ItemRecord;
  id: string;
  mode: FieldDraft;
  name: FieldDraft;
  serviceName: FieldDraft;
  seatNumber: FieldDraft;
  from: FieldDraft;
  to: FieldDraft;
  depTime: FieldDraft;
  arrTime: FieldDraft;
  price: NumberDraft;
  currency: FieldDraft;
  paid: BooleanDraft;
  notes: FieldDraft;
  link: FieldDraft;
  transfers: TransferDraft[];
};

type HotelDraft = {
  raw: ItemRecord;
  name: FieldDraft;
  address: FieldDraft;
  price: NumberDraft;
  currency: FieldDraft;
  paid: BooleanDraft;
  checkIn: FieldDraft;
  checkOut: FieldDraft;
  notes: FieldDraft;
  link: FieldDraft;
};

type ActivityDraft = {
  raw: ItemRecord;
  title: FieldDraft;
  address: FieldDraft;
  date: FieldDraft;
  notes: FieldDraft;
  link: FieldDraft;
};

type PackingDraft = {
  raw: Record<string, unknown> | string;
  isString: boolean;
  name: FieldDraft;
  checked: BooleanDraft;
};

type SavingsDraft = {
  raw: number | { amount?: number };
  value: string;
  original: string;
  isObject: boolean;
};

type AiPlannerMode = "replace" | "merge";
type AiAssistantMode = "consult" | "plan";

type AiChatSource = {
  title: string;
  url: string;
  snippet?: string;
};

type AiAssistantResponse = {
  mode?: AiAssistantMode;
  summary?: string;
  warnings?: string[];
  plan?: AiPlanSuggestion;
  answer?: string;
  requiresClarification?: boolean;
  questions?: string[];
  sources?: AiChatSource[];
  detail?: string;
  status?: number;
  error?: string;
};

type HotelRecommendation = {
  name: string;
  price: number | null;
  currency: string | null;
  score: number | null;
  reviewCount: number | null;
  address: string | null;
  link: string | null;
  source: string;
};

type HotelRecommendationsResponse = {
  destinationResolved?: {
    destId?: string;
    name?: string;
    type?: string;
  };
  hotels?: HotelRecommendation[];
  warnings?: string[];
  detail?: string;
  error?: string;
};

type FlightTransferRecommendation = {
  station: string | null;
  serviceName: string | null;
  arrTime: string | null;
  depTime: string | null;
};

type FlightRecommendation = {
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

type AiChatRole = "user" | "assistant";

type AiChatMessage = {
  id: string;
  role: AiChatRole;
  text: string;
  warnings: string[];
  attachments: string[];
  sources: AiChatSource[];
  createdAt: string;
};

type TripMapStop = {
  id: string;
  label: string;
  address: string;
  query: string;
  queryCandidates: string[];
  destinationHint: string;
  kind: "宿泊" | "予定" | "移動";
  sortValue: string;
  subtitle: string;
};

type TripMapResolvedStop = TripMapStop & {
  placeName: string;
  lng: number;
  lat: number;
};

type TripOverviewResponse = {
  error?: string;
  detail?: string;
  points?: TripMapResolvedStop[];
  warnings?: string[];
  provider?: string;
};

type PendingAiSuggestion = {
  suggestion: AiPlanSuggestion;
  summary: string;
  warnings: string[];
};

const AI_CHAT_HISTORY_LIMIT = 80;

const TRANSPORT_NAME_KEYS = ["name", "title", "type"];
const TRANSPORT_MODE_KEYS = ["type", "category", "kind", "mode"];
const TRANSPORT_MODES = ["新幹線", "飛行機", "車", "船", "バス", "特急", "在来線"];
const TRANSPORT_MODE_CONFIG: Record<
  string,
  {
    serviceLabel?: string;
    serviceKeys?: string[];
    seatLabel?: string;
    seatKeys?: string[];
    icon: ReactNode;
  }
> = {
  新幹線: {
    serviceLabel: "列車名",
    serviceKeys: ["trainName", "lineName", "serviceName"],
    seatLabel: "座席番号",
    seatKeys: ["seatNumber", "seat", "seatNo"],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ) // Placeholder, replacing with specific icons below
  },
  特急: {
    serviceLabel: "列車名",
    serviceKeys: ["trainName", "lineName", "serviceName"],
    seatLabel: "座席番号",
    seatKeys: ["seatNumber", "seat", "seatNo"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  },
  在来線: {
    serviceLabel: "列車名",
    serviceKeys: ["trainName", "lineName", "serviceName"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    )
  },
  飛行機: {
    serviceLabel: "便番号",
    serviceKeys: ["flightNumber", "flightNo", "serviceName"],
    seatLabel: "座席番号",
    seatKeys: ["seatNumber", "seat", "seatNo"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    )
  },
  バス: {
    serviceLabel: "便名",
    serviceKeys: ["busName", "serviceName"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )
  },
  船: {
    serviceLabel: "便名",
    serviceKeys: ["shipName", "ferryName", "serviceName"],
    seatLabel: "座席/部屋",
    seatKeys: ["seatNumber", "cabin", "room"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
    )
  },
  車: {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )
  }
};

// Update icons with proper paths
TRANSPORT_MODE_CONFIG["新幹線"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m 4,14 c 1,-4 3,-5 6,-5 1,0 2,0 2,2 l 1,2 h 6 c 2,1 3,2 3,4 v 4 H 6 V 19 l -2,-2 z M 4,17 h 4" /><circle cx="8" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /><path d="M 6.5,14 H 14" /></svg>
);
TRANSPORT_MODE_CONFIG["特急"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="16" rx="2" /><path d="M4 11h16M12 3v8m4-8v8m-8-8v8M8 19v3M16 19v3" /><path d="m 9,7 6,0" /></svg>
);
TRANSPORT_MODE_CONFIG["在来線"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="16" rx="2" /><path d="M4 11h16M12 3v8m4-8v8m-8-8v8M8 19v3M16 19v3" /></svg>
);
TRANSPORT_MODE_CONFIG["飛行機"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20M2 12l5-5m-5 5l5 5" style={{ display: 'none' }} /><path d="M21 14l-4 4H5l6-9H8L3 14v4l9-3 9-4z" style={{ display: 'none' }} /><path d="M2 12h20" style={{ display: 'none' }} /><path d="M20 12v3l-7-4-6 4 1-5-3-3h11l4 5z" /></svg>
);
TRANSPORT_MODE_CONFIG["バス"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="15" rx="2" /><path d="M5 18v3" /><path d="M19 18v3" /><path d="M3 11h18" /><path d="M3 15h18" /></svg>
);
TRANSPORT_MODE_CONFIG["船"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 21h20M22 21v-2c0-.6-.4-1.2-1-1.2h-1c-1.7 0-3.3-1.4-3.3-3.1V6a2 2 0 0 0-2-2H9.3a2 2 0 0 0-2 2v8.7c0 1.7-1.6 3.1-3.3 3.1H3c-.6 0-1 .6-1 1.2v2" /><path d="M9 10h6M12 6v10" /></svg>
);
TRANSPORT_MODE_CONFIG["車"].icon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>
);
const TRANSPORT_FROM_KEYS = [
  "from",
  "departure",
  "origin",
  "start",
  "startPlace",
  "startLocation",
  "fromPlace",
  "departurePlace",
  "departPlace",
  "originPlace",
  "fromLocation",
  "departureLocation",
  "fromCity",
  "originCity",
  "fromAirport",
  "departureAirport",
  "fromStation"
];
const TRANSPORT_FROM_PATTERNS = ["departure", "depart", "origin", "start", "from"];
const TRANSPORT_TO_KEYS = [
  "to",
  "arrival",
  "destination",
  "end",
  "endPlace",
  "endLocation",
  "toPlace",
  "arrivalPlace",
  "arrivePlace",
  "destinationPlace",
  "toLocation",
  "arrivalLocation",
  "toCity",
  "destinationCity",
  "toAirport",
  "arrivalAirport",
  "toStation"
];
const TRANSPORT_TO_PATTERNS = ["arrival", "arrive", "destination", "dest", "end"];
const TRANSPORT_PRICE_KEYS = ["price", "amount", "cost", "fee", "fare", "total"];
const TRANSPORT_ORIGINAL_PRICE_KEYS = [
  "originalPrice",
  "priceOriginal",
  "sourcePrice"
];
const TRANSPORT_CURRENCY_KEYS = [
  "currency",
  "currencyCode",
  "priceCurrency",
  "costCurrency"
];
const TRANSPORT_PAID_KEYS = [
  "isPaid",
  "paid",
  "isPaymentDone",
  "paymentDone",
  "isSettled"
];
const TRANSPORT_DEP_KEYS = [
  "departureTime",
  "depTime",
  "startTime",
  "departAt",
  "departureDate",
  "departDate"
];
const TRANSPORT_ARR_KEYS = [
  "arrivalTime",
  "arrTime",
  "endTime",
  "arriveAt",
  "arrivalDate",
  "arriveDate"
];
const TRANSFER_STATION_KEYS = ["station", "name", "title"];
const TRANSFER_SERVICE_KEYS = [
  "serviceName",
  "service",
  "flightNumber",
  "flightNo",
  "lineName"
];
const TRANSFER_DEP_KEYS = ["departureTime", "depTime", "departAt"];
const TRANSFER_ARR_KEYS = ["arrivalTime", "arrTime", "arriveAt"];

const HOTEL_NAME_KEYS = ["name", "title"];
const HOTEL_PRICE_KEYS = ["price", "amount", "cost", "fee", "total"];
const HOTEL_ORIGINAL_PRICE_KEYS = ["originalPrice", "priceOriginal", "sourcePrice"];
const HOTEL_CURRENCY_KEYS = [
  "currency",
  "currencyCode",
  "priceCurrency",
  "costCurrency"
];
const HOTEL_PAID_KEYS = [
  "isPaid",
  "paid",
  "isPaymentDone",
  "paymentDone",
  "isSettled"
];
const HOTEL_ADDRESS_KEYS = ["address", "placeName", "formattedAddress"];
const HOTEL_CHECKIN_KEYS = ["checkIn", "checkInDate", "startDate"];
const HOTEL_CHECKOUT_KEYS = ["checkOut", "checkOutDate", "endDate"];

const USD_TO_JPY_RATE = 150;

const ACTIVITY_TITLE_KEYS = ["name", "title", "activity"];
const ACTIVITY_ADDRESS_KEYS = ["address", "placeName", "formattedAddress"];
const ACTIVITY_DATE_KEYS = ["date", "startDate", "time"];
const ACTIVITY_COST_KEYS = ["price", "amount", "cost", "fee", "fare", "total"];

const PACKING_NAME_KEYS = ["name", "title", "item"];
const PACKING_CHECK_KEYS = ["checked", "isChecked", "done", "packed"];

const NOTES_KEYS = ["notes", "memo", "detail"];
const LINK_KEYS = [
  "url",
  "link",
  "bookingUrl",
  "bookingLink",
  "reservationUrl",
  "reservationLink",
  "website",
  "ticketUrl",
  "ticketLink"
];

function sumSavingsHistory(items: Array<number | { amount?: number }>): number {
  return items.reduce<number>((sum, entry) => {
    if (typeof entry === "number") {
      return sum + entry;
    }
    if (entry && typeof entry === "object" && "amount" in entry) {
      const value = (entry as { amount?: number }).amount;
      return sum + (typeof value === "number" ? value : 0);
    }
    return sum;
  }, 0);
}

function formatSavingsEntry(entry: number | { amount?: number }) {
  if (typeof entry === "number") {
    return formatYen(entry);
  }
  if (entry && typeof entry === "object" && "amount" in entry) {
    const value = (entry as { amount?: number }).amount;
    return typeof value === "number" ? formatYen(value) : "—";
  }
  return "—";
}

function getStringField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function getLocationField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (value && typeof value === "object") {
      const record = value as ItemRecord;
      const nested = getStringField(record, [
        "name",
        "title",
        "label",
        "address",
        "city",
        "airport",
        "station",
        "place"
      ]);
      if (nested) {
        return nested;
      }
    }
  }

  return "";
}

function findLocationByPattern(item: ItemRecord, patterns: string[]) {
  const entries = Object.entries(item);
  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (!patterns.some((pattern) => lower.includes(pattern))) {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (value && typeof value === "object") {
      const nested = getStringField(value as ItemRecord, [
        "name",
        "title",
        "label",
        "address",
        "city",
        "airport",
        "station",
        "place"
      ]);
      if (nested) {
        return nested;
      }
    }
  }

  return "";
}

function getNumberField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.-]/g, ""));
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function normalizePriceCurrency(value: string): PriceCurrency {
  return value.trim().toUpperCase() === "USD" ? "USD" : "JPY";
}

function buildCurrencyDraft(item: ItemRecord, keys: string[]) {
  const key = resolveKey(item, keys);
  const value = normalizePriceCurrency(key ? getStringField(item, [key]) : "");
  return { key: key || keys[0], value, original: value };
}

function buildPriceDraft(
  item: ItemRecord,
  priceKeys: string[],
  originalPriceKeys: string[],
  currency: PriceCurrency
) {
  const key = resolveKey(item, priceKeys);
  const storedPrice = key ? getNumberField(item, [key]) : null;
  const originalPrice = getNumberField(item, originalPriceKeys);
  const effectivePrice =
    currency === "USD" ? originalPrice ?? storedPrice : storedPrice;
  const text = typeof effectivePrice === "number" ? String(effectivePrice) : "";
  return { key, value: text, original: text };
}

function getItemCurrency(item: ItemRecord, keys: string[]) {
  return normalizePriceCurrency(getStringField(item, keys));
}

function convertPriceToYen(amount: number, currency: PriceCurrency) {
  if (currency === "USD") {
    return Math.round(amount * USD_TO_JPY_RATE);
  }
  return Math.round(amount);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatPriceLabel(
  priceYen: number | null,
  currency: PriceCurrency,
  originalPrice: number | null = null
) {
  if (priceYen === null) {
    return "";
  }
  if (currency === "USD") {
    const usd =
      originalPrice !== null
        ? originalPrice
        : Math.round((priceYen / USD_TO_JPY_RATE) * 100) / 100;
    return `${formatYen(priceYen)} (${formatUsd(usd)})`;
  }
  return formatYen(priceYen);
}

function getBooleanField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
    }
  }
  return null;
}

function getDateField(item: ItemRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value) {
      return value as Date | string;
    }
  }
  return null;
}

function formatShortDateTime(value?: Date | string | null) {
  if (!value) {
    return "";
  }
  const text = formatDateTime(value);
  return text || "";
}

function formatFlightDateTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatFlightDuration(minutes?: number | null) {
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

function extractDateOnly(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
  if (!match) {
    return "";
  }
  const [, yyyy, mm, dd] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function extractTimeOnly(value?: string) {
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

function formatFlightTimeValue(value?: string | null) {
  const direct = extractTimeOnly(value ?? "");
  if (direct) {
    return direct;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "—:—";
  }
  const isoMatch = text.match(/T(\d{2}:\d{2})/);
  if (isoMatch?.[1]) {
    return isoMatch[1];
  }
  const parseable = new Date(text);
  if (!Number.isNaN(parseable.getTime())) {
    return `${String(parseable.getHours()).padStart(2, "0")}:${String(
      parseable.getMinutes()
    ).padStart(2, "0")}`;
  }
  return "—:—";
}

function buildDateTimeValue(datePart: string, timePart: string) {
  const date = datePart.trim();
  const time = timePart.trim();
  if (date && time) {
    return `${date} ${time}`;
  }
  if (date) {
    return date;
  }
  if (time) {
    return time;
  }
  return "";
}

function updateDateTimeValue(
  currentValue: string,
  nextDate?: string,
  nextTime?: string
) {
  const date =
    nextDate !== undefined ? nextDate : extractDateOnly(currentValue);
  const time =
    nextTime !== undefined ? nextTime : extractTimeOnly(currentValue);
  return buildDateTimeValue(date, time);
}

function parseDateTimeForSort(value: string) {
  if (!value) {
    return null;
  }
  const date = extractDateOnly(value);
  if (!date) {
    return null;
  }
  const time = extractTimeOnly(value) || "00:00";
  const ms = Date.parse(`${date}T${time}:00`);
  return Number.isNaN(ms) ? null : ms;
}

function getTransportSortTime(draft: TransportationDraft) {
  return (
    parseDateTimeForSort(draft.depTime.value) ??
    parseDateTimeForSort(draft.arrTime.value)
  );
}

function getTransferSortTime(draft: TransferDraft) {
  return (
    parseDateTimeForSort(draft.arrTime.value) ??
    parseDateTimeForSort(draft.depTime.value)
  );
}

function sortTransferDrafts(drafts: TransferDraft[]) {
  const sorted = drafts
    .map((draft, index) => ({
      draft,
      index,
      time: getTransferSortTime(draft)
    }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) {
        return a.index - b.index;
      }
      if (a.time === null) {
        return 1;
      }
      if (b.time === null) {
        return -1;
      }
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.draft);

  return sorted;
}

function sortTransportationDrafts(drafts: TransportationDraft[]) {
  const sorted = drafts
    .map((draft, index) => {
      const sortedTransfers = sortTransferDrafts(draft.transfers);
      return {
        // Only recreate if transfers changed
        draft: sortedTransfers === draft.transfers
          ? draft
          : { ...draft, transfers: sortedTransfers },
        index,
        time: getTransportSortTime(draft)
      };
    })
    .sort((a, b) => {
      if (a.time === null && b.time === null) {
        return a.index - b.index;
      }
      if (a.time === null) {
        return 1;
      }
      if (b.time === null) {
        return -1;
      }
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.draft);

  // Deep comparison to avoid unnecessary re-renders if order/content logically didn't change
  // Note: Since we might have recreated draft objects above, we check IDs first for speed
  const isIdOrderChanged = sorted.some((d, i) => d.id !== drafts[i].id);

  if (!isIdOrderChanged) {
    // If IDs are same order, check if any content actually changed (referential equality of inner objects)
    const hasContentChange = sorted.some((d, i) => d !== drafts[i]);
    if (!hasContentChange) {
      return drafts;
    }
  }

  return sorted;
}

function getTransportItemSortTime(item: ItemRecord) {
  const depValue = buildDateDraft(item, TRANSPORT_DEP_KEYS).value;
  const arrValue = buildDateDraft(item, TRANSPORT_ARR_KEYS).value;
  return parseDateTimeForSort(depValue) ?? parseDateTimeForSort(arrValue);
}

function sortTransportItems(items: ItemRecord[]) {
  return items
    .map((item, index) => ({
      item,
      index,
      time: getTransportItemSortTime(item)
    }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) {
        return a.index - b.index;
      }
      if (a.time === null) {
        return 1;
      }
      if (b.time === null) {
        return -1;
      }
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function useFlipAnimation(ids: string[]) {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, DOMRect>());
  const lastOrderKeyRef = useRef<string | null>(null);
  const idsKey = ids.join("|");

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    ids.forEach((id) => {
      const node = nodesRef.current.get(id);
      if (node) {
        nextPositions.set(id, node.getBoundingClientRect());
      }
    });
    const shouldAnimate =
      lastOrderKeyRef.current !== null && lastOrderKeyRef.current !== idsKey;
    if (shouldAnimate) {
      ids.forEach((id) => {
        const node = nodesRef.current.get(id);
        const prev = positionsRef.current.get(id);
        const next = nextPositions.get(id);
        if (!node || !prev || !next) {
          return;
        }
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (dx !== 0 || dy !== 0) {
          node.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "translate(0, 0)" }
            ],
            { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }
          );
        }
      });
    }
    positionsRef.current = nextPositions;
    lastOrderKeyRef.current = idsKey;
  }, [idsKey]);

  return (id: string) => (node: HTMLElement | null) => {
    if (node) {
      nodesRef.current.set(id, node);
    } else {
      nodesRef.current.delete(id);
    }
  };
}

const AIRPORT_NAME_JA: Record<string, string> = {
  HND: "羽田空港",
  NRT: "成田国際空港",
  KIX: "関西国際空港",
  ITM: "大阪国際空港",
  NGO: "中部国際空港",
  CTS: "新千歳空港",
  FUK: "福岡空港",
  OKA: "那覇空港",
  SDJ: "仙台空港",
  HIJ: "広島空港",
  KOJ: "鹿児島空港",
  KMJ: "熊本空港",
  KMI: "宮崎空港",
  OIT: "大分空港",
  NGS: "長崎空港",
  HSG: "佐賀空港",
  KKJ: "北九州空港",
  UBJ: "山口宇部空港",
  KMQ: "小松空港",
  KIJ: "新潟空港",
  OKJ: "岡山空港",
  TKS: "徳島空港",
  TAK: "高松空港",
  MYJ: "松山空港",
  KCZ: "高知空港",
  AOJ: "青森空港",
  AXT: "秋田空港",
  HNA: "花巻空港",
  MMB: "女満別空港",
  OBO: "帯広空港",
  KUH: "釧路空港",
  WKJ: "稚内空港",
  OKD: "札幌丘珠空港",
  HKD: "函館空港",
  UKB: "神戸空港",
  ISG: "石垣空港",
  MMY: "宮古空港",
  ASJ: "奄美空港",
  TKN: "徳之島空港",
  UEO: "久米島空港",
  OGN: "与那国空港",
  RNJ: "与論空港",
  RIS: "利尻空港",
  FUJ: "福江空港",
  TSJ: "対馬空港",
  IKI: "壱岐空港",
  ICN: "仁川国際空港",
  GMP: "金浦国際空港",
  PEK: "北京首都国際空港",
  PKX: "北京大興国際空港",
  PVG: "上海浦東国際空港",
  SHA: "上海虹橋国際空港",
  HKG: "香港国際空港",
  TPE: "台湾桃園国際空港",
  TSA: "台北松山空港",
  SIN: "シンガポール・チャンギ空港",
  BKK: "スワンナプーム国際空港",
  DMK: "ドンムアン空港",
  KUL: "クアラルンプール国際空港",
  CGK: "スカルノ・ハッタ国際空港",
  MNL: "ニノイ・アキノ国際空港",
  HAN: "ノイバイ国際空港",
  SGN: "タンソンニャット国際空港",
  DPS: "ングラ・ライ国際空港",
  DEL: "インディラ・ガンディー国際空港",
  BOM: "チャトラパティ・シヴァージー国際空港",
  BLR: "ケンペゴウダ国際空港",
  HYD: "ラジーヴ・ガンディー国際空港",
  DXB: "ドバイ国際空港",
  AUH: "アブダビ国際空港",
  DOH: "ハマド国際空港",
  JED: "キング・アブドゥルアズィーズ国際空港",
  RUH: "キング・ハーリド国際空港",
  LHR: "ロンドン・ヒースロー空港",
  LGW: "ロンドン・ガトウィック空港",
  CDG: "パリ＝シャルル・ド・ゴール空港",
  ORY: "パリ＝オルリー空港",
  AMS: "アムステルダム・スキポール空港",
  FRA: "フランクフルト空港",
  MUC: "ミュンヘン空港",
  ZRH: "チューリッヒ空港",
  VIE: "ウィーン国際空港",
  MAD: "マドリード＝バラハス空港",
  BCN: "バルセロナ＝エル・プラット空港",
  FCO: "ローマ・フィウミチーノ空港",
  MXP: "ミラノ・マルペンサ空港",
  DUB: "ダブリン空港",
  ARN: "ストックホルム・アーランダ空港",
  CPH: "コペンハーゲン空港",
  OSL: "オスロ・ガーデモエン空港",
  HEL: "ヘルシンキ・ヴァンター空港",
  IST: "イスタンブール空港",
  SAW: "サビハ・ギョクチェン国際空港",
  YYZ: "トロント・ピアソン国際空港",
  YVR: "バンクーバー国際空港",
  YUL: "モントリオール・トルドー国際空港",
  JFK: "ジョン・F・ケネディ国際空港",
  EWR: "ニューアーク・リバティ国際空港",
  LGA: "ラガーディア空港",
  ORD: "シカゴ・オヘア国際空港",
  ATL: "ハーツフィールド・ジャクソン・アトランタ国際空港",
  DFW: "ダラス・フォートワース国際空港",
  DEN: "デンバー国際空港",
  SEA: "シアトル・タコマ国際空港",
  SFO: "サンフランシスコ国際空港",
  LAX: "ロサンゼルス国際空港",
  LAS: "ハリー・リード国際空港",
  PHX: "フェニックス・スカイハーバー国際空港",
  MIA: "マイアミ国際空港",
  IAD: "ワシントン・ダレス国際空港",
  IAH: "ジョージ・ブッシュ・インターコンチネンタル空港",
  BOS: "ローガン国際空港",
  SYD: "シドニー国際空港",
  MEL: "メルボルン空港",
  BNE: "ブリスベン空港",
  AKL: "オークランド国際空港"
};

const CITY_TO_AIRPORT_JA: Record<string, { code: string; name: string }> = {
  Tokyo: { code: "HND", name: "羽田空港" },
  "東京": { code: "HND", name: "羽田空港" },
  Osaka: { code: "KIX", name: "関西国際空港" },
  "大阪": { code: "KIX", name: "関西国際空港" },
  Sapporo: { code: "CTS", name: "新千歳空港" },
  "札幌": { code: "CTS", name: "新千歳空港" },
  Seoul: { code: "ICN", name: "仁川国際空港" },
  Incheon: { code: "ICN", name: "仁川国際空港" },
  "ソウル": { code: "ICN", name: "仁川国際空港" },
  "仁川": { code: "ICN", name: "仁川国際空港" },
  London: { code: "LHR", name: "ロンドン・ヒースロー空港" },
  Paris: { code: "CDG", name: "パリ＝シャルル・ド・ゴール空港" },
  Amsterdam: { code: "AMS", name: "アムステルダム・スキポール空港" },
  Frankfurt: { code: "FRA", name: "フランクフルト空港" },
  Munich: { code: "MUC", name: "ミュンヘン空港" },
  Zurich: { code: "ZRH", name: "チューリッヒ空港" },
  Vienna: { code: "VIE", name: "ウィーン国際空港" },
  Madrid: { code: "MAD", name: "マドリード＝バラハス空港" },
  Barcelona: { code: "BCN", name: "バルセロナ＝エル・プラット空港" },
  Rome: { code: "FCO", name: "ローマ・フィウミチーノ空港" },
  Milan: { code: "MXP", name: "ミラノ・マルペンサ空港" },
  Dublin: { code: "DUB", name: "ダブリン空港" },
  Stockholm: { code: "ARN", name: "ストックホルム・アーランダ空港" },
  Copenhagen: { code: "CPH", name: "コペンハーゲン空港" },
  Oslo: { code: "OSL", name: "オスロ・ガーデモエン空港" },
  Helsinki: { code: "HEL", name: "ヘルシンキ・ヴァンター空港" },
  Istanbul: { code: "IST", name: "イスタンブール空港" },
  Toronto: { code: "YYZ", name: "トロント・ピアソン国際空港" },
  Vancouver: { code: "YVR", name: "バンクーバー国際空港" },
  Montreal: { code: "YUL", name: "モントリオール・トルドー国際空港" },
  "New York": { code: "JFK", name: "ジョン・F・ケネディ国際空港" },
  "Los Angeles": { code: "LAX", name: "ロサンゼルス国際空港" },
  "San Francisco": { code: "SFO", name: "サンフランシスコ国際空港" },
  "Seattle": { code: "SEA", name: "シアトル・タコマ国際空港" },
  Chicago: { code: "ORD", name: "シカゴ・オヘア国際空港" },
  Atlanta: { code: "ATL", name: "ハーツフィールド・ジャクソン・アトランタ国際空港" },
  Dallas: { code: "DFW", name: "ダラス・フォートワース国際空港" },
  Denver: { code: "DEN", name: "デンバー国際空港" },
  Miami: { code: "MIA", name: "マイアミ国際空港" },
  Washington: { code: "IAD", name: "ワシントン・ダレス国際空港" },
  Boston: { code: "BOS", name: "ローガン国際空港" },
  Sydney: { code: "SYD", name: "シドニー国際空港" },
  Melbourne: { code: "MEL", name: "メルボルン空港" },
  Brisbane: { code: "BNE", name: "ブリスベン空港" },
  Auckland: { code: "AKL", name: "オークランド国際空港" },
  Beijing: { code: "PEK", name: "北京首都国際空港" },
  Shanghai: { code: "PVG", name: "上海浦東国際空港" },
  "Hong Kong": { code: "HKG", name: "香港国際空港" },
  Taipei: { code: "TPE", name: "台湾桃園国際空港" },
  Singapore: { code: "SIN", name: "シンガポール・チャンギ空港" },
  Bangkok: { code: "BKK", name: "スワンナプーム国際空港" },
  Manila: { code: "MNL", name: "ニノイ・アキノ国際空港" },
  Delhi: { code: "DEL", name: "インディラ・ガンディー国際空港" },
  Mumbai: { code: "BOM", name: "チャトラパティ・シヴァージー国際空港" },
  Dubai: { code: "DXB", name: "ドバイ国際空港" },
  Doha: { code: "DOH", name: "ハマド国際空港" }
};

const CITY_CODE_TO_AIRPORT: Record<string, { code: string; name: string }> = {
  TYO: { code: "HND", name: "羽田空港" },
  OSA: { code: "KIX", name: "関西国際空港" },
  NYC: { code: "JFK", name: "ジョン・F・ケネディ国際空港" },
  LON: { code: "LHR", name: "ロンドン・ヒースロー空港" },
  PAR: { code: "CDG", name: "パリ＝シャルル・ド・ゴール空港" }
};

function pickFirstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function extractIataFromText(text: string) {
  const match = text.match(/\b([A-Z0-9]{3})\b/);
  return match ? match[1].toUpperCase() : "";
}

function resolveCityAirport(name: string, code: string) {
  if (name) {
    const mapped = CITY_TO_AIRPORT_JA[name] ?? CITY_TO_AIRPORT_JA[name.trim()];
    if (mapped) {
      return mapped;
    }
  }
  if (code) {
    const mapped = CITY_CODE_TO_AIRPORT[code];
    if (mapped) {
      return mapped;
    }
  }
  return null;
}

function normalizeAirport(value: unknown) {
  if (!value) {
    return "";
  }
  let name = "";
  let code = "";
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return "";
    }
    code = extractIataFromText(text);
    if (!code || text.toUpperCase() !== code) {
      name = text;
    }
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const airport =
      record.airport && typeof record.airport === "object"
        ? (record.airport as Record<string, unknown>)
        : null;
    name = pickFirstString([
      airport?.name,
      airport?.airportName,
      record.name,
      record.airportName,
      record.fullName,
      record.shortName,
      record.municipalityName,
      record.city,
      record.locationName,
      record.airport
    ]);
    code = pickFirstString([
      airport?.iata,
      airport?.iataCode,
      airport?.code,
      record.iata,
      record.iataCode,
      record.code,
      airport?.icao,
      record.icao,
      record.airportCode,
      record.airportIata,
      record.airportIataCode,
      record.airportIcao
    ]).toUpperCase();
  }
  if (!code && name) {
    code = extractIataFromText(name);
  }
  if (!code && !name) {
    return "";
  }
  const isCityCode = Boolean(code && CITY_CODE_TO_AIRPORT[code]);
  // Prefer explicit airport code (e.g. ITM) over city-name mapping (e.g. Osaka -> KIX).
  const cityMapped = isCityCode || !code ? resolveCityAirport(name, code) : null;
  const jpName = code ? AIRPORT_NAME_JA[code] : "";
  const displayName = jpName || cityMapped?.name || name;
  const displayCode = code || cityMapped?.code || "";
  if (displayName && displayCode) {
    return `${displayName} (${displayCode})`;
  }
  if (displayName) {
    return displayName;
  }
  return displayCode;
}

function normalizeTime(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = pickFirstString([
      record.local,
      record.localTime,
      record.scheduledTimeLocal,
      record.scheduledTime,
      record.scheduledTimeUtc,
      record.utc,
      record.time,
      record.timeLocal,
      record.timeUtc,
      record.dateTime,
      record.dateTimeLocal,
      record.dateTimeUtc
    ]);
    if (direct) {
      return direct;
    }
    const nested =
      normalizeTime(record.local) ||
      normalizeTime(record.utc) ||
      normalizeTime(record.scheduledTimeLocal) ||
      normalizeTime(record.scheduledTimeUtc) ||
      normalizeTime(record.time);
    if (nested) {
      return nested;
    }
  }
  return "";
}

function pickTime(values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeTime(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function extractFlightInfo(payload: unknown) {
  const data = payload as Record<string, unknown>;
  const raw = Array.isArray(data?.data)
    ? data.data[0]
    : ((data?.data as Record<string, unknown>)?.flights as any[])?.[0] ??
    (data?.data as Record<string, unknown>) ??
    data;
  const record = raw as Record<string, unknown> | undefined;
  const departure = (record?.departure ??
    (record?.departures as Record<string, unknown>[] | undefined)?.[0] ??
    record?.departureAirport) as Record<string, unknown> | undefined;
  const arrival = (record?.arrival ??
    (record?.arrivals as Record<string, unknown>[] | undefined)?.[0] ??
    record?.arrivalAirport) as Record<string, unknown> | undefined;

  const departureAirport = normalizeAirport(departure);
  const arrivalAirport = normalizeAirport(arrival);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const depAny = departure as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arrAny = arrival as any;

  const departureTime =
    pickTime([
      departure?.scheduledTimeLocal,
      depAny?.scheduledTime?.local,
      depAny?.scheduledTime?.utc,
      departure?.scheduledTime,
      departure?.scheduledTimeUtc,
      departure?.time,
      record?.departureTime,
      record?.departureTimeUtc,
      record?.departureTimeLocal
    ]) || "";
  const arrivalTime =
    pickTime([
      arrival?.scheduledTimeLocal,
      arrAny?.scheduledTime?.local,
      arrAny?.scheduledTime?.utc,
      arrival?.scheduledTime,
      arrival?.scheduledTimeUtc,
      arrival?.time,
      record?.arrivalTime,
      record?.arrivalTimeUtc,
      record?.arrivalTimeLocal
    ]) || "";

  return {
    departureAirport,
    arrivalAirport,
    departureTime,
    arrivalTime
  };
}

function resolveKey(item: ItemRecord, keys: string[], patterns: string[] = []) {
  for (const key of keys) {
    if (key in item) {
      return key;
    }
  }
  if (patterns.length > 0) {
    const entries = Object.keys(item);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (patterns.some((pattern) => lower.includes(pattern))) {
        return entry;
      }
    }
  }
  return keys[0] ?? "";
}

function buildStringDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  const value = key ? getStringField(item, [key]) : "";
  return { key, value, original: value };
}

function sanitizeGenericAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(hotel|hotels|vacation rental|hostel|apartment|apartments|guest house|guesthouse)$/i.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function extractStandaloneUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const direct = normalizeLink(trimmed);
  if (direct) {
    return direct;
  }
  const match = trimmed.match(/https?:\/\/[^\s]+/i);
  return match ? normalizeLink(match[0]) : "";
}

function hasAirportSignal(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("airport") || value.includes("空港")) {
    return true;
  }
  return /\(([a-z]{3})\)/i.test(value);
}

function inferTransportModeFromItem(item: ItemRecord) {
  const from = getLocationField(item, TRANSPORT_FROM_KEYS);
  const to = getLocationField(item, TRANSPORT_TO_KEYS);
  const name = getStringField(item, ["name", "title"]);
  const service = getStringField(item, [
    "flightNumber",
    "flightNo",
    "serviceName",
    "name",
    "title"
  ]);
  const notes = getStringField(item, NOTES_KEYS);
  const explicitFlightNumber = getStringField(item, ["flightNumber", "flightNo"]);
  const signalText = `${name} ${service} ${notes}`.trim();

  const flightNumberLike = /\b[a-z]{2,3}\s?\d{2,4}\b/i.test(signalText);
  const flightWordLike = /航空|flight|airline|便|plane/i.test(signalText);
  const railWordLike =
    /新幹線|特急|在来線|電車|鉄道|train|rail|metro|subway|jr/i.test(signalText);
  const busWordLike = /バス|bus|coach/i.test(signalText);
  const shipWordLike = /船|フェリー|ship|ferry|boat/i.test(signalText);
  const carWordLike =
    /車|タクシー|レンタカー|car|taxi|drive|uber|lyft|rideshare|ridehail/i.test(signalText);
  const hasFromAirport = hasAirportSignal(from);
  const hasToAirport = hasAirportSignal(to);

  if (explicitFlightNumber || flightNumberLike || flightWordLike) {
    return "飛行機";
  }
  if (hasFromAirport && hasToAirport) {
    return "飛行機";
  }
  if (carWordLike) {
    return "車";
  }
  if (busWordLike) {
    return "バス";
  }
  if (shipWordLike) {
    return "船";
  }
  if (railWordLike) {
    return signalText.includes("新幹線")
      ? "新幹線"
      : signalText.includes("特急")
        ? "特急"
        : "在来線";
  }
  return "";
}

function normalizeTransportModeValue(rawValue: string, item: ItemRecord) {
  const inferred = inferTransportModeFromItem(item);
  if (inferred) {
    return inferred;
  }

  const value = rawValue.trim();
  if (!value) {
    return "在来線";
  }
  if (TRANSPORT_MODES.includes(value)) {
    return value;
  }

  const normalized = value.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("shinkansen") || value.includes("新幹線")) {
    return "新幹線";
  }
  if (
    normalized.includes("limitedexpress") ||
    normalized.includes("ltdexp") ||
    value.includes("特急")
  ) {
    return "特急";
  }
  if (
    normalized.includes("train") ||
    normalized.includes("rail") ||
    normalized.includes("jr") ||
    normalized.includes("metro") ||
    normalized.includes("subway") ||
    value.includes("在来線") ||
    value.includes("電車") ||
    value.includes("鉄道")
  ) {
    return "在来線";
  }
  if (
    normalized.includes("flight") ||
    normalized.includes("plane") ||
    normalized.includes("air") ||
    value.includes("飛行機")
  ) {
    return "飛行機";
  }
  if (normalized.includes("bus") || value.includes("バス")) {
    return "バス";
  }
  if (
    normalized.includes("ferry") ||
    normalized.includes("ship") ||
    normalized.includes("boat") ||
    value.includes("船")
  ) {
    return "船";
  }
  if (
    normalized.includes("car") ||
    normalized.includes("taxi") ||
    normalized.includes("drive") ||
    value.includes("車")
  ) {
    return "車";
  }
  return "在来線";
}

function buildModeDraft(item: ItemRecord) {
  const key = resolveKey(item, TRANSPORT_MODE_KEYS);
  const rawValue = key ? getStringField(item, [key]) : "";
  const value = normalizeTransportModeValue(rawValue, item);
  return { key: key || TRANSPORT_MODE_KEYS[0], value, original: value };
}

function getModeConfig(mode: string) {
  return TRANSPORT_MODE_CONFIG[mode] ?? TRANSPORT_MODE_CONFIG["在来線"];
}

function supportsTransferInput(mode: string) {
  return mode === "在来線" || mode === "飛行機";
}

function buildLocationDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  let value = key ? getLocationField(item, [key]) : "";
  if (!value && patterns.length > 0) {
    value = findLocationByPattern(item, patterns);
  }
  return { key, value, original: value };
}

function createDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildTransferDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const existingId = typeof item.id === "string" ? item.id : "";
    const id = existingId.trim() ? existingId : createDraftId();
    return {
      raw: item,
      id,
      station: buildStringDraft(item, TRANSFER_STATION_KEYS),
      serviceName: buildStringDraft(item, TRANSFER_SERVICE_KEYS),
      depTime: buildDateDraft(item, TRANSFER_DEP_KEYS),
      arrTime: buildDateDraft(item, TRANSFER_ARR_KEYS)
    } satisfies TransferDraft;
  });
}

function buildDateDraft(item: ItemRecord, keys: string[], patterns: string[] = []) {
  const key = resolveKey(item, keys, patterns);
  let value = "";
  if (key) {
    value = formatShortDateTime(getDateField(item, [key]));
    if (!value) {
      value = getStringField(item, [key]);
    }
  }
  return { key, value, original: value };
}

function buildNumberDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  const value = key ? getNumberField(item, [key]) : null;
  const text = typeof value === "number" ? String(value) : "";
  return { key, value: text, original: text };
}

function buildBooleanDraft(
  item: ItemRecord,
  keys: string[],
  patterns: string[] = []
) {
  const key = resolveKey(item, keys, patterns);
  const value = key ? getBooleanField(item, [key]) : null;
  return { key, value, original: value };
}

function buildTransportationDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const existingId = typeof item.id === "string" ? item.id : "";
    const id = existingId.trim() ? existingId : createDraftId();
    const mode = buildModeDraft(item);
    const config = getModeConfig(mode.value);
    const serviceKeys = config.serviceKeys ?? [];
    const seatKeys = config.seatKeys ?? [];
    const transfers = Array.isArray(item.transfers) ? item.transfers : [];
    const currency = buildCurrencyDraft(item, TRANSPORT_CURRENCY_KEYS);
    const notesDraft = buildStringDraft(item, NOTES_KEYS);
    const linkDraft = buildStringDraft(item, LINK_KEYS);
    const noteOnlyLink = extractStandaloneUrl(notesDraft.value);
    const effectiveLink = linkDraft.value || noteOnlyLink || "";
    const effectiveNotes =
      noteOnlyLink && normalizeLink(notesDraft.value) === noteOnlyLink
        ? { ...notesDraft, value: "", original: "" }
        : notesDraft;
    return {
      raw: item,
      id,
      mode,
      name: buildStringDraft(item, TRANSPORT_NAME_KEYS),
      serviceName: serviceKeys.length
        ? buildStringDraft(item, serviceKeys)
        : { key: "", value: "", original: "" },
      seatNumber: seatKeys.length
        ? buildStringDraft(item, seatKeys)
        : { key: "", value: "", original: "" },
      from: buildLocationDraft(item, TRANSPORT_FROM_KEYS, TRANSPORT_FROM_PATTERNS),
      to: buildLocationDraft(item, TRANSPORT_TO_KEYS, TRANSPORT_TO_PATTERNS),
      depTime: buildDateDraft(item, TRANSPORT_DEP_KEYS),
      arrTime: buildDateDraft(item, TRANSPORT_ARR_KEYS),
      price: buildPriceDraft(
        item,
        TRANSPORT_PRICE_KEYS,
        TRANSPORT_ORIGINAL_PRICE_KEYS,
        normalizePriceCurrency(currency.value)
      ),
      currency,
      paid: buildBooleanDraft(item, TRANSPORT_PAID_KEYS),
      notes: effectiveNotes,
      link: { ...linkDraft, value: effectiveLink, original: effectiveLink || linkDraft.original },
      transfers: buildTransferDrafts(transfers as ItemRecord[])
    } satisfies TransportationDraft;
  });
}

function buildHotelDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const currency = buildCurrencyDraft(item, HOTEL_CURRENCY_KEYS);
    const addressDraft = buildStringDraft(item, HOTEL_ADDRESS_KEYS);
    const sanitizedAddress = sanitizeGenericAddress(addressDraft.value);
    return {
      raw: item,
      name: buildStringDraft(item, HOTEL_NAME_KEYS),
      address: {
        ...addressDraft,
        value: sanitizedAddress,
        original: sanitizedAddress
      },
      price: buildPriceDraft(
        item,
        HOTEL_PRICE_KEYS,
        HOTEL_ORIGINAL_PRICE_KEYS,
        normalizePriceCurrency(currency.value)
      ),
      currency,
      paid: buildBooleanDraft(item, HOTEL_PAID_KEYS),
      checkIn: buildDateDraft(item, HOTEL_CHECKIN_KEYS),
      checkOut: buildDateDraft(item, HOTEL_CHECKOUT_KEYS),
      notes: buildStringDraft(item, NOTES_KEYS),
      link: buildStringDraft(item, LINK_KEYS)
    } satisfies HotelDraft;
  });
}

function buildActivityDrafts(items: ItemRecord[]) {
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      raw: item,
      title: buildStringDraft(item, ACTIVITY_TITLE_KEYS),
      address: buildStringDraft(item, ACTIVITY_ADDRESS_KEYS),
      date: buildDateDraft(item, ACTIVITY_DATE_KEYS),
      notes: buildStringDraft(item, NOTES_KEYS),
      link: buildStringDraft(item, LINK_KEYS)
    } satisfies ActivityDraft;
  });
}

function buildPackingDrafts(items: Array<Record<string, unknown> | string>) {
  return items.map((raw) => {
    const isString = typeof raw === "string";
    const record = isString ? { name: raw } : raw;
    const item = record && typeof record === "object" ? record : {};
    return {
      raw,
      isString,
      name: buildStringDraft(item, PACKING_NAME_KEYS),
      checked: buildBooleanDraft(item, PACKING_CHECK_KEYS)
    } satisfies PackingDraft;
  });
}

function buildSavingsDrafts(items: Array<number | { amount?: number }>) {
  return items.map((raw) => {
    const isObject = typeof raw === "object" && raw !== null;
    const value =
      typeof raw === "number"
        ? raw
        : typeof (raw as { amount?: number }).amount === "number"
          ? (raw as { amount?: number }).amount
          : null;
    const text = typeof value === "number" ? String(value) : "";
    return {
      raw,
      value: text,
      original: text,
      isObject
    } satisfies SavingsDraft;
  });
}

function hasInvalidNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return Number.isNaN(Number(trimmed));
}

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function applyStringDraft(item: ItemRecord, draft: FieldDraft) {
  if (!draft.key || draft.value === draft.original) {
    return;
  }
  item[draft.key] = draft.value.trim();
}

function applyNumberDraft(item: ItemRecord, draft: NumberDraft) {
  if (!draft.key || draft.value === draft.original) {
    return;
  }
  item[draft.key] = toNumberOrNull(draft.value);
}

function applyBooleanDraft(item: ItemRecord, draft: BooleanDraft) {
  if (!draft.key || draft.value === draft.original) {
    return;
  }
  item[draft.key] = draft.value;
}

function applyPriceDraft(
  item: ItemRecord,
  priceDraft: NumberDraft,
  currencyValue: PriceCurrency,
  originalPriceKeys: string[]
) {
  if (!priceDraft.key) {
    return;
  }
  const amount = toNumberOrNull(priceDraft.value);
  item[priceDraft.key] =
    amount === null ? null : convertPriceToYen(amount, currencyValue);
  const originalKey = originalPriceKeys[0];
  if (currencyValue === "USD") {
    item[originalKey] = amount;
  } else {
    delete item[originalKey];
  }
}

function applyTransferDrafts(drafts: TransferDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw, id: draft.id };
    applyStringDraft(nextItem, draft.station);
    applyStringDraft(nextItem, draft.serviceName);
    applyStringDraft(nextItem, draft.depTime);
    applyStringDraft(nextItem, draft.arrTime);
    return nextItem;
  });
}

function applyTransportationDrafts(drafts: TransportationDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw, id: draft.id };
    applyStringDraft(nextItem, draft.mode);
    applyStringDraft(nextItem, draft.name);
    applyStringDraft(nextItem, draft.serviceName);
    applyStringDraft(nextItem, draft.seatNumber);
    applyStringDraft(nextItem, draft.from);
    applyStringDraft(nextItem, draft.to);
    applyStringDraft(nextItem, draft.depTime);
    applyStringDraft(nextItem, draft.arrTime);
    applyPriceDraft(
      nextItem,
      draft.price,
      normalizePriceCurrency(draft.currency.value),
      TRANSPORT_ORIGINAL_PRICE_KEYS
    );
    applyStringDraft(nextItem, draft.currency);
    applyBooleanDraft(nextItem, draft.paid);
    applyStringDraft(nextItem, draft.notes);
    applyStringDraft(nextItem, draft.link);
    if (supportsTransferInput(draft.mode.value) || Array.isArray(draft.raw.transfers)) {
      nextItem.transfers = applyTransferDrafts(draft.transfers);
    }
    return nextItem;
  });
}

function applyHotelDrafts(drafts: HotelDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw };
    applyStringDraft(nextItem, draft.name);
    applyStringDraft(nextItem, draft.address);
    applyPriceDraft(
      nextItem,
      draft.price,
      normalizePriceCurrency(draft.currency.value),
      HOTEL_ORIGINAL_PRICE_KEYS
    );
    applyStringDraft(nextItem, draft.currency);
    applyBooleanDraft(nextItem, draft.paid);
    applyStringDraft(nextItem, draft.checkIn);
    applyStringDraft(nextItem, draft.checkOut);
    applyStringDraft(nextItem, draft.notes);
    applyStringDraft(nextItem, draft.link);
    return nextItem;
  });
}

function applyActivityDrafts(drafts: ActivityDraft[]) {
  return drafts.map((draft) => {
    const nextItem: ItemRecord = { ...draft.raw };
    applyStringDraft(nextItem, draft.title);
    applyStringDraft(nextItem, draft.address);
    applyStringDraft(nextItem, draft.date);
    applyStringDraft(nextItem, draft.notes);
    applyStringDraft(nextItem, draft.link);
    return nextItem;
  });
}

function applyPackingDrafts(drafts: PackingDraft[]) {
  return drafts.map((draft) => {
    if (draft.isString) {
      const nameChanged = draft.name.value !== draft.name.original;
      const hasChecked = draft.checked.value !== null;
      if (!hasChecked) {
        return nameChanged ? draft.name.value.trim() : draft.raw;
      }
      const checkedKey = draft.checked.key || "checked";
      const nameKey = draft.name.key || "name";
      return {
        [nameKey]: draft.name.value.trim(),
        [checkedKey]: draft.checked.value ?? false
      };
    }
    const nextItem: ItemRecord = { ...(draft.raw as Record<string, unknown>) };
    applyStringDraft(nextItem, draft.name);
    applyBooleanDraft(nextItem, draft.checked);
    return nextItem;
  });
}

function applySavingsDrafts(drafts: SavingsDraft[]) {
  return drafts.map((draft) => {
    if (draft.value === draft.original) {
      return draft.raw;
    }
    const parsed = toNumberOrNull(draft.value);
    if (draft.isObject) {
      return {
        ...(draft.raw as Record<string, unknown>),
        amount: parsed ?? undefined
      };
    }
    return parsed ?? 0;
  });
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-right text-base font-semibold text-slate-900">
        {value && value.length > 0 ? value : "—"}
      </span>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="text-sm font-semibold tracking-wide text-slate-500">
      {title}
    </h3>
  );
}

function parseDateInputValue(value: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function toDateInput(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function buildMonthCells(month: Date) {
  const firstDay = startOfMonth(month);
  const daysInMonth = endOfMonth(month).getDate();
  const leadingBlanks = getDay(firstDay);
  const cells: Array<Date | null> = [];
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return cells;
}

function StayDateRangePicker({
  title = "宿泊日程",
  startDate,
  endDate,
  originalStartDate: _originalStartDate,
  originalEndDate: _originalEndDate,
  onChange
}: {
  title?: string;
  startDate: string;
  endDate: string;
  originalStartDate: string;
  originalEndDate: string;
  onChange: (nextStartDate: string, nextEndDate: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState<Date | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const start = parseDateInputValue(startDate);
  const end = parseDateInputValue(endDate) || start;
  const [month, setMonth] = useState<Date>(
    startOfMonth(start || new Date())
  );
  let rangeStartDate = start;
  let rangeEndDate = end;
  if (rangeStartDate && rangeEndDate && isAfter(rangeStartDate, rangeEndDate)) {
    const swap = rangeStartDate;
    rangeStartDate = rangeEndDate;
    rangeEndDate = swap;
  }
  const stayNights =
    rangeStartDate && rangeEndDate
      ? Math.max(0, differenceInCalendarDays(rangeEndDate, rangeStartDate))
      : null;
  const rangeLabel =
    rangeStartDate && rangeEndDate
      ? `${format(rangeStartDate, "M/d")} - ${format(rangeEndDate, "M/d")}`
      : "日程を選択";

  useEffect(() => {
    const nextStart = parseDateInputValue(startDate);
    setMonth(startOfMonth(nextStart || new Date()));
    setAnchorDate(null);
  }, [startDate]);

  const updatePopupPosition = () => {
    const anchor = wrapperRef.current;
    if (!anchor || typeof window === "undefined") {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(360, window.innerWidth - viewportPadding * 2);
    const centeredLeft = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(
      viewportPadding,
      Math.min(centeredLeft, window.innerWidth - width - viewportPadding)
    );
    const top = rect.bottom + 8;
    setPopupStyle({ top, left, width });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    updatePopupPosition();

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (
        !target ||
        wrapperRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
      setAnchorDate(null);
    };
    const handleViewportUpdate = () => {
      updatePopupPosition();
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, { passive: true });
    window.addEventListener("resize", handleViewportUpdate);
    window.addEventListener("scroll", handleViewportUpdate, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      window.removeEventListener("resize", handleViewportUpdate);
      window.removeEventListener("scroll", handleViewportUpdate, true);
    };
  }, [isOpen]);

  const handleDayClick = (day: Date) => {
    const selected = startOfDay(day);
    if (!anchorDate) {
      setAnchorDate(selected);
      return;
    }
    const nextStart = isAfter(anchorDate, selected) ? selected : anchorDate;
    const nextEnd = isAfter(anchorDate, selected) ? anchorDate : selected;
    onChange(toDateInput(nextStart), toDateInput(nextEnd));
    setAnchorDate(null);
    setIsOpen(false);
  };

  const popup =
    isOpen && popupStyle && typeof window !== "undefined"
      ? createPortal(
        <div
          ref={popupRef}
          className="fixed z-[1200] rounded-2xl border border-white/65 bg-white/72 p-3.5 shadow-[0_26px_72px_-28px_rgba(15,23,42,0.65)] backdrop-blur-2xl"
          style={{
            top: popupStyle.top,
            left: popupStyle.left,
            width: popupStyle.width
          }}
        >
          <p className="text-xs text-slate-500">
            {anchorDate
              ? "終了日を選択してください（外側タップで閉じる）"
              : "開始日→終了日を順に選択（外側タップで閉じる）"}
          </p>
          {rangeStartDate && rangeEndDate ? (
            <p className="mt-1 text-xs font-semibold text-slate-700">
              {format(rangeStartDate, "M/d")} - {format(rangeEndDate, "M/d")}
              {stayNights !== null ? ` (${stayNights}泊)` : ""}
            </p>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="whitespace-nowrap text-xl font-bold text-slate-900">
              {format(month, "yyyy年M月")}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth((current) => addMonths(current, -1))}
                className="rounded-lg border border-white/80 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur hover:bg-white/80"
                aria-label="前の月"
              >
                前月
              </button>
              <button
                type="button"
                onClick={() => setMonth((current) => addMonths(current, 1))}
                className="rounded-lg border border-white/80 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur hover:bg-white/80"
                aria-label="次の月"
              >
                次月
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-x-1 gap-y-2 text-center text-xs font-semibold text-slate-500">
            {["日", "月", "火", "水", "木", "金", "土"].map((label) => (
              <span key={`${format(month, "yyyy-MM")}-${label}`}>{label}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-x-0 gap-y-2">
            {buildMonthCells(month).map((cell, index) => {
              if (!cell) {
                return (
                  <span
                    key={`blank-${format(month, "yyyy-MM")}-${index}`}
                    className="h-10"
                  />
                );
              }
              const isRangeStart = rangeStartDate
                ? isSameDay(cell, rangeStartDate)
                : anchorDate
                  ? isSameDay(cell, anchorDate)
                  : false;
              const isRangeEnd = rangeEndDate && !anchorDate ? isSameDay(cell, rangeEndDate) : false;
              const inRange =
                Boolean(rangeStartDate && rangeEndDate && !anchorDate) &&
                cell.getTime() > (rangeStartDate?.getTime() ?? 0) &&
                cell.getTime() < (rangeEndDate?.getTime() ?? 0);
              const isBlueEdge = isRangeStart || isRangeEnd;
              const wrapperClass = isRangeStart && isRangeEnd
                ? "rounded-lg bg-blue-600"
                : isRangeStart
                  ? "rounded-l-lg bg-blue-600"
                  : isRangeEnd
                    ? "rounded-r-lg bg-blue-600"
                    : inRange
                      ? "bg-slate-200"
                      : "rounded-lg hover:bg-slate-100";
              return (
                <div key={toDateInput(cell)} className={`h-10 ${wrapperClass}`}>
                  <button
                    type="button"
                    onClick={() => handleDayClick(cell)}
                    className={`h-10 w-full text-base font-semibold transition ${
                      isBlueEdge ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {format(cell, "d")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )
      : null;

  return (
    <div
      ref={wrapperRef}
      className="relative mt-1.5"
    >
      <button
        type="button"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (!next) {
            setAnchorDate(null);
          }
          if (next) {
            requestAnimationFrame(() => updatePopupPosition());
          }
        }}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition focus:border-sky-300"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-500">
            {title}
          </p>
          <p
            className={`mt-1 text-sm font-medium ${
              rangeStartDate ? "text-slate-900" : "text-slate-400"
            }`}
          >
            {rangeLabel}
          </p>
        </div>
        <span className="text-xs font-semibold text-blue-600">
          {isOpen ? "閉じる" : "選択"}
        </span>
      </button>
      {popup}
    </div>
  );
}

function PopoverDatePicker({
  value,
  onChange,
  onCommit,
  placeholder = "日付を選択"
}: {
  value: string;
  onChange: (nextDate: string) => void;
  onCommit?: () => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const selected = parseDateInputValue(value);
  const triggerLabel = selected ? format(selected, "M/d") : placeholder;

  useEffect(() => {
    const nextDate = parseDateInputValue(value);
    setMonth(startOfMonth(nextDate || new Date()));
  }, [value]);

  const updatePopupPosition = () => {
    const anchor = wrapperRef.current;
    if (!anchor || typeof window === "undefined") {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(360, window.innerWidth - viewportPadding * 2);
    const centeredLeft = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(
      viewportPadding,
      Math.min(centeredLeft, window.innerWidth - width - viewportPadding)
    );
    const top = rect.bottom + 8;
    setPopupStyle({ top, left, width });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    updatePopupPosition();

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (
        !target ||
        wrapperRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
      onCommit?.();
    };
    const handleViewportUpdate = () => {
      updatePopupPosition();
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, { passive: true });
    window.addEventListener("resize", handleViewportUpdate);
    window.addEventListener("scroll", handleViewportUpdate, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      window.removeEventListener("resize", handleViewportUpdate);
      window.removeEventListener("scroll", handleViewportUpdate, true);
    };
  }, [isOpen, onCommit]);

  const popup =
    isOpen && popupStyle && typeof window !== "undefined"
      ? createPortal(
        <div
          ref={popupRef}
          className="fixed z-[1200] rounded-2xl border border-white/65 bg-white/72 p-3.5 shadow-[0_26px_72px_-28px_rgba(15,23,42,0.65)] backdrop-blur-2xl"
          style={{
            top: popupStyle.top,
            left: popupStyle.left,
            width: popupStyle.width
          }}
        >
          <p className="text-xs text-slate-500">日付を選択（外側タップで閉じる）</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="whitespace-nowrap text-xl font-bold text-slate-900">
              {format(month, "yyyy年M月")}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth((current) => addMonths(current, -1))}
                className="rounded-lg border border-white/80 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur hover:bg-white/80"
                aria-label="前の月"
              >
                前月
              </button>
              <button
                type="button"
                onClick={() => setMonth((current) => addMonths(current, 1))}
                className="rounded-lg border border-white/80 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur hover:bg-white/80"
                aria-label="次の月"
              >
                次月
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-x-1 gap-y-2 text-center text-xs font-semibold text-slate-500">
            {["日", "月", "火", "水", "木", "金", "土"].map((label) => (
              <span key={`${format(month, "yyyy-MM")}-${label}`}>{label}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-x-1 gap-y-2">
            {buildMonthCells(month).map((cell, index) => {
              if (!cell) {
                return <span key={`blank-${format(month, "yyyy-MM")}-${index}`} />;
              }
              const active = selected ? isSameDay(cell, selected) : false;
              return (
                <button
                  key={toDateInput(cell)}
                  type="button"
                  onClick={() => {
                    onChange(toDateInput(startOfDay(cell)));
                    setIsOpen(false);
                    onCommit?.();
                  }}
                  className={`mx-auto h-10 w-10 rounded-lg text-base font-semibold transition ${active
                    ? "bg-blue-600 text-white"
                    : "text-slate-900 hover:bg-slate-100"
                    }`}
                >
                  {format(cell, "d")}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )
      : null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() =>
          setIsOpen((current) => {
            const next = !current;
            if (!next) {
              onCommit?.();
            }
            if (next) {
              requestAnimationFrame(() => updatePopupPosition());
            }
            return next;
          })
        }
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md"
        aria-expanded={isOpen}
      >
        <span
          className={`text-sm font-semibold ${selected ? "text-slate-900" : "text-slate-400"
            }`}
        >
          {triggerLabel}
        </span>
        <span className="text-xs font-semibold text-blue-600">
          {isOpen ? "閉じる" : "選択"}
        </span>
      </button>
      {popup}
    </div>
  );
}

function resolvePlanParam(param: string) {
  if (!param) {
    return { planPath: null, planId: null };
  }
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    decoded = param;
  }

  if (decoded.includes("/")) {
    return { planPath: decoded, planId: null };
  }

  return { planPath: null, planId: decoded };
}

function toDateValue(value?: unknown) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && "toDate" in value) {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === "function") {
      return withToDate.toDate();
    }
  }
  return null;
}

function toDateInputValue(value?: unknown) {
  const date = toDateValue(value);
  if (!date) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAiPlannerErrorMessage(code?: string, detail?: string) {
  const normalizedDetail = detail?.trim();
  if (normalizedDetail) {
    return normalizedDetail;
  }
  switch (code) {
    case "missing_openai_api_key":
      return "OPENAI_API_KEY が設定されていません。";
    case "prompt_or_image_required":
      return "文章か画像のどちらかを入力してください。";
    case "too_many_images":
      return "画像は3枚まで選択できます。";
    case "invalid_image_type":
      return "画像ファイルのみアップロードできます。";
    case "image_too_large":
      return "画像サイズは1枚あたり6MB以下にしてください。";
    case "ai_output_incomplete":
      return "AIの出力が途中で切れました。入力テキストを短くするか画像枚数を減らして再試行してください。";
    case "invalid_ai_response":
      return "AIの出力を解析できませんでした。入力を少し具体的にして再試行してください。";
    default:
      return "AIプランの作成に失敗しました。時間をおいて再試行してください。";
  }
}

function getHotelRecommendationsErrorMessage(code?: string, detail?: string) {
  const normalizedDetail = detail?.trim();
  if (normalizedDetail) {
    return normalizedDetail;
  }
  switch (code) {
    case "missing_hotel_api_key":
      return "SERPAPI_API_KEY が設定されていません。";
    case "destination_required":
      return "目的地を入力してください。";
    case "invalid_dates":
      return "旅行日程を設定してから再試行してください。";
    case "destination_not_found":
      return "目的地候補が見つかりませんでした。都市名を具体的に入力してください。";
    case "location_lookup_failed":
      return "目的地の検索に失敗しました。";
    case "hotel_search_failed":
      return "ホテル候補の検索に失敗しました。";
    default:
      return "ホテル候補の取得に失敗しました。時間をおいて再試行してください。";
  }
}

function normalizeAiChatMessage(value: unknown) {
  const toText = (entry: unknown) => (typeof entry === "string" ? entry.trim() : "");
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const role = record.role === "user" ? "user" : record.role === "assistant" ? "assistant" : null;
  const text = toText(record.text);
  const createdAt = toText(record.createdAt);
  if (!role || !text) {
    return null;
  }
  return {
    id: toText(record.id) || createDraftId(),
    role,
    text,
    warnings: Array.isArray(record.warnings)
      ? record.warnings.map((item) => toText(item)).filter(Boolean)
      : [],
    attachments: Array.isArray(record.attachments)
      ? record.attachments.map((item) => toText(item)).filter(Boolean)
      : [],
    sources: normalizeAiChatSources(record.sources),
    createdAt: createdAt || new Date().toISOString()
  } satisfies AiChatMessage;
}

function normalizeAiChatSources(value: unknown): AiChatSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: AiChatSource[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const snippet = typeof record.snippet === "string" ? record.snippet.trim() : "";
    if (!url) {
      return;
    }
    result.push({
      title: title || url,
      url,
      snippet: snippet || undefined
    });
  });
  return result.slice(0, 8);
}

function formatAiChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return format(date, "M/d HH:mm");
}

function hasHotelRecommendationIntent(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) {
    return false;
  }
  return [
    "ホテル",
    "宿",
    "hotel",
    "accommodation",
    "おすすめ",
    "オススメ",
    "泊ま"
  ].some((keyword) => text.includes(keyword));
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

function normalizeLink(raw: string) {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractMapHint(text: string) {
  const parts = text
    .split("/")
    .map((part) => compactText(part))
    .filter(Boolean);
  return (
    parts.find(
      (part) =>
        !/^レビュー\b/.test(part) &&
        !/^source\s*:/i.test(part) &&
        !/要確認|未確定|候補/.test(part)
    ) || ""
  );
}

function buildMapQuery(parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((part) => compactText(part ?? ""))
    .filter(Boolean);
  if (normalized.length === 0) {
    return "";
  }
  return Array.from(new Set(normalized)).join(", ");
}

function buildHotelMapQuery(name: string, address: string, notes: string, destination: string) {
  return buildMapQuery([address, name, extractMapHint(notes), destination]);
}

function buildActivityMapQuery(
  title: string,
  address: string,
  notes: string,
  destination: string
) {
  return buildMapQuery([address, title, extractMapHint(notes), destination]);
}

function stripIataSuffix(value: string) {
  return compactText(value).replace(/\s*\([A-Z]{3,4}\)\s*$/g, "");
}

function containsJapaneseText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

const AIRPORT_CODE_ALIASES: Record<string, string[]> = {
  HND: ["東京国際空港", "羽田空港"],
  NRT: ["成田国際空港", "成田空港"],
  ITM: ["大阪国際空港", "伊丹空港", "大阪伊丹空港"],
  KIX: ["関西国際空港", "関西空港"],
  UKB: ["神戸空港"],
  CTS: ["新千歳空港"],
  FUK: ["福岡空港"],
  OKA: ["那覇空港"]
};

const DESTINATION_GEO_ALIASES: Record<string, string[]> = {
  バンコク: ["バンコク", "Bangkok", "タイ", "Thailand"],
  Bangkok: ["バンコク", "Bangkok", "タイ", "Thailand"],
  台北: ["台北", "Taipei", "新北", "New Taipei", "台湾", "Taiwan"],
  Taipei: ["台北", "Taipei", "新北", "New Taipei", "台湾", "Taiwan"],
  台湾: ["台湾", "Taiwan", "台北", "Taipei", "新北", "New Taipei"],
  Taiwan: ["台湾", "Taiwan", "台北", "Taipei", "新北", "New Taipei"],
  ソウル: ["ソウル", "Seoul", "韓国", "Korea"],
  Seoul: ["ソウル", "Seoul", "韓国", "Korea"],
  香港: ["香港", "Hong Kong"],
  Singapore: ["シンガポール", "Singapore"],
  シンガポール: ["シンガポール", "Singapore"],
  Doha: ["ドーハ", "Doha", "カタール", "Qatar"],
  ドーハ: ["ドーハ", "Doha", "カタール", "Qatar"]
};

function getIataCode(value: string) {
  const match = compactText(value).match(/\(([A-Z]{3,4})\)\s*$/);
  return match?.[1] ?? "";
}

function getAirportAliasCandidates(label: string) {
  const code = getIataCode(label);
  const base = stripIataSuffix(label);
  const aliases = [
    ...(code ? AIRPORT_CODE_ALIASES[code] ?? [] : []),
    /羽田/.test(base) ? "東京国際空港" : "",
    /伊丹|大阪国際/.test(base) ? "大阪国際空港" : "",
    /関西空港/.test(base) ? "関西国際空港" : "",
    /成田/.test(base) ? "成田国際空港" : ""
  ]
    .map((candidate) => compactText(candidate))
    .filter(Boolean);
  return Array.from(new Set(aliases));
}

function splitDestinationHints(value: string) {
  const rawHints = Array.from(
    new Set(
      compactText(value)
        .split(/[、,・/／>\-|→\n]+/)
        .map((part) => stripIataSuffix(part))
        .map((part) => compactText(part))
        .filter((part) => part.length > 1)
    )
  ).slice(0, 3);
  const expanded = rawHints.flatMap((hint) => DESTINATION_GEO_ALIASES[hint] ?? [hint]);
  return Array.from(new Set(expanded.map((hint) => compactText(hint)).filter(Boolean))).slice(0, 6);
}

function isJapanDestination(destinationHints: string[]) {
  return destinationHints.some((hint) =>
    /日本|東京|大阪|京都|北海道|福岡|博多|那覇|札幌|名古屋|横浜|神戸/i.test(hint)
  );
}

function extractPlaceFragments(value: string) {
  const base = compactText(stripIataSuffix(value));
  const parenthetical = Array.from(base.matchAll(/[（(]([^）)]+)[）)]/g))
    .map((match) => compactText(match[1] ?? ""))
    .filter(Boolean);
  const normalized = base
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/[()（）]/g, " ")
    .replace(
      /(観光|旅行|散策|体験|食べ歩き|味くらべ|グルメ|ランチ|ディナー|朝食|巡り|周辺|歴史|街歩き|写真撮影|展望台|要確認|おすすめ|人気|など|本店|ツアー)/g,
      " "
    );
  const directCore = compactText(
    normalized
      .replace(/\s+/g, " ")
      .trim()
  );
  return Array.from(
    new Set(
      [directCore, normalized, ...parenthetical]
        .flatMap((chunk) => chunk.split(/[&＆、,\/／]+/))
        .flatMap((part) => part.split(/・/))
        .flatMap((part) => part.split(/\s+/))
        .map((part) => compactText(part))
        .filter((part) => part.length >= 2)
        .filter(
          (part) =>
            !/^(和菓子|グルメ|観光|散策|体験|食べ歩き|ランチ|ディナー|朝食|周辺|歴史|街歩き|写真撮影|展望台|など)$/.test(
              part
            )
        )
    )
  ).slice(0, 4);
}

function buildLocationQueryCandidates(label: string, destinationHint = "") {
  const base = stripIataSuffix(label);
  const destinationHints = splitDestinationHints(destinationHint);
  const airportAliases = getAirportAliasCandidates(label);
  const appendJapanSuffix = isJapanDestination(destinationHints);
  return buildQueryCandidates([
    ...(appendJapanSuffix ? airportAliases.map((alias) => [alias, "日本"]) : []),
    ...airportAliases.map((alias) => [alias]),
    containsJapaneseText(base) && appendJapanSuffix ? [base, "日本"] : [],
    ...destinationHints.map((hint) =>
      containsJapaneseText(base) && appendJapanSuffix ? [base, hint, "日本"] : [base, hint]
    ),
    [base],
    [label]
  ]);
}

function buildQueryCandidates(partsList: Array<Array<string | null | undefined>>) {
  const candidates = partsList
    .map((parts) => buildMapQuery(parts))
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function getPrimaryDestinationTerms(destination: string) {
  return splitDestinationHints(destination).filter(
    (hint) => !/^(日本|japan|台湾|taiwan|タイ|thailand|韓国|korea|香港|hong kong)$/i.test(hint)
  );
}

function buildHotelMapQueryCandidates(
  name: string,
  address: string,
  notes: string,
  destination: string
) {
  const hint = extractMapHint(notes);
  const baseName = stripIataSuffix(name);
  const cleanAddress = compactText(address);
  const destinationHints = splitDestinationHints(destination);
  const primaryDestinationTerms = getPrimaryDestinationTerms(destination);
  const placeFragments = extractPlaceFragments(`${name} ${cleanAddress} ${hint}`);
  const appendJapanSuffix = isJapanDestination(destinationHints);
  return buildQueryCandidates([
    cleanAddress ? [cleanAddress] : [],
    ...destinationHints.map((destinationHint) =>
      cleanAddress ? [cleanAddress, destinationHint] : []
    ),
    ...primaryDestinationTerms.map((destinationHint) =>
      containsJapaneseText(baseName) && appendJapanSuffix
        ? [baseName, destinationHint, "日本"]
        : [baseName, destinationHint]
    ),
    ...destinationHints.map((destinationHint) =>
      containsJapaneseText(baseName) && appendJapanSuffix
        ? [baseName, destinationHint, "日本"]
        : [baseName, destinationHint]
    ),
    ...placeFragments.flatMap((fragment) =>
      destinationHints.map((destinationHint) =>
        appendJapanSuffix ? [fragment, destinationHint, "日本"] : [fragment, destinationHint]
      )
    ),
    containsJapaneseText(baseName) && appendJapanSuffix ? [baseName, "日本"] : [],
    ...(appendJapanSuffix ? placeFragments.map((fragment) => [fragment, "日本"]) : []),
    [baseName],
    [hint],
    ...destinationHints.map((destinationHint) => [hint, destinationHint]),
    ...placeFragments.map((fragment) => [fragment]),
    [name]
  ]);
}

function buildActivityMapQueryCandidates(
  title: string,
  address: string,
  notes: string,
  destination: string
) {
  const hint = extractMapHint(notes);
  const baseTitle = stripIataSuffix(title);
  const cleanAddress = compactText(address);
  const destinationHints = splitDestinationHints(destination);
  const primaryDestinationTerms = getPrimaryDestinationTerms(destination);
  const placeFragments = extractPlaceFragments(`${title} ${cleanAddress} ${hint}`);
  const appendJapanSuffix = isJapanDestination(destinationHints);
  return buildQueryCandidates([
    cleanAddress ? [cleanAddress] : [],
    ...destinationHints.map((destinationHint) =>
      cleanAddress ? [cleanAddress, destinationHint] : []
    ),
    ...placeFragments.flatMap((fragment) =>
      primaryDestinationTerms.map((destinationHint) =>
        appendJapanSuffix ? [fragment, destinationHint, "日本"] : [fragment, destinationHint]
      )
    ),
    ...primaryDestinationTerms.map((destinationHint) =>
      containsJapaneseText(baseTitle) && appendJapanSuffix
        ? [baseTitle, destinationHint, "日本"]
        : [baseTitle, destinationHint]
    ),
    ...placeFragments.flatMap((fragment) =>
      destinationHints.map((destinationHint) =>
        appendJapanSuffix ? [fragment, destinationHint, "日本"] : [fragment, destinationHint]
      )
    ),
    ...destinationHints.map((destinationHint) =>
      containsJapaneseText(baseTitle) && appendJapanSuffix
        ? [baseTitle, destinationHint, "日本"]
        : [baseTitle, destinationHint]
    ),
    containsJapaneseText(baseTitle) && appendJapanSuffix ? [baseTitle, "日本"] : [],
    ...(appendJapanSuffix ? placeFragments.map((fragment) => [fragment, "日本"]) : []),
    ...destinationHints.map((destinationHint) => [hint, destinationHint]),
    [baseTitle],
    [hint],
    ...placeFragments.map((fragment) => [fragment]),
    [title]
  ]);
}

function normalizeTripMapSortValue(value: string) {
  const normalized = compactText(value);
  if (!normalized) {
    return "9999-12-31T23:59:59";
  }
  const timestamp = Date.parse(normalized);
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  return normalized;
}

function dedupeTripMapStops(stops: TripMapStop[]) {
  const seen = new Set<string>();
  return stops.filter((stop) => {
    const key = `${stop.kind}:${compactText(stop.label).toLowerCase()}`;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getLinkField(item: ItemRecord) {
  return getStringField(item, LINK_KEYS);
}

function formatTripMapDistance(km: number) {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  if (km < 10) {
    return `${km.toFixed(1)}km`;
  }
  return `${Math.round(km)}km`;
}

function getDistanceInKm(
  from: Pick<TripMapResolvedStop, "lat" | "lng">,
  to: Pick<TripMapResolvedStop, "lat" | "lng">
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function buildTripMapStopsFromHotels(
  hotels: Array<{
    id: string;
    name: string;
    address: string;
    notes: string;
    checkIn: string;
    checkOut: string;
  }>,
  destination: string
) {
  return hotels
    .map((hotel) => {
      const label = compactText(hotel.name);
      const queryCandidates = buildHotelMapQueryCandidates(
        label,
        hotel.address,
        hotel.notes,
        destination
      );
      const query = queryCandidates[0] ?? "";
      const subtitle =
        hotel.checkIn || hotel.checkOut
          ? `${hotel.checkIn || "—"} 〜 ${hotel.checkOut || "—"}`
          : "宿泊";
      if (!label || !query) {
        return null;
      }
      return {
        id: hotel.id,
        label,
        address: compactText(hotel.address),
        query,
        queryCandidates,
        destinationHint: destination,
        kind: "宿泊" as const,
        sortValue: normalizeTripMapSortValue(hotel.checkIn || hotel.checkOut),
        subtitle
      } satisfies TripMapStop;
    })
    .filter(Boolean) as TripMapStop[];
}

function buildTripMapStopsFromActivities(
  activities: Array<{
    id: string;
    title: string;
    address: string;
    notes: string;
    date: string;
  }>,
  destination: string
) {
  return activities
    .map((activity) => {
      const label = compactText(activity.title);
      const queryCandidates = buildActivityMapQueryCandidates(
        label,
        activity.address,
        activity.notes,
        destination
      );
      const query = queryCandidates[0] ?? "";
      if (!label || !query) {
        return null;
      }
      return {
        id: activity.id,
        label,
        address: compactText(activity.address),
        query,
        queryCandidates,
        destinationHint: destination,
        kind: "予定" as const,
        sortValue: normalizeTripMapSortValue(activity.date),
        subtitle: activity.date ? formatShortDateTime(activity.date) : "予定"
      } satisfies TripMapStop;
    })
    .filter(Boolean) as TripMapStop[];
}

function buildTripMapStopsFromTransportations(
  transportations: Array<{
    id: string;
    mode: string;
    from: string;
    to: string;
    depTime: string;
    arrTime: string;
  }>,
  destinationHint: string
) {
  return transportations
    .flatMap((transportation) => {
      const mode = compactText(transportation.mode) || "移動";
      const departure = compactText(transportation.from);
      const arrival = compactText(transportation.to);
      const depTime = compactText(transportation.depTime);
      const arrTime = compactText(transportation.arrTime);
      const stops: TripMapStop[] = [];

      if (departure) {
        stops.push({
          id: `${transportation.id}-from`,
          label: departure,
          address: "",
          query: stripIataSuffix(departure),
          queryCandidates: buildLocationQueryCandidates(departure, destinationHint),
          destinationHint,
          kind: "移動",
          sortValue: normalizeTripMapSortValue(depTime),
          subtitle: `${mode} 出発${depTime ? ` ${formatShortDateTime(depTime)}` : ""}`
        });
      }

      if (arrival) {
        stops.push({
          id: `${transportation.id}-to`,
          label: arrival,
          address: "",
          query: stripIataSuffix(arrival),
          queryCandidates: buildLocationQueryCandidates(arrival, destinationHint),
          destinationHint,
          kind: "移動",
          sortValue: normalizeTripMapSortValue(arrTime || depTime),
          subtitle: `${mode} 到着${arrTime ? ` ${formatShortDateTime(arrTime)}` : ""}`
        });
      }

      return stops;
    })
    .filter(Boolean);
}

function TripOverviewMapCard({
  stops,
  onResolvedStops
}: {
  stops: TripMapStop[];
  onResolvedStops?: (stops: TripMapResolvedStop[]) => void;
}) {
  const [resolvedStops, setResolvedStops] = useState<TripMapResolvedStop[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState("");

  const stopsPayload = useMemo(
    () =>
      stops.map((stop) => ({
        id: stop.id,
        label: stop.label,
        address: stop.address,
        query: stop.query,
        queryCandidates: stop.queryCandidates,
        destinationHint: stop.destinationHint,
        kind: stop.kind,
        sortValue: stop.sortValue,
        subtitle: stop.subtitle
      })),
    [stops]
  );

  useEffect(() => {
    if (stopsPayload.length === 0) {
      setResolvedStops([]);
      setWarnings([]);
      setError(null);
      setLoading(false);
      setProvider("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/maps/overview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ stops: stopsPayload }),
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as TripOverviewResponse;
        if (!response.ok) {
          throw new Error(payload.detail || "旅程マップを取得できませんでした。");
        }
        setResolvedStops(Array.isArray(payload.points) ? payload.points : []);
        setWarnings(
          Array.isArray(payload.warnings)
            ? payload.warnings.filter((item): item is string => typeof item === "string")
            : []
        );
        setProvider(typeof payload.provider === "string" ? payload.provider : "");
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setResolvedStops([]);
        setWarnings([]);
        setProvider("");
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "旅程マップを読み込めませんでした。"
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [stopsPayload]);

  useEffect(() => {
    onResolvedStops?.(resolvedStops);
  }, [onResolvedStops, resolvedStops]);

  if (stops.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Trip Map
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">旅程マップ</h3>
          <p className="mt-1 text-sm text-slate-500">
            宿泊先と予定を中心に日付順で表示します。前後の距離感もここで確認できます。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {stops.length}スポット
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {loading ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-slate-500">
            地図を読み込み中...
          </div>
        ) : error ? (
          <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-slate-500">
            {error}
          </div>
        ) : resolvedStops.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-slate-500">
            地図化できるスポットがありません。位置検索キー未設定の場合は `.env.local` に `GEOAPIFY_API_KEY` を追加してください。
          </div>
        ) : (
          <TripOverviewMapCanvas resolvedStops={resolvedStops} />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {provider ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
            Geocoding: {provider}
          </span>
        ) : null}
        {warnings.length > 0 ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
            {warnings[0]}
          </span>
        ) : null}
      </div>

      {resolvedStops.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {resolvedStops.map((stop, index) => {
            const distanceFromPrevious =
              index > 0
                ? getDistanceInKm(resolvedStops[index - 1], stop)
                : null;
            return (
              <div
                key={stop.id || `${stop.label}-${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{stop.label}</p>
                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {stop.kind}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{stop.subtitle}</p>
                    <p className="mt-1 text-xs text-slate-500">{stop.placeName}</p>
                    {distanceFromPrevious !== null ? (
                      <p className="mt-2 text-xs font-semibold text-slate-700">
                        前のスポットから約 {formatTripMapDistance(distanceFromPrevious)}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-slate-700">
                        旅程のスタート地点
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, button, label"));
}

function SwipeDeleteCard({
  enabled,
  onDelete,
  children
}: {
  enabled: boolean;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [translateX, setTranslateX] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const swipingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || isDeleting || isInteractiveTarget(event.target)) {
      return;
    }
    draggingRef.current = true;
    swipingRef.current = false;
    startRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !enabled || isDeleting) {
      return;
    }
    const deltaX = event.clientX - startRef.current.x;
    const deltaY = event.clientY - startRef.current.y;
    if (!swipingRef.current) {
      if (Math.abs(deltaX) < 6) {
        return;
      }
      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        draggingRef.current = false;
        return;
      }
      swipingRef.current = true;
    }
    const nextTranslate = Math.max(-120, Math.min(0, deltaX));
    setTranslateX(nextTranslate);
  };

  const handlePointerEnd = () => {
    if (!draggingRef.current || isDeleting) {
      return;
    }
    draggingRef.current = false;
    if (translateX <= -80) {
      setIsDeleting(true);
      setTranslateX(0);
      if (deleteTimerRef.current) {
        window.clearTimeout(deleteTimerRef.current);
      }
      deleteTimerRef.current = window.setTimeout(() => {
        onDelete();
      }, 220);
      return;
    }
    setTranslateX(0);
  };

  const deleteOpacity =
    enabled && !isDeleting ? Math.min(1, Math.abs(translateX) / 80) : 0;

  return (
    <div
      className={`relative overflow-visible rounded-2xl ${isDeleting ? "pointer-events-none animate-slide-out" : ""
        }`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl bg-rose-500"
        style={{ opacity: deleteOpacity }}
      />
      {enabled ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end pr-6 text-sm font-semibold text-white">
          削除
        </div>
      ) : null}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative z-10 transition-transform duration-200"
        style={{ transform: `translateX(${translateX}px)`, touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}

function PlanDetailContent({ user }: { user: User }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const planParam = typeof params?.id === "string" ? params.id : "";
  const { planPath, planId } = resolvePlanParam(planParam);
  const bootAssist = (searchParams?.get("assist") ?? "").trim().toLowerCase();
  const bootPrompt = (searchParams?.get("bootPrompt") ?? "").trim();
  const [plan, setPlan] = useState<TravelPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transportSortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const skipApplyRef = useRef(false);
  const [editValues, setEditValues] = useState({
    name: "",
    destination: "",
    memo: "",
    startDate: "",
    endDate: "",
    isPublic: false
  });
  const [transportEdits, setTransportEdits] = useState<TransportationDraft[]>([]);
  const [hotelEdits, setHotelEdits] = useState<HotelDraft[]>([]);
  const [activityEdits, setActivityEdits] = useState<ActivityDraft[]>([]);
  const [packingEdits, setPackingEdits] = useState<PackingDraft[]>([]);
  const [savingsEdits, setSavingsEdits] = useState<SavingsDraft[]>([]);
  const [flightFetchingId, setFlightFetchingId] = useState<string | null>(null);
  const [flightFetchError, setFlightFetchError] = useState<string | null>(null);
  const [flightFetchErrorId, setFlightFetchErrorId] = useState<string | null>(null);
  const [flightRecoLoadingId, setFlightRecoLoadingId] = useState<string | null>(null);
  const [flightRecoErrorId, setFlightRecoErrorId] = useState<string | null>(null);
  const [flightRecoError, setFlightRecoError] = useState<string | null>(null);
  const [flightRecoById, setFlightRecoById] = useState<Record<string, FlightRecommendation[]>>({});
  const [flightRecoWarningsById, setFlightRecoWarningsById] = useState<Record<string, string[]>>({});
  const [flightRecoSheetId, setFlightRecoSheetId] = useState<string | null>(null);
  const autoFlightRecoKeyRef = useRef<Record<string, string>>({});
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiImages, setAiImages] = useState<File[]>([]);
  const [aiAssistantMode, setAiAssistantMode] = useState<AiAssistantMode>("consult");
  const [aiMode, setAiMode] = useState<AiPlannerMode>("merge");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [quickAssistOpen, setQuickAssistOpen] = useState(false);
  const [hotelRecoLoading, setHotelRecoLoading] = useState(false);
  const [hotelRecoError, setHotelRecoError] = useState<string | null>(null);
  const [hotelRecoWarnings, setHotelRecoWarnings] = useState<string[]>([]);
  const [hotelRecoSummary, setHotelRecoSummary] = useState<string | null>(null);
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
  const [pendingAiSuggestion, setPendingAiSuggestion] = useState<PendingAiSuggestion | null>(null);
  const [aiChatLoadedKey, setAiChatLoadedKey] = useState("");
  const [autoPlanBootPrepared, setAutoPlanBootPrepared] = useState(false);
  const [autoPlanBootTriggered, setAutoPlanBootTriggered] = useState(false);
  const aiChatEndRef = useRef<HTMLDivElement | null>(null);
  const aiImageInputRef = useRef<HTMLInputElement | null>(null);
  const autoPlanBootRef = useRef(false);
  const canEditNow =
    Boolean(plan?.path) &&
    (plan?.userId === user.uid ||
      plan?.ownerId === user.uid ||
      (typeof plan?.path === "string" &&
        (plan.path.startsWith(`users/${user.uid}/travelPlans/`) ||
          plan.path.startsWith(`Users/${user.uid}/travelPlans/`))));

  const applyPlanToEdits = (current: TravelPlan) => {
    setEditValues({
      name: current.name ?? "",
      destination: current.destination ?? "",
      memo: current.memo ?? "",
      startDate: toDateInputValue(current.startDate),
      endDate: toDateInputValue(current.endDate),
      isPublic: Boolean(current.isPublic)
    });
    const transportations = Array.isArray(current.transportations)
      ? current.transportations
      : [];
    const hotels = Array.isArray(current.hotels) ? current.hotels : [];
    const activities = Array.isArray(current.activities) ? current.activities : [];
    const packingList = Array.isArray(current.packingList) ? current.packingList : [];
    const savingsHistory = Array.isArray(current.savingsHistory)
      ? current.savingsHistory
      : [];
    setTransportEdits(sortTransportationDrafts(buildTransportationDrafts(transportations)));
    setHotelEdits(buildHotelDrafts(hotels));
    setActivityEdits(buildActivityDrafts(activities));
    setPackingEdits(buildPackingDrafts(packingList));
    setSavingsEdits(buildSavingsDrafts(savingsHistory));
  };

  const buildCurrentAiPlanContext = (): AiPlanSuggestion => ({
    name: editValues.name.trim() || undefined,
    destination: editValues.destination.trim() || undefined,
    memo: editValues.memo.trim() || undefined,
    startDate: editValues.startDate || null,
    endDate: editValues.endDate || null,
    transportations: applyTransportationDrafts(transportEdits),
    hotels: applyHotelDrafts(hotelEdits),
    activities: applyActivityDrafts(activityEdits),
    packingList: applyPackingDrafts(packingEdits)
  });

  const applyAiSuggestion = (suggestion: AiPlanSuggestion, mode: AiPlannerMode) => {
    setEditValues((prev) => ({
      ...prev,
      name:
        mode === "replace"
          ? suggestion.name ?? ""
          : suggestion.name && suggestion.name.trim()
            ? suggestion.name
            : prev.name,
      destination:
        mode === "replace"
          ? suggestion.destination ?? ""
          : suggestion.destination && suggestion.destination.trim()
            ? suggestion.destination
            : prev.destination,
      memo:
        mode === "replace"
          ? suggestion.memo ?? ""
          : suggestion.memo && suggestion.memo.trim()
            ? suggestion.memo
            : prev.memo,
      startDate:
        mode === "replace"
          ? toDateInputValue(suggestion.startDate)
          : suggestion.startDate
            ? toDateInputValue(suggestion.startDate)
            : prev.startDate,
      endDate:
        mode === "replace"
          ? toDateInputValue(suggestion.endDate)
          : suggestion.endDate
            ? toDateInputValue(suggestion.endDate)
            : prev.endDate
    }));

    if (mode === "replace" || (suggestion.transportations?.length ?? 0) > 0) {
      setTransportEdits(
        sortTransportationDrafts(
          buildTransportationDrafts(suggestion.transportations ?? [])
        )
      );
    }
    if (mode === "replace" || (suggestion.hotels?.length ?? 0) > 0) {
      setHotelEdits(buildHotelDrafts(suggestion.hotels ?? []));
    }
    if (mode === "replace" || (suggestion.activities?.length ?? 0) > 0) {
      setActivityEdits(buildActivityDrafts(suggestion.activities ?? []));
    }
    if (mode === "replace" || (suggestion.packingList?.length ?? 0) > 0) {
      setPackingEdits(buildPackingDrafts(suggestion.packingList ?? []));
    }
  };

  const aiChatStorageKey = useMemo(() => {
    const scope = plan?.path || planPath || planId || "";
    return scope ? `travelog:ai-chat:${scope}` : "";
  }, [plan?.path, planId, planPath]);

  const appendAiChatMessage = (
    message: Omit<AiChatMessage, "id" | "createdAt" | "sources"> & {
      sources?: AiChatSource[];
    }
  ) => {
    const text = message.text.trim();
    if (!text) {
      return;
    }
    setAiChatMessages((prev) =>
      [
        ...prev,
        {
          id: createDraftId(),
          role: message.role,
          text,
          warnings: message.warnings.filter(Boolean),
          attachments: message.attachments.filter(Boolean),
          sources: normalizeAiChatSources(message.sources ?? []),
          createdAt: new Date().toISOString()
        }
      ].slice(-AI_CHAT_HISTORY_LIMIT)
    );
  };

  const clearAiChatHistory = () => {
    setAiChatMessages([]);
    if (typeof window === "undefined" || !aiChatStorageKey) {
      return;
    }
    try {
      window.localStorage.removeItem(aiChatStorageKey);
    } catch {}
  };

  const applyPendingSuggestion = (mode: AiPlannerMode) => {
    if (!pendingAiSuggestion) {
      return;
    }
    applyAiSuggestion(pendingAiSuggestion.suggestion, mode);
    appendAiChatMessage({
      role: "assistant",
      text: mode === "replace" ? "AI提案を上書き反映しました。" : "AI提案を追記反映しました。",
      warnings: pendingAiSuggestion.warnings,
      attachments: []
    });
    setPendingAiSuggestion(null);
    setAiSummary(null);
    setAiWarnings([]);
    setAiError(null);
  };

  const discardPendingSuggestion = () => {
    if (!pendingAiSuggestion) {
      return;
    }
    appendAiChatMessage({
      role: "assistant",
      text: "提案を破棄しました。必要なら条件を変えて再生成してください。",
      warnings: [],
      attachments: []
    });
    setPendingAiSuggestion(null);
    setAiSummary(null);
    setAiWarnings([]);
  };

  const mapHotelRecommendationsToCandidates = (
    recommendations: HotelRecommendation[],
    checkIn: string,
    checkOut: string
  ) =>
    recommendations.map((hotel) => {
      const noteParts = [
        hotel.score !== null
          ? `レビュー ${hotel.score.toFixed(1)}${hotel.reviewCount !== null ? ` (${Math.round(hotel.reviewCount)}件)` : ""}`
          : "",
        hotel.source ? `source: ${hotel.source}` : ""
      ].filter(Boolean);

      return {
        name: hotel.name,
        address: hotel.address ?? "",
        price: hotel.price,
        currency: normalizePriceCurrency(hotel.currency ?? "JPY"),
        paid: false,
        checkIn,
        checkOut,
        notes: noteParts.join(" / "),
        link: hotel.link ?? ""
      } satisfies ItemRecord;
    });

  const formatHotelPriceLabel = (hotel: HotelRecommendation) => {
    if (hotel.price === null) {
      return "価格未取得";
    }
    return `${normalizePriceCurrency(hotel.currency ?? "JPY")} ${Math.round(hotel.price).toLocaleString()}`;
  };

  const formatHotelScoreLabel = (hotel: HotelRecommendation) => {
    if (hotel.score === null) {
      return "未取得";
    }
    return hotel.reviewCount !== null
      ? `${hotel.score.toFixed(1)} (${Math.round(hotel.reviewCount).toLocaleString()}件)`
      : hotel.score.toFixed(1);
  };

  const buildHotelRecommendationsChatText = (
    recommendations: HotelRecommendation[],
    resolvedDestination: string
  ) => {
    const prices = recommendations
      .map((hotel) => hotel.price)
      .filter((price): price is number => price !== null);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    const maxScore = recommendations.reduce<number | null>((acc, hotel) => {
      if (hotel.score === null) {
        return acc;
      }
      return acc === null ? hotel.score : Math.max(acc, hotel.score);
    }, null);
    const maxReviewCount = recommendations.reduce<number | null>((acc, hotel) => {
      if (hotel.reviewCount === null) {
        return acc;
      }
      return acc === null ? hotel.reviewCount : Math.max(acc, hotel.reviewCount);
    }, null);
    const cheapestHotel = recommendations
      .filter((hotel) => hotel.price !== null)
      .sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY))[0];
    const highestRatedHotel = recommendations
      .filter((hotel) => hotel.score !== null)
      .sort((a, b) => {
        const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      })[0];
    const balancedHotel = recommendations
      .filter((hotel) => hotel.price !== null && hotel.score !== null)
      .sort((a, b) => {
        const aScore = (a.score ?? 0) * 1000 - (a.price ?? 0) / 1000;
        const bScore = (b.score ?? 0) * 1000 - (b.price ?? 0) / 1000;
        return bScore - aScore;
      })[0];

    const pickRows: string[] = [];
    if (cheapestHotel) {
      pickRows.push(
        `安さ重視: ${cheapestHotel.name} (${formatHotelPriceLabel(cheapestHotel)} / 評価 ${formatHotelScoreLabel(cheapestHotel)})`
      );
    }
    if (highestRatedHotel && highestRatedHotel.name !== cheapestHotel?.name) {
      pickRows.push(
        `評価重視: ${highestRatedHotel.name} (評価 ${formatHotelScoreLabel(highestRatedHotel)} / 価格 ${formatHotelPriceLabel(highestRatedHotel)})`
      );
    }
    if (
      balancedHotel &&
      balancedHotel.name !== cheapestHotel?.name &&
      balancedHotel.name !== highestRatedHotel?.name
    ) {
      pickRows.push(
        `バランス重視: ${balancedHotel.name} (価格 ${formatHotelPriceLabel(balancedHotel)} / 評価 ${formatHotelScoreLabel(balancedHotel)})`
      );
    }

    const rows = recommendations.slice(0, 5).map((hotel, index) => {
      const reasons: string[] = [];
      if (minPrice !== null && hotel.price !== null) {
        if (hotel.price <= minPrice * 1.03) {
          reasons.push("価格が最安クラス");
        } else if (hotel.price <= minPrice * 1.12) {
          reasons.push("価格が比較的おさえめ");
        }
      }
      if (maxScore !== null && hotel.score !== null && hotel.score >= Math.max(8.5, maxScore - 0.2)) {
        reasons.push("レビュー評価が高い");
      }
      if (
        maxReviewCount !== null &&
        hotel.reviewCount !== null &&
        hotel.reviewCount >= Math.max(200, maxReviewCount * 0.5)
      ) {
        reasons.push("レビュー件数が多く安心");
      }
      if (hotel.link) {
        reasons.push("予約ページあり");
      }
      if (reasons.length === 0) {
        reasons.push("価格と評価のバランスが良い");
      }

      const address = hotel.address?.trim() ? hotel.address.trim() : "エリア情報なし";
      return [
        `${index + 1}. ${hotel.name}`,
        `   価格: ${formatHotelPriceLabel(hotel)}`,
        `   評価: ${formatHotelScoreLabel(hotel)}`,
        `   エリア: ${address}`,
        `   推しポイント: ${reasons.join(" / ")}`
      ].join("\n");
    });

    const picksSection =
      pickRows.length > 0 ? `おすすめの見方\n${pickRows.map((row) => `- ${row}`).join("\n")}\n\n` : "";

    return `${recommendations.length}件の候補を追加しました（${resolvedDestination}）\n\n${picksSection}${rows.join("\n\n")}`;
  };

  const toItemRecordArray = (value: unknown): ItemRecord[] =>
    Array.isArray(value)
      ? value.filter((item): item is ItemRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      : [];

  const buildPendingSuggestionPreviewText = (suggestion: AiPlanSuggestion) => {
    const previewLimit = 8;
    const planName = typeof suggestion.name === "string" ? suggestion.name.trim() : "";
    const destination = typeof suggestion.destination === "string" ? suggestion.destination.trim() : "";
    const startDate = toDateOnly(suggestion.startDate);
    const endDate = toDateOnly(suggestion.endDate);
    const memo = typeof suggestion.memo === "string" ? suggestion.memo.trim() : "";
    const transportations = toItemRecordArray(suggestion.transportations);
    const hotels = toItemRecordArray(suggestion.hotels);
    const activities = toItemRecordArray(suggestion.activities);
    const packingItems = Array.isArray(suggestion.packingList) ? suggestion.packingList : [];

    const transportLines = transportations.map((item) => {
      const mode = getStringField(item, TRANSPORT_MODE_KEYS) || "移動";
      const name = getStringField(item, TRANSPORT_NAME_KEYS);
      const from = getLocationField(item, TRANSPORT_FROM_KEYS);
      const to = getLocationField(item, TRANSPORT_TO_KEYS);
      const route = from && to ? `${from} → ${to}` : from || to || "";
      const detail = [name, route].filter(Boolean).join(" / ");
      return `・${mode}${detail ? `: ${detail}` : ""}`;
    });

    const hotelLines = hotels.map((item) => {
      const name = getStringField(item, HOTEL_NAME_KEYS) || "ホテル名未設定";
      const price = getNumberField(item, HOTEL_PRICE_KEYS);
      const currency = getItemCurrency(item, HOTEL_CURRENCY_KEYS);
      const priceLabel =
        price === null ? "価格未記載" : currency === "USD" ? formatUsd(price) : formatYen(price);
      return `・${name} (${priceLabel})`;
    });

    const activityLines = activities.map((item) => {
      const title = getStringField(item, ACTIVITY_TITLE_KEYS) || "予定名未設定";
      const date = toDateOnly(getStringField(item, ACTIVITY_DATE_KEYS));
      return `・${title}${date ? ` (${date})` : ""}`;
    });

    const packingLines = packingItems
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return getStringField(item as ItemRecord, PACKING_NAME_KEYS);
        }
        return "";
      })
      .filter(Boolean)
      .map((name) => `・${name}`);

    const lines: string[] = [];
    lines.push(`プラン名: ${planName || "未設定"}`);
    lines.push(`目的地: ${destination || "未設定"}`);
    lines.push(`日程: ${startDate || "未設定"} 〜 ${endDate || "未設定"}`);
    lines.push(
      `件数: 移動${transportations.length} / ホテル${hotels.length} / 予定${activities.length} / 持ち物${packingItems.length}`
    );
    if (memo) {
      lines.push(`メモ: ${memo.length > 80 ? `${memo.slice(0, 80)}...` : memo}`);
    }

    const appendPreviewSection = (title: string, entries: string[]) => {
      if (entries.length === 0) {
        return;
      }
      lines.push("");
      if (entries.length <= previewLimit) {
        lines.push(`${title}（全${entries.length}件）`);
        lines.push(...entries);
        return;
      }
      lines.push(`${title}（先頭${previewLimit}件 / 全${entries.length}件）`);
      lines.push(...entries.slice(0, previewLimit));
      lines.push(`・…他${entries.length - previewLimit}件`);
    };

    appendPreviewSection("移動", transportLines);
    appendPreviewSection("ホテル", hotelLines);
    appendPreviewSection("予定", activityLines);
    appendPreviewSection("持ち物", packingLines);

    return lines.join("\n");
  };

  const requestHotelRecommendations = async ({
    destination,
    checkIn,
    checkOut,
    limit = 5
  }: {
    destination: string;
    checkIn: string;
    checkOut: string;
    limit?: number;
  }) => {
    const response = await fetch("/api/hotels/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination,
        checkIn,
        checkOut,
        adults: 2,
        rooms: 1,
        locale: "ja",
        currency: "JPY",
        limit
      })
    });

    const payload = (await response.json()) as Partial<HotelRecommendationsResponse>;
    if (!response.ok) {
      throw new Error(getHotelRecommendationsErrorMessage(payload.error, payload.detail));
    }

    return {
      recommendations: Array.isArray(payload.hotels) ? payload.hotels : [],
      warnings: Array.isArray(payload.warnings)
        ? payload.warnings.map((item) => item.trim()).filter(Boolean)
        : [],
      resolvedDestination: payload.destinationResolved?.name?.trim() || destination
    };
  };

  const requestFlightRecommendations = async ({
    from,
    to,
    date,
    limit = 12
  }: {
    from: string;
    to: string;
    date: string;
    limit?: number;
  }) => {
    const response = await fetch("/api/flights/recommendations", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        date,
        adults: 1,
        locale: "ja",
        currency: "JPY",
        limit
      })
    });

    const payload = (await response.json()) as Partial<FlightRecommendationsResponse>;
    if (!response.ok) {
      throw new Error(
        payload.detail?.trim() ||
        payload.error?.trim() ||
        "フライト候補の取得に失敗しました。"
      );
    }

    return {
      recommendations: Array.isArray(payload.flights) ? payload.flights : [],
      warnings: Array.isArray(payload.warnings)
        ? payload.warnings.map((item) => item.trim()).filter(Boolean)
        : []
    };
  };

  const applyFlightRecommendationToDraft = (
    transportId: string,
    recommendation: FlightRecommendation
  ) => {
    updateTransportById(
      transportId,
      (current) => ({
        ...current,
        mode: { ...current.mode, value: "飛行機" },
        name: {
          ...current.name,
          value: compactText(recommendation.airline ?? "") || current.name.value
        },
        serviceName: {
          ...current.serviceName,
          value: compactText(recommendation.flightNumber ?? "") || current.serviceName.value
        },
        from: {
          ...current.from,
          value: compactText(recommendation.from ?? "") || current.from.value
        },
        to: {
          ...current.to,
          value: compactText(recommendation.to ?? "") || current.to.value
        },
        depTime: {
          ...current.depTime,
          value: compactText(recommendation.depTime ?? "") || current.depTime.value
        },
        arrTime: {
          ...current.arrTime,
          value: compactText(recommendation.arrTime ?? "") || current.arrTime.value
        },
        price: {
          ...current.price,
          value:
            typeof recommendation.price === "number"
              ? String(Math.round(recommendation.price))
              : current.price.value
        },
        currency: {
          ...current.currency,
          value: normalizePriceCurrency(recommendation.currency ?? "JPY")
        },
        link: {
          ...current.link,
          value: compactText(recommendation.link ?? "")
        },
        notes: {
          ...current.notes,
          value: [
            typeof recommendation.stops === "number"
              ? recommendation.stops === 0
                ? "直行便"
                : `${recommendation.stops}回経由`
              : "",
            formatFlightDuration(recommendation.totalDurationMinutes),
            recommendation.source ? `source: ${recommendation.source}` : ""
          ]
            .filter(Boolean)
            .join(" / ")
        },
        transfers: buildTransferDrafts(
          (recommendation.transfers ?? []).map((transfer) => ({
            id: createDraftId(),
            station: compactText(transfer.station ?? ""),
            serviceName: compactText(transfer.serviceName ?? ""),
            arrivalTime: compactText(transfer.arrTime ?? ""),
            departureTime: compactText(transfer.depTime ?? "")
          }))
        )
      }),
      { sort: true }
    );
  };

  const updateTransport = (
    index: number,
    updater: (draft: TransportationDraft) => TransportationDraft,
    options?: { sort?: boolean }
  ) => {
    setTransportEdits((prev) => {
      const next = prev.map((draft, i) => (i === index ? updater(draft) : draft));
      if (options?.sort) {
        return sortTransportationDrafts(next);
      }
      return next;
    });
  };

  const updateTransportById = (
    id: string,
    updater: (draft: TransportationDraft) => TransportationDraft,
    options?: { sort?: boolean }
  ) => {
    setTransportEdits((prev) => {
      const next = prev.map((draft) => (draft.id === id ? updater(draft) : draft));
      if (options?.sort) {
        return sortTransportationDrafts(next);
      }
      return next;
    });
  };

  const scheduleTransportSort = () => {
    if (transportSortTimerRef.current) {
      clearTimeout(transportSortTimerRef.current);
    }
    transportSortTimerRef.current = setTimeout(() => {
      setTransportEdits((prev) => sortTransportationDrafts(prev));
    }, 1);
  };

  const handleTransportSortBlur = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) {
      return;
    }
    scheduleTransportSort();
  };

  const updateHotel = (index: number, updater: (draft: HotelDraft) => HotelDraft) => {
    setHotelEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };

  const updateActivity = (
    index: number,
    updater: (draft: ActivityDraft) => ActivityDraft
  ) => {
    setActivityEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };

  const updatePacking = (
    index: number,
    updater: (draft: PackingDraft) => PackingDraft
  ) => {
    setPackingEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };

  const updateSavings = (
    index: number,
    updater: (draft: SavingsDraft) => SavingsDraft
  ) => {
    setSavingsEdits((prev) =>
      prev.map((draft, i) => (i === index ? updater(draft) : draft))
    );
  };
  const removeTransport = (index: number) => {
    setTransportEdits((prev) =>
      sortTransportationDrafts(prev.filter((_, i) => i !== index))
    );
  };
  const removeHotel = (index: number) => {
    setHotelEdits((prev) => prev.filter((_, i) => i !== index));
  };
  const removeActivity = (index: number) => {
    setActivityEdits((prev) => prev.filter((_, i) => i !== index));
  };
  const removePacking = (index: number) => {
    setPackingEdits((prev) => prev.filter((_, i) => i !== index));
  };
  const removeSavings = (index: number) => {
    setSavingsEdits((prev) => prev.filter((_, i) => i !== index));
  };

  const pasteFromClipboard = async (onPaste: (value: string) => void) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        return;
      }
      onPaste(text);
    } catch (err) {
      console.error("clipboard_read_failed", err);
    }
  };

  const openExternalLink = (raw: string) => {
    const href = normalizeLink(raw);
    if (!href || typeof window === "undefined") {
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const fetchFlightInfo = async (transportId: string) => {
    const draft = transportEdits.find((item) => item.id === transportId);
    if (!draft) {
      return;
    }
    const flightNumber = draft.serviceName.value.trim();
    if (!flightNumber) {
      setFlightFetchError("便番号を入力してください。");
      setFlightFetchErrorId(transportId);
      return;
    }
    const date =
      extractDateOnly(draft.depTime.value) ||
      extractDateOnly(editValues.startDate) ||
      new Date().toISOString().slice(0, 10);

    setFlightFetchingId(transportId);
    setFlightFetchError(null);
    setFlightFetchErrorId(null);
    try {
      const response = await fetch(
        `/api/aerodatabox?flight=${encodeURIComponent(
          flightNumber
        )}&date=${encodeURIComponent(date)}`
      );
      if (!response.ok) {
        throw new Error("fetch_failed");
      }
      const payload = await response.json();
      const info = extractFlightInfo(payload);
      if (
        !info.departureAirport &&
        !info.arrivalAirport &&
        !info.departureTime &&
        !info.arrivalTime
      ) {
        setFlightFetchError("便情報が見つかりませんでした。");
        setFlightFetchErrorId(transportId);
        return;
      }

      updateTransportById(transportId, (current) => {
        const departureTimeOnly = info.departureTime
          ? extractTimeOnly(info.departureTime)
          : "";
        const arrivalTimeOnly = info.arrivalTime
          ? extractTimeOnly(info.arrivalTime)
          : "";
        return {
          ...current,
          from: {
            ...current.from,
            value: info.departureAirport || current.from.value
          },
          to: {
            ...current.to,
            value: info.arrivalAirport || current.to.value
          },
          depTime: {
            ...current.depTime,
            value: departureTimeOnly
              ? updateDateTimeValue(current.depTime.value, undefined, departureTimeOnly)
              : current.depTime.value
          },
          arrTime: {
            ...current.arrTime,
            value: arrivalTimeOnly
              ? updateDateTimeValue(current.arrTime.value, undefined, arrivalTimeOnly)
              : current.arrTime.value
          }
        };
      });
      scheduleTransportSort();
    } catch (error) {
      if (error instanceof TypeError) {
        setFlightFetchError("通信に失敗しました。時間をおいて再試行してください。");
      } else {
        setFlightFetchError("便情報の取得に失敗しました。");
      }
      setFlightFetchErrorId(transportId);
    } finally {
      setFlightFetchingId(null);
    }
  };

  const handleFetchFlightRecommendations = async (
    transportId: string,
    options?: { openSheet?: boolean }
  ) => {
    const draft = transportEdits.find((item) => item.id === transportId);
    if (!draft) {
      return;
    }

    const from = draft.from.value.trim();
    const to = draft.to.value.trim();
    const date =
      extractDateOnly(draft.depTime.value) ||
      editValues.startDate.trim() ||
      "";

    if (!from || !to || !date) {
      setFlightRecoError("出発地・到着地・出発日を入れてから候補便を取得してください。");
      setFlightRecoErrorId(transportId);
      return;
    }

    setFlightRecoLoadingId(transportId);
    setFlightRecoError(null);
    setFlightRecoErrorId(null);
    setFlightRecoWarningsById((prev) => ({ ...prev, [transportId]: [] }));

    try {
      const result = await requestFlightRecommendations({
        from,
        to,
        date,
        limit: 12
      });
      setFlightRecoById((prev) => ({
        ...prev,
        [transportId]: result.recommendations
      }));
      setFlightRecoWarningsById((prev) => ({
        ...prev,
        [transportId]: result.warnings
      }));
      if (options?.openSheet) {
        setFlightRecoSheetId(transportId);
      }
      if (result.recommendations.length === 0) {
        setFlightRecoError("候補便が見つかりませんでした。条件を少し変えて再試行してください。");
        setFlightRecoErrorId(transportId);
      }
    } catch (error) {
      setFlightRecoError(
        error instanceof Error && error.message
          ? error.message
          : "フライト候補の取得に失敗しました。"
      );
      setFlightRecoErrorId(transportId);
      setFlightRecoById((prev) => ({ ...prev, [transportId]: [] }));
    } finally {
      setFlightRecoLoadingId(null);
    }
  };

  const activeFlightRecoDraft =
    flightRecoSheetId
      ? transportEdits.find((item) => item.id === flightRecoSheetId) ?? null
      : null;
  const activeFlightRecoCandidates = flightRecoSheetId
    ? flightRecoById[flightRecoSheetId] ?? []
    : [];
  const activeFlightRecoWarnings = flightRecoSheetId
    ? flightRecoWarningsById[flightRecoSheetId] ?? []
    : [];

  useEffect(() => {
    const flightDrafts = transportEdits.filter((draft) => draft.mode.value === "飛行機");
    flightDrafts.forEach((draft) => {
      const from = draft.from.value.trim();
      const to = draft.to.value.trim();
      const date = extractDateOnly(draft.depTime.value) || editValues.startDate.trim() || "";
      if (!from || !to || !date) {
        return;
      }

      const signature = [from, to, date].join("|");
      const previousSignature = autoFlightRecoKeyRef.current[draft.id];
      const hasCandidates = (flightRecoById[draft.id]?.length ?? 0) > 0;
      const hasWarnings = (flightRecoWarningsById[draft.id]?.length ?? 0) > 0;
      const isLoading = flightRecoLoadingId === draft.id;
      if (previousSignature === signature || hasCandidates || hasWarnings || isLoading) {
        return;
      }

      autoFlightRecoKeyRef.current[draft.id] = signature;
      void handleFetchFlightRecommendations(draft.id);
    });
  }, [
    editValues.startDate,
    flightRecoById,
    flightRecoError,
    flightRecoErrorId,
    flightRecoLoadingId,
    flightRecoWarningsById,
    transportEdits
  ]);

  const handleAiImagesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );
    setAiImages(files.slice(0, 3));
    setAiError(null);
    event.target.value = "";
  };

  const requestStructuredPlanSuggestion = async ({
    prompt,
    currentPlan
  }: {
    prompt: string;
    currentPlan: AiPlanSuggestion;
  }) => {
    const formData = new FormData();
    formData.set("prompt", prompt);
    formData.set("currentPlan", JSON.stringify(currentPlan));
    formData.set("assistantMode", "plan");
    formData.set("enableWebSearch", "true");

    const response = await fetch("/api/ai-plan", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as Partial<AiAssistantResponse>;
    if (!response.ok || !payload.plan) {
      throw new Error(getAiPlannerErrorMessage(payload.error, payload.detail));
    }
    return {
      suggestion: payload.plan,
      summary: payload.summary?.trim() || "AI下書き案を作成しました。",
      warnings: Array.isArray(payload.warnings)
        ? payload.warnings.map((item) => item.trim()).filter(Boolean)
        : [],
      sources: normalizeAiChatSources(payload.sources)
    };
  };

  const handleGenerateAiPlan = async () => {
    if ((!aiPrompt.trim() && aiImages.length === 0) || aiLoading) {
      return;
    }

    const prompt = aiPrompt.trim();
    const imageNames = aiImages.map((file) => file.name.trim()).filter(Boolean);
    appendAiChatMessage({
      role: "user",
      text: prompt || (aiAssistantMode === "consult" ? "画像をもとに相談したい" : "画像をもとにプランを生成して"),
      attachments: imageNames,
      warnings: []
    });
    setAiPrompt("");

    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    setAiWarnings([]);
    setPendingAiSuggestion(null);

    try {
      const formData = new FormData();
      formData.set("prompt", prompt);
      const currentPlan = buildCurrentAiPlanContext();
      formData.set("currentPlan", JSON.stringify(currentPlan));
      formData.set(
        "chatHistory",
        JSON.stringify(
          aiChatMessages.slice(-12).map((message) => ({
            role: message.role,
            text: message.text
          }))
        )
      );
      formData.set("assistantMode", aiAssistantMode);
      if (aiAssistantMode === "consult" || aiAssistantMode === "plan") {
        formData.set("enableWebSearch", "true");
      }
      aiImages.forEach((file) => {
        formData.append("images", file);
      });

      const response = await fetch("/api/ai-plan", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as Partial<AiAssistantResponse>;

      if (aiAssistantMode === "consult") {
        const warnings = Array.isArray(payload.warnings)
          ? payload.warnings.map((item) => item.trim()).filter(Boolean)
          : [];
        if (!response.ok || !payload.answer?.trim()) {
          throw new Error(
            getAiPlannerErrorMessage(payload.error, payload.detail)
          );
        }
        const answer = payload.answer.trim();
        setAiSummary(answer);
        setAiWarnings(warnings);
        setAiImages([]);
        appendAiChatMessage({
          role: "assistant",
          text: answer,
          warnings,
          attachments: [],
          sources: normalizeAiChatSources(payload.sources)
        });
        try {
          const candidatePrompt = [
            "以下の相談内容を、旅行プラン管理アプリに反映できる下書きに変換してください。",
            "相談回答をベースに、移動・ホテル・予定・持ち物を可能な範囲で具体化してください。",
            `ユーザー相談: ${prompt || "なし"}`,
            `AI回答: ${answer}`
          ].join("\n");
          const candidate = await requestStructuredPlanSuggestion({
            prompt: candidatePrompt,
            currentPlan
          });
          const candidateWarnings = Array.from(
            new Set([...warnings, ...candidate.warnings])
          );
          setPendingAiSuggestion({
            suggestion: candidate.suggestion,
            summary: "相談内容をもとに反映候補を作成しました。これでいいですか？",
            warnings: candidateWarnings
          });
          appendAiChatMessage({
            role: "assistant",
            text: "相談内容をもとに反映候補を作成しました。これでいいですか？下のプレビューを確認して「追記で反映」か「上書きで反映」を選んでください。",
            warnings: candidateWarnings,
            attachments: [],
            sources: candidate.sources
          });
        } catch {}
        return;
      }

      const nextPlan = payload.plan;
      const clarificationQuestions = Array.isArray(payload.questions)
        ? payload.questions.map((item) => item.trim()).filter(Boolean)
        : [];
      if (payload.requiresClarification && clarificationQuestions.length > 0) {
        const clarificationText = (
          payload.answer?.trim() ||
          "より具体的なプランにするため、いくつか確認させてください。"
        ).trim();
        const message = [
          clarificationText,
          ...clarificationQuestions.map((question, index) => `${index + 1}. ${question}`)
        ].join("\n");
        setAiSummary(clarificationText);
        setAiWarnings([]);
        setPendingAiSuggestion(null);
        appendAiChatMessage({
          role: "assistant",
          text: message,
          warnings: [],
          attachments: [],
          sources: normalizeAiChatSources(payload.sources)
        });
        return;
      }

      if (!response.ok || !nextPlan) {
        throw new Error(
          getAiPlannerErrorMessage(payload.error, payload.detail)
        );
      }

      let summary = payload.summary?.trim() || "AI下書き案を作成しました。";
      let warnings = Array.isArray(payload.warnings)
        ? payload.warnings.map((item) => item.trim()).filter(Boolean)
        : [];
      let suggestion = nextPlan;

      const noHotelSuggestions = (nextPlan.hotels?.length ?? 0) === 0;
      if (hasHotelRecommendationIntent(prompt) && noHotelSuggestions) {
        const destination =
          editValues.destination.trim() ||
          (typeof nextPlan.destination === "string"
            ? nextPlan.destination.trim()
            : "") ||
          plan?.destination?.trim() ||
          "";
        const checkIn =
          editValues.startDate.trim() ||
          toDateOnly(nextPlan.startDate) ||
          toDateOnly(currentPlan?.startDate) ||
          "";
        const checkOut =
          editValues.endDate.trim() ||
          toDateOnly(nextPlan.endDate) ||
          toDateOnly(currentPlan?.endDate) ||
          "";

        if (destination && checkIn && checkOut) {
          try {
            const hotelResult = await requestHotelRecommendations({
              destination,
              checkIn,
              checkOut,
              limit: 5
            });
            if (hotelResult.recommendations.length > 0) {
              suggestion = {
                ...nextPlan,
                hotels: mapHotelRecommendationsToCandidates(
                  hotelResult.recommendations,
                  checkIn,
                  checkOut
                )
              };
              summary = `${summary} ホテル候補${hotelResult.recommendations.length}件も提案しました。`;
              warnings = Array.from(new Set([...warnings, ...hotelResult.warnings]));
            } else {
              warnings = Array.from(
                new Set([
                  ...warnings,
                  ...hotelResult.warnings,
                  "ホテル候補が見つかりませんでした。目的地名を具体化して再試行してください。"
                ])
              );
            }
          } catch {
            warnings = Array.from(
              new Set([
                ...warnings,
                "ホテル候補の自動提案を取得できませんでした。右下の「ホテル提案」ボタンで再試行してください。"
              ])
            );
          }
        } else {
          warnings = Array.from(
            new Set([
              ...warnings,
              "ホテル候補の提案には目的地と旅行日程が必要です。"
            ])
          );
        }
      }

      setAiSummary(summary);
      setAiWarnings(warnings);
      if (autoPlanBootRef.current) {
        applyAiSuggestion(suggestion, "replace");
        setPendingAiSuggestion(null);
        setAiAssistantMode("consult");
        appendAiChatMessage({
          role: "assistant",
          text: `${summary}\n初期プランに自動反映しました。続けて相談モードで調整できます。`,
          warnings,
          attachments: [],
          sources: normalizeAiChatSources(payload.sources)
        });
        autoPlanBootRef.current = false;
      } else {
        setPendingAiSuggestion({
          suggestion,
          summary,
          warnings
        });
        appendAiChatMessage({
          role: "assistant",
          text: `${summary}\n下のプレビューで内容を確認して「追記で反映」か「上書きで反映」を選んでください。`,
          warnings,
          attachments: [],
          sources: normalizeAiChatSources(payload.sources)
        });
      }
      setAiImages([]);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getAiPlannerErrorMessage();
      setAiError(message);
      appendAiChatMessage({
        role: "assistant",
        text: message,
        warnings: [],
        attachments: []
      });
      autoPlanBootRef.current = false;
    } finally {
      setAiLoading(false);
    }
  };

  const handleFetchHotelRecommendations = async () => {
    if (hotelRecoLoading) {
      return;
    }

    const destination = editValues.destination.trim() || plan?.destination?.trim() || "";
    const checkIn = editValues.startDate.trim();
    const checkOut = editValues.endDate.trim();
    appendAiChatMessage({
      role: "user",
      text: `ホテル候補を取得して (${destination || "目的地未入力"} / ${checkIn || "日付未入力"} - ${checkOut || "日付未入力"})`,
      warnings: [],
      attachments: []
    });

    if (!destination) {
      const message = "目的地を入力してから候補を取得してください。";
      setHotelRecoError(message);
      appendAiChatMessage({
        role: "assistant",
        text: message,
        warnings: [],
        attachments: []
      });
      return;
    }
    if (!checkIn || !checkOut) {
      const message = "旅行日程を設定してから候補を取得してください。";
      setHotelRecoError(message);
      appendAiChatMessage({
        role: "assistant",
        text: message,
        warnings: [],
        attachments: []
      });
      return;
    }

    setHotelRecoLoading(true);
    setHotelRecoError(null);
    setHotelRecoWarnings([]);
    setHotelRecoSummary(null);

    try {
      const hotelResult = await requestHotelRecommendations({
        destination,
        checkIn,
        checkOut,
        limit: 5
      });
      const recommendations = hotelResult.recommendations;
      if (recommendations.length === 0) {
        const warnings = hotelResult.warnings.length > 0
          ? hotelResult.warnings
          : ["候補を抽出できませんでした。目的地を具体的にして再試行してください。"];
        const summary = "候補0件";
        setHotelRecoWarnings(warnings);
        setHotelRecoSummary(summary);
        appendAiChatMessage({
          role: "assistant",
          text: summary,
          warnings,
          attachments: []
        });
        return;
      }

      const candidates = mapHotelRecommendationsToCandidates(
        recommendations,
        checkIn,
        checkOut
      );

      setHotelEdits((prev) => [...prev, ...buildHotelDrafts(candidates)]);
      const warnings = hotelResult.warnings;
      const summary = `${recommendations.length}件の候補を追加しました（${hotelResult.resolvedDestination}）`;
      setHotelRecoWarnings(warnings);
      setHotelRecoSummary(summary);
      appendAiChatMessage({
        role: "assistant",
        text: buildHotelRecommendationsChatText(recommendations, hotelResult.resolvedDestination),
        warnings,
        attachments: []
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getHotelRecommendationsErrorMessage();
      setHotelRecoError(message);
      appendAiChatMessage({
        role: "assistant",
        text: message,
        warnings: [],
        attachments: []
      });
    } finally {
      setHotelRecoLoading(false);
    }
  };

  const buildAutoSaveUpdates = () => {
    const updates: PlanUpdate = {
      name: editValues.name,
      destination: editValues.destination,
      memo: editValues.memo.trim() ? editValues.memo.trim() : null,
      startDate: parseDateInput(editValues.startDate),
      endDate: parseDateInput(editValues.endDate),
      totalCost: computedTotalCost,
      isPublic: editValues.isPublic
    };

    if (transportEdits.length > 0 || Array.isArray(plan?.transportations)) {
      updates.transportations = applyTransportationDrafts(transportEdits);
    }
    if (hotelEdits.length > 0 || Array.isArray(plan?.hotels)) {
      updates.hotels = applyHotelDrafts(hotelEdits);
    }
    if (activityEdits.length > 0 || Array.isArray(plan?.activities)) {
      updates.activities = applyActivityDrafts(activityEdits);
    }
    if (packingEdits.length > 0 || Array.isArray(plan?.packingList)) {
      updates.packingList = applyPackingDrafts(packingEdits);
    }
    if (savingsEdits.length > 0 || Array.isArray(plan?.savingsHistory)) {
      updates.savingsHistory = applySavingsDrafts(savingsEdits);
    }

    return updates;
  };

  const addTransport = () => {
    setTransportEdits((prev) => {
      const base = prev[0];
      const modeValue = base?.mode.value ?? "在来線";
      const modeKey = base?.mode.key || TRANSPORT_MODE_KEYS[0];
      const modeConfig = getModeConfig(modeValue);
      const serviceKey =
        modeConfig.serviceKeys?.find((key) => key === base?.serviceName.key) ??
        modeConfig.serviceKeys?.[0] ??
        "";
      const seatKey =
        modeConfig.seatKeys?.find((key) => key === base?.seatNumber.key) ??
        modeConfig.seatKeys?.[0] ??
        "";
      const currencyKey = base?.currency.key || TRANSPORT_CURRENCY_KEYS[0];
      const currencyValue = normalizePriceCurrency(base?.currency.value ?? "JPY");
      const item: ItemRecord = {
        [modeKey]: modeValue,
        [base?.name.key || TRANSPORT_NAME_KEYS[0]]: "",
        [base?.from.key || TRANSPORT_FROM_KEYS[0]]: "",
        [base?.to.key || TRANSPORT_TO_KEYS[0]]: "",
        [base?.depTime.key || TRANSPORT_DEP_KEYS[0]]: "",
        [base?.arrTime.key || TRANSPORT_ARR_KEYS[0]]: "",
        [base?.price.key || TRANSPORT_PRICE_KEYS[0]]: null,
        [currencyKey]: currencyValue,
        [base?.paid.key || TRANSPORT_PAID_KEYS[0]]: false,
        [base?.notes.key || NOTES_KEYS[0]]: "",
        [base?.link.key || LINK_KEYS[0]]: ""
      };
      if (serviceKey) {
        item[serviceKey] = "";
      }
      if (seatKey) {
        item[seatKey] = "";
      }
      if (supportsTransferInput(modeValue)) {
        item.transfers = [];
      }
      return sortTransportationDrafts([...prev, ...buildTransportationDrafts([item])]);
    });
  };

  const addHotel = () => {
    setHotelEdits((prev) => {
      const base = prev[0];
      const currencyKey = base?.currency.key || HOTEL_CURRENCY_KEYS[0];
      const currencyValue = normalizePriceCurrency(base?.currency.value ?? "JPY");
      const item: ItemRecord = {
        [base?.name.key || HOTEL_NAME_KEYS[0]]: "",
        [base?.address.key || HOTEL_ADDRESS_KEYS[0]]: "",
        [base?.price.key || HOTEL_PRICE_KEYS[0]]: null,
        [currencyKey]: currencyValue,
        [base?.paid.key || HOTEL_PAID_KEYS[0]]: false,
        [base?.checkIn.key || HOTEL_CHECKIN_KEYS[0]]: "",
        [base?.checkOut.key || HOTEL_CHECKOUT_KEYS[0]]: "",
        [base?.notes.key || NOTES_KEYS[0]]: "",
        [base?.link.key || LINK_KEYS[0]]: ""
      };
      return [...prev, ...buildHotelDrafts([item])];
    });
  };

  const addActivity = () => {
    setActivityEdits((prev) => {
      const base = prev[0];
      const item: ItemRecord = {
        [base?.title.key || ACTIVITY_TITLE_KEYS[0]]: "",
        [base?.address.key || ACTIVITY_ADDRESS_KEYS[0]]: "",
        [base?.date.key || ACTIVITY_DATE_KEYS[0]]: "",
        [base?.notes.key || NOTES_KEYS[0]]: "",
        [base?.link.key || LINK_KEYS[0]]: ""
      };
      return [...prev, ...buildActivityDrafts([item])];
    });
  };

  const addPacking = () => {
    setPackingEdits((prev) => {
      const base = prev[0];
      const item: ItemRecord = {
        [base?.name.key || PACKING_NAME_KEYS[0]]: "",
        [base?.checked.key || PACKING_CHECK_KEYS[0]]: false
      };
      return [...prev, ...buildPackingDrafts([item])];
    });
  };

  const addSavings = () => {
    setSavingsEdits((prev) => {
      const usesObject = prev.some((draft) => draft.isObject);
      const item = usesObject ? { amount: 0 } : 0;
      return [...prev, ...buildSavingsDrafts([item])];
    });
  };

  useEffect(() => {
    let active = true;
    if (!planPath && !planId) {
      return;
    }
    setLoadingPlan(true);
    setPlanError(null);

    const request = planPath
      ? getPlanByPath(planPath)
      : getPlanById(planId ?? "", user.uid);

    request
      .then((data) => {
        if (!active) {
          return;
        }
        setPlan(data);
        if (!data) {
          setPlanError("プランが見つかりませんでした。");
        }
      })
      .catch((err: Error) => {
        if (active) {
          setPlanError("プランの読み込みに失敗しました。");
        }
        console.error(err);
      })
      .finally(() => {
        if (active) {
          setLoadingPlan(false);
        }
      });

    return () => {
      active = false;
    };
  }, [planId, planPath, user.uid]);

  useEffect(() => {
    if (!plan) {
      return;
    }
    if (skipApplyRef.current) {
      skipApplyRef.current = false;
      return;
    }
    applyPlanToEdits(plan);
  }, [plan]);

  useEffect(() => {
    if (!plan?.path) {
      return;
    }
    setCommentsError(null);
    const unsubscribe = subscribeComments(
      plan.path,
      (data) => {
        setComments(data);
      },
      () => {
        setCommentsError("コメントの取得に失敗しました。");
      }
    );

    return () => {
      unsubscribe();
    };
  }, [plan?.path]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!aiChatStorageKey) {
      setAiChatMessages([]);
      setAiChatLoadedKey("");
      return;
    }
    try {
      const raw = window.localStorage.getItem(aiChatStorageKey);
      if (!raw) {
        setAiChatMessages([]);
        setAiChatLoadedKey(aiChatStorageKey);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const messages = Array.isArray(parsed)
        ? parsed
            .map((item) => normalizeAiChatMessage(item))
            .filter((item): item is AiChatMessage => Boolean(item))
            .slice(-AI_CHAT_HISTORY_LIMIT)
        : [];
      setAiChatMessages(messages);
      setAiChatLoadedKey(aiChatStorageKey);
    } catch {
      setAiChatMessages([]);
      setAiChatLoadedKey(aiChatStorageKey);
    }
  }, [aiChatStorageKey]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !aiChatStorageKey ||
      aiChatLoadedKey !== aiChatStorageKey
    ) {
      return;
    }
    try {
      window.localStorage.setItem(aiChatStorageKey, JSON.stringify(aiChatMessages));
    } catch {}
  }, [aiChatMessages, aiChatLoadedKey, aiChatStorageKey]);

  useEffect(() => {
    if (!quickAssistOpen) {
      return;
    }
    aiChatEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [quickAssistOpen, aiChatMessages.length]);

  useEffect(() => {
    if (autoPlanBootPrepared) {
      return;
    }
    if (bootAssist !== "plan" || !bootPrompt || loadingPlan || !canEditNow) {
      return;
    }
    setQuickAssistOpen(true);
    setAiAssistantMode("plan");
    setAiPrompt(bootPrompt);
    setAutoPlanBootPrepared(true);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("assist");
      url.searchParams.delete("bootPrompt");
      const nextSearch = url.searchParams.toString();
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`
      );
    }
  }, [autoPlanBootPrepared, bootAssist, bootPrompt, canEditNow, loadingPlan]);

  useEffect(() => {
    if (
      !autoPlanBootPrepared ||
      autoPlanBootTriggered ||
      aiLoading ||
      aiAssistantMode !== "plan" ||
      !aiPrompt.trim()
    ) {
      return;
    }
    autoPlanBootRef.current = true;
    setAutoPlanBootTriggered(true);
    void handleGenerateAiPlan();
  }, [
    aiAssistantMode,
    aiLoading,
    aiPrompt,
    autoPlanBootPrepared,
    autoPlanBootTriggered,
    handleGenerateAiPlan
  ]);

  const authorName = user.displayName ?? user.email ?? "ユーザー";
  const planSavedTotal =
    Array.isArray(plan?.savingsHistory) && plan.savingsHistory.length > 0
      ? sumSavingsHistory(plan.savingsHistory)
      : typeof plan?.savedAmount === "number"
        ? plan.savedAmount
        : typeof plan?.amount === "number"
          ? plan.amount
          : 0;
  const ownsByPath =
    typeof plan?.path === "string" &&
    (plan.path.startsWith(`users/${user.uid}/travelPlans/`) ||
      plan.path.startsWith(`Users/${user.uid}/travelPlans/`));
  const isOwner =
    Boolean(plan) &&
    (plan?.userId === user.uid || plan?.ownerId === user.uid || ownsByPath);
  const canEdit = Boolean(plan?.path) && isOwner;
  const editedSavingsTotal = useMemo(
    () =>
      savingsEdits.reduce((sum, draft) => {
        const value = toNumberOrNull(draft.value);
        return sum + (value ?? 0);
      }, 0),
    [savingsEdits]
  );
  const savedTotal = canEdit ? editedSavingsTotal : planSavedTotal;
  const computedTotalCost = useMemo(() => {
    let sum = 0;
    transportEdits.forEach((draft) => {
      const value = toNumberOrNull(draft.price.value);
      if (value !== null) {
        sum += convertPriceToYen(value, normalizePriceCurrency(draft.currency.value));
      }
    });
    hotelEdits.forEach((draft) => {
      const value = toNumberOrNull(draft.price.value);
      if (value !== null) {
        sum += convertPriceToYen(value, normalizePriceCurrency(draft.currency.value));
      }
    });
    activityEdits.forEach((draft) => {
      const value = getNumberField(draft.raw as ItemRecord, ACTIVITY_COST_KEYS);
      if (value !== null) {
        sum += value;
      }
    });
    return sum;
  }, [transportEdits, hotelEdits, activityEdits]);
  const totalCost = canEdit
    ? computedTotalCost
    : typeof plan?.totalCost === "number"
      ? plan.totalCost
      : null;
  const transportations = Array.isArray(plan?.transportations)
    ? plan.transportations
    : [];
  const hotels = Array.isArray(plan?.hotels) ? plan.hotels : [];
  const paidTotalFromDrafts = useMemo(() => {
    let sum = 0;
    transportEdits.forEach((draft) => {
      if (draft.paid.value !== true) {
        return;
      }
      const value = toNumberOrNull(draft.price.value);
      if (value !== null) {
        sum += convertPriceToYen(value, normalizePriceCurrency(draft.currency.value));
      }
    });
    hotelEdits.forEach((draft) => {
      if (draft.paid.value !== true) {
        return;
      }
      const value = toNumberOrNull(draft.price.value);
      if (value !== null) {
        sum += convertPriceToYen(value, normalizePriceCurrency(draft.currency.value));
      }
    });
    return sum;
  }, [transportEdits, hotelEdits]);
  const paidTotalFromPlan = useMemo(() => {
    let sum = 0;
    transportations.forEach((item) => {
      const isPaid = getBooleanField(item, TRANSPORT_PAID_KEYS);
      if (isPaid !== true) {
        return;
      }
      const value = getNumberField(item, TRANSPORT_PRICE_KEYS);
      if (value !== null) {
        sum += Math.round(value);
      }
    });
    hotels.forEach((item) => {
      const isPaid = getBooleanField(item, HOTEL_PAID_KEYS);
      if (isPaid !== true) {
        return;
      }
      const value = getNumberField(item, HOTEL_PRICE_KEYS);
      if (value !== null) {
        sum += Math.round(value);
      }
    });
    return sum;
  }, [transportations, hotels]);
  const paidTotal = canEdit ? paidTotalFromDrafts : paidTotalFromPlan;
  const coveredTotal = savedTotal + paidTotal;
  const remainingCost =
    totalCost !== null ? Math.max(0, totalCost - coveredTotal) : null;
  const progressPercent =
    totalCost && totalCost > 0
      ? Math.min(100, Math.round((coveredTotal / totalCost) * 100))
      : 0;
  const activities = Array.isArray(plan?.activities) ? plan.activities : [];
  const mapDestinationHint = compactText(
    editValues.destination || (typeof plan?.destination === "string" ? plan.destination : "")
  );
  const tripMapStops = useMemo(() => {
    const transportStops = canEdit
      ? buildTripMapStopsFromTransportations(
          transportEdits.map((draft, index) => ({
            id:
              typeof draft.raw.id === "string" || typeof draft.raw.id === "number"
                ? String(draft.raw.id)
                : `transport-draft-${index}`,
            mode: draft.mode.value,
            from: draft.from.value,
            to: draft.to.value,
            depTime: draft.depTime.value,
            arrTime: draft.arrTime.value
          })),
          mapDestinationHint
        )
      : buildTripMapStopsFromTransportations(
          transportations.map((item, index) => ({
            id: getStringField(item, ["id"]) || `transport-${index}`,
            mode: getStringField(item, TRANSPORT_MODE_KEYS) || "",
            from: getStringField(item, TRANSPORT_FROM_KEYS) || "",
            to: getStringField(item, TRANSPORT_TO_KEYS) || "",
            depTime: formatDateTime(getDateField(item, TRANSPORT_DEP_KEYS)) || "",
            arrTime: formatDateTime(getDateField(item, TRANSPORT_ARR_KEYS)) || ""
          })),
          mapDestinationHint
        );

    const hotelStops = canEdit
      ? buildTripMapStopsFromHotels(
        hotelEdits.map((draft, index) => ({
            id:
              typeof draft.raw.id === "string" || typeof draft.raw.id === "number"
                ? String(draft.raw.id)
                : `hotel-draft-${index}`,
            name: draft.name.value,
            address: draft.address.value,
            notes: draft.notes.value,
            checkIn: draft.checkIn.value,
            checkOut: draft.checkOut.value
          })),
          mapDestinationHint
        )
      : buildTripMapStopsFromHotels(
        hotels.map((item, index) => ({
            id: getStringField(item, ["id"]) || `hotel-${index}`,
            name: getStringField(item, HOTEL_NAME_KEYS) || "",
            address: getStringField(item, HOTEL_ADDRESS_KEYS) || "",
            notes: getStringField(item, NOTES_KEYS) || "",
            checkIn: formatDateTime(getDateField(item, HOTEL_CHECKIN_KEYS)) || "",
            checkOut: formatDateTime(getDateField(item, HOTEL_CHECKOUT_KEYS)) || ""
          })),
          mapDestinationHint
        );

    const activityStops = canEdit
      ? buildTripMapStopsFromActivities(
        activityEdits.map((draft, index) => ({
            id:
              typeof draft.raw.id === "string" || typeof draft.raw.id === "number"
                ? String(draft.raw.id)
                : `activity-draft-${index}`,
            title: draft.title.value,
            address: draft.address.value,
            notes: draft.notes.value,
            date: draft.date.value
          })),
          mapDestinationHint
        )
      : buildTripMapStopsFromActivities(
        activities.map((item, index) => ({
            id: getStringField(item, ["id"]) || `activity-${index}`,
            title: getStringField(item, ACTIVITY_TITLE_KEYS) || "",
            address: getStringField(item, ACTIVITY_ADDRESS_KEYS) || "",
            notes: getStringField(item, NOTES_KEYS) || "",
            date: formatDateTime(getDateField(item, ACTIVITY_DATE_KEYS)) || ""
          })),
          mapDestinationHint
        );

    const coreStops = [...hotelStops, ...activityStops];
    const visibleStops = coreStops.length > 0 ? coreStops : transportStops;
    return dedupeTripMapStops(
      visibleStops.sort((left, right) => left.sortValue.localeCompare(right.sortValue))
    );
  }, [
    transportEdits,
    transportations,
    activities,
    activityEdits,
    canEdit,
    hotelEdits,
    hotels,
    mapDestinationHint
  ]);
  const packingList = Array.isArray(plan?.packingList) ? plan.packingList : [];
  const hasEditError = Boolean(editError);
  const transportIds = transportEdits.map((draft) => draft.id);
  const transportCardRef = useFlipAnimation(transportIds);
  const sortedTransportations = useMemo(
    () => sortTransportItems(transportations),
    [transportations]
  );

  const progress =
    totalCost !== null && remainingCost !== null
      ? { remaining: remainingCost, percent: progressPercent }
      : null;

  useEffect(() => {
    lastSavedRef.current = null;
    setAutoSaveState("idle");
  }, [plan?.path]);

  useEffect(() => {
    if (!canEdit || !plan?.path) {
      return;
    }

    const hasInvalid =
      transportEdits.some((draft) => hasInvalidNumberInput(draft.price.value)) ||
      hotelEdits.some((draft) => hasInvalidNumberInput(draft.price.value)) ||
      savingsEdits.some((draft) => hasInvalidNumberInput(draft.value));

    if (hasInvalid) {
      setAutoSaveState("error");
      setEditError("数値の入力を確認してください。");
      return;
    }

    setEditError(null);

    const updates = buildAutoSaveUpdates();
    const signature = JSON.stringify(updates);

    if (lastSavedRef.current === null) {
      lastSavedRef.current = signature;
      return;
    }

    if (lastSavedRef.current === signature) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    setAutoSaveState("saving");
    autoSaveTimerRef.current = setTimeout(() => {
      setSaving(true);
      updatePlan(plan.path, updates)
        .then(() => {
          lastSavedRef.current = signature;
          skipApplyRef.current = true;
          setPlan((prev) => (prev ? { ...prev, ...updates } : prev));
          setAutoSaveState("saved");
        })
        .catch((err) => {
          setAutoSaveState("error");
          setEditError("自動保存に失敗しました。");
          console.error(err);
        })
        .finally(() => {
          setSaving(false);
        });
    }, 700);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    canEdit,
    plan?.path,
    editValues,
    transportEdits,
    hotelEdits,
    activityEdits,
    packingEdits,
    savingsEdits,
    computedTotalCost
  ]);

  const handleResolvedTripMapStops = (nextStops: TripMapResolvedStop[]) => {
    if (!canEdit || nextStops.length === 0) {
      return;
    }

    const resolvedById = new Map(nextStops.map((stop) => [stop.id, stop.placeName]));

    setHotelEdits((prev) => {
      let changed = false;
      const next = prev.map((draft, index) => {
        const draftId =
          typeof draft.raw.id === "string" || typeof draft.raw.id === "number"
            ? String(draft.raw.id)
            : `hotel-draft-${index}`;
        const placeName = resolvedById.get(draftId);
        if (!placeName || draft.address.value.trim()) {
          return draft;
        }
        changed = true;
        return {
          ...draft,
          address: { ...draft.address, value: placeName }
        };
      });
      return changed ? next : prev;
    });

    setActivityEdits((prev) => {
      let changed = false;
      const next = prev.map((draft, index) => {
        const draftId =
          typeof draft.raw.id === "string" || typeof draft.raw.id === "number"
            ? String(draft.raw.id)
            : `activity-draft-${index}`;
        const placeName = resolvedById.get(draftId);
        if (!placeName || draft.address.value.trim()) {
          return draft;
        }
        changed = true;
        return {
          ...draft,
          address: { ...draft.address, value: placeName }
        };
      });
      return changed ? next : prev;
    });
  };

  return (
    <>
    <PageShell title={plan?.name || "プラン詳細"}>
      <div className="space-y-6">
        {planError ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-rose-500 shadow-cardSoft">
            {planError}
          </div>
        ) : null}
        {loadingPlan ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
            読み込み中...
          </div>
        ) : plan ? (
          <div className="rounded-2xl bg-white p-5 shadow-cardSoft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {plan.name || "Untitled"}
                </h2>
                <p className="text-sm text-slate-500">
                  {plan.destination || "Destination"}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <span className="block text-base font-semibold text-slate-900">
                  {typeof plan.commentsCount === "number" ? plan.commentsCount : 0}
                </span>
                コメント
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {progress ? `あと ${formatYen(progress.remaining)}` : "あと —"}
                </span>
                <span>{progress ? `${progress.percent}%` : "—"}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-slate-900/80"
                  style={{ width: `${progress ? progress.percent : 0}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-6">
            <TripOverviewMapCard
              stops={tripMapStops}
              onResolvedStops={handleResolvedTripMapStops}
            />

            {!canEdit ? (
              <div className="rounded-2xl bg-white p-4 text-xs text-slate-500 shadow-cardSoft">
                このログは編集できません。ログイン中のUIDと ownerId / userId が一致しているか確認してください。
              </div>
            ) : null}
            {canEdit ? (
              <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                <div className="space-y-3">
                  <div className="hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                          Travel Assist Beta
                        </p>
                        <h3 className="mt-1 text-sm font-semibold text-slate-900">
                          ベータ機能でプラン下書きを生成
                        </h3>
                        <p className="mt-1 text-xs text-slate-600">
                          行程表や予約画面の画像も読み取り、移動・ホテル・予定・持ち物に反映します。
                        </p>
                      </div>
                      <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-semibold text-sky-700">
                        BETA / GPT-4.1系
                      </div>
                    </div>
                    <label className="mt-4 block text-xs font-semibold text-slate-600">
                      指示文
                      <textarea
                        value={aiPrompt}
                        onChange={(event) => {
                          setAiPrompt(event.target.value);
                          setAiError(null);
                        }}
                        rows={4}
                        placeholder="例: 4月の京都2泊3日。新幹線で東京から移動、画像の予約内容も反映して、ざっくりした観光予定と持ち物も作って。"
                        className="mt-2 w-full rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-300"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <label className="block text-xs font-semibold text-slate-600">
                        画像
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleAiImagesSelected}
                          className="mt-2 block w-full rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-sky-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-sky-700"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/80 bg-white/80 p-1 text-xs font-semibold text-slate-600">
                        <button
                          type="button"
                          onClick={() => setAiMode("merge")}
                          className={`rounded-xl px-3 py-2 transition ${
                            aiMode === "merge"
                              ? "bg-slate-900 text-white shadow-sm"
                              : "bg-transparent text-slate-600"
                          }`}
                        >
                          追記
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiMode("replace")}
                          className={`rounded-xl px-3 py-2 transition ${
                            aiMode === "replace"
                              ? "bg-slate-900 text-white shadow-sm"
                              : "bg-transparent text-slate-600"
                          }`}
                        >
                          上書き
                        </button>
                      </div>
                    </div>
                    {aiImages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {aiImages.map((file, index) => (
                          <button
                            key={`${file.name}-${file.size}-${index}`}
                            type="button"
                            onClick={() =>
                              setAiImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                            }
                            className="rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-700"
                          >
                            {file.name} ×
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {aiError ? (
                      <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
                        {aiError}
                      </div>
                    ) : null}
                    {aiSummary ? (
                      <div className="rounded-xl bg-white/90 px-3 py-3 text-xs text-slate-700">
                        <p className="font-semibold text-slate-900">生成結果</p>
                        <p className="mt-1 leading-5">{aiSummary}</p>
                        {aiWarnings.length > 0 ? (
                          <div className="mt-2 space-y-1 text-amber-700">
                            {aiWarnings.map((warning, index) => (
                              <p key={`${warning}-${index}`}>・{warning}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[11px] leading-5 text-slate-500">
                        画像は最大3枚、1枚あたり6MBまで。生成後はこの画面の内容に反映され、自動保存されます。
                      </p>
                      <button
                        type="button"
                        disabled={aiLoading || (!aiPrompt.trim() && aiImages.length === 0)}
                        onClick={handleGenerateAiPlan}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {aiLoading ? "生成中..." : "AIで下書き作成"}
                      </button>
                    </div>
                  </div>
                  <label className="block text-xs font-semibold text-slate-500">
                    旅行名
                    <input
                      value={editValues.name}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          name: event.target.value
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-500">
                    目的地
                    <input
                      value={editValues.destination}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          destination: event.target.value
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-500">
                    メモ
                    <textarea
                      value={editValues.memo}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          memo: event.target.value
                        }))
                      }
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      旅行日程
                      <div className="mt-2">
                        <StayDateRangePicker
                          title="旅行日程"
                          startDate={editValues.startDate}
                          endDate={editValues.endDate}
                          originalStartDate={toDateInputValue(plan.startDate)}
                          originalEndDate={toDateInputValue(plan.endDate)}
                          onChange={(nextStartDate, nextEndDate) =>
                            setEditValues((prev) => ({
                              ...prev,
                              startDate: nextStartDate,
                              endDate: nextEndDate
                            }))
                          }
                        />
                      </div>
                    </label>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-100/80 px-4 py-3 text-slate-900">
                      <p className="text-xs font-semibold text-slate-600">
                        合計費用（自動）
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-2xl font-semibold leading-none text-slate-950">
                            {formatYen(computedTotalCost)}
                          </p>
                          <p className="mt-2 text-xs text-slate-600">
                            移動費とホテル代を自動集計
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-right">
                          <p className="text-[11px] font-semibold text-slate-500">
                            保存状態
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {autoSaveState === "saving"
                              ? "更新中"
                              : autoSaveState === "saved"
                                ? "保存済み"
                                : autoSaveState === "error"
                                  ? "要確認"
                                  : "自動保存"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <label className="mt-1 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={editValues.isPublic}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          isPublic: event.target.checked
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-400 text-slate-900"
                    />
                    公開する
                  </label>
                  {hasEditError ? (
                    <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
                      {editError}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    <span>
                      {saving || autoSaveState === "saving"
                        ? "自動保存中..."
                        : autoSaveState === "error"
                          ? "自動保存エラー"
                          : autoSaveState === "saved"
                            ? "保存済み"
                            : "自動保存"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (plan) {
                          applyPlanToEdits(plan);
                        }
                        setEditError(null);
                      }}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      リセット
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {!canEdit ? (
              <>
                <div className="space-y-2">
                  <SectionTitle title="基本情報" />
                  <div className="rounded-2xl bg-white px-4 shadow-cardSoft">
                    <InfoRow label="旅行名" value={plan.name} />
                    <div className="h-px bg-slate-100" />
                    <InfoRow label="目的地" value={plan.destination} />
                    <div className="h-px bg-slate-100" />
                    <InfoRow label="メモ" value={plan.memo ?? ""} />
                  </div>
                </div>

                <div className="space-y-2">
                  <SectionTitle title="旅行日程" />
                  <div className="rounded-2xl bg-white px-4 shadow-cardSoft">
                    <InfoRow
                      label="出発日"
                      value={formatDate(plan.startDate) || ""}
                    />
                    <div className="h-px bg-slate-100" />
                    <InfoRow
                      label="帰宅日"
                      value={formatDate(plan.endDate) || ""}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <SectionTitle title="移動手段" />
              {canEdit ? (
                transportEdits.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                    まだ移動手段が登録されていません。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transportEdits.map((draft, index) => {
                      const depDate = extractDateOnly(draft.depTime.value);
                      const depTime = extractTimeOnly(draft.depTime.value);
                      const arrDate = extractDateOnly(draft.arrTime.value);
                      const arrTime = extractTimeOnly(draft.arrTime.value);
                      return (
                        <div
                          key={draft.id}
                          ref={transportCardRef(draft.id)}
                          className="will-change-transform"
                        >
                          <SwipeDeleteCard
                            enabled={canEdit}
                            onDelete={() => removeTransport(index)}
                          >
                            <div
                              className="rounded-2xl bg-white p-4 shadow-cardSoft"
                              onBlur={handleTransportSortBlur}
                            >
                              <div className="mb-4">
                                <p className="text-xs font-semibold text-slate-500">
                                  移動手段の種類
                                </p>
                                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                                  {TRANSPORT_MODES.map((mode) => {
                                    const selected = draft.mode.value === mode;
                                    return (
                                      <button
                                        key={`${mode}-${index}`}
                                        type="button"
                                        onClick={() =>
                                          updateTransport(index, (current) => {
                                            if (current.mode.value === mode) {
                                              return current;
                                            }
                                            const config = getModeConfig(mode);
                                            const serviceKey = config.serviceKeys?.[0] ?? "";
                                            const seatKey = config.seatKeys?.[0] ?? "";
                                            const nextRaw = { ...current.raw };
                                            if (!supportsTransferInput(mode)) {
                                              delete nextRaw.transfers;
                                            }
                                            return {
                                              ...current,
                                              raw: nextRaw,
                                              mode: { ...current.mode, value: mode },
                                              serviceName: {
                                                key: serviceKey,
                                                value: "",
                                                original: ""
                                              },
                                              seatNumber: {
                                                key: seatKey,
                                                value: "",
                                                original: ""
                                              },
                                              transfers: supportsTransferInput(mode)
                                                ? current.transfers
                                                : []
                                            };
                                          })
                                        }
                                        className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-3 text-xs font-bold transition-all ${selected
                                          ? "bg-slate-900 text-white shadow-md scale-[1.02]"
                                          : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                          }`}
                                      >
                                        {mode}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {draft.mode.value === "在来線" ? (
                                <>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block text-xs font-semibold text-slate-500">
                                      金額
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        value={draft.price.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            price: {
                                              ...current.price,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <label className="block text-xs font-semibold text-slate-500">
                                      通貨
                                      <select
                                        value={normalizePriceCurrency(draft.currency.value)}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            currency: {
                                              ...current.currency,
                                              value: normalizePriceCurrency(event.target.value)
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      >
                                        <option value="JPY">円 (JPY)</option>
                                        <option value="USD">ドル (USD)</option>
                                      </select>
                                    </label>
                                  </div>
                                  {(() => {
                                    const priceValue = toNumberOrNull(draft.price.value);
                                    if (
                                      priceValue === null ||
                                      normalizePriceCurrency(draft.currency.value) !== "USD"
                                    ) {
                                      return null;
                                    }
                                    return (
                                      <p className="mt-2 text-xs text-slate-500">
                                        円換算: {formatYen(convertPriceToYen(priceValue, "USD"))}
                                      </p>
                                    );
                                  })()}
                                  <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs font-semibold text-slate-500">
                                        乗換駅
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            transfers: [
                                              ...current.transfers,
                                              ...buildTransferDrafts([
                                                {
                                                  id: createDraftId(),
                                                  station: "",
                                                  serviceName: "",
                                                  arrivalTime: "",
                                                  departureTime: ""
                                                }
                                              ])
                                            ]
                                          }))
                                        }
                                        className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
                                      >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                        乗換を追加
                                      </button>
                                    </div>
                                    {draft.transfers.length === 0 ? (
                                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        まだ乗換駅がありません。
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {draft.transfers.map((transfer, transferIndex) => {
                                          const transferArrDate = extractDateOnly(transfer.arrTime.value);
                                          const transferArrTime = extractTimeOnly(transfer.arrTime.value);
                                          const transferDepDate = extractDateOnly(transfer.depTime.value);
                                          const transferDepTime = extractTimeOnly(transfer.depTime.value);
                                          return (
                                            <div
                                              key={`${transfer.id}-${transferIndex}`}
                                              className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-500">
                                                  乗換 {transferIndex + 1}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    updateTransport(index, (current) => ({
                                                      ...current,
                                                      transfers: current.transfers.filter(
                                                        (_, idx) => idx !== transferIndex
                                                      )
                                                    }))
                                                  }
                                                  className="text-xs font-semibold text-rose-500"
                                                >
                                                  削除
                                                </button>
                                              </div>
                                              <div className="mt-2">
                                                <p className="text-xs font-semibold text-slate-500">
                                                  駅名
                                                </p>
                                                <div className="mt-2">
                                                  <label className="block text-[11px] font-semibold text-transparent select-none">
                                                    Station
                                                    <div className="relative mt-1 text-slate-900">
                                                      <input
                                                        value={transfer.station.value}
                                                        onChange={(event) =>
                                                          updateTransport(index, (current) => ({
                                                            ...current,
                                                            transfers: current.transfers.map(
                                                              (item, idx) =>
                                                                idx === transferIndex
                                                                  ? {
                                                                    ...item,
                                                                    station: {
                                                                      ...item.station,
                                                                      value: event.target.value
                                                                    }
                                                                  }
                                                                  : item
                                                            )
                                                          }))
                                                        }
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 placeholder-transparent"
                                                      />
                                                    </div>
                                                  </label>
                                                </div>
                                              </div>
                                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                  <p className="text-[11px] font-bold text-slate-500">
                                                    1. この駅に到着
                                                  </p>
                                                  <p className="mt-1 text-[11px] text-slate-400">
                                                    乗換駅に着いた時刻
                                                  </p>
                                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      日付
                                                      <div className="mt-1">
                                                        <PopoverDatePicker
                                                          value={transferArrDate}
                                                          onChange={(nextDate) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      arrTime: {
                                                                        ...item.arrTime,
                                                                        value: updateDateTimeValue(
                                                                          item.arrTime.value,
                                                                          nextDate,
                                                                          undefined
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          onCommit={scheduleTransportSort}
                                                        />
                                                      </div>
                                                    </label>
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      時刻
                                                      <div className="mt-1">
                                                        <input
                                                          type="time"
                                                          value={transferArrTime}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      arrTime: {
                                                                        ...item.arrTime,
                                                                        value: updateDateTimeValue(
                                                                          item.arrTime.value,
                                                                          undefined,
                                                                          event.target.value
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          onBlur={scheduleTransportSort}
                                                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                        />
                                                      </div>
                                                    </label>
                                                  </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                  <p className="text-[11px] font-bold text-slate-500">
                                                    2. この駅を出発
                                                  </p>
                                                  <p className="mt-1 text-[11px] text-slate-400">
                                                    次の列車が出る時刻
                                                  </p>
                                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      日付
                                                      <div className="mt-1">
                                                        <PopoverDatePicker
                                                          value={transferDepDate}
                                                          onChange={(nextDate) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      depTime: {
                                                                        ...item.depTime,
                                                                        value: updateDateTimeValue(
                                                                          item.depTime.value,
                                                                          nextDate,
                                                                          undefined
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          onCommit={scheduleTransportSort}
                                                        />
                                                      </div>
                                                    </label>
                                                    <label className="block text-[11px] font-semibold text-slate-500">
                                                      時刻
                                                      <div className="mt-1">
                                                        <input
                                                          type="time"
                                                          value={transferDepTime}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      depTime: {
                                                                        ...item.depTime,
                                                                        value: updateDateTimeValue(
                                                                          item.depTime.value,
                                                                          undefined,
                                                                          event.target.value
                                                                        )
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          onBlur={scheduleTransportSort}
                                                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                        />
                                                      </div>
                                                    </label>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-[11px] font-bold text-slate-500">到着情報</p>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      最終目的地と到着時刻
                                    </p>
                                    <label className="mt-2 block text-xs font-semibold text-slate-500">
                                      到着地
                                      <input
                                        value={draft.to.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            to: { ...current.to, value: event.target.value }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                                      <label className="block text-[11px] font-semibold text-slate-500">
                                        到着日
                                        <div className="mt-1">
                                          <PopoverDatePicker
                                            value={arrDate}
                                            onChange={(nextDate) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                arrTime: {
                                                  ...current.arrTime,
                                                  value: updateDateTimeValue(
                                                    current.arrTime.value,
                                                    nextDate,
                                                    undefined
                                                  )
                                                }
                                              }))
                                            }
                                            onCommit={scheduleTransportSort}
                                          />
                                        </div>
                                      </label>
                                      <label className="block text-[11px] font-semibold text-slate-500">
                                        到着時刻
                                        <div className="mt-1">
                                          <input
                                            type="time"
                                            value={arrTime}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                arrTime: {
                                                  ...current.arrTime,
                                                  value: updateDateTimeValue(
                                                    current.arrTime.value,
                                                    undefined,
                                                    event.target.value
                                                  )
                                                }
                                              }))
                                            }
                                            onBlur={scheduleTransportSort}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                          />
                                        </div>
                                      </label>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  {(() => {
                                    const modeConfig = getModeConfig(draft.mode.value);
                                    const hasService = Boolean(modeConfig.serviceLabel);
                                    const hasSeat = Boolean(modeConfig.seatLabel);
                                    return hasService || hasSeat ? (
                                      <div className="mb-3 grid gap-3 md:grid-cols-2">
                                        {hasService ? (
                                          <label className="block text-xs font-semibold text-slate-500">
                                            {modeConfig.serviceLabel}
                                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                              <input
                                                value={draft.serviceName.value}
                                                onChange={(event) =>
                                                  updateTransport(index, (current) => ({
                                                    ...current,
                                                    serviceName: {
                                                      ...current.serviceName,
                                                      value: event.target.value
                                                    }
                                                  }))
                                                }
                                                className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                              />
                                              {draft.mode.value === "飛行機" ? (
                                                <div className="flex gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => fetchFlightInfo(draft.id)}
                                                    disabled={flightFetchingId === draft.id}
                                                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                                                  >
                                                    {flightFetchingId === draft.id
                                                      ? "取得中..."
                                                      : "便情報"}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      void handleFetchFlightRecommendations(draft.id, {
                                                        openSheet: true
                                                      });
                                                    }}
                                                    disabled={flightRecoLoadingId === draft.id}
                                                    className="rounded-full border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                                                  >
                                                    {flightRecoLoadingId === draft.id
                                                      ? "取得中..."
                                                      : "候補便"}
                                                  </button>
                                                </div>
                                              ) : null}
                                            </div>
                                            {flightFetchError &&
                                              flightFetchErrorId === draft.id ? (
                                              <p className="mt-2 text-xs text-rose-500">
                                                {flightFetchError}
                                              </p>
                                            ) : null}
                                            {flightRecoError &&
                                              flightRecoErrorId === draft.id ? (
                                              <p className="mt-2 text-xs text-rose-500">
                                                {flightRecoError}
                                              </p>
                                            ) : null}
                                          </label>
                                        ) : null}
                                        {hasSeat ? (
                                          <label className="block text-xs font-semibold text-slate-500">
                                            {modeConfig.seatLabel}
                                            <input
                                              value={draft.seatNumber.value}
                                              onChange={(event) =>
                                                updateTransport(index, (current) => ({
                                                  ...current,
                                                  seatNumber: {
                                                    ...current.seatNumber,
                                                    value: event.target.value
                                                  }
                                                }))
                                              }
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                            />
                                          </label>
                                        ) : null}
                                      </div>
                                    ) : null;
                                  })()}
                                  {draft.mode.value === "飛行機" &&
                                  ((flightRecoById[draft.id]?.length ?? 0) > 0 ||
                                    (flightRecoWarningsById[draft.id]?.length ?? 0) > 0) ? (
                                    <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                                            Flight Options
                                          </p>
                                          <p className="mt-1 text-xs text-slate-500">
                                            {(flightRecoById[draft.id]?.length ?? 0)}件の候補があります
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setFlightRecoSheetId(draft.id)}
                                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                        >
                                          候補を選ぶ
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block text-xs font-semibold text-slate-500">
                                      金額
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        value={draft.price.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            price: {
                                              ...current.price,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <label className="block text-xs font-semibold text-slate-500">
                                      通貨
                                      <select
                                        value={normalizePriceCurrency(draft.currency.value)}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            currency: {
                                              ...current.currency,
                                              value: normalizePriceCurrency(event.target.value)
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      >
                                        <option value="JPY">円 (JPY)</option>
                                        <option value="USD">ドル (USD)</option>
                                      </select>
                                    </label>
                                  </div>
                                  {(() => {
                                    const priceValue = toNumberOrNull(draft.price.value);
                                    if (
                                      priceValue === null ||
                                      normalizePriceCurrency(draft.currency.value) !== "USD"
                                    ) {
                                      return null;
                                    }
                                    return (
                                      <p className="mt-2 text-xs text-slate-500">
                                        円換算: {formatYen(convertPriceToYen(priceValue, "USD"))}
                                      </p>
                                    );
                                  })()}
                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <label className="block text-xs font-semibold text-slate-500">
                                      出発地
                                      <input
                                        value={draft.from.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            from: {
                                              ...current.from,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                    <label className="block text-xs font-semibold text-slate-500">
                                      到着地
                                      <input
                                        value={draft.to.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            to: { ...current.to, value: event.target.value }
                                          }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <div>
                                      <p className="text-xs font-semibold text-slate-500">
                                        出発時刻
                                      </p>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          日付
                                          <div className="mt-1">
                                            <PopoverDatePicker
                                              value={depDate}
                                              onChange={(nextDate) =>
                                                updateTransport(index, (current) => ({
                                                  ...current,
                                                  depTime: {
                                                    ...current.depTime,
                                                    value: updateDateTimeValue(
                                                      current.depTime.value,
                                                      nextDate,
                                                      undefined
                                                    )
                                                  }
                                                }))
                                              }
                                              onCommit={scheduleTransportSort}
                                            />
                                          </div>
                                        </label>
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          時刻
                                          <input
                                            type="time"
                                            value={depTime}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                depTime: {
                                                  ...current.depTime,
                                                  value: updateDateTimeValue(
                                                    current.depTime.value,
                                                    undefined,
                                                    event.target.value
                                                  )
                                                }
                                              }))
                                            }
                                            onBlur={scheduleTransportSort}
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold text-slate-500">
                                        到着時刻
                                      </p>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          日付
                                          <div className="mt-1">
                                            <PopoverDatePicker
                                              value={arrDate}
                                              onChange={(nextDate) =>
                                                updateTransport(index, (current) => ({
                                                  ...current,
                                                  arrTime: {
                                                    ...current.arrTime,
                                                    value: updateDateTimeValue(
                                                      current.arrTime.value,
                                                      nextDate,
                                                      undefined
                                                    )
                                                  }
                                                }))
                                              }
                                              onCommit={scheduleTransportSort}
                                            />
                                          </div>
                                        </label>
                                        <label className="block text-[11px] font-semibold text-slate-400">
                                          時刻
                                          <input
                                            type="time"
                                            value={arrTime}
                                            onChange={(event) =>
                                              updateTransport(index, (current) => ({
                                                ...current,
                                                arrTime: {
                                                  ...current.arrTime,
                                                  value: updateDateTimeValue(
                                                    current.arrTime.value,
                                                    undefined,
                                                    event.target.value
                                                  )
                                                }
                                              }))
                                            }
                                            onBlur={scheduleTransportSort}
                                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                  {draft.mode.value === "飛行機" ? (
                                    <div className="mt-4 space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold text-slate-500">
                                          経由便
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateTransport(index, (current) => ({
                                              ...current,
                                              transfers: [
                                                ...current.transfers,
                                                ...buildTransferDrafts([
                                                  {
                                                    id: createDraftId(),
                                                    station: "",
                                                    serviceName: "",
                                                    arrivalTime: "",
                                                    departureTime: ""
                                                  }
                                                ])
                                              ]
                                            }))
                                          }
                                          className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
                                        >
                                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                          経由便を追加
                                        </button>
                                      </div>
                                      {draft.transfers.length === 0 ? (
                                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                          まだ経由便がありません。
                                        </div>
                                      ) : (
                                        <div className="space-y-2">
                                          {draft.transfers.map((transfer, transferIndex) => {
                                            const transferArrDate = extractDateOnly(transfer.arrTime.value);
                                            const transferArrTime = extractTimeOnly(transfer.arrTime.value);
                                            const transferDepDate = extractDateOnly(transfer.depTime.value);
                                            const transferDepTime = extractTimeOnly(transfer.depTime.value);
                                            return (
                                              <div
                                                key={`${transfer.id}-${transferIndex}`}
                                                className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs font-semibold text-slate-500">
                                                    経由 {transferIndex + 1}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      updateTransport(index, (current) => ({
                                                        ...current,
                                                        transfers: current.transfers.filter(
                                                          (_, idx) => idx !== transferIndex
                                                        )
                                                      }))
                                                    }
                                                    className="text-xs font-semibold text-rose-500"
                                                  >
                                                    削除
                                                  </button>
                                                </div>
                                                <div className="mt-2">
                                                  <p className="text-xs font-semibold text-slate-500">
                                                    便名
                                                  </p>
                                                  <div className="mt-2">
                                                    <label className="block text-[11px] font-semibold text-transparent select-none">
                                                      Flight
                                                      <div className="relative mt-1 text-slate-900">
                                                        <input
                                                          value={transfer.serviceName.value}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      serviceName: {
                                                                        ...item.serviceName,
                                                                        value: event.target.value
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 placeholder-transparent"
                                                        />
                                                      </div>
                                                    </label>
                                                  </div>
                                                </div>
                                                <div className="mt-2">
                                                  <p className="text-xs font-semibold text-slate-500">
                                                    経由空港
                                                  </p>
                                                  <div className="mt-2">
                                                    <label className="block text-[11px] font-semibold text-transparent select-none">
                                                      Airport
                                                      <div className="relative mt-1 text-slate-900">
                                                        <input
                                                          value={transfer.station.value}
                                                          onChange={(event) =>
                                                            updateTransport(index, (current) => ({
                                                              ...current,
                                                              transfers: current.transfers.map(
                                                                (item, idx) =>
                                                                  idx === transferIndex
                                                                    ? {
                                                                      ...item,
                                                                      station: {
                                                                        ...item.station,
                                                                        value: event.target.value
                                                                      }
                                                                    }
                                                                    : item
                                                              )
                                                            }))
                                                          }
                                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 placeholder-transparent"
                                                        />
                                                      </div>
                                                    </label>
                                                  </div>
                                                </div>
                                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                    <p className="text-[11px] font-bold text-slate-500">
                                                      1. この空港に到着
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-slate-400">
                                                      経由空港に着いた時刻
                                                    </p>
                                                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                      <label className="block text-[11px] font-semibold text-slate-500">
                                                        日付
                                                        <div className="mt-1">
                                                          <PopoverDatePicker
                                                            value={transferArrDate}
                                                            onChange={(nextDate) =>
                                                              updateTransport(index, (current) => ({
                                                                ...current,
                                                                transfers: current.transfers.map(
                                                                  (item, idx) =>
                                                                    idx === transferIndex
                                                                      ? {
                                                                        ...item,
                                                                        arrTime: {
                                                                          ...item.arrTime,
                                                                          value: updateDateTimeValue(
                                                                            item.arrTime.value,
                                                                            nextDate,
                                                                            undefined
                                                                          )
                                                                        }
                                                                      }
                                                                      : item
                                                                )
                                                              }))
                                                            }
                                                            onCommit={scheduleTransportSort}
                                                          />
                                                        </div>
                                                      </label>
                                                      <label className="block text-[11px] font-semibold text-slate-500">
                                                        時刻
                                                        <div className="mt-1">
                                                          <input
                                                            type="time"
                                                            value={transferArrTime}
                                                            onChange={(event) =>
                                                              updateTransport(index, (current) => ({
                                                                ...current,
                                                                transfers: current.transfers.map(
                                                                  (item, idx) =>
                                                                    idx === transferIndex
                                                                      ? {
                                                                        ...item,
                                                                        arrTime: {
                                                                          ...item.arrTime,
                                                                          value: updateDateTimeValue(
                                                                            item.arrTime.value,
                                                                            undefined,
                                                                            event.target.value
                                                                          )
                                                                        }
                                                                      }
                                                                      : item
                                                                )
                                                              }))
                                                            }
                                                            onBlur={scheduleTransportSort}
                                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                          />
                                                        </div>
                                                      </label>
                                                    </div>
                                                  </div>
                                                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                    <p className="text-[11px] font-bold text-slate-500">
                                                      2. この空港を出発
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-slate-400">
                                                      次の便が出発する時刻
                                                    </p>
                                                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                      <label className="block text-[11px] font-semibold text-slate-500">
                                                        日付
                                                        <div className="mt-1">
                                                          <PopoverDatePicker
                                                            value={transferDepDate}
                                                            onChange={(nextDate) =>
                                                              updateTransport(index, (current) => ({
                                                                ...current,
                                                                transfers: current.transfers.map(
                                                                  (item, idx) =>
                                                                    idx === transferIndex
                                                                      ? {
                                                                        ...item,
                                                                        depTime: {
                                                                          ...item.depTime,
                                                                          value: updateDateTimeValue(
                                                                            item.depTime.value,
                                                                            nextDate,
                                                                            undefined
                                                                          )
                                                                        }
                                                                      }
                                                                      : item
                                                                )
                                                              }))
                                                            }
                                                            onCommit={scheduleTransportSort}
                                                          />
                                                        </div>
                                                      </label>
                                                      <label className="block text-[11px] font-semibold text-slate-500">
                                                        時刻
                                                        <div className="mt-1">
                                                          <input
                                                            type="time"
                                                            value={transferDepTime}
                                                            onChange={(event) =>
                                                              updateTransport(index, (current) => ({
                                                                ...current,
                                                                transfers: current.transfers.map(
                                                                  (item, idx) =>
                                                                    idx === transferIndex
                                                                      ? {
                                                                        ...item,
                                                                        depTime: {
                                                                          ...item.depTime,
                                                                          value: updateDateTimeValue(
                                                                            item.depTime.value,
                                                                            undefined,
                                                                            event.target.value
                                                                          )
                                                                        }
                                                                      }
                                                                      : item
                                                                )
                                                              }))
                                                            }
                                                            onBlur={scheduleTransportSort}
                                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                                                          />
                                                        </div>
                                                      </label>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                  <label className="mt-3 block text-xs font-semibold text-slate-500">
                                    メモ
                                    <textarea
                                      value={draft.notes.value}
                                      onChange={(event) =>
                                        updateTransport(index, (current) => ({
                                          ...current,
                                          notes: {
                                            ...current.notes,
                                            value: event.target.value
                                          }
                                        }))
                                      }
                                      rows={2}
                                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    />
                                  </label>
                                  <label className="mt-3 block text-xs font-semibold text-slate-500">
                                    予約リンク
                                    <div className="mt-2 flex items-center gap-2">
                                      <input
                                        value={draft.link.value}
                                        onChange={(event) =>
                                          updateTransport(index, (current) => ({
                                            ...current,
                                            link: { ...current.link, value: event.target.value }
                                          }))
                                        }
                                        placeholder="https://..."
                                        className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void pasteFromClipboard((text) =>
                                            updateTransport(index, (current) => ({
                                              ...current,
                                              link: { ...current.link, value: text }
                                            }))
                                          )
                                        }
                                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                      >
                                        貼り付け
                                      </button>
                                      {draft.link.value.trim() ? (
                                        <button
                                          type="button"
                                          onClick={() => openExternalLink(draft.link.value)}
                                          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                        >
                                          開く
                                        </button>
                                      ) : null}
                                    </div>
                                  </label>
                                </>
                              )}
                              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                                <input
                                  type="checkbox"
                                  checked={draft.paid.value === true}
                                  onChange={(event) =>
                                    updateTransport(index, (current) => ({
                                      ...current,
                                      paid: {
                                        ...current.paid,
                                        value: event.target.checked
                                      }
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                支払い済み
                              </label>
                            </div>
                          </SwipeDeleteCard>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : transportations.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだ移動手段が登録されていません。
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedTransportations.map((item, index) => {
                    const name =
                      getStringField(item, TRANSPORT_NAME_KEYS) ||
                      `移動 ${index + 1}`;
                    const mode = getStringField(item, TRANSPORT_MODE_KEYS);
                    const modeConfig = getModeConfig(mode || "在来線");
                    const serviceLabel = modeConfig.serviceLabel;
                    const seatLabel = modeConfig.seatLabel;
                    const serviceValue =
                      serviceLabel && modeConfig.serviceKeys?.length
                        ? getStringField(item, modeConfig.serviceKeys)
                        : "";
                    const seatValue =
                      seatLabel && modeConfig.seatKeys?.length
                        ? getStringField(item, modeConfig.seatKeys)
                        : "";
                    const priceYen = getNumberField(item, TRANSPORT_PRICE_KEYS);
                    const originalPrice = getNumberField(
                      item,
                      TRANSPORT_ORIGINAL_PRICE_KEYS
                    );
                    const currency = getItemCurrency(item, TRANSPORT_CURRENCY_KEYS);
                    const isPaid = getBooleanField(item, TRANSPORT_PAID_KEYS);
                    let from = getLocationField(item, TRANSPORT_FROM_KEYS);
                    if (!from) {
                      from = findLocationByPattern(item, TRANSPORT_FROM_PATTERNS);
                    }
                    let to = getLocationField(item, TRANSPORT_TO_KEYS);
                    if (!to) {
                      to = findLocationByPattern(item, TRANSPORT_TO_PATTERNS);
                    }
                    const depTime = formatShortDateTime(
                      getDateField(item, TRANSPORT_DEP_KEYS)
                    );
                    const arrTime = formatShortDateTime(
                      getDateField(item, TRANSPORT_ARR_KEYS)
                    );
                    const transfers = Array.isArray(item.transfers)
                      ? (item.transfers as ItemRecord[])
                      : [];
                    const notes = getStringField(item, NOTES_KEYS);
                    const link = getLinkField(item);
                    const linkHref = link ? normalizeLink(link) : null;

                    return (
                      <div
                        key={`${name}-${index}`}
                        className="rounded-2xl bg-white p-4 shadow-cardSoft"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-base font-semibold text-slate-900">
                            {name}
                          </h4>
                          {priceYen !== null ? (
                            <span className="text-base font-semibold text-slate-900">
                              {formatPriceLabel(priceYen, currency, originalPrice)}
                            </span>
                          ) : null}
                        </div>
                        {mode ? (
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            {mode}
                          </p>
                        ) : null}
                        {isPaid !== null ? (
                          <p className="mt-2 text-xs font-semibold text-emerald-600">
                            {isPaid ? "支払い済み" : "未払い"}
                          </p>
                        ) : null}
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          {serviceLabel && serviceValue ? (
                            <div className="flex items-center justify-between gap-4">
                              <span>
                                {serviceLabel}: {serviceValue}
                              </span>
                              {seatLabel && seatValue ? (
                                <span>
                                  {seatLabel}: {seatValue}
                                </span>
                              ) : null}
                            </div>
                          ) : seatLabel && seatValue ? (
                            <div className="flex items-center justify-between gap-4">
                              <span>
                                {seatLabel}: {seatValue}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-4">
                            <span>出発地: {from || "—"}</span>
                            <span>到着地: {to || "—"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>DEP: {depTime || "—"}</span>
                            <span>ARR: {arrTime || "—"}</span>
                          </div>
                          {supportsTransferInput(mode) && transfers.length > 0 ? (
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              <p className="font-semibold text-slate-500">
                                {mode === "飛行機" ? "経由便" : "乗換駅"}
                              </p>
                              <div className="mt-2 space-y-1">
                                {transfers.map((transfer, transferIndex) => {
                                  const station = getStringField(transfer, [
                                    "station",
                                    "name",
                                    "title"
                                  ]);
                                  const transferService = getStringField(
                                    transfer,
                                    TRANSFER_SERVICE_KEYS
                                  );
                                  const transferArr = formatShortDateTime(
                                    getDateField(transfer, TRANSFER_ARR_KEYS)
                                  );
                                  const transferDep = formatShortDateTime(
                                    getDateField(transfer, TRANSFER_DEP_KEYS)
                                  );
                                  return (
                                    <div
                                      key={`transfer-${transferIndex}`}
                                      className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                      <span>
                                        {transferIndex + 1}.{" "}
                                        {station || (mode === "飛行機" ? "経由空港未設定" : "駅名未設定")}
                                        {transferService ? ` (${transferService})` : ""}
                                      </span>
                                      <span className="text-slate-400">
                                        {transferArr || "—"} → {transferDep || "—"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          {notes ? <p>メモ: {notes}</p> : null}
                          {linkHref ? (
                            <a
                              href={linkHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-900 underline underline-offset-4"
                            >
                              Google Flightsを開く
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addTransport}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  移動手段を追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="宿泊" />
              {canEdit ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-cardSoft">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        目的地と日程を使って候補ホテルを自動取得します。
                      </div>
                      <button
                        type="button"
                        onClick={handleFetchHotelRecommendations}
                        disabled={hotelRecoLoading}
                        className="rounded-full border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {hotelRecoLoading ? "取得中..." : "候補ホテルを取得"}
                      </button>
                    </div>
                    {hotelRecoError ? (
                      <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
                        {hotelRecoError}
                      </div>
                    ) : null}
                    {hotelRecoSummary ? (
                      <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {hotelRecoSummary}
                      </div>
                    ) : null}
                    {hotelRecoWarnings.length > 0 ? (
                      <div className="mt-2 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {hotelRecoWarnings.map((warning, index) => (
                          <p key={`${warning}-${index}`}>・{warning}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {hotelEdits.length === 0 ? (
                    <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                      まだ宿泊先が登録されていません。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {hotelEdits.map((draft, index) => {
                        const checkInDate = extractDateOnly(draft.checkIn.value);
                        const checkOutDate = extractDateOnly(draft.checkOut.value);
                        const originalCheckInDate = extractDateOnly(draft.checkIn.original);
                        const originalCheckOutDate = extractDateOnly(draft.checkOut.original);
                        return (
                          <SwipeDeleteCard
                            key={`hotel-edit-${index}`}
                            enabled={canEdit}
                            onDelete={() => removeHotel(index)}
                          >
                            <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="block text-xs font-semibold text-slate-500">
                                宿泊名
                                <input
                                  value={draft.name.value}
                                  onChange={(event) =>
                                    updateHotel(index, (current) => ({
                                      ...current,
                                      name: { ...current.name, value: event.target.value }
                                    }))
                                  }
                                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                />
                              </label>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="block text-xs font-semibold text-slate-500">
                                  金額
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={draft.price.value}
                                    onChange={(event) =>
                                      updateHotel(index, (current) => ({
                                        ...current,
                                        price: { ...current.price, value: event.target.value }
                                      }))
                                    }
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                  />
                                </label>
                                <label className="block text-xs font-semibold text-slate-500">
                                  通貨
                                  <select
                                    value={normalizePriceCurrency(draft.currency.value)}
                                    onChange={(event) =>
                                      updateHotel(index, (current) => ({
                                        ...current,
                                        currency: {
                                          ...current.currency,
                                          value: normalizePriceCurrency(event.target.value)
                                        }
                                      }))
                                    }
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                  >
                                    <option value="JPY">円 (JPY)</option>
                                    <option value="USD">ドル (USD)</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                            {(() => {
                              const priceValue = toNumberOrNull(draft.price.value);
                              if (
                                priceValue === null ||
                                normalizePriceCurrency(draft.currency.value) !== "USD"
                              ) {
                                return null;
                              }
                              return (
                                <p className="mt-2 text-xs text-slate-500">
                                  円換算: {formatYen(convertPriceToYen(priceValue, "USD"))}
                                </p>
                              );
                            })()}
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-slate-500">
                                宿泊日程
                              </p>
                              <div className="mt-2">
                                <StayDateRangePicker
                                  startDate={checkInDate}
                                  endDate={checkOutDate}
                                  originalStartDate={originalCheckInDate}
                                  originalEndDate={originalCheckOutDate}
                                  onChange={(nextStartDate, nextEndDate) =>
                                    updateHotel(index, (current) => ({
                                      ...current,
                                      checkIn: {
                                        ...current.checkIn,
                                        value: nextStartDate
                                      },
                                      checkOut: {
                                        ...current.checkOut,
                                        value: nextEndDate
                                      }
                                    }))
                                  }
                                />
                              </div>
                            </div>
                            <label className="mt-3 block text-xs font-semibold text-slate-500">
                              住所
                              <input
                                value={draft.address.value}
                                onChange={(event) =>
                                  updateHotel(index, (current) => ({
                                    ...current,
                                    address: { ...current.address, value: event.target.value }
                                  }))
                                }
                                placeholder="例: 台北市中山区..."
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                              <input
                                type="checkbox"
                                checked={draft.paid.value === true}
                                onChange={(event) =>
                                  updateHotel(index, (current) => ({
                                    ...current,
                                    paid: {
                                      ...current.paid,
                                      value: event.target.checked
                                    }
                                  }))
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              支払い済み
                            </label>
                            <label className="mt-3 block text-xs font-semibold text-slate-500">
                              メモ
                              <textarea
                                value={draft.notes.value}
                                onChange={(event) =>
                                  updateHotel(index, (current) => ({
                                    ...current,
                                    notes: { ...current.notes, value: event.target.value }
                                  }))
                                }
                                rows={2}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="mt-3 block text-xs font-semibold text-slate-500">
                              予約リンク
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  value={draft.link.value}
                                  onChange={(event) =>
                                    updateHotel(index, (current) => ({
                                      ...current,
                                      link: { ...current.link, value: event.target.value }
                                    }))
                                  }
                                  placeholder="https://..."
                                  className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void pasteFromClipboard((text) =>
                                      updateHotel(index, (current) => ({
                                        ...current,
                                        link: { ...current.link, value: text }
                                      }))
                                    )
                                  }
                                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  貼り付け
                                </button>
                                {draft.link.value.trim() ? (
                                  <button
                                    type="button"
                                    onClick={() => openExternalLink(draft.link.value)}
                                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                  >
                                    開く
                                  </button>
                                ) : null}
                              </div>
                            </label>
                            </div>
                          </SwipeDeleteCard>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : hotels.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだ宿泊先が登録されていません。
                </div>
              ) : (
                <div className="space-y-3">
                  {hotels.map((item, index) => {
                    const name =
                      getStringField(item, HOTEL_NAME_KEYS) ||
                      `宿泊 ${index + 1}`;
                    const priceYen = getNumberField(item, HOTEL_PRICE_KEYS);
                    const originalPrice = getNumberField(
                      item,
                      HOTEL_ORIGINAL_PRICE_KEYS
                    );
                    const currency = getItemCurrency(item, HOTEL_CURRENCY_KEYS);
                    const isPaid = getBooleanField(item, HOTEL_PAID_KEYS);
                    const checkIn = formatDate(getDateField(item, HOTEL_CHECKIN_KEYS));
                    const checkOut = formatDate(getDateField(item, HOTEL_CHECKOUT_KEYS));
                    const address = getStringField(item, HOTEL_ADDRESS_KEYS);
                    const notes = getStringField(item, NOTES_KEYS);
                    const link = getLinkField(item);
                    const linkHref = link ? normalizeLink(link) : null;

                    return (
                      <div
                        key={`${name}-${index}`}
                        className="rounded-2xl bg-white p-4 shadow-cardSoft"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-base font-semibold text-slate-900">
                            {name}
                          </h4>
                          {priceYen !== null ? (
                            <span className="text-base font-semibold text-slate-900">
                              {formatPriceLabel(priceYen, currency, originalPrice)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          {isPaid !== null ? (
                            <p className="font-semibold text-emerald-600">
                              {isPaid ? "支払い済み" : "未払い"}
                            </p>
                          ) : null}
                          {(checkIn || checkOut) && (
                            <div className="flex items-center justify-between gap-4">
                              <span>チェックイン: {checkIn || "—"}</span>
                              <span>チェックアウト: {checkOut || "—"}</span>
                            </div>
                          )}
                          {address ? <p>住所: {address}</p> : null}
                          {notes ? <p>メモ: {notes}</p> : null}
                          {linkHref ? (
                            <a
                              href={linkHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-900 underline underline-offset-4"
                            >
                              予約リンクを開く
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addHotel}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  宿泊を追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="アクティビティ" />
              {canEdit ? (
                activityEdits.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                    まだアクティビティが登録されていません。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activityEdits.map((draft, index) => {
                      return (
                        <SwipeDeleteCard
                          key={`activity-edit-${index}`}
                          enabled={canEdit}
                          onDelete={() => removeActivity(index)}
                        >
                          <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block text-xs font-semibold text-slate-500">
                              タイトル
                              <input
                                value={draft.title.value}
                                onChange={(event) =>
                                  updateActivity(index, (current) => ({
                                    ...current,
                                    title: { ...current.title, value: event.target.value }
                                  }))
                                }
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-500">
                              住所
                              <input
                                value={draft.address.value}
                                onChange={(event) =>
                                  updateActivity(index, (current) => ({
                                    ...current,
                                    address: { ...current.address, value: event.target.value }
                                  }))
                                }
                                placeholder="例: 台北市信義区..."
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-500">
                              日時
                              <input
                                value={draft.date.value}
                                onChange={(event) =>
                                  updateActivity(index, (current) => ({
                                    ...current,
                                    date: { ...current.date, value: event.target.value }
                                  }))
                                }
                                placeholder="例: 2025-11-23 10:00"
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                          </div>
                          <label className="mt-3 block text-xs font-semibold text-slate-500">
                            メモ
                            <textarea
                              value={draft.notes.value}
                              onChange={(event) =>
                                updateActivity(index, (current) => ({
                                  ...current,
                                  notes: { ...current.notes, value: event.target.value }
                                }))
                              }
                              rows={2}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                          <label className="mt-3 block text-xs font-semibold text-slate-500">
                            予約リンク
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                value={draft.link.value}
                                onChange={(event) =>
                                  updateActivity(index, (current) => ({
                                    ...current,
                                    link: { ...current.link, value: event.target.value }
                                  }))
                                }
                                placeholder="https://..."
                                className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  void pasteFromClipboard((text) =>
                                    updateActivity(index, (current) => ({
                                      ...current,
                                      link: { ...current.link, value: text }
                                    }))
                                  )
                                }
                                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                貼り付け
                              </button>
                              {draft.link.value.trim() ? (
                                <button
                                  type="button"
                                  onClick={() => openExternalLink(draft.link.value)}
                                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  開く
                                </button>
                              ) : null}
                            </div>
                          </label>
                        </div>
                      </SwipeDeleteCard>
                      );
                    })}
                  </div>
                )
              ) : activities.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだアクティビティが登録されていません。
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((item, index) => {
                    const title =
                      getStringField(item, ACTIVITY_TITLE_KEYS) ||
                      `アクティビティ ${index + 1}`;
                    const address = getStringField(item, ACTIVITY_ADDRESS_KEYS);
                    const date = formatShortDateTime(
                      getDateField(item, ACTIVITY_DATE_KEYS)
                    );
                    const notes = getStringField(item, NOTES_KEYS);
                    const link = getLinkField(item);
                    const linkHref = link ? normalizeLink(link) : null;

                    return (
                      <div
                        key={`${title}-${index}`}
                        className="rounded-2xl bg-white p-4 shadow-cardSoft"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-base font-semibold text-slate-900">
                            {title}
                          </h4>
                          {date ? (
                            <span className="text-xs text-slate-500">{date}</span>
                          ) : null}
                        </div>
                        {address ? (
                          <p className="mt-2 text-xs text-slate-500">住所: {address}</p>
                        ) : null}
                        {notes ? (
                          <p className="mt-2 text-xs text-slate-500">メモ: {notes}</p>
                        ) : null}
                        {linkHref ? (
                          <a
                            href={linkHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block text-xs text-slate-900 underline underline-offset-4"
                          >
                            予約リンクを開く
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addActivity}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  アクティビティを追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="持ち物" />
              {canEdit ? (
                packingEdits.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                    まだ持ち物が登録されていません。
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                    <div className="space-y-3">
                      {packingEdits.map((draft, index) => (
                        <SwipeDeleteCard
                          key={`packing-edit-${index}`}
                          enabled={canEdit}
                          onDelete={() => removePacking(index)}
                        >
                          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                            <label className="block text-xs font-semibold text-slate-500">
                              持ち物
                              <input
                                value={draft.name.value}
                                onChange={(event) =>
                                  updatePacking(index, (current) => ({
                                    ...current,
                                    name: { ...current.name, value: event.target.value }
                                  }))
                                }
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                              <input
                                type="checkbox"
                                checked={draft.checked.value === true}
                                onChange={(event) =>
                                  updatePacking(index, (current) => ({
                                    ...current,
                                    checked: {
                                      ...current.checked,
                                      value: event.target.checked
                                    }
                                  }))
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              準備済み
                            </label>
                          </div>
                        </SwipeDeleteCard>
                      ))}
                    </div>
                  </div>
                )
              ) : packingList.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                  まだ持ち物が登録されていません。
                </div>
              ) : (
                <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                  <ul className="space-y-2 text-sm">
                    {packingList.map((item, index) => {
                      const record =
                        typeof item === "string" ? { name: item } : item;
                      const name =
                        getStringField(record, PACKING_NAME_KEYS) ||
                        `持ち物 ${index + 1}`;
                      const checked = getBooleanField(record, PACKING_CHECK_KEYS);
                      return (
                        <li
                          key={`${name}-${index}`}
                          className="flex items-center justify-between"
                        >
                          <span className="text-slate-900">{name}</span>
                          <span className="text-xs text-slate-500">
                            {checked ? "準備済み" : "未準備"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={addPacking}
                  className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                >
                  持ち物を追加
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <SectionTitle title="支払い履歴" />
              <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">貯金額</span>
                  <span className="font-semibold text-slate-900">
                    {formatYen(savedTotal)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">あと</span>
                  <span className="font-semibold text-slate-900">
                    {remainingCost !== null ? formatYen(remainingCost) : "—"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">支払い済み</span>
                  <span className="font-semibold text-slate-900">
                    {formatYen(paidTotal)}
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-900/80"
                    style={{
                      width: `${totalCost
                        ? Math.min(100, Math.round((coveredTotal / totalCost) * 100))
                        : 0
                        }%`
                    }}
                  />
                </div>
                {canEdit ? (
                  savingsEdits.length === 0 ? (
                    <div className="mt-3 text-xs text-slate-500">
                      まだ貯金履歴がありません。
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {savingsEdits.map((draft, index) => (
                        <SwipeDeleteCard
                          key={`save-edit-${index}`}
                          enabled={canEdit}
                          onDelete={() => removeSavings(index)}
                        >
                          <div className="rounded-2xl bg-white p-4 shadow-cardSoft">
                            <p className="text-xs font-semibold text-slate-500">
                              貯金 {index + 1}
                            </p>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={draft.value}
                              onChange={(event) =>
                                updateSavings(index, (current) => ({
                                  ...current,
                                  value: event.target.value
                                }))
                              }
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                            />
                          </div>
                        </SwipeDeleteCard>
                      ))}
                    </div>
                  )
                ) : plan.savingsHistory && plan.savingsHistory.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {plan.savingsHistory.map((value, index) => (
                      <span
                        key={`save-${index}`}
                        className="rounded-full bg-slate-100 px-3 py-1"
                      >
                        {formatSavingsEntry(value)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={addSavings}
                    className="mt-4 w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50"
                  >
                    貯金履歴を追加
                  </button>
                ) : null}
              </div>
            </div>

            {!canEdit ? (
              <div className="space-y-2">
                <SectionTitle title="合計費用" />
                <div className="rounded-2xl bg-white px-4 shadow-cardSoft">
                  <InfoRow
                    label="合計"
                    value={totalCost !== null ? formatYen(totalCost) : "—"}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">コメント</h3>
            {commentsError ? (
              <span className="text-xs text-rose-500">{commentsError}</span>
            ) : null}
          </div>
          {actionError ? (
            <div className="rounded-2xl bg-white p-3 text-xs text-rose-500 shadow-cardSoft">
              {actionError}
            </div>
          ) : null}
          <CommentForm
            onSubmit={async (text) => {
              if (!plan?.path) {
                setActionError("プラン情報が取得できません。");
                return;
              }
              setActionError(null);
              try {
                await postComment(plan.path, text, authorName);
              } catch (err) {
                setActionError("コメントの投稿に失敗しました。");
                console.error(err);
              }
            }}
          />
          <CommentList
            comments={comments}
            onDelete={async (commentId) => {
              if (!plan?.path) {
                setActionError("プラン情報が取得できません。");
                return;
              }
              setActionError(null);
              try {
                await deleteComment(plan.path, commentId);
              } catch (err) {
                setActionError("コメントの削除に失敗しました。");
                console.error(err);
              }
            }}
          />
        </section>
        {plan && canEdit ? (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-4 z-40 w-[min(92vw,470px)]">
            <div className="flex flex-col items-end gap-2">
              {quickAssistOpen ? (
                <div className="w-full rounded-3xl border border-sky-100 bg-sky-50/80 p-4 shadow-[0_24px_42px_-22px_rgba(15,23,42,0.28)]">
                  <div className="flex items-center justify-between gap-2 border-b border-sky-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-[11px] font-bold text-white">
                        AI
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Travel Assist Beta
                        </p>
                        <h3 className="mt-0.5 text-base font-semibold text-slate-900">
                          旅行アシスト（ベータ）
                        </h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={clearAiChatHistory}
                        className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        履歴クリア
                      </button>
                      <div className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                        BETA / GPT-4.1系
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAiAssistantMode("consult")}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        aiAssistantMode === "consult"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      相談モード
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiAssistantMode("plan")}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        aiAssistantMode === "plan"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      自動作成モード
                    </button>
                    <p className="ml-auto text-[11px] font-semibold text-slate-500">
                      {aiAssistantMode === "consult" ? "Web検索ON" : "プレビュー確認後に反映"}
                    </p>
                  </div>
                  <div className="mt-3 h-[32rem] rounded-2xl border border-slate-200 bg-white">
                    <div className="h-full space-y-3 overflow-y-auto p-3">
                      {aiChatMessages.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-600">
                          ベータ版の旅行アシスト履歴がここに残ります。作成結果や相談内容を後から見返せます。
                        </p>
                      ) : (
                        aiChatMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            {message.role === "assistant" ? (
                              <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
                                AI
                              </div>
                            ) : null}
                            <div
                              className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13.5px] leading-6 font-medium ${
                                message.role === "user"
                                  ? "bg-slate-900 text-slate-50 shadow-[0_10px_20px_-14px_rgba(15,23,42,0.85)]"
                                  : "border border-slate-200 bg-slate-50 text-slate-900"
                              }`}
                            >
                              <p
                                className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                  message.role === "user" ? "text-slate-300" : "text-slate-500"
                                }`}
                              >
                                {message.role === "user" ? "You" : "AI"}
                              </p>
                              <p className="whitespace-pre-wrap break-words font-medium">{message.text}</p>
                              {message.attachments.length > 0 ? (
                                <p
                                  className={`mt-2 text-[11px] ${
                                    message.role === "user" ? "text-slate-300" : "text-slate-600"
                                  }`}
                                >
                                  画像: {message.attachments.join(", ")}
                                </p>
                              ) : null}
                              {message.warnings.length > 0 ? (
                                <div
                                  className={`mt-2 space-y-1 text-[11px] ${
                                    message.role === "user" ? "text-amber-200" : "text-amber-800"
                                  }`}
                                >
                                  {message.warnings.map((warning, index) => (
                                    <p key={`${message.id}-${index}`}>・{warning}</p>
                                  ))}
                                </div>
                              ) : null}
                              {message.role === "assistant" && message.sources.length > 0 ? (
                                <div className="mt-2 space-y-1.5 rounded-xl border border-slate-200 bg-white/80 p-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sources</p>
                                  {message.sources.map((source, index) => (
                                    <div key={`${message.id}-source-${index}`} className="space-y-0.5">
                                      <button
                                        type="button"
                                        onClick={() => openExternalLink(source.url)}
                                        className="text-left text-[11px] font-semibold text-sky-700 underline-offset-2 transition hover:underline"
                                      >
                                        {index + 1}. {source.title}
                                      </button>
                                      {source.snippet ? (
                                        <p className="text-[10.5px] leading-4 text-slate-600">{source.snippet}</p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <p
                                className={`mt-2 text-right text-[11px] ${
                                  message.role === "user" ? "text-slate-300" : "text-slate-500"
                                }`}
                              >
                                {formatAiChatTime(message.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                      {aiLoading ? (
                        <div className="flex justify-start">
                          <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
                            AI
                          </div>
                          <div className="max-w-[90%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p className="animate-pulse">
                              {aiAssistantMode === "consult"
                                ? "AIが相談内容を調査して回答中..."
                                : "AIがプラン案を生成中..."}
                            </p>
                          </div>
                        </div>
                      ) : null}
                      {hotelRecoLoading ? (
                        <div className="flex justify-start">
                          <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
                            AI
                          </div>
                          <div className="max-w-[90%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p className="animate-pulse">ホテル候補を検索中...</p>
                          </div>
                        </div>
                      ) : null}
                      <div ref={aiChatEndRef} />
                    </div>
                  </div>
                  {aiError ? (
                    <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{aiError}</p>
                  ) : null}
                  <div className="mt-3">
                    <input
                      ref={aiImageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAiImagesSelected}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2">
                      <textarea
                        value={aiPrompt}
                        onChange={(event) => {
                          setAiPrompt(event.target.value);
                          setAiError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || event.shiftKey) {
                            return;
                          }
                          if (event.nativeEvent.isComposing) {
                            return;
                          }
                          event.preventDefault();
                          void handleGenerateAiPlan();
                        }}
                        rows={1}
                        placeholder={
                          aiAssistantMode === "consult"
                            ? "例: 台湾で3泊4日、家族向けでおすすめを相談したい"
                            : "例: 3月末の台北4日、移動とホテル込みで下書きを作って"
                        }
                        className="h-7 flex-1 resize-none bg-transparent px-1 text-sm font-medium leading-7 text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => aiImageInputRef.current?.click()}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                        aria-label="画像を追加"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={aiLoading || (!aiPrompt.trim() && aiImages.length === 0)}
                        onClick={handleGenerateAiPlan}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                        aria-label="送信"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L15 22l-4-9-9-4 20-7z" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleFetchHotelRecommendations()}
                          disabled={hotelRecoLoading}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          {hotelRecoLoading ? "候補取得中..." : "ホテル提案"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAiPrompt(
                              aiAssistantMode === "consult"
                                ? "台湾で3泊4日のおすすめの過ごし方を、移動負荷が少ない順で3案ください。"
                                : "おすすめの移動手段とホテル候補を入れた旅行プランの下書きを作って。"
                            )
                          }
                          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          テンプレ
                        </button>
                      </div>
                      {aiImages.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAiImages([])}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          画像 {aiImages.length}枚 クリア
                        </button>
                      ) : (
                        <p className="text-[11px] font-medium text-slate-500">Enterで送信 / Shift+Enterで改行</p>
                      )}
                    </div>
                  </div>
                  {pendingAiSuggestion ? (
                    <div className="mt-2.5 rounded-2xl border border-sky-200 bg-white p-3 text-xs text-slate-700">
                      <p className="font-semibold text-slate-900">{pendingAiSuggestion.summary}</p>
                      {pendingAiSuggestion.warnings.length > 0 ? (
                        <div className="mt-1 space-y-0.5 text-amber-700">
                          {pendingAiSuggestion.warnings.map((warning, index) => (
                            <p key={`pending-warning-${index}`}>・{warning}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-xs font-bold text-slate-800">提案内容プレビュー</p>
                        <p className="mt-1 max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 font-medium text-slate-800">
                          {buildPendingSuggestionPreviewText(pendingAiSuggestion.suggestion)}
                        </p>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => applyPendingSuggestion("merge")}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          追記で反映
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPendingSuggestion("replace")}
                          className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          上書きで反映
                        </button>
                        <button
                          type="button"
                          onClick={discardPendingSuggestion}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          破棄
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setQuickAssistOpen((current) => !current)}
                className={`rounded-full px-4 py-2.5 text-xs font-semibold transition ${
                  quickAssistOpen
                    ? "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                    : "bg-slate-900 text-white shadow-[0_18px_32px_-16px_rgba(15,23,42,0.82)] hover:bg-slate-800"
                }`}
                aria-expanded={quickAssistOpen}
              >
                {quickAssistOpen ? "旅行アシスト（β）を閉じる" : "旅行アシスト（β）"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
    {flightRecoSheetId && typeof window !== "undefined"
      ? createPortal(
        <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-[0_28px_80px_-28px_rgba(15,23,42,0.45)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Flight Options
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  候補便を選択
                </h3>
                {activeFlightRecoDraft ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {activeFlightRecoDraft.from.value || "出発地未設定"} →{" "}
                    {activeFlightRecoDraft.to.value || "到着地未設定"}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setFlightRecoSheetId(null)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                閉じる
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
              {activeFlightRecoWarnings.length > 0 ? (
                <div className="mb-3 space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  {activeFlightRecoWarnings.map((warning, index) => (
                    <p key={`active-flight-warning-${index}`}>・{warning}</p>
                  ))}
                </div>
              ) : null}
              {activeFlightRecoCandidates.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  候補便が見つかりませんでした。
                </div>
              ) : (
                <div className="space-y-3">
                  {activeFlightRecoCandidates.map((candidate, candidateIndex) => {
                    const logo = normalizeLink(candidate.airlineLogo ?? "");
                    const times = [
                      formatFlightTimeValue(candidate.depTime),
                      formatFlightTimeValue(candidate.arrTime)
                    ].join(" - ");
                    const meta = [
                      formatFlightDuration(candidate.totalDurationMinutes),
                      typeof candidate.stops === "number"
                        ? candidate.stops === 0
                          ? "直行便"
                          : `${candidate.stops}回経由`
                        : "",
                      candidate.via?.length ? `経由: ${candidate.via.join(" / ")}` : ""
                    ]
                      .filter(Boolean)
                      .join(" / ");
                    return (
                      <div
                        key={`flight-reco-sheet-${candidateIndex}`}
                        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 flex-1 gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-xs font-black text-slate-700">
                              {logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={logo}
                                  alt={candidate.airline ?? "airline"}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <span>{(candidate.airline ?? "?").slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <p className="truncate text-base font-bold text-slate-900">
                                  {candidate.airline || "航空会社未取得"}
                                </p>
                                {candidate.flightNumber ? (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                    {candidate.flightNumber}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-base font-semibold text-slate-800">
                                {times}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {(candidate.from ?? "").replace(/\s+/g, " ")} →{" "}
                                {(candidate.to ?? "").replace(/\s+/g, " ")}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {meta || "詳細未取得"}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-lg font-black text-slate-900">
                              {candidate.price !== null
                                ? `${normalizePriceCurrency(candidate.currency ?? "JPY")} ${Math.round(candidate.price).toLocaleString()}`
                                : "価格未取得"}
                            </p>
                            <div className="mt-3 flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!flightRecoSheetId) {
                                    return;
                                  }
                                  applyFlightRecommendationToDraft(flightRecoSheetId, candidate);
                                  setFlightRecoSheetId(null);
                                }}
                                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                              >
                                この便を反映
                              </button>
                              {candidate.link ? (
                                <button
                                  type="button"
                                  onClick={() => openExternalLink(candidate.link ?? "")}
                                  className="text-xs font-semibold text-slate-600 underline underline-offset-4"
                                >
                                  Google Flightsを開く
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
      : null}
    </>
  );
}

export default function PlanDetailPage() {
  return (
    <AuthGate>
      {(user) => <PlanDetailContent user={user} />}
    </AuthGate>
  );
}
