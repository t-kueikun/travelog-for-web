"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type HeaderProps = {
  title: string;
  showSettings?: boolean;
  leftAccessory?: ReactNode;
  rightAccessory?: ReactNode;
};

const iconButtonClassName =
  "flex h-9 w-9 items-center justify-center rounded-full text-[#0d1e75] transition hover:bg-white/35 sm:h-10 sm:w-10";

export default function Header({
  title,
  showSettings = false,
  leftAccessory,
  rightAccessory
}: HeaderProps) {
  const leftContent =
    leftAccessory !== undefined ? (
      leftAccessory
    ) : showSettings ? (
      <Link href="/settings" aria-label="設定" className={iconButtonClassName}>
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.983 2.25a1.5 1.5 0 0 1 1.5 1.5v.278a6.75 6.75 0 0 1 2.31.957l.196-.196a1.5 1.5 0 0 1 2.122 0l1.06 1.06a1.5 1.5 0 0 1 0 2.121l-.196.196c.41.7.708 1.48.872 2.31h.278a1.5 1.5 0 0 1 1.5 1.5v1.5a1.5 1.5 0 0 1-1.5 1.5h-.278a6.75 6.75 0 0 1-.957 2.31l.196.196a1.5 1.5 0 0 1 0 2.122l-1.06 1.06a1.5 1.5 0 0 1-2.121 0l-.196-.196a6.75 6.75 0 0 1-2.31.957v.278a1.5 1.5 0 0 1-1.5 1.5h-1.5a1.5 1.5 0 0 1-1.5-1.5v-.278a6.75 6.75 0 0 1-2.31-.957l-.196.196a1.5 1.5 0 0 1-2.122 0l-1.06-1.06a1.5 1.5 0 0 1 0-2.122l.196-.196a6.75 6.75 0 0 1-.957-2.31H2.25a1.5 1.5 0 0 1-1.5-1.5v-1.5a1.5 1.5 0 0 1 1.5-1.5h.278a6.75 6.75 0 0 1 .957-2.31l-.196-.196a1.5 1.5 0 0 1 0-2.121l1.06-1.06a1.5 1.5 0 0 1 2.122 0l.196.196a6.75 6.75 0 0 1 2.31-.957V3.75a1.5 1.5 0 0 1 1.5-1.5h1.5Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      </Link>
    ) : null;

  return (
    <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 sm:grid-cols-[2.75rem_1fr_2.75rem] sm:gap-3">
      <div className="flex justify-start">{leftContent}</div>
      <h1 className="text-center text-[1.4rem] font-semibold tracking-[-0.04em] text-[#0d1e75] sm:text-[1.5rem]">
        {title}
      </h1>
      <div className="flex justify-end">{rightAccessory ?? null}</div>
    </div>
  );
}
