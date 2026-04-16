"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import PlanRow from "@/components/PlanRow";
import {
  archivePlan,
  createPlan,
  deletePlan,
  getMyPlans,
  type TravelPlan
} from "@/lib/firestore";

function toDateEpoch(value: TravelPlan["startDate"] | TravelPlan["endDate"]) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    const time = parsed.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if ("toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    const time = parsed.getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

function compareOptionalDateDesc(a: number | null, b: number | null) {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b - a;
}

function compareOptionalDateAsc(a: number | null, b: number | null) {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

function sortPlansBySchedule(items: TravelPlan[]) {
  return [...items].sort((a, b) => {
    const startCompare = compareOptionalDateDesc(
      toDateEpoch(a.startDate),
      toDateEpoch(b.startDate)
    );
    if (startCompare !== 0) {
      return startCompare;
    }
    const endCompare = compareOptionalDateDesc(
      toDateEpoch(a.endDate),
      toDateEpoch(b.endDate)
    );
    if (endCompare !== 0) {
      return endCompare;
    }
    return (a.name || "").localeCompare(b.name || "", "ja");
  });
}

function getTodayStartEpoch() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function sortUpcomingPlans(items: TravelPlan[]) {
  return [...items].sort((a, b) => {
    const startCompare = compareOptionalDateAsc(
      toDateEpoch(a.startDate),
      toDateEpoch(b.startDate)
    );
    if (startCompare !== 0) {
      return startCompare;
    }
    const endCompare = compareOptionalDateAsc(
      toDateEpoch(a.endDate),
      toDateEpoch(b.endDate)
    );
    if (endCompare !== 0) {
      return endCompare;
    }
    return (a.name || "").localeCompare(b.name || "", "ja");
  });
}

function sortPastPlans(items: TravelPlan[]) {
  return sortPlansBySchedule(items);
}

function splitPlansByTimeline(items: TravelPlan[]) {
  const todayStart = getTodayStartEpoch();
  const upcoming: TravelPlan[] = [];
  const past: TravelPlan[] = [];

  items.forEach((plan) => {
    const endEpoch = toDateEpoch(plan.endDate) ?? toDateEpoch(plan.startDate);
    if (endEpoch !== null && endEpoch < todayStart) {
      past.push(plan);
      return;
    }
    upcoming.push(plan);
  });

  return {
    upcoming: sortUpcomingPlans(upcoming),
    past: sortPastPlans(past)
  };
}

function MyLogContent({
  user,
  creationError
}: {
  user: User;
  creationError: string | null;
}) {
  const [plans, setPlans] = useState<TravelPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineView, setTimelineView] = useState<"upcoming" | "past">("upcoming");
  const sortedPlans = useMemo(() => sortPlansBySchedule(plans), [plans]);
  const visiblePlans = useMemo(
    () => sortedPlans.filter((plan) => plan.archived !== true),
    [sortedPlans]
  );
  const planSections = useMemo(() => splitPlansByTimeline(visiblePlans), [visiblePlans]);
  const activePlans = timelineView === "upcoming" ? planSections.upcoming : planSections.past;

  useEffect(() => {
    if (timelineView === "upcoming" && planSections.upcoming.length === 0 && planSections.past.length > 0) {
      setTimelineView("past");
      return;
    }
    if (timelineView === "past" && planSections.past.length === 0 && planSections.upcoming.length > 0) {
      setTimelineView("upcoming");
    }
  }, [planSections.past.length, planSections.upcoming.length, timelineView]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getMyPlans(user.uid)
      .then((data) => {
        if (active) {
          setPlans(data);
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError("MyLogの読み込みに失敗しました。");
        }
        console.error(err);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user.uid]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {creationError || error ? (
        <div className="rounded-[1rem] bg-white/90 p-3 text-sm text-rose-500 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)]">
          {creationError ?? error}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-[1rem] bg-white/90 p-3 text-sm text-slate-500 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)]">
          読み込み中...
        </div>
      ) : visiblePlans.length === 0 ? (
        <div className="rounded-[1rem] bg-white p-4 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)]">
          <p className="text-base font-semibold text-slate-900 sm:text-lg">まだ旅行プランがありません。</p>
          <p className="mt-2 text-sm text-slate-500 sm:text-[15px]">
            右上の `+` から新しいLogを作成できます。
          </p>
        </div>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          <div className="rounded-full bg-white/85 p-1 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.22)] backdrop-blur-xl">
            <div className="grid grid-cols-2 gap-1">
              {[
                { key: "upcoming" as const, label: "今後の旅行", count: planSections.upcoming.length },
                { key: "past" as const, label: "これまでの旅行", count: planSections.past.length }
              ].map((option) => {
                const active = timelineView === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTimelineView(option.key)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition sm:px-4 sm:py-2 sm:text-[13px] ${
                      active
                        ? "bg-[#e5e5e8] text-[#0d1e75]"
                        : "text-slate-500 hover:text-[#0d1e75]"
                    }`}
                  >
                    {option.label}
                      <span className={`ml-1.5 text-[10px] sm:text-[11px] ${active ? "text-[#0d1e75]/70" : "text-slate-400"}`}>
                        {option.count}件
                      </span>
                    </button>
                );
              })}
            </div>
          </div>

          <section className="space-y-3.5 sm:space-y-4">
            {activePlans.length > 0 ? (
              activePlans.map((plan) => (
                <PlanRow
                  key={plan.path}
                  plan={plan}
                  canDelete
                  canArchive
                  onArchive={async (target) => {
                    try {
                      const nextArchived = !(target.archived === true);
                      await archivePlan(target.path, nextArchived);
                      setPlans((prev) =>
                        prev.map((item) =>
                          item.path === target.path ? { ...item, archived: nextArchived } : item
                        )
                      );
                    } catch (err) {
                      setError("アーカイブ更新に失敗しました。");
                      console.error(err);
                    }
                  }}
                  onDelete={async (target) => {
                    try {
                      await deletePlan(target.path);
                      setPlans((prev) => prev.filter((item) => item.path !== target.path));
                    } catch (err) {
                      setError("プランの削除に失敗しました。");
                      console.error(err);
                    }
                  }}
                />
              ))
            ) : (
              <div className="rounded-[1rem] bg-white/90 p-3 text-sm text-slate-500 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)]">
                {timelineView === "upcoming" ? "予定中の旅行はありません。" : "過去の旅行はありません。"}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MyLogPageInner({ user }: { user: User }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (creating) {
      return;
    }
    setCreating(true);
    setCreationError(null);
    try {
      const path = await createPlan(user.uid);
      router.push(`/plans/${encodeURIComponent(path)}`);
    } catch (err) {
      setCreationError("新しいLogの作成に失敗しました。");
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageShell
      title="MyLog"
      showSettings
      headerRight={
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          aria-label="新しいLogを作成"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#0d1e75] transition hover:bg-white/35 disabled:opacity-50 sm:h-10 sm:w-10"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5.25v13.5M5.25 12h13.5" />
          </svg>
        </button>
      }
    >
      <MyLogContent user={user} creationError={creationError} />
    </PageShell>
  );
}

export default function MyLogPage() {
  return (
    <AuthGate>
      {(user) => <MyLogPageInner user={user} />}
    </AuthGate>
  );
}
