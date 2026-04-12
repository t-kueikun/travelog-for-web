"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { useRouter } from "next/navigation";
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
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import { createPlan, updatePlan } from "@/lib/firestore";
import type { AiPlanSuggestion } from "@/lib/ai-plan";

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
  flights?: FlightRecommendation[];
  warnings?: string[];
  detail?: string;
  error?: string;
};

type AirportSuggestion = {
  code: string;
  name: string;
  cityName: string | null;
  label: string;
};

const INTEREST_OPTIONS = [
  "グルメ",
  "観光名所",
  "自然・絶景",
  "買い物",
  "温泉・スパ",
  "ナイトライフ",
  "子ども向け"
] as const;

const TRANSPORT_MODE_PRIORITY_OPTIONS = [
  "指定なし",
  "飛行機優先",
  "新幹線優先",
  "在来線優先",
  "バス優先",
  "車優先"
] as const;

const ROUTE_POLICY_OPTIONS = [
  "バランス重視",
  "最短時間重視",
  "最安重視",
  "乗換少なめ重視"
] as const;

const TRANSFER_LIMIT_OPTIONS = ["制限なし", "乗換1回まで", "乗換2回まで"] as const;

const TIME_BAND_OPTIONS = ["指定なし", "朝", "昼", "夕方", "夜"] as const;

const HOTEL_GRADE_OPTIONS = ["指定なし", "3つ星以上", "4つ星以上", "5つ星以上"] as const;
const DESTINATION_SCOPE_OPTIONS = ["海外", "国内"] as const;
const TRAVEL_STYLE_OPTIONS = ["節約", "標準", "快適", "プレミアム"] as const;
const DESTINATION_SUGGESTIONS = [
  {
    label: "台北",
    scope: "海外",
    image:
      "https://images.unsplash.com/photo-1550760146-f2f4cf8961f1?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "ソウル",
    scope: "海外",
    image:
      "https://images.unsplash.com/photo-1597552571860-136a103d5eb3?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "バンコク",
    scope: "海外",
    image:
      "https://images.unsplash.com/photo-1601224335112-b74158e231ec?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "シンガポール",
    scope: "海外",
    image:
      "https://images.unsplash.com/photo-1496939376851-89342e90adcd?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "ローマ",
    scope: "海外",
    image:
      "https://images.unsplash.com/photo-1555992828-35627f3b373f?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "京都",
    scope: "国内",
    image:
      "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "大阪",
    scope: "国内",
    image:
      "https://images.unsplash.com/photo-1584505489290-96eb4e406d08?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "札幌",
    scope: "国内",
    image:
      "https://images.unsplash.com/photo-1572420780547-8fbb45c82f0a?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "東京",
    scope: "国内",
    image:
      "https://images.unsplash.com/photo-1604928141064-207cea6f571f?auto=format&fit=crop&w=900&h=1350&q=80"
  },
  {
    label: "ニューヨーク",
    scope: "海外",
    image:
      "https://images.unsplash.com/photo-1485738422979-f5c462d49f74?auto=format&fit=crop&w=900&h=1350&q=80"
  }
] as const;
const BUDGET_PRESET_VALUES = [50000, 100000, 150000, 200000, 300000] as const;
const BUDGET_SLIDER_MIN = 0;
const BUDGET_SLIDER_MAX = 500000;
const BUDGET_SLIDER_STEP = 10000;
const ASSIST_LAST_DEPARTURE_KEY = "travelog-assist-last-departure";
const ASSIST_DEPARTURE_HISTORY_KEY = "travelog-assist-departure-history";
const ASSIST_DEPARTURE_HISTORY_LIMIT = 6;
const AIRPORT_PRESET_CANDIDATES = [
  { cityTokens: ["東京", "tokyo"], options: ["羽田空港 (HND)", "成田空港 (NRT)"] },
  { cityTokens: ["大阪", "osaka"], options: ["伊丹空港 (ITM)", "関西国際空港 (KIX)", "神戸空港 (UKB)"] },
  { cityTokens: ["札幌", "sapporo", "北海道", "hokkaido"], options: ["新千歳空港 (CTS)"] },
  { cityTokens: ["ソウル", "seoul"], options: ["仁川国際空港 (ICN)", "金浦国際空港 (GMP)"] },
  { cityTokens: ["台北", "taipei"], options: ["台北松山空港 (TSA)", "台湾桃園国際空港 (TPE)"] },
  { cityTokens: ["バンコク", "bangkok"], options: ["スワンナプーム国際空港 (BKK)", "ドンムアン国際空港 (DMK)"] },
  { cityTokens: ["シンガポール", "singapore"], options: ["チャンギ国際空港 (SIN)"] },
  { cityTokens: ["ローマ", "rome"], options: ["フィウミチーノ空港 (FCO)", "チャンピーノ空港 (CIA)"] },
  { cityTokens: ["ニューヨーク", "new york", "nyc"], options: ["ジョン・F・ケネディ国際空港 (JFK)", "ニューアーク国際空港 (EWR)", "ラガーディア空港 (LGA)"] }
] as const;

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

function formatBudgetLabel(value: number) {
  if (value <= 0) {
    return "未指定";
  }
  return `約${value.toLocaleString("ja-JP")}円`;
}

