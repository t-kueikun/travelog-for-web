import React from "react";

export default function AppStoreBadge() {
    return (
        <div className="inline-flex h-[52px] items-center gap-3 rounded-lg bg-black px-4 text-white transition-all hover:opacity-80 border border-white/10 shadow-sm">
            <svg viewBox="0 0 384 512" fill="currentColor" className="mb-0.5 h-7 w-7">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 46.9 126.7 89.8 126.7 32.4 0 52-25.8 89.5-25.8 42.1 0 54.7 25.8 92.5 25.8 28.3 0 57.5-62.7 84.1-127.3-32.9-12.7-56-39.7-55.6-85.4zM242.5 9c21.8-8 80.4-16.5 96.6 60.1-41.9 14.6-67.4 34.6-96.6 42.1-4.7 58.7 11.7 101.9-88 127.8z" />
            </svg>
            <div className="flex flex-col items-start justify-center leading-none">
                <span className="font-sans text-[18px] font-bold tracking-tight">App Store</span>
                <span className="text-[10px] font-bold mt-[2px]">からダウンロード</span>
            </div>
        </div>
    );
}
