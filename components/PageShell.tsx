"use client";

import type { ReactNode } from "react";
import Header from "@/components/Header";
import TabBar from "@/components/TabBar";

type PageShellProps = {
  title: string;
  children: ReactNode;
  showTabBar?: boolean;
  showSettings?: boolean;
};

export default function PageShell({
  title,
  children,
  showTabBar = true,
  showSettings = true
}: PageShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-chrome">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-white/70 blur-3xl" />
        <div className="absolute -bottom-28 -left-12 h-80 w-80 rounded-full bg-slate-200/70 blur-3xl" />
      </div>
      <div className="mx-auto w-full max-w-3xl px-5 pt-8 animate-fade-up motion-reduce:animate-none">
        <Header title={title} showSettings={showSettings} />
      </div>
      <main
        className={`mx-auto w-full max-w-3xl px-5 pt-6 animate-fade-in motion-reduce:animate-none ${
          showTabBar ? "pb-28" : "pb-10"
        }`}
      >
        {children}
      </main>
      {showTabBar ? <TabBar /> : null}
    </div>
  );
}
