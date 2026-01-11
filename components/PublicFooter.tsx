"use client";

import Link from "next/link";

export default function PublicFooter() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-slate-50 py-12 border-t border-slate-100">
            <div className="mx-auto max-w-6xl px-6">
                <div className="grid gap-8 md:grid-cols-4">
                    <div className="col-span-2">
                        <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
                            TraveLog
                        </Link>
                        <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs">
                            旅の計画から思い出の記録まで。<br />
                            あなたの旅をよりスマートに、美しく彩るための<br />
                            オールインワン・トラベルアプリです。
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-slate-900 mb-4">サイトマップ</h4>
                        <ul className="space-y-2 text-sm text-slate-600">
                            <li><Link href="/" className="hover:text-blue-600 transition">ホーム</Link></li>
                            <li><Link href="/features" className="hover:text-blue-600 transition">特徴</Link></li>
                            <li><Link href="/howto" className="hover:text-blue-600 transition">使い方</Link></li>
                            <li><Link href="/gallery" className="hover:text-blue-600 transition">ギャラリー</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold text-slate-900 mb-4">サポート</h4>
                        <ul className="space-y-2 text-sm text-slate-600">
                            <li><Link href="/contact" className="hover:text-blue-600 transition">お問い合わせ</Link></li>
                            <li><Link href="/terms" className="hover:text-blue-600 transition">利用規約</Link></li>
                            <li><Link href="/privacy" className="hover:text-blue-600 transition">プライバシーポリシー</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-200 text-center text-sm text-slate-500">
                    <p>&copy; {currentYear} TraveLog. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}
