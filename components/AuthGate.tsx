"use client";

import { type ReactNode, useEffect, useState, Suspense } from "react";
import type { User } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import LoginView from "@/components/LoginView";
import { useAuth } from "@/components/AuthProvider";

type AuthGateProps = {
  children: (user: User) => ReactNode;
};

function AuthGateContent({ children }: AuthGateProps) {
  const { user, loading, error } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("login") === "true") {
      setShowLogin(true);
    }
  }, [searchParams]);

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
    if (showLogin) {
      return (
        <LoginView
          authError={error}
          onBack={() => setShowLogin(false)}
        />
      );
    }
    return <LandingPage onLoginClick={() => setShowLogin(true)} />;
  }

  return <>{children(user)}</>;
}

export default function AuthGate(props: AuthGateProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-chrome px-5 py-10">
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-cardSoft">
          読み込み中...
        </div>
      </div>
    }>
      <AuthGateContent {...props} />
    </Suspense>
  );
}
