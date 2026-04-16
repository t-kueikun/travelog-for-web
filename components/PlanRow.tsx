"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TravelPlan } from "@/lib/firestore";
import { formatDate, formatYen } from "@/lib/format";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function getPaidTotalFromItems(items: unknown) {
  if (!Array.isArray(items)) {
    return 0;
  }
  return items.reduce((sum, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return sum;
    }
    const record = item as Record<string, unknown>;
    const isPaid = toBoolean(record.paid ?? record.isPaid);
    if (!isPaid) {
      return sum;
    }
    const amount =
      toNumber(record.price) ??
      toNumber(record.amount) ??
      toNumber(record.cost) ??
      toNumber(record.fare);
    return sum + (amount ?? 0);
  }, 0);
}

function getSavedAmount(plan: TravelPlan): number | null {
  if (Array.isArray(plan.savingsHistory)) {
    return plan.savingsHistory.reduce<number>((sum, entry) => {
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
  if (typeof plan.savedAmount === "number") {
    return plan.savedAmount;
  }
  if (typeof plan.amount === "number") {
    return plan.amount;
  }
  return null;
}

function getCoveredAmount(plan: TravelPlan) {
  const saved = getSavedAmount(plan) ?? 0;
  const paidTransport = getPaidTotalFromItems(plan.transportations);
  const paidHotel = getPaidTotalFromItems(plan.hotels);
  return saved + paidTransport + paidHotel;
}

function getProgress(plan: TravelPlan) {
  if (typeof plan.totalCost !== "number") {
    return {
      percent: 0,
      remainingLabel: "あと —",
      progressLabel: "—"
    };
  }
  const saved = getCoveredAmount(plan);
  const safeTotal = plan.totalCost > 0 ? plan.totalCost : 0;
  const percent = safeTotal > 0 ? Math.min(100, Math.round((saved / safeTotal) * 100)) : 0;
  const remaining = Math.max(0, plan.totalCost - saved);

  return {
    percent,
    remainingLabel: `あと ${formatYen(remaining)}`,
    progressLabel: `${percent}%`
  };
}

function getScheduleLabel(plan: TravelPlan) {
  const start = formatDate(plan.startDate);
  const end = formatDate(plan.endDate);
  if (start && end) {
    return `${start} 〜 ${end}`;
  }
  if (start) {
    return `${start} 出発`;
  }
  if (end) {
    return `${end} まで`;
  }
  return "";
}

function toDate(value: TravelPlan["startDate"] | TravelPlan["endDate"]) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if ("toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function getDepartureLabel(plan: TravelPlan) {
  const start = toDate(plan.startDate);
  if (!start) {
    return "日程未定";
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  ).getTime();
  const diff = Math.round((target - today) / 86400000);
  if (diff > 0) {
    return `出発まで\n${diff} days`;
  }
  if (diff === 0) {
    return "今日出発";
  }
  return `${Math.abs(diff)} days前`;
}

type PlanRowProps = {
  plan: TravelPlan;
  canDelete?: boolean;
  onDelete?: (plan: TravelPlan) => void;
  canArchive?: boolean;
  onArchive?: (plan: TravelPlan) => void;
  confirmMessage?: string;
};

export default function PlanRow({
  plan,
  canDelete = false,
  onDelete,
  canArchive = false,
  onArchive
}: PlanRowProps) {
  const router = useRouter();
  const [translateX, setTranslateX] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const swipingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const progress = getProgress(plan);
  const commentsCount = typeof plan.commentsCount === "number" ? plan.commentsCount : 0;
  const encodedPath = encodeURIComponent(plan.path);
  const scheduleLabel = getScheduleLabel(plan);
  const departureLabel = getDepartureLabel(plan);
  const isArchived = plan.archived === true;

  const isRowActionTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(target.closest("[data-row-action='true']"));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isRowActionTarget(event.target)) {
      return;
    }
    if (!canDelete || isDeleting) {
      return;
    }
    draggingRef.current = true;
    swipingRef.current = false;
    startRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !canDelete || isDeleting) {
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
    const nextTranslate = Math.max(-140, Math.min(0, deltaX));
    setTranslateX(nextTranslate);
  };

  const handlePointerEnd = () => {
    if (!draggingRef.current || isDeleting) {
      return;
    }
    draggingRef.current = false;
    if (translateX <= -80 && canDelete && onDelete) {
      setIsDeleting(true);
      setTranslateX(0);
      if (deleteTimerRef.current) {
        window.clearTimeout(deleteTimerRef.current);
      }
      deleteTimerRef.current = window.setTimeout(() => {
        onDelete(plan);
      }, 220);
      return;
    }
    setTranslateX(0);
  };

  const openPlan = () => {
    if (isDeleting || swipingRef.current || Math.abs(translateX) > 5) {
      swipingRef.current = false;
      return;
    }
    router.push(`/plans/${encodedPath}`);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isRowActionTarget(event.target)) {
      return;
    }
    openPlan();
  };

  const showDelete = canDelete && translateX < -4 && !isDeleting;

  return (
    <div
      className={`relative overflow-hidden rounded-[1rem] ${
        isDeleting ? "pointer-events-none animate-slide-out" : ""
      }`}
    >
      {showDelete ? (
        <div className="pointer-events-none absolute inset-0 rounded-[1rem] bg-rose-500" />
      ) : null}
      {showDelete ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end pr-6 text-sm font-semibold text-white">
          削除
        </div>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            openPlan();
          }
        }}
        className="relative z-10 rounded-[1.35rem] border border-[#b7cad9] bg-[linear-gradient(180deg,#d3e0ea_0%,#c5d4e0_100%)] p-3 transition-transform duration-200 ease-out hover:bg-[#ccd9e4] will-change-transform sm:p-3.5"
        style={{ transform: `translateX(${translateX}px)`, touchAction: "pan-y" }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
          <div className="min-w-0 flex-1 rounded-[1.1rem] bg-white px-4 py-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.45)] sm:px-5 sm:py-5">
            {scheduleLabel ? (
              <p className="text-[11px] font-semibold tracking-[0.01em] text-slate-500 sm:text-xs">
                {scheduleLabel}
              </p>
            ) : null}
            <h3 className="mt-2 line-clamp-2 text-[1.15rem] font-semibold leading-[1.2] tracking-[-0.03em] text-slate-950 sm:text-[1.35rem] lg:text-[1.5rem]">
              {plan.name || "Untitled"}
            </h3>
            <p className="mt-2 text-sm font-medium text-slate-600 sm:text-[15px]">
              {plan.destination || "Destination"}
            </p>
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-500 sm:text-[13px]">
                <span>{progress.remainingLabel}</span>
                <span>進捗 {progress.progressLabel}</span>
                {commentsCount > 0 ? <span>{commentsCount} comments</span> : null}
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#0d1e75]"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-row items-center justify-between gap-3 rounded-[1rem] border border-white/60 bg-white/35 px-4 py-3 backdrop-blur-sm lg:w-[12rem] lg:flex-col lg:items-stretch lg:justify-between lg:border-l lg:border-t-0 lg:px-4 lg:py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Departure
              </p>
              <p className="mt-1 whitespace-pre-line text-sm font-semibold leading-[1.25] text-slate-900 sm:text-[15px] lg:text-base">
                {departureLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-stretch">
              <div className="rounded-full bg-[#9eb7cb] px-4 py-2 text-xs font-semibold text-white text-center shadow-[0_10px_18px_-16px_rgba(15,23,42,0.65)]">
                詳細を見る
              </div>
              {canArchive && onArchive ? (
                <button
                  type="button"
                  data-row-action="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    onArchive(plan);
                  }}
                  className="rounded-full bg-white/85 px-3.5 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-white"
                >
                  {isArchived ? "戻す" : "アーカイブ"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
