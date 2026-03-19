"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import { signOutUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  archivePlan,
  getMyPlans,
  resetMyPlans,
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

function SettingsContent({ user }: { user: User }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [archivedPlans, setArchivedPlans] = useState<TravelPlan[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(true);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const sortedArchivedPlans = useMemo(
    () => sortPlansBySchedule(archivedPlans),
    [archivedPlans]
  );

  useEffect(() => {
    let active = true;
    setLoadingArchived(true);
    getMyPlans(user.uid)
      .then((data) => {
        if (active) {
          setArchivedPlans(data.filter((plan) => plan.archived === true));
        }
      })
      .catch((err) => {
        if (active) {
          setError("アーカイブ一覧の読み込みに失敗しました。");
        }
        console.error(err);
      })
      .finally(() => {
        if (active) {
          setLoadingArchived(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user.uid]);

  const handleReset = async () => {
    const ok = window.confirm("データをリセットしますか？この操作は取り消せません。");
    if (!ok) {
      return;
    }
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      await resetMyPlans(user.uid);
      setMessage("データをリセットしました。");
    } catch (err) {
      setError("データのリセットに失敗しました。");
      console.error(err);
    } finally {
      setPending(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOutUser();
    } catch (err) {
      setError("ログアウトに失敗しました。");
      console.error(err);
    } finally {
      setSigningOut(false);
    }
  };

  const handleRestoreArchive = async (plan: TravelPlan) => {
    setRestoringPath(plan.path);
    setError(null);
    setMessage(null);
    try {
      await archivePlan(plan.path, false);
      setArchivedPlans((prev) => prev.filter((item) => item.path !== plan.path));
      setMessage(`「${plan.name || "プラン"}」をアーカイブから戻しました。`);
    } catch (err) {
      setError("アーカイブの復元に失敗しました。");
      console.error(err);
    } finally {
      setRestoringPath(null);
    }
  };

  return (
    <PageShell title="設定" showSettings={false}>
      <div className="space-y-4">
        {message ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-emerald-600 shadow-cardSoft">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-rose-500 shadow-cardSoft">
            {error}
          </div>
        ) : null}
        <div className="rounded-2xl bg-white p-5 shadow-cardSoft">
          <h2 className="text-base font-semibold text-slate-900">アカウント</h2>
          <p className="mt-2 text-sm text-slate-500">
            {user.email ?? "ログイン中のユーザー"}
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-4 w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
          >
            ログアウト
          </button>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-cardSoft">
          <h2 className="text-base font-semibold text-slate-900">データ管理</h2>
          <p className="mt-2 text-sm text-slate-500">
            旅行プランのデータをリセットします。
          </p>
          <button
            type="button"
            onClick={handleReset}
            disabled={pending}
            className="mt-4 w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-900"
          >
            データをリセット
          </button>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-cardSoft">
          <h2 className="text-base font-semibold text-slate-900">アーカイブ</h2>
          <p className="mt-2 text-sm text-slate-500">
            アーカイブ済みのLogを確認して復元できます。
          </p>
          {loadingArchived ? (
            <p className="mt-3 text-sm text-slate-500">読み込み中...</p>
          ) : sortedArchivedPlans.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              アーカイブされたLogはありません。
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {sortedArchivedPlans.map((plan) => {
                const start = formatDate(plan.startDate);
                const end = formatDate(plan.endDate);
                const schedule = start && end ? `${start} 〜 ${end}` : start || end || "";
                const restoring = restoringPath === plan.path;
                return (
                  <div
                    key={plan.path}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {plan.name || "Untitled"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {plan.destination || "Destination"}
                      {schedule ? ` ・ ${schedule}` : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/plans/${encodeURIComponent(plan.path)}`)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        開く
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestoreArchive(plan)}
                        disabled={restoring}
                        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {restoring ? "復元中..." : "アーカイブから戻す"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

export default function SettingsPage() {
  return (
    <AuthGate>{(user) => <SettingsContent user={user} />}</AuthGate>
  );
}
