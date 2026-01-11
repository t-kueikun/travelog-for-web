"use client";

import type React from "react";
import Image from "next/image";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

type LandingPageProps = {
    onLoginClick: () => void;
};

export default function LandingPage({ onLoginClick }: LandingPageProps) {
    return (
        <div className="min-h-screen bg-white text-slate-900">
            <PublicHeader />

            <main>
                {/* Hero Section */}
                <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden bg-gradient-to-b from-blue-50 to-white px-6 pt-20">
                    <div className="mx-auto max-w-4xl text-center">
                        <div className="mb-6 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-600">
                            New Standard of Travel
                        </div>
                        <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-7xl">
                            旅のすべてを、
                            <br className="hidden sm:block" />
                            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                ひとつの場所で。
                            </span>
                        </h1>
                        <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-600 sm:text-xl">
                            計画から思い出の記録まで。
                            TraveLogは、あなたの旅をよりスマートに、
                            そして美しく彩るためのオールインワン・トラベルアプリです。
                        </p>
                        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                            <button
                                onClick={onLoginClick}
                                className="w-full rounded-full bg-blue-600 px-8 py-4 text-base font-bold text-white shadow-xl transition hover:bg-blue-500 hover:shadow-2xl hover:-translate-y-1 sm:w-auto"
                            >
                                無料で始める
                            </button>
                            <button
                                onClick={() => {
                                    window.location.href = "/features";
                                }}
                                className="w-full rounded-full bg-white px-8 py-4 text-base font-bold text-slate-700 shadow-md transition hover:bg-slate-50 hover:shadow-lg sm:w-auto"
                            >
                                詳しく見る
                            </button>
                        </div>
                    </div>

                    {/* Decorative background elements */}
                    <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl filter" />
                    <div className="absolute -right-20 bottom-20 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl filter" />
                </section>

                {/* Features Section */}
                <section id="features" className="py-24 bg-white">
                    <div className="mx-auto max-w-6xl px-6">
                        <div className="mb-16 text-center">
                            <h2 className="mb-4 text-3xl font-bold text-slate-900 sm:text-4xl">
                                旅に必要な機能がここに
                            </h2>
                            <p className="text-slate-500">
                                シンプルなデザインに、強力な機能を詰め込みました。
                            </p>
                        </div>

                        <div className="grid gap-12 sm:grid-cols-3">
                            <FeatureCard
                                icon="✈️"
                                title="旅程を一元管理"
                                description="フライト、ホテル、アクティビティ。バラバラになりがちな予約情報を、美しいタイムラインで整理できます。"
                            />
                            <FeatureCard
                                icon="💰"
                                title="貯金もサポート"
                                description="目標金額を設定して、貯金の進捗を可視化。旅へのモチベーションを高めながら、着実に準備を進められます。"
                            />
                            <FeatureCard
                                icon="🎒"
                                title="持ち物リスト"
                                description="忘れ物を防ぐためのスマートなチェックリスト。カテゴリごとに整理して、効率よくパッキングしましょう。"
                            />
                        </div>

                        <div className="mt-16 text-center">
                            <a href="/features" className="inline-flex items-center text-blue-600 font-semibold hover:underline">
                                すべての機能を見る →
                            </a>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="bg-slate-900 py-24 text-white">
                    <div className="mx-auto max-w-4xl px-6 text-center">
                        <h2 className="mb-6 text-3xl font-bold sm:text-5xl">
                            さあ、次の旅へ出かけよう
                        </h2>
                        <p className="mb-10 text-lg text-slate-300">
                            TraveLogなら、旅の準備がいまよりもっと楽しくなる。
                            <br />
                            まずはアカウントを作成して、最初のプランを作ってみましょう。
                        </p>
                        <button
                            onClick={onLoginClick}
                            className="rounded-full bg-white px-8 py-4 text-base font-bold text-slate-900 shadow-xl transition hover:bg-slate-100 hover:shadow-2xl hover:-translate-y-1"
                        >
                            今すぐ始める
                        </button>
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}

function FeatureCard({
    icon,
    title,
    description
}: {
    icon: string | React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="group rounded-3xl border border-slate-100 bg-white p-8 shadow-cardSoft transition hover:shadow-card">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl shadow-sm transition group-hover:bg-blue-100 group-hover:scale-110">
                {icon}
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900">{title}</h3>
            <p className="leading-relaxed text-slate-500">{description}</p>
        </div>
    );
}
