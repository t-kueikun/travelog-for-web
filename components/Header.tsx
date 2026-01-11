"use client";

import Link from "next/link";

type HeaderProps = {
  title: string;
  showSettings?: boolean;
};

export default function Header({ title, showSettings = true }: HeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      {showSettings ? (
        <Link
          href="/settings"
          aria-label="設定"
          className="flex h-10 w-10 items-center justify-center rounded-full card-surface shadow-cardSoft transition hover:shadow-card interactive-soft"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-slate-700"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
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
      ) : null}
    </div>
  );
}
