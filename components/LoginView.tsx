"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  formatAuthError,
  signInWithApple,
  signInWithEmail,
  signUpWithEmail
} from "@/lib/auth";

type LoginViewProps = {
  authError?: string | null;
};

type Mode = "login" | "signup";

export default function LoginView({ authError }: LoginViewProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(authError ?? null);

  useEffect(() => {
    setError(authError ?? null);
  }, [authError]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "login") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      await signInWithApple();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-chrome px-5 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">TraveLog</h1>
          <p className="text-sm text-slate-500">
            {mode === "login" ? "ログインして続ける" : "新規登録してはじめる"}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-card">
          <div className="flex rounded-full bg-slate-100 p-1 text-xs font-semibold text-slate-500">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-cardSoft"
                  : "hover:text-slate-700"
              }`}
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                mode === "signup"
                  ? "bg-white text-slate-900 shadow-cardSoft"
                  : "hover:text-slate-700"
              }`}
            >
              新規登録
            </button>
          </div>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">
                メールアドレス
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">
                パスワード
              </label>
              <input
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="6文字以上"
              />
            </div>

            {error ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {mode === "login" ? "ログイン" : "新規登録"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>または</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleAppleSignIn}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-black/60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.86 12.53c.02 2.06 1.8 2.74 1.82 2.75-.01.05-.28 1-1 1.98-.62.85-1.26 1.69-2.28 1.71-1 .02-1.32-.6-2.46-.6-1.15 0-1.5.58-2.45.62-1 .04-1.77-.98-2.4-1.82-1.3-1.78-2.3-5.02-.96-7.21.66-1.08 1.84-1.77 3.12-1.79.98-.02 1.9.66 2.45.66.56 0 1.62-.81 2.73-.69.46.02 1.76.19 2.6 1.43-.07.04-1.56.91-1.55 2.96Zm-1.79-5.89c.52-.63.88-1.52.78-2.42-.75.03-1.65.5-2.19 1.13-.48.56-.9 1.45-.79 2.3.83.06 1.68-.42 2.2-1.01Z"
              />
            </svg>
            Appleでサインイン
          </button>
        </div>

        <div className="rounded-2xl bg-white/80 p-4 text-xs text-slate-500 shadow-cardSoft">
          Firebase Authentication のメール/パスワードとAppleを有効化してください。
        </div>
      </div>
    </div>
  );
}
