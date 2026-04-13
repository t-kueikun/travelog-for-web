"use client";

import type { ReactNode } from "react";
import Header from "@/components/Header";
import TabBar from "@/components/TabBar";

type PageShellProps = {
  title: string;
  children: ReactNode;
  showTabBar?: boolean;
  showSettings?: boolean;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
};

export default function PageShell({
  title,
  children,
  showTabBar = true,
  showSettings = false,
  headerLeft,
  headerRight
}: PageShellProps) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#edf2f7]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-12 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-white/80 blur-3xl" />
        <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-white/70 blur-3xl" />
        <div className="absolute -bottom-28 -left-12 h-80 w-80 rounded-full bg-slate-200/70 blur-3xl" />
      </div>
      <div className="mx-auto w-full max-w-[27rem] px-4 pt-4 sm:px-5 sm:pt-6 animate-fade-up motion-reduce:animate-none">
        <Header
          title={title}
          showSettings={showSettings}
          leftAccessory={headerLeft}
          rightAccessory={headerRight}
        />
      </div>
      <main
        className={`mx-auto w-full max-w-[27rem] px-4 pt-4 sm:px-5 sm:pt-5 animate-fade-in motion-reduce:animate-none ${
          showTabBar ? "pb-[calc(8rem+env(safe-area-inset-bottom))]" : "pb-8"
        }`}
      >
        {children}
      </main>
      {showTabBar ? <TabBar /> : null}
    </div>
  );
}
