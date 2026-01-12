"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TravelPlan } from "@/lib/firestore";
import { formatYen } from "@/lib/format";

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

function getProgress(plan: TravelPlan) {
  if (typeof plan.totalCost !== "number") {
    return {
      percent: 0,
      remainingLabel: "あと —",
      progressLabel: "—"
    };
  }
  const saved = getSavedAmount(plan) ?? 0;
  const safeTotal = plan.totalCost > 0 ? plan.totalCost : 0;
  const percent = safeTotal > 0 ? Math.min(100, Math.round((saved / safeTotal) * 100)) : 0;
  const remaining = Math.max(0, plan.totalCost - saved);

  return {
    percent,
    remainingLabel: `あと ${formatYen(remaining)}`,
    progressLabel: `${percent}%`
  };
}

type PlanRowProps = {
  plan: TravelPlan;
  canDelete?: boolean;
  onDelete?: (plan: TravelPlan) => void;
};

export default function PlanRow({ plan, canDelete = false, onDelete }: PlanRowProps) {
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

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
      }, 260);
      return;
    }
    setTranslateX(0);
  };

  const handleClick = () => {
    if (isDeleting || swipingRef.current || Math.abs(translateX) > 5) {
      swipingRef.current = false;
      return;
    }
    router.push(`/plans/${encodedPath}`);
  };

  const showDelete = canDelete && translateX < -4 && !isDeleting;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${
        isDeleting ? "pointer-events-none animate-burst-out" : ""
      }`}
    >
      {showDelete ? (
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-rose-500" />
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
            handleClick();
          }
        }}
        className="relative z-10 rounded-2xl card-surface p-4 shadow-cardSoft transition-transform hover:shadow-card duration-200 ease-out interactive-shadow will-change-transform"
        style={{ transform: `translateX(${translateX}px)`, touchAction: "pan-y" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {plan.name || "Untitled"}
            </h3>
            <p className="text-sm text-slate-500">
              {plan.destination || "Destination"}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <span className="block text-base font-semibold text-slate-900">
              {commentsCount}
            </span>
            コメント
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{progress.remainingLabel}</span>
            <span>{progress.progressLabel}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-slate-900/80"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
