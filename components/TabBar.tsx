"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "MyLog" },
  { href: "/public", label: "みんなのLog" }
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white shadow-card"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
