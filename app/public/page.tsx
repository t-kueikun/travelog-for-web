"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import PlanRow from "@/components/PlanRow";
import { getPublicPlans, type TravelPlan } from "@/lib/firestore";

function PublicLogContent() {
  const [plans, setPlans] = useState<TravelPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getPublicPlans()
      .then((data) => {
        if (active) {
          setPlans(data);
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError("みんなのLogの読み込みに失敗しました。");
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
  }, []);

  return (
    <div className="space-y-4">
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
          公開されたプランがありません。
        </div>
      ) : (
        plans.map((plan) => <PlanRow key={plan.id} plan={plan} />)
      )}
    </div>
  );
}

export default function PublicLogPage() {
  return (
    <AuthGate>
      {(_user) => (
        <PageShell title="みんなのLog">
          <PublicLogContent />
        </PageShell>
      )}
    </AuthGate>
  );
}
