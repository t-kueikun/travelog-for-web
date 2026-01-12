"use client";

import type React from "react";
import Image from "next/image";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import AppStoreBadge from "@/components/AppStoreBadge";

type LandingPageProps = {
    onLoginClick: () => void;
};

export default function LandingPage({ onLoginClick }: LandingPageProps) {
    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-slate-900 selection:bg-slate-200 selection:text-black">
            <PublicHeader onLoginClick={onLoginClick} />

            <main>
                {/* Hero Section */}
                <section className="relative flex min-h-screen flex-col items-center justify-center pt-24 pb-12">
                    <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">

                        <h1 className="mx-auto max-w-5xl text-5xl font-semibold tracking-tighter sm:text-7xl lg:text-8xl text-slate-900 leading-[1.1]">
                            Plan. Organize. <br />
                            <span className="text-slate-400">Travel.</span>
                        </h1>

                        <p className="mx-auto mt-8 max-w-lg text-lg text-slate-600 leading-relaxed font-medium">
                            フライト、ホテル、行きたい場所。<br />
                            散らばる情報をひとつにまとめて、理想の旅をデザインしましょう。
                        </p>

                        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <button
                                onClick={onLoginClick}
                                className="h-12 min-w-[160px] rounded-xl bg-black px-8 text-sm font-bold text-white transition-all hover:bg-slate-800 hover:scale-[1.02] active:scale-[0.98] shadow-md"
                            >
                                Start Planning
                            </button>
                            <a
                                href="/features"
                                className="flex h-12 min-w-[160px] items-center justify-center rounded-xl border border-slate-200 bg-white px-8 text-sm font-bold text-slate-900 transition-all hover:border-slate-300 hover:bg-slate-50 shadow-sm"
                            >
                                Learn more
                            </a>
                            <a
                                href="https://apps.apple.com/jp/app/travelog/id6748625749"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block transition-transform hover:scale-105 active:scale-95"
                            >
                                <img
                                    src="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ja-jp?releaseDate=1255046400"
                                    alt="App Storeでダウンロード"
                                    style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
                                />
                            </a>
                        </div>

                        {/* Hero Visual */}
                        <div className="mt-16 w-full">
                            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/50">
                                <Image
                                    src="/330shots_so.webp"
                                    alt="TraveLog Application Interface"
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 80vw"
                                    priority
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Bento Grid - Clean Style */}
                <section className="py-32 bg-white">
                    <div className="mx-auto max-w-7xl px-6 lg:px-8">
                        <h2 className="mb-16 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl text-center">
                            Simplify Your Trip.
                        </h2>

                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                            {/* Card 1 - Timeline */}
                            <div className="col-span-1 sm:col-span-2 lg:col-span-2 relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-8 transition-all hover:shadow-lg hover:border-slate-200">
                                <div className="relative z-10 max-w-md">
                                    <h3 className="text-xl font-bold text-slate-900">Timeline View</h3>
                                    <p className="mt-2 text-slate-600">
                                        フライト、ホテル、観光。時系列に並んだカードで、旅の流れが一目でわかります。
                                    </p>
                                </div>
                                {/* Visual Decoration */}
                                <div className="absolute -right-12 top-12 h-64 w-64 rounded-xl bg-white border border-slate-200 shadow-sm rotate-6"></div>
                                <div className="absolute -right-4 top-24 h-64 w-64 rounded-xl bg-slate-100 border border-slate-200 shadow-sm rotate-3"></div>
                            </div>

                            {/* Card 2 - Budget */}
                            <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-8 transition-all hover:shadow-lg hover:border-slate-200">
                                <div className="h-10 w-10 mb-4 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                    <span className="font-bold text-lg">¥</span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-900">Budget</h3>
                                <p className="mt-2 text-sm text-slate-500">旅費の予算もスマートに管理。</p>
                            </div>



                            {/* Card 4 - Organization (was Memories) */}
                            <div className="col-span-1 sm:col-span-2 lg:col-span-2 relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-900 p-8 text-white transition-all hover:shadow-xl">
                                <div className="relative z-10">
                                    <h3 className="text-xl font-bold">All in One Place</h3>
                                    <p className="mt-2 text-slate-300">
                                        予約番号、電車の時間、行きたいお店のメモ。<br />
                                        もう複数のアプリを行き来する必要はありません。
                                    </p>
                                </div>
                                <div className="absolute right-0 top-0 h-full w-full opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500 to-transparent"></div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Simple CTA */}
                <section className="bg-[#FDFDFD] py-40 text-center">
                    <div className="mx-auto max-w-2xl px-6">
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                            Start your journey.
                        </h2>
                        <p className="mt-6 text-slate-500">
                            シンプルで美しい旅の記録を、今日から始めましょう。
                        </p>
                        <div className="mt-10 flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
                            <button
                                onClick={onLoginClick}
                                className="h-12 rounded-xl bg-black px-8 text-sm font-bold text-white transition-all hover:bg-slate-800 hover:shadow-lg shadow-md min-w-[180px]"
                            >
                                Create free account
                            </button>

                            <a
                                href="https://apps.apple.com/jp/app/travelog/id6748625749"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block transition-transform hover:scale-105"
                            >
                                <img
                                    src="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ja-jp?releaseDate=1255046400"
                                    alt="App Storeでダウンロード"
                                    style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
                                />
                            </a>
                        </div>
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
