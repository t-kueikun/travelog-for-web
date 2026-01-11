"use client";

import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import LoginView from "@/components/LoginView";
import { useAuth } from "@/components/AuthProvider";

type AuthGateProps = {
  children: (user: User) => ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-chrome px-5 py-10">
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
          読み込み中...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView authError={error} />;
  }

  return <>{children(user)}</>;
}
