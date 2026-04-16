"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  {
    href: "/",
    label: "MyLog",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5 12 3.75l8.25 6.75v8.25A1.5 1.5 0 0 1 18.75 20.25h-13.5a1.5 1.5 0 0 1-1.5-1.5V10.5Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 20.25v-6h4.5v6" />
      </svg>
    )
  },
  {
    href: "/plans/assist",
    label: "AI作成",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M11.25 2.25a.75.75 0 0 1 1.5 0V6a.75.75 0 0 1-1.5 0V2.25Zm0 15.75a.75.75 0 0 1 1.5 0v3.75a.75.75 0 0 1-1.5 0V18Zm-9-6.75a.75.75 0 0 1 0-1.5H6a.75.75 0 0 1 0 1.5H2.25Zm15.75 0a.75.75 0 0 1 0-1.5h3.75a.75.75 0 0 1 0 1.5H18Zm-2.325-5.925a.75.75 0 1 1 1.06-1.06l2.652 2.651a.75.75 0 0 1-1.06 1.06l-2.652-2.651Zm-10.044 10.044a.75.75 0 0 1 1.06 0l2.652 2.651a.75.75 0 0 1-1.06 1.06l-2.652-2.651a.75.75 0 0 1 0-1.06Zm13.756 3.711a.75.75 0 0 1-1.06 0l-2.652-2.651a.75.75 0 1 1 1.06-1.06l2.652 2.651a.75.75 0 0 1 0 1.06ZM8.348 8.348a.75.75 0 0 1-1.06 0L4.636 5.697a.75.75 0 1 1 1.06-1.06l2.652 2.65a.75.75 0 0 1 0 1.061Z" />
      </svg>
    )
  },
  {
    href: "/public",
    label: "みんなのLog",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5M12 3.75c2.07 2.257 3.214 5.216 3.214 8.25S14.07 17.993 12 20.25c-2.07-2.257-3.214-5.216-3.214-8.25S9.93 6.007 12 3.75Z" />
      </svg>
    )
  }
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="pointer-events-auto mx-auto w-full max-w-[var(--app-shell-max)] px-[var(--app-shell-gutter)] pb-[calc(0.7rem+env(safe-area-inset-bottom))] lg:pb-[calc(0.95rem+env(safe-area-inset-bottom))]">
        <div className="flex rounded-full bg-white p-1 shadow-[0_14px_24px_-14px_rgba(0,0,0,0.18)] lg:mx-auto lg:max-w-xl">
          {tabs.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/" || (pathname.startsWith("/plans/") && pathname !== "/plans/assist")
                : pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] font-medium transition sm:px-2.5 sm:py-1.5 sm:text-[10px] lg:flex-row lg:justify-center lg:gap-2 lg:px-4 lg:py-2 lg:text-xs ${
                  active
                    ? "bg-[#e5e5e8] text-[#007fff]"
                    : "text-slate-500 hover:text-[#0d1e75]"
                }`}
              >
                <span className="scale-[0.9] sm:scale-100 lg:scale-100">{tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
