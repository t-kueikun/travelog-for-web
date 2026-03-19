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
                  return <span key={`blank-${format(month, "yyyy-MM")}-${index}`} className="h-10" />;
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
                      className={`h-10 w-full text-base font-semibold transition ${
                        isBlueEdge
                          ? "text-white"
                          : "text-slate-900"
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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelerCount, setTravelerCount] = useState("2");
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
  const [hotelGradePreference, setHotelGradePreference] = useState("指定なし");
  const [hotelAreaPreference, setHotelAreaPreference] = useState("");
  const [requiredSpots, setRequiredSpots] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (creating) {
      return false;
    }
    if (!departure.trim() || !destination.trim() || !startDate || !endDate) {
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
  }, [creating, departure, destination, startDate, endDate, travelerCount]);

  const toggleInterest = (value: string) => {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const buildBootPrompt = () => {
    const budgetLine = budget.trim() ? `${budget.trim()}円` : "未指定";
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
      `出発地: ${departure.trim()}`,
      `旅行日程: ${startDate || "未指定"} 〜 ${endDate || "未指定"}`,
      `同行人数: ${travelerCount.trim() || "2"}名`,
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
      `ホテルグレードの希望: ${hotelGradePreference}`,
      `ホテルエリアの希望: ${hotelAreaLine}`,
      `必ず含めたい訪問地・駅: ${requiredSpotsLine}`,
      `その他メモ: ${notesLine}`,
      "出力は旅行管理用の下書きとして、移動・ホテル・予定・持ち物を可能な範囲で埋めてください。"
    ].join("\n");
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("prompt", buildBootPrompt());
      formData.set("assistantMode", "plan");
      formData.set("enableWebSearch", "true");
      formData.set(
        "currentPlan",
        JSON.stringify({
          departure: departure.trim(),
          destination: destination.trim(),
          startDate,
          endDate
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
      router.push(`/plans/${encodeURIComponent(path)}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "AIプラン作成ページからのLog生成に失敗しました。");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-cardSoft">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">旅行アシスト（ベータ）</h2>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
            BETA
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          フォームを埋めるだけで初期プランを作成します。作成後は相談モードで調整できます。
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            出発地
            <input
              value={departure}
              onChange={(event) => setDeparture(event.target.value)}
              placeholder="例: 東京、福岡、台北市"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            目的地
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="例: 台北、北海道、バンコク"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            同行人数（名）
            <input
              value={travelerCount}
              onChange={(event) => setTravelerCount(event.target.value.replace(/[^\d]/g, ""))}
              placeholder="例: 2"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            同行者タイプ
            <select
              value={travelerType}
              onChange={(event) => setTravelerType(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            >
              <option>大人のみ</option>
              <option>家族（子どもあり）</option>
              <option>カップル</option>
              <option>友人グループ</option>
              <option>一人旅</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
            旅行日程
            <AssistDateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(nextStartDate, nextEndDate) => {
                setStartDate(nextStartDate);
                setEndDate(nextEndDate);
              }}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            予算（円）
            <input
              value={budget}
              onChange={(event) => setBudget(event.target.value.replace(/[^\d]/g, ""))}
              placeholder="例: 150000"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            旅行ペース
            <select
              value={pace}
              onChange={(event) => setPace(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
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
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
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
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            >
              <option>コスパ重視</option>
              <option>駅近重視</option>
              <option>朝食付き重視</option>
              <option>高級ホテル重視</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
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

        <div className="mt-3 grid gap-3">
          <label className="text-xs font-semibold text-slate-600">
            必ずやりたいこと
            <textarea
              value={mustDo}
              onChange={(event) => setMustDo(event.target.value)}
              rows={2}
              placeholder="例: 九份に行きたい、温泉に入りたい"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            避けたいこと
            <textarea
              value={avoid}
              onChange={(event) => setAvoid(event.target.value)}
              rows={2}
              placeholder="例: 朝が早すぎる移動、長時間の乗り換え"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            補足メモ
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="例: 子ども連れ、スーツケース大きめ、予備日あり"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300"
            />
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
            <div className="grid gap-3 border-t border-slate-200 px-3 py-3 sm:grid-cols-2">
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
            {creating ? "初期プランを作成中..." : "この条件でLog作成"}
          </button>
        </div>
      </div>
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
