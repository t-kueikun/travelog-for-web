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
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-white/70 bg-white/60 px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.4)] backdrop-blur-md">
        旅の予定をカードで一覧化。新規作成は右上の `+`、AI作成は下部タブから開けます。
      </div>
      {creationError || error ? (
        <div className="rounded-[1.4rem] bg-white p-3.5 text-sm text-rose-500 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.4)]">
          {creationError ?? error}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-[1.4rem] bg-white p-3.5 text-sm text-slate-500 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.4)]">
          読み込み中...
        </div>
      ) : visiblePlans.length === 0 ? (
        <div className="rounded-[1.7rem] border border-[rgba(199,210,224,0.95)] bg-[#fffdfa] p-4 shadow-[7px_9px_0_rgba(190,205,222,0.88)]">
          <p className="text-base font-semibold text-slate-900">まだ旅行プランがありません。</p>
          <p className="mt-2 text-sm text-slate-500">
            右上の `+` から新しいLogを作成できます。
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-full border border-white/80 bg-white/80 p-1 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl">
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
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                      active
                        ? "bg-[#dbe4ec] text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {option.label}
                      <span className={`ml-1.5 text-[10px] ${active ? "text-slate-600" : "text-slate-400"}`}>
                        {option.count}件
                      </span>
                    </button>
                );
              })}
            </div>
          </div>

          <section className="space-y-3.5">
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
              <div className="rounded-[1.4rem] bg-white p-3.5 text-sm text-slate-500 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.4)]">
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
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-700 shadow-[0_10px_22px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition hover:bg-white disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
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
