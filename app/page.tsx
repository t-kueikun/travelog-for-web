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

function MyLogContent({ user }: { user: User }) {
  const router = useRouter();
  const [plans, setPlans] = useState<TravelPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
    <div className="space-y-4">
      <button
        type="button"
        disabled={creating}
        onClick={async () => {
          setCreating(true);
          setError(null);
          try {
            const path = await createPlan(user.uid);
            router.push(`/plans/${encodeURIComponent(path)}`);
          } catch (err) {
            setError("新しいLogの作成に失敗しました。");
            console.error(err);
          } finally {
            setCreating(false);
          }
        }}
        className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-4 text-sm font-semibold text-slate-600 shadow-cardSoft transition hover:bg-slate-50 disabled:opacity-60"
      >
        {creating ? "作成中..." : "新しいLogを作成"}
      </button>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => router.push("/plans/assist")}
          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          旅行アシスト（ベータ）を開く
        </button>
      </div>
      {error ? (
        <div className="rounded-2xl bg-white p-4 text-sm text-rose-500 shadow-cardSoft">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
          読み込み中...
        </div>
      ) : visiblePlans.length === 0 ? (
        <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
          まだ旅行プランがありません。
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex gap-2">
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
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                  <span className={`ml-2 text-xs ${active ? "text-white/80" : "text-slate-400"}`}>
                    {option.count}件
                  </span>
                </button>
              );
            })}
          </div>

          <section className="space-y-3">
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
              <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
                {timelineView === "upcoming" ? "予定中の旅行はありません。" : "過去の旅行はありません。"}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function MyLogPage() {
  return (
    <AuthGate>
      {(user) => (
        <PageShell title="MyLog">
          <MyLogContent user={user} />
        </PageShell>
      )}
    </AuthGate>
  );
}
