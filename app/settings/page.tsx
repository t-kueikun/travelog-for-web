"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import AuthGate from "@/components/AuthGate";
import PageShell from "@/components/PageShell";
import { signOutUser } from "@/lib/auth";
import { resetMyPlans } from "@/lib/firestore";

function SettingsContent({ user }: { user: User }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <PageShell title="設定" showTabBar={false} showSettings={false}>
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
      </div>
    </PageShell>
  );
}

export default function SettingsPage() {
  return (
    <AuthGate>{(user) => <SettingsContent user={user} />}</AuthGate>
  );
}
