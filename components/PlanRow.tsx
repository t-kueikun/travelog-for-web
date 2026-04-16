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
        className="relative z-10 rounded-[1rem] border border-[#b7cad9] bg-[#c3d5e1] px-[0.4rem] py-[0.35rem] transition-transform duration-200 ease-out hover:bg-[#bccfdd] will-change-transform"
        style={{ transform: `translateX(${translateX}px)`, touchAction: "pan-y" }}
      >
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1 rounded-[0.8rem] bg-white px-3 py-2.5">
            {scheduleLabel ? (
              <p className="text-[10px] font-semibold tracking-[-0.02em] text-black/65">
                {scheduleLabel.replace(" 〜 ", " ~ ")}
              </p>
            ) : null}
            <h3 className="mt-1 line-clamp-1 text-[1rem] font-semibold leading-[1.15] tracking-[-0.03em] text-black">
              {plan.name || "Untitled"}
            </h3>
            <p className="mt-1 text-[10px] font-semibold text-black/65">
              {plan.destination || "Destination"}
            </p>
            <div className="mt-2.5">
              <div className="flex items-center justify-between gap-2 text-[9px] font-semibold text-black/55">
                <span className="truncate">{progress.remainingLabel}</span>
                <span>{progress.progressLabel}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full border border-[#0d1e75]/20 bg-white">
                <div
                  className="h-full rounded-full bg-[#0d1e75]"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex w-[5rem] flex-col justify-between border-l border-dashed border-[#6f85a0] pl-2 pt-0.5 text-right">
            <div className="whitespace-pre-line text-[10px] font-semibold leading-[1.15] text-black/80">
              {departureLabel}
              {commentsCount > 0 ? (
                <span className="mt-1 block text-[9px] font-medium text-black/45">
                  {commentsCount} comments
                </span>
              ) : null}
            </div>
            <div className="self-end rounded-[0.45rem] bg-[#a9bfd1] px-3 py-1 text-[10px] font-semibold text-white">
              詳細
            </div>
          </div>
        </div>
        {canArchive && onArchive ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              data-row-action="true"
              onClick={(event) => {
                event.stopPropagation();
                onArchive(plan);
              }}
              className="rounded-full bg-white/70 px-2.5 py-1 text-[9px] font-semibold text-black/55 transition hover:bg-white"
            >
              {isArchived ? "アーカイブから戻す" : "アーカイブ"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