function normalizeTimeString(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return "";
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    ![0, 30].includes(minutes)
  ) {
    return "";
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeStringToSliderValue(value: string) {
  const normalized = normalizeTimeString(value);
  if (!normalized) {
    return 24;
  }
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 2 + (minutes >= 30 ? 1 : 0);
}

function sliderValueToTimeString(value: number) {
  const safeValue = Math.max(0, Math.min(47, Math.round(value)));
  const hours = Math.floor(safeValue / 2);
  const minutes = safeValue % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function formatTimePreferenceLabel(value: string) {
  return normalizeTimeString(value) || "指定なし";
}

function normalizeAirportLookupText(value: string) {
  return value.trim().toLowerCase();
}

function getAirportOptionsForPlace(value: string) {
  const normalized = normalizeAirportLookupText(value);
  if (!normalized) {
    return [] as string[];
  }
  const match = AIRPORT_PRESET_CANDIDATES.find((item) =>
    item.cityTokens.some((token) => normalized.includes(token))
  );
  return match ? [...match.options] : [];
}

function TimeSliderField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const sliderValue = timeStringToSliderValue(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100"
        >
          未指定
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-900">{formatTimePreferenceLabel(value)}</span>
        <span className="text-[11px] font-semibold text-slate-400">30分刻み</span>
      </div>
      <input
        type="range"
        min={0}
        max={47}
        step={1}
        value={sliderValue}
        onChange={(event) => onChange(sliderValueToTimeString(Number(event.target.value)))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
      />
      <div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-400">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:30</span>
      </div>
    </div>
  );
}

function describeTravelStyle(value: string) {
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

function extractTimeOnly(value?: string | null) {
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

function cleanAssistString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAssistNumber(value: unknown) {
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

function normalizeFlightRecommendation(raw: unknown): FlightRecommendation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const depTime =
    cleanAssistString(record.depTime) ||
    cleanAssistString(record.dep_time) ||
    cleanAssistString(record.departureTime) ||
    cleanAssistString(record.departure_time) ||
    cleanAssistString(
      record.departure_airport &&
        typeof record.departure_airport === "object" &&
        !Array.isArray(record.departure_airport)
        ? (record.departure_airport as Record<string, unknown>).time
        : ""
    ) ||
    null;
  const arrTime =
    cleanAssistString(record.arrTime) ||
    cleanAssistString(record.arr_time) ||
    cleanAssistString(record.arrivalTime) ||
    cleanAssistString(record.arrival_time) ||
    cleanAssistString(
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
          station: cleanAssistString(item.station) || null,
          serviceName: cleanAssistString(item.serviceName ?? item.service_name) || null,
          arrTime: cleanAssistString(item.arrTime ?? item.arr_time) || null,
          depTime: cleanAssistString(item.depTime ?? item.dep_time) || null
        }))
    : [];

  return {
    airline: cleanAssistString(record.airline) || null,
    airlineLogo: cleanAssistString(record.airlineLogo ?? record.airline_logo) || null,
    flightNumber:
      cleanAssistString(record.flightNumber ?? record.flight_number ?? record.serviceName) || null,
    from: cleanAssistString(record.from) || null,
    to: cleanAssistString(record.to) || null,
    depTime,
    arrTime,
    price: parseAssistNumber(record.price),
    currency: cleanAssistString(record.currency) || null,
    stops: parseAssistNumber(record.stops),
    via: via && via.length > 0 ? via : null,
    transfers,
    totalDurationMinutes:
      parseAssistNumber(record.totalDurationMinutes ?? record.total_duration ?? record.duration),
    link: cleanAssistString(record.link ?? record.url ?? record.googleFlightsUrl) || null,
    source: cleanAssistString(record.source) || "serpapi/google_flights"
  };
}

function formatFlightTimeValue(value?: string | null) {
  const direct = extractTimeOnly(value);
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
    return `${String(parseable.getHours()).padStart(2, "0")}:${String(parseable.getMinutes()).padStart(2, "0")}`;
  }
  return "—:—";
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

function formatFlightPrice(price?: number | null, currency?: string | null) {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return "価格未取得";
  }
  const normalizedCurrency = (currency || "JPY").toUpperCase() === "USD" ? "USD" : "JPY";
  return `${normalizedCurrency} ${Math.round(price).toLocaleString("ja-JP")}`;
}

function inferRequestedFlightClassPreference(text: string) {
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

function inferRequestedNonstopOnly(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return /直行便|ノンストップ|nonstop|direct flight/.test(normalized);
}

function buildSelectedFlightSummary(label: string, flight: FlightRecommendation) {
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

function buildTransportFromFlightRecommendation(flight: FlightRecommendation) {
  return {
    type: "飛行機",
    name: flight.airline ?? null,
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

function normalizeDepartureValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function readDepartureHistory() {
  if (typeof window === "undefined") {
    return { last: "", history: [] as string[] };
  }
  const last = normalizeDepartureValue(localStorage.getItem(ASSIST_LAST_DEPARTURE_KEY) || "");
  try {
    const raw = JSON.parse(localStorage.getItem(ASSIST_DEPARTURE_HISTORY_KEY) || "[]");
    const history = Array.isArray(raw)
      ? raw
          .filter((item): item is string => typeof item === "string")
          .map(normalizeDepartureValue)
          .filter(Boolean)
      : [];
    return { last, history };
  } catch {
    return { last, history: [] as string[] };
  }
}

function writeDepartureHistory(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeDepartureValue(value);
  if (!normalized) {
    return;
  }
  const { history } = readDepartureHistory();
  const nextHistory = [normalized, ...history.filter((item) => item !== normalized)].slice(
    0,
    ASSIST_DEPARTURE_HISTORY_LIMIT
  );
  localStorage.setItem(ASSIST_LAST_DEPARTURE_KEY, normalized);
  localStorage.setItem(ASSIST_DEPARTURE_HISTORY_KEY, JSON.stringify(nextHistory));
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

function AssistDateRangePicker({
  startDate,
  endDate,
  onChange
}: {
  startDate: string;
  endDate: string;
  onChange: (nextStartDate: string, nextEndDate: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState<Date | null>(null);
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const start = parseDateInputValue(startDate);
  const end = parseDateInputValue(endDate);
  let rangeStartDate = start;
  let rangeEndDate = end || start;
  if (rangeStartDate && rangeEndDate && isAfter(rangeStartDate, rangeEndDate)) {
    const swap = rangeStartDate;
    rangeStartDate = rangeEndDate;
    rangeEndDate = swap;
  }
  const rangeNights =
    rangeStartDate && rangeEndDate
      ? Math.max(0, differenceInCalendarDays(rangeEndDate, rangeStartDate))
      : null;

  useEffect(() => {
    const nextDate = parseDateInputValue(startDate);
    setMonth(startOfMonth(nextDate || new Date()));
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

  const popup =
    isOpen && popupStyle && typeof window !== "undefined"
      ? createPortal(
          <div
            ref={popupRef}
            className="fixed z-[1200] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_28px_80px_-28px_rgba(15,23,42,0.35)]"
            style={{
              top: popupStyle.top,
              left: popupStyle.left,
              width: popupStyle.width
            }}
          >
            <p className="text-xs font-medium text-slate-600">
              {anchorDate
                ? "終了日を選択してください（外側タップで閉じる）"
                : "開始日→終了日を順に選択（外側タップで閉じる）"}
            </p>
            {rangeStartDate && rangeEndDate ? (
              <p className="mt-1 text-sm font-bold text-slate-900">
                {format(rangeStartDate, "M/d")} - {format(rangeEndDate, "M/d")}
                {rangeNights !== null ? ` (${rangeNights}泊)` : ""}
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
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  aria-label="前の月"
                >
                  前月
                </button>
                <button
                  type="button"
                  onClick={() => setMonth((current) => addMonths(current, 1))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  aria-label="次の月"
                >
                  次月
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-x-1 gap-y-2 text-center text-xs font-bold text-slate-500">
              {["日", "月", "火", "水", "木", "金", "土"].map((label) => (
                <span key={`${format(month, "yyyy-MM")}-${label}`}>{label}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-x-0 gap-y-2">
              {buildMonthCells(month).map((cell, index) => {
                if (!cell) {
                  return <span key={`blank-${format(month, "yyyy-MM")}-${index}`} className="h-10" />;
                }
                const isToday = isSameDay(cell, startOfDay(new Date()));
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
                  ? "rounded-lg bg-sky-600 shadow-sm"
                  : isRangeStart
                    ? "rounded-l-lg bg-sky-600 shadow-sm"
                    : isRangeEnd
                      ? "rounded-r-lg bg-sky-600 shadow-sm"
                      : inRange
                        ? "bg-sky-100"
                        : "rounded-lg hover:bg-slate-100";
                return (
                  <div key={toDateInput(cell)} className={`h-10 ${wrapperClass}`}>
                    <button
                      type="button"
                      onClick={() => {
                        const selectedDate = startOfDay(cell);
                        if (!anchorDate) {
                          setAnchorDate(selectedDate);
                          return;
                        }
                        const nextStart = isAfter(anchorDate, selectedDate)
                          ? selectedDate
                          : anchorDate;
                        const nextEnd = isAfter(anchorDate, selectedDate)
                          ? anchorDate
                          : selectedDate;
                        onChange(toDateInput(nextStart), toDateInput(nextEnd));
                        setAnchorDate(null);
                        setIsOpen(false);
                      }}
                      className={`h-10 w-full rounded-lg text-base font-bold transition ${
                        isBlueEdge
                          ? "text-white"
                          : "text-slate-800"
                      }`}
                    >
                      <span className="flex h-full w-full flex-col items-center justify-center leading-none">
                        <span>{format(cell, "d")}</span>
                        {isToday ? (
                          <span
                            className={`mt-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                              isBlueEdge ? "text-white/85" : "text-sky-600"
                            }`}
                          >
                            today
                          </span>
                        ) : null}
                      </span>
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
    <div ref={wrapperRef} className="relative mt-1.5">
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
        <span
          className={`text-sm font-medium ${
            rangeStartDate ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {rangeStartDate && rangeEndDate
            ? `${format(rangeStartDate, "M/d")} - ${format(rangeEndDate, "M/d")}`
            : "日程を選択"}
        </span>
        <span className="text-xs font-semibold text-blue-600">
          {isOpen ? "閉じる" : "選択"}
        </span>
      </button>
      {popup}
    </div>
  );
}

function AssistCreateContent({ user }: { user: User }) {
  const router = useRouter();
  const [departure, setDeparture] = useState("");
  const [destination, setDestination] = useState("");
  const [departureAirportPreference, setDepartureAirportPreference] = useState("");
  const [destinationAirportPreference, setDestinationAirportPreference] = useState("");
  const [departureAirportSuggestions, setDepartureAirportSuggestions] = useState<AirportSuggestion[]>([]);
  const [destinationAirportSuggestions, setDestinationAirportSuggestions] = useState<AirportSuggestion[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [destinationScope, setDestinationScope] =
    useState<(typeof DESTINATION_SCOPE_OPTIONS)[number]>("海外");
  const [departureHistory, setDepartureHistory] = useState<string[]>([]);
  const [travelerCount, setTravelerCount] = useState("2");
  const [travelStyle, setTravelStyle] =
    useState<(typeof TRAVEL_STYLE_OPTIONS)[number]>("標準");
  const [travelerType, setTravelerType] = useState("大人のみ");
  const [budget, setBudget] = useState("");
  const [pace, setPace] = useState("標準");
  const [transportPreference, setTransportPreference] = useState("公共交通優先");
  const [hotelPreference, setHotelPreference] = useState("コスパ重視");
  const [interests, setInterests] = useState<string[]>(["グルメ", "観光名所"]);
  const [mustDo, setMustDo] = useState("");
  const [avoid, setAvoid] = useState("");
  const [notes, setNotes] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [transportModePriority, setTransportModePriority] = useState("指定なし");
  const [routePolicy, setRoutePolicy] = useState("バランス重視");
  const [transferLimit, setTransferLimit] = useState("制限なし");
  const [departureTimeBand, setDepartureTimeBand] = useState("指定なし");
  const [arrivalTimeBand, setArrivalTimeBand] = useState("指定なし");
  const [outboundPreferredDepartureTime, setOutboundPreferredDepartureTime] = useState("");
  const [outboundPreferredArrivalTime, setOutboundPreferredArrivalTime] = useState("");
  const [returnPreferredDepartureTime, setReturnPreferredDepartureTime] = useState("");
  const [returnPreferredArrivalTime, setReturnPreferredArrivalTime] = useState("");
  const [hotelGradePreference, setHotelGradePreference] = useState("指定なし");
  const [hotelAreaPreference, setHotelAreaPreference] = useState("");
  const [requiredSpots, setRequiredSpots] = useState("");
  const [creating, setCreating] = useState(false);
  const [flightChoiceLoading, setFlightChoiceLoading] = useState(false);
  const [flightChoiceOpen, setFlightChoiceOpen] = useState(false);
  const [flightChoiceError, setFlightChoiceError] = useState<string | null>(null);
  const [outboundFlightOptions, setOutboundFlightOptions] = useState<FlightRecommendation[]>([]);
  const [returnFlightOptions, setReturnFlightOptions] = useState<FlightRecommendation[]>([]);
  const [outboundFlightWarnings, setOutboundFlightWarnings] = useState<string[]>([]);
  const [returnFlightWarnings, setReturnFlightWarnings] = useState<string[]>([]);
  const [selectedOutboundIndex, setSelectedOutboundIndex] = useState(0);
  const [selectedReturnIndex, setSelectedReturnIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const budgetNumber = useMemo(() => {
    const parsed = Number(budget);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [budget]);
  const filteredDestinationSuggestions = useMemo(
    () => DESTINATION_SUGGESTIONS.filter((option) => option.scope === destinationScope),
    [destinationScope]
  );
  const departureAirportOptions = useMemo(() => {
    const apiOptions = departureAirportSuggestions.map((item) => item.label);
    return apiOptions.length > 0 ? apiOptions : getAirportOptionsForPlace(departure);
  }, [departure, departureAirportSuggestions]);
  const destinationAirportOptions = useMemo(() => {
    const apiOptions = destinationAirportSuggestions.map((item) => item.label);
    return apiOptions.length > 0 ? apiOptions : getAirportOptionsForPlace(destination);
  }, [destination, destinationAirportSuggestions]);

  useEffect(() => {
    if (
      departureAirportPreference &&
      departureAirportOptions.length > 0 &&
      !departureAirportOptions.includes(departureAirportPreference)
    ) {
      setDepartureAirportPreference("");
    }
    if (!departure.trim()) {
      setDepartureAirportPreference("");
    }
  }, [departure, departureAirportOptions, departureAirportPreference]);

  useEffect(() => {
    if (
      destinationAirportPreference &&
      destinationAirportOptions.length > 0 &&
      !destinationAirportOptions.includes(destinationAirportPreference)
    ) {
      setDestinationAirportPreference("");
    }
    if (!destination.trim()) {
      setDestinationAirportPreference("");
    }
  }, [destination, destinationAirportOptions, destinationAirportPreference]);

  useEffect(() => {
    const { last, history } = readDepartureHistory();
    if (last) {
      setDeparture((current) => current || last);
    }
    setDepartureHistory(history);
  }, []);

  useEffect(() => {
    let active = true;
    const query = departure.trim();
    if (query.length < 2) {
      setDepartureAirportSuggestions([]);
      return () => {
        active = false;
      };
    }
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/flights/airports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, locale: "ja", limit: 5 }),
          cache: "no-store"
        });
        const payload = (await response.json()) as { airports?: AirportSuggestion[] };
        if (!active) {
          return;
        }
        setDepartureAirportSuggestions(Array.isArray(payload.airports) ? payload.airports : []);
      } catch {
        if (!active) {
          return;
        }
        setDepartureAirportSuggestions([]);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [departure]);

  useEffect(() => {
    let active = true;
    const query = destination.trim();
    if (query.length < 2) {
      setDestinationAirportSuggestions([]);
      return () => {
        active = false;
      };
    }
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/flights/airports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, locale: "ja", limit: 5 }),
          cache: "no-store"
        });
        const payload = (await response.json()) as { airports?: AirportSuggestion[] };
        if (!active) {
          return;
        }
        setDestinationAirportSuggestions(Array.isArray(payload.airports) ? payload.airports : []);
      } catch {
        if (!active) {
          return;
        }
        setDestinationAirportSuggestions([]);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [destination]);

  const toDateOnly = (value: string | null | undefined) => {
    if (!value) {
      return "";
    }
    return value.trim().slice(0, 10);
  };

  const extractList = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (item) => typeof item === "string" || (item && typeof item === "object" && !Array.isArray(item))
        )
      : [];

  const canSubmit = useMemo(() => {
    if (creating || flightChoiceLoading) {
      return false;
    }
    if (!destination.trim() || !startDate || !endDate) {
      return false;
    }
    if (!travelerCount.trim() || Number(travelerCount) <= 0) {
      return false;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    if (end < start) {
      return false;
    }
    return true;
  }, [creating, flightChoiceLoading, departure, destination, startDate, endDate, travelerCount]);

  const toggleInterest = (value: string) => {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const requestFlightRecommendations = async ({
    from,
    to,
    date,
    limit = 12,
    travelClass,
    nonstopOnly,
    preferredDepartureTime,
    preferredArrivalTime
  }: {
    from: string;
    to: string;
    date: string;
    limit?: number;
    travelClass?: string;
    nonstopOnly?: boolean;
    preferredDepartureTime?: string;
    preferredArrivalTime?: string;
  }) => {
    const response = await fetch("/api/flights/recommendations", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        date,
        adults: Math.max(1, Number(travelerCount) || 1),
        locale: "ja",
        currency: "JPY",
        limit,
        budget: budgetNumber > 0 ? budgetNumber : undefined,
        travelStyle,
        travelClass,
        nonstopOnly,
        preferredDepartureTime: preferredDepartureTime || undefined,
        preferredArrivalTime: preferredArrivalTime || undefined
      })
    });

    const payload = (await response.json()) as FlightRecommendationsResponse;
    if (!response.ok) {
      throw new Error(
        payload.detail?.trim() ||
          payload.error?.trim() ||
          "フライト候補の取得に失敗しました。"
      );
    }

    return {
      recommendations: Array.isArray(payload.flights)
        ? payload.flights.filter(
            (item): item is FlightRecommendation =>
              normalizeFlightRecommendation(item) !== null
          ).map((item) => normalizeFlightRecommendation(item) as FlightRecommendation)
        : [],
      warnings: Array.isArray(payload.warnings)
        ? payload.warnings.map((item) => item.trim()).filter(Boolean)
        : []
    };
  };

  const buildBootPrompt = (selectedFlights?: {
    outbound?: FlightRecommendation | null;
    inbound?: FlightRecommendation | null;
  }) => {
    const budgetLine = budget.trim() ? `${budget.trim()}円` : "未指定";
    const travelStyleLine = describeTravelStyle(travelStyle);
    const interestsLine = interests.length > 0 ? interests.join("、") : "未指定";
    const mustDoLine = mustDo.trim() || "特になし";
    const avoidLine = avoid.trim() || "特になし";
    const notesLine = notes.trim() || "特になし";
    const hotelAreaLine = hotelAreaPreference.trim() || "指定なし";
    const requiredSpotsLine = requiredSpots.trim() || "指定なし";
    return [
      "以下の旅行条件で、実行しやすい旅行プランの下書きを作成してください。",
      "不明な情報はwarningsに要確認として出してください。",
      `目的地: ${destination.trim()}`,
      `出発地: ${departure.trim() || "未指定"}`,
      `出発空港の希望: ${departureAirportPreference || "自動"}`,
      `旅行日程: ${startDate || "未指定"} 〜 ${endDate || "未指定"}`,
      `到着空港の希望: ${destinationAirportPreference || "自動"}`,
      `同行人数: ${travelerCount.trim() || "2"}名`,
      `旅行タイプ: ${travelStyle}`,
      `同行者タイプ: ${travelerType}`,
      `予算目安: ${budgetLine}`,
      `旅行ペース: ${pace}`,
      `移動の希望: ${transportPreference}`,
      `ホテル条件: ${hotelPreference}`,
      `重視したいこと: ${interestsLine}`,
      `必ずやりたいこと: ${mustDoLine}`,
      `避けたいこと: ${avoidLine}`,
      "詳細条件（任意）:",
      `主要移動手段の優先: ${transportModePriority}`,
      `経路方針: ${routePolicy}`,
      `乗換の上限: ${transferLimit}`,
      `出発時間帯の希望: ${departureTimeBand}`,
      `到着時間帯の希望: ${arrivalTimeBand}`,
      `往路の出発希望時刻: ${outboundPreferredDepartureTime || "指定なし"}`,
      `往路の到着希望時刻: ${outboundPreferredArrivalTime || "指定なし"}`,
      `復路の出発希望時刻: ${returnPreferredDepartureTime || "指定なし"}`,
      `復路の到着希望時刻: ${returnPreferredArrivalTime || "指定なし"}`,
      `ホテルグレードの希望: ${hotelGradePreference}`,
      `ホテルエリアの希望: ${hotelAreaLine}`,
      `必ず含めたい訪問地・駅: ${requiredSpotsLine}`,
      `その他メモ: ${notesLine}`,
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
      selectedFlights?.outbound
        ? buildSelectedFlightSummary("往路", selectedFlights.outbound)
        : "",
      selectedFlights?.inbound
        ? buildSelectedFlightSummary("復路", selectedFlights.inbound)
        : "",
      "出力は旅行管理用の下書きとして、移動・ホテル・予定・持ち物を可能な範囲で埋めてください。"
    ].join("\n");
  };

  const submitAiPlan = async (selectedFlights?: {
    outbound?: FlightRecommendation | null;
    inbound?: FlightRecommendation | null;
  }) => {
    setCreating(true);
    setError(null);
    try {
      const requestedFlightClass = inferRequestedFlightClassPreference(
        [mustDo, avoid, notes, requiredSpots].join("\n")
      );
      const requestedNonstopOnly = inferRequestedNonstopOnly(
        [mustDo, avoid, notes, requiredSpots].join("\n")
      );
      const selectedTransportations = [
        selectedFlights?.outbound ? buildTransportFromFlightRecommendation(selectedFlights.outbound) : null,
        selectedFlights?.inbound ? buildTransportFromFlightRecommendation(selectedFlights.inbound) : null
      ].filter(Boolean);
      const formData = new FormData();
      formData.set("prompt", buildBootPrompt(selectedFlights));
      formData.set("assistantMode", "plan");
      formData.set("enableWebSearch", "true");
      formData.set(
        "currentPlan",
        JSON.stringify({
          departure: departure.trim(),
          destination: destination.trim(),
          departureAirportPreference: departureAirportPreference || null,
          destinationAirportPreference: destinationAirportPreference || null,
          startDate,
          endDate,
          budget: budget.trim(),
          travelStyle,
          flightClassPreference: requestedFlightClass,
          nonstopOnly: requestedNonstopOnly,
          outboundPreferredDepartureTime: outboundPreferredDepartureTime || null,
          outboundPreferredArrivalTime: outboundPreferredArrivalTime || null,
          returnPreferredDepartureTime: returnPreferredDepartureTime || null,
          returnPreferredArrivalTime: returnPreferredArrivalTime || null,
          transportations: selectedTransportations
        })
      );

      const response = await fetch("/api/ai-plan", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as {
        plan?: AiPlanSuggestion;
        detail?: string;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        const detail = payload.detail?.trim() || payload.error?.trim() || "";
        throw new Error(detail || "AIプランの生成に失敗しました。");
      }

      const plan = payload.plan;
      const path = await createPlan(user.uid);
      await updatePlan(path, {
        name: plan.name?.trim() || `${destination.trim()}旅行`,
        destination: plan.destination?.trim() || destination.trim(),
        memo: plan.memo?.trim() || null,
        startDate: toDateOnly(plan.startDate) || startDate,
        endDate: toDateOnly(plan.endDate) || endDate,
        transportations: extractList(plan.transportations) as Array<Record<string, unknown>>,
        hotels: extractList(plan.hotels) as Array<Record<string, unknown>>,
        activities: extractList(plan.activities) as Array<Record<string, unknown>>,
        packingList: extractList(plan.packingList) as Array<Record<string, unknown> | string>
      });
      if (departure.trim()) {
        writeDepartureHistory(departure);
        setDepartureHistory(readDepartureHistory().history);
      }
      router.push(`/plans/${encodeURIComponent(path)}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "AIプラン作成ページからのLog生成に失敗しました。");
    } finally {
      setCreating(false);
    }
  };

  const shouldPromptFlightSelection = useMemo(() => {
    if (!departure.trim() || !destination.trim() || !startDate || !endDate) {
      return false;
    }
    return true;
  }, [
    departure,
    destination,
    startDate,
    endDate
  ]);

  const fetchPreflightOptions = async () => {
    const requestedFlightClass = inferRequestedFlightClassPreference(
      [mustDo, avoid, notes, requiredSpots].join("\n")
    );
    const requestedNonstopOnly = inferRequestedNonstopOnly(
      [mustDo, avoid, notes, requiredSpots].join("\n")
    );
    const outbound = await requestFlightRecommendations({
      from: departureAirportPreference || departure.trim(),
      to: destinationAirportPreference || destination.trim(),
      date: startDate,
      limit: 12,
      travelClass: requestedFlightClass,
      nonstopOnly: requestedNonstopOnly,
      preferredDepartureTime: outboundPreferredDepartureTime,
      preferredArrivalTime: outboundPreferredArrivalTime
    });
    const inboundNeeded = Boolean(endDate && endDate !== startDate);
    const inbound = inboundNeeded
      ? await requestFlightRecommendations({
          from: destinationAirportPreference || destination.trim(),
          to: departureAirportPreference || departure.trim(),
          date: endDate,
          limit: 12,
          travelClass: requestedFlightClass,
          nonstopOnly: requestedNonstopOnly,
          preferredDepartureTime: returnPreferredDepartureTime,
          preferredArrivalTime: returnPreferredArrivalTime
        })
      : { recommendations: [] as FlightRecommendation[], warnings: [] as string[] };

    setOutboundFlightOptions(outbound.recommendations);
    setReturnFlightOptions(inbound.recommendations);
    setOutboundFlightWarnings(outbound.warnings);
    setReturnFlightWarnings(inbound.warnings);
    setSelectedOutboundIndex(0);
    setSelectedReturnIndex(0);
    return {
      hasAny: outbound.recommendations.length > 0 || inbound.recommendations.length > 0,
      hasOutbound: outbound.recommendations.length > 0,
      hasInbound: inbound.recommendations.length > 0
    };
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setError(null);
    if (!shouldPromptFlightSelection) {
      await submitAiPlan();
      return;
    }
    setFlightChoiceOpen(false);
    setOutboundFlightOptions([]);
    setReturnFlightOptions([]);
    setOutboundFlightWarnings([]);
    setReturnFlightWarnings([]);
    setFlightChoiceLoading(true);
    setFlightChoiceError(null);
    try {
      const result = await fetchPreflightOptions();
      if (!result.hasAny) {
        setFlightChoiceError("候補便を取得できませんでした。空港や日程を見直すか、便を選ばず続けてください。");
        setFlightChoiceOpen(true);
        return;
      }
      setFlightChoiceOpen(true);
    } catch (err) {
      setFlightChoiceError(
        err instanceof Error ? err.message : "候補便の取得に失敗しました。"
      );
      setError(err instanceof Error ? err.message : "候補便の取得に失敗しました。");
    } finally {
      setFlightChoiceLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {creating || flightChoiceLoading ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/28 backdrop-blur-[1px]">
          <div className="mx-4 w-full max-w-[360px] rounded-[24px] border border-slate-200 bg-white px-5 py-6 text-center shadow-[0_28px_72px_-28px_rgba(15,23,42,0.32)]">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
            <p className="mt-4 text-[18px] font-black tracking-[-0.02em] text-slate-950">
              {flightChoiceLoading ? "候補便を取得中" : "AIがプランを作成中"}
            </p>
            <p className="mt-2 text-sm leading-6 font-semibold text-slate-600">
              {flightChoiceLoading
                ? "出発地と日程から、往路・復路の候補便を確認しています。"
                : "行き先や日程から移動、ホテル、予定を組み立てています。"}
            </p>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Processing
              </p>
              <div className="mt-2 space-y-1.5 text-sm font-bold text-slate-800">
                {flightChoiceLoading ? (
                  <>
                    <p>出発地を確認</p>
                    <p>往路候補を取得</p>
                    <p>復路候補を取得</p>
                    <p>選択画面を準備</p>
                  </>
                ) : (
                  <>
                    <p>旅行条件を整理</p>
                    <p>移動候補を補完</p>
                    <p>ホテル候補を反映</p>
                    <p>最初の下書きを作成</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-cardSoft">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">旅行アシスト（ベータ）</h2>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
            BETA
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          まず行き先を決めて、必要最小限の条件だけで初期プランを作成します。細かい調整は作成後に相談できます。
        </p>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <label className="block text-sm font-bold text-slate-700">
            どこに行く？
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="例: 台北、北海道、バンコク、ローマ"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
          <div className="mt-3 flex items-center gap-2">
            {DESTINATION_SCOPE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDestinationScope(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  destinationScope === option
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-3 -mx-1 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-2 px-1">
            {filteredDestinationSuggestions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setDestination(option.label)}
                className={`group w-28 shrink-0 overflow-hidden rounded-2xl border text-left transition sm:w-32 ${
                  destination.trim() === option.label
                    ? "border-slate-900 ring-2 ring-slate-900/10"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="relative aspect-[2/3] w-full bg-slate-200">
                  <img
                    src={option.image}
                    alt={option.label}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <span className="text-base font-bold tracking-[0.02em] text-white">
                      {option.label}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
            日程
            <AssistDateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(nextStartDate, nextEndDate) => {
                setStartDate(nextStartDate);
                setEndDate(nextEndDate);
              }}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
            予算
            <div className="mt-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">
                  {formatBudgetLabel(budgetNumber)}
                </span>
                <input
                  value={budget}
                  onChange={(event) =>
                    setBudget(event.target.value.replace(/[^\d]/g, ""))
                  }
                  inputMode="numeric"
                  placeholder="未指定"
                  className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-right text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                />
              </div>
              <input
                type="range"
                min={BUDGET_SLIDER_MIN}
                max={BUDGET_SLIDER_MAX}
                step={BUDGET_SLIDER_STEP}
                value={Math.min(BUDGET_SLIDER_MAX, Math.max(BUDGET_SLIDER_MIN, budgetNumber))}
                onChange={(event) => setBudget(event.target.value)}
                className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {BUDGET_PRESET_VALUES.map((value) => {
                  const active = budgetNumber === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBudget(String(value))}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        active
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {value >= 10000 ? `${value / 10000}万円` : `${value.toLocaleString("ja-JP")}円`}
                    </button>
                  );
                })}
              </div>
            </div>
          </label>
          <div className="text-xs font-semibold text-slate-600 sm:col-span-2">
            旅行タイプ
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TRAVEL_STYLE_OPTIONS.map((option) => {
                const active = travelStyle === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTravelStyle(option)}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.8)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-bold">{option}</p>
                    <p
                      className={`mt-1 text-[11px] leading-5 ${
                        active ? "text-white/80" : "text-slate-500"
                      }`}
                    >
                      {option === "節約"
                        ? "LCCや価格優先"
                        : option === "快適"
                          ? "FSC寄りで移動を楽に"
                          : option === "プレミアム"
                            ? "FSCと高級ホテル寄り"
                            : "価格と快適性のバランス"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="text-xs font-semibold text-slate-600 sm:col-span-2">
            フライト希望時刻
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <TimeSliderField
                label="往路の出発"
                value={outboundPreferredDepartureTime}
                onChange={setOutboundPreferredDepartureTime}
              />
              <TimeSliderField
                label="往路の到着"
                value={outboundPreferredArrivalTime}
                onChange={setOutboundPreferredArrivalTime}
              />
              <TimeSliderField
                label="復路の出発"
                value={returnPreferredDepartureTime}
                onChange={setReturnPreferredDepartureTime}
              />
              <TimeSliderField
                label="復路の到着"
                value={returnPreferredArrivalTime}
                onChange={setReturnPreferredArrivalTime}
              />
            </div>
          </div>
          <label className="text-xs font-semibold text-slate-600">
            出発地
            <input
              value={departure}
              onChange={(event) => setDeparture(event.target.value)}
              placeholder="例: 東京、福岡"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
            {departureAirportOptions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDepartureAirportPreference("")}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    !departureAirportPreference
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  自動
                </button>
                {departureAirportOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDepartureAirportPreference(option)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      departureAirportPreference === option
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
            {departureHistory.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {departureHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDeparture(item)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      normalizeDepartureValue(departure) === item
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="text-xs font-semibold text-slate-600">
            同行人数
            <input
              value={travelerCount}
              onChange={(event) => setTravelerCount(event.target.value.replace(/[^\d]/g, ""))}
              placeholder="例: 2"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
            {destinationAirportOptions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDestinationAirportPreference("")}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    !destinationAirportPreference
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  自動
                </button>
                {destinationAirportOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDestinationAirportPreference(option)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      destinationAirportPreference === option
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-700"
          >
            <span>詳細条件（任意）</span>
            <span className="text-slate-500">{showAdvanced ? "閉じる" : "開く"}</span>
          </button>
          {showAdvanced ? (
            <div className="space-y-3 border-t border-slate-200 px-3 py-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  同行者タイプ
                  <select
                    value={travelerType}
                    onChange={(event) => setTravelerType(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                  >
                    <option>大人のみ</option>
                    <option>家族（子どもあり）</option>
                    <option>カップル</option>
                    <option>友人グループ</option>
                    <option>一人旅</option>
                    </select>
                  </label>
                <label className="text-xs font-semibold text-slate-600">
                  旅行ペース
                  <select
                    value={pace}
                    onChange={(event) => setPace(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                  >
                    <option>ゆったり</option>
                    <option>標準</option>
                    <option>アクティブ</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  移動の希望
                  <select
                    value={transportPreference}
                    onChange={(event) => setTransportPreference(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                  >
                    <option>公共交通優先</option>
                    <option>タクシー併用</option>
                    <option>レンタカー中心</option>
                    <option>移動は最小限</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  ホテル条件
                  <select
                    value={hotelPreference}
                    onChange={(event) => setHotelPreference(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                  >
                    <option>コスパ重視</option>
                    <option>駅近重視</option>
                    <option>朝食付き重視</option>
                    <option>高級ホテル重視</option>
                  </select>
                </label>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600">重視したいこと</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((option) => {
                    const active = interests.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleInterest(option)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                主要移動手段の優先
                <select
                  value={transportModePriority}
                  onChange={(event) => setTransportModePriority(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                >
                  {TRANSPORT_MODE_PRIORITY_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                経路方針
                <select
                  value={routePolicy}
                  onChange={(event) => setRoutePolicy(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                >
                  {ROUTE_POLICY_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                乗換制限
                <select
                  value={transferLimit}
                  onChange={(event) => setTransferLimit(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                >
                  {TRANSFER_LIMIT_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                出発時間帯
                <select
                  value={departureTimeBand}
                  onChange={(event) => setDepartureTimeBand(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                >
                  {TIME_BAND_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                到着時間帯
                <select
                  value={arrivalTimeBand}
                  onChange={(event) => setArrivalTimeBand(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                >
                  {TIME_BAND_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                ホテルグレード
                <select
                  value={hotelGradePreference}
                  onChange={(event) => setHotelGradePreference(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                >
                  {HOTEL_GRADE_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                ホテルエリアの希望
                <input
                  value={hotelAreaPreference}
                  onChange={(event) => setHotelAreaPreference(event.target.value)}
                  placeholder="例: 台北駅周辺、梅田駅徒歩圏"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                必ず含めたい訪問地・駅
                <input
                  value={requiredSpots}
                  onChange={(event) => setRequiredSpots(event.target.value)}
                  placeholder="例: 九份、台中、京都駅"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                />
              </label>
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  必ずやりたいこと
                  <textarea
                    value={mustDo}
                    onChange={(event) => setMustDo(event.target.value)}
                    rows={2}
                    placeholder="例: 九份に行きたい、温泉に入りたい"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  避けたいこと
                  <textarea
                    value={avoid}
                    onChange={(event) => setAvoid(event.target.value)}
                    rows={2}
                    placeholder="例: 朝が早すぎる移動、長時間の乗り換え"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  補足メモ
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    placeholder="例: 子ども連れ、スーツケース大きめ、予備日あり"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            MyLogに戻る
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating
              ? "AIで作成中..."
              : flightChoiceLoading
                ? "候補便を取得中..."
                : shouldPromptFlightSelection
                  ? "候補便を確認して作成"
                  : "AIでざっくり作成"}
          </button>
        </div>
      </div>
      {flightChoiceOpen && typeof window !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-900/35 p-4 backdrop-blur-sm sm:items-center">
              <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_28px_80px_-28px_rgba(15,23,42,0.45)]">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Step 1
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">先に候補便を選択</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      ここではまだプランは作成しません。便を選んだあとに AI がプランへ反映します。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFlightChoiceOpen(false)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    閉じる
                  </button>
                </div>
                <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
                  {flightChoiceError ? (
                    <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {flightChoiceError}
                    </div>
                  ) : null}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">往路</p>
                        <p className="text-xs text-slate-500">
                          {departure.trim() || "出発地未設定"} → {destination.trim() || "目的地未設定"} / {startDate}
                        </p>
                      </div>
                      {outboundFlightWarnings.length > 0 ? (
                        <div className="space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                          {outboundFlightWarnings.map((warning, index) => (
                            <p key={`assist-outbound-warning-${index}`}>・{warning}</p>
                          ))}
                        </div>
                      ) : null}
                      {outboundFlightOptions.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                          往路候補は見つかりませんでした。
                        </div>
                      ) : (
                        outboundFlightOptions.map((candidate, index) => {
                          const selected = index === selectedOutboundIndex;
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
                            <button
                              key={`assist-outbound-flight-${index}`}
                              type="button"
                              onClick={() => setSelectedOutboundIndex(index)}
                              className={`w-full rounded-3xl border p-4 text-left transition ${
                                selected
                                  ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_36px_-18px_rgba(15,23,42,0.8)]"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 flex-1 gap-3">
                                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${selected ? "bg-white/10" : "bg-slate-100"}`}>
                                    {candidate.airlineLogo ? (
                                      <img
                                        src={candidate.airlineLogo}
                                        alt={candidate.airline ?? "airline"}
                                        className="h-full w-full object-contain"
                                      />
                                    ) : (
                                      <span className={`text-xs font-black ${selected ? "text-white" : "text-slate-700"}`}>
                                        {(candidate.airline ?? "?").slice(0, 2).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className={`truncate text-base font-bold ${selected ? "text-white" : "text-slate-900"}`}>
                                        {candidate.airline || "航空会社未取得"}
                                      </p>
                                      {candidate.flightNumber ? (
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${selected ? "bg-white/15 text-white/85" : "bg-slate-100 text-slate-600"}`}>
                                          {candidate.flightNumber}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className={`mt-1 text-base font-semibold ${selected ? "text-white" : "text-slate-800"}`}>
                                      {times}
                                    </p>
                                    <p className={`mt-1 text-sm ${selected ? "text-white/75" : "text-slate-500"}`}>
                                      {(candidate.from ?? "").replace(/\s+/g, " ")} → {(candidate.to ?? "").replace(/\s+/g, " ")}
                                    </p>
                                    <p className={`mt-1 text-xs ${selected ? "text-white/75" : "text-slate-500"}`}>
                                      {meta || "詳細未取得"}
                                    </p>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className={`text-lg font-black ${selected ? "text-white" : "text-slate-900"}`}>
                                    {formatFlightPrice(candidate.price, candidate.currency)}
                                  </p>
                                  {candidate.link ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        window.open(candidate.link || "", "_blank", "noopener,noreferrer");
                                      }}
                                      className={`mt-3 text-xs font-semibold underline underline-offset-4 ${selected ? "text-white/80" : "text-slate-600"}`}
                                    >
                                      Google Flightsを開く
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">復路</p>
                        <p className="text-xs text-slate-500">
                          {destination.trim() || "目的地未設定"} → {departure.trim() || "出発地未設定"} / {endDate}
                        </p>
                      </div>
                      {returnFlightWarnings.length > 0 ? (
                        <div className="space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                          {returnFlightWarnings.map((warning, index) => (
                            <p key={`assist-return-warning-${index}`}>・{warning}</p>
                          ))}
                        </div>
                      ) : null}
                      {returnFlightOptions.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                          復路候補は見つかりませんでした。
                        </div>
                      ) : (
                        returnFlightOptions.map((candidate, index) => {
                          const selected = index === selectedReturnIndex;
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
                            <button
                              key={`assist-return-flight-${index}`}
                              type="button"
                              onClick={() => setSelectedReturnIndex(index)}
                              className={`w-full rounded-3xl border p-4 text-left transition ${
                                selected
                                  ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_36px_-18px_rgba(15,23,42,0.8)]"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 flex-1 gap-3">
                                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${selected ? "bg-white/10" : "bg-slate-100"}`}>
                                    {candidate.airlineLogo ? (
                                      <img
                                        src={candidate.airlineLogo}
                                        alt={candidate.airline ?? "airline"}
                                        className="h-full w-full object-contain"
                                      />
                                    ) : (
                                      <span className={`text-xs font-black ${selected ? "text-white" : "text-slate-700"}`}>
                                        {(candidate.airline ?? "?").slice(0, 2).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className={`truncate text-base font-bold ${selected ? "text-white" : "text-slate-900"}`}>
                                        {candidate.airline || "航空会社未取得"}
                                      </p>
                                      {candidate.flightNumber ? (
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${selected ? "bg-white/15 text-white/85" : "bg-slate-100 text-slate-600"}`}>
                                          {candidate.flightNumber}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className={`mt-1 text-base font-semibold ${selected ? "text-white" : "text-slate-800"}`}>
                                      {times}
                                    </p>
                                    <p className={`mt-1 text-sm ${selected ? "text-white/75" : "text-slate-500"}`}>
                                      {(candidate.from ?? "").replace(/\s+/g, " ")} → {(candidate.to ?? "").replace(/\s+/g, " ")}
                                    </p>
                                    <p className={`mt-1 text-xs ${selected ? "text-white/75" : "text-slate-500"}`}>
                                      {meta || "詳細未取得"}
                                    </p>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className={`text-lg font-black ${selected ? "text-white" : "text-slate-900"}`}>
                                    {formatFlightPrice(candidate.price, candidate.currency)}
                                  </p>
                                  {candidate.link ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        window.open(candidate.link || "", "_blank", "noopener,noreferrer");
                                      }}
                                      className={`mt-3 text-xs font-semibold underline underline-offset-4 ${selected ? "text-white/80" : "text-slate-600"}`}
                                    >
                                      Google Flightsを開く
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      setFlightChoiceOpen(false);
                      void submitAiPlan();
                    }}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    便を選ばず続ける
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const outbound =
                        outboundFlightOptions.length > 0
                          ? outboundFlightOptions[selectedOutboundIndex] ?? outboundFlightOptions[0]
                          : null;
                      const inbound =
                        returnFlightOptions.length > 0
                          ? returnFlightOptions[selectedReturnIndex] ?? returnFlightOptions[0]
                          : null;
                      setFlightChoiceOpen(false);
                      void submitAiPlan({ outbound, inbound });
                    }}
                    className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    この便で続ける
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default function AssistCreatePage() {
  return (
    <AuthGate>
      {(user) => (
        <PageShell title="旅行アシスト（ベータ）">
          <AssistCreateContent user={user} />
        </PageShell>
      )}
    </AuthGate>
  );
}
