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
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#d7e7f4]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-52 bg-[linear-gradient(180deg,rgba(255,255,255,0.36),rgba(255,255,255,0))]" />
        <div className="absolute -top-16 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-white/45 blur-3xl" />
        <div className="absolute right-0 top-10 h-44 w-44 rounded-full bg-[#b4cae0]/40 blur-3xl" />
        <div className="absolute -bottom-20 left-0 h-52 w-52 rounded-full bg-white/25 blur-3xl" />
      </div>
      <div className="mx-auto w-full max-w-[var(--app-shell-max)] px-[var(--app-shell-gutter)] pt-4 sm:pt-5 lg:pt-6 animate-fade-up motion-reduce:animate-none">
        <Header
          title={title}
          showSettings={showSettings}
          leftAccessory={headerLeft}
          rightAccessory={headerRight}
        />
      </div>
      <main
        className={`mx-auto w-full max-w-[var(--app-shell-max)] px-[var(--app-shell-gutter)] pt-3 sm:pt-4 lg:pt-5 animate-fade-in motion-reduce:animate-none ${
          showTabBar ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6.75rem+env(safe-area-inset-bottom))] lg:pb-[calc(7rem+env(safe-area-inset-bottom))]" : "pb-8 sm:pb-10 lg:pb-12"
        }`}
      >
        {children}
      </main>
      {showTabBar ? <TabBar /> : null}
    </div>
  );
}
