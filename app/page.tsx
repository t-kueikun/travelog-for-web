"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import PlanRow from "@/components/PlanRow";
import { createPlan, deletePlan, getMyPlans, type TravelPlan } from "@/lib/firestore";

function MyLogContent({ user }: { user: User }) {
  const router = useRouter();
  const [plans, setPlans] = useState<TravelPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
      {error ? (
        <div className="rounded-2xl bg-white p-4 text-sm text-rose-500 shadow-cardSoft">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
          読み込み中...
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
          まだ旅行プランがありません。
        </div>
      ) : (
        plans.map((plan) => (
          <PlanRow
            key={plan.path}
            plan={plan}
            canDelete
            onDelete={async (target) => {
              const ok = window.confirm("このプランを削除しますか？");
              if (!ok) {
                return;
              }
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
