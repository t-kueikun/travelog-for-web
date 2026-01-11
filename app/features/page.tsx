import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function FeaturesPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 pt-16">
            <PublicHeader />

            <main>
                <section className="bg-blue-50 py-20 px-6 text-center">
                    <h1 className="text-4xl font-extrabold text-slate-900 mb-6">TraveLogの主な機能</h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        旅をより便利に、より楽しくするための多彩な機能を搭載しています。
                    </p>
                </section>

                <section className="py-20 px-6 max-w-6xl mx-auto space-y-24">
                    {/* Feature 1 */}
                    <div className="flex flex-col md:flex-row items-center gap-12">
                        <div className="flex-1 space-y-6">
                            <div className="inline-block p-3 rounded-2xl bg-blue-100 text-3xl">✈️</div>
                            <h2 className="text-3xl font-bold text-slate-900">旅程を一元管理</h2>
                            <p className="text-slate-600 leading-relaxed text-lg">
                                フライト、ホテル、アクティビティなどの予約情報をタイムライン形式でわかりやすく整理。
                                PDFや確認メールを探し回る必要はもうありません。
                            </p>
                        </div>
                        <div className="flex-1 bg-slate-100 rounded-3xl h-80 w-full flex items-center justify-center text-slate-400">
                            {/* Placeholder for image */}
                            <span>Screen Image</span>
                        </div>
                    </div>

                    {/* Feature 2 */}
                    <div className="flex flex-col md:flex-row-reverse items-center gap-12">
                        <div className="flex-1 space-y-6">
                            <div className="inline-block p-3 rounded-2xl bg-green-100 text-3xl">💰</div>
                            <h2 className="text-3xl font-bold text-slate-900">スマートな予算管理</h2>
                            <p className="text-slate-600 leading-relaxed text-lg">
                                目標金額を設定し、貯金の進捗を可視化。
                                旅行中も支払った費用を記録して、予算オーバーを防ぎましょう。
                            </p>
                        </div>
                        <div className="flex-1 bg-slate-100 rounded-3xl h-80 w-full flex items-center justify-center text-slate-400">
                            {/* Placeholder for image */}
                            <span>Screen Image</span>
                        </div>
                    </div>

                    {/* Feature 3 */}
                    <div className="flex flex-col md:flex-row items-center gap-12">
                        <div className="flex-1 space-y-6">
                            <div className="inline-block p-3 rounded-2xl bg-orange-100 text-3xl">🎒</div>
                            <h2 className="text-3xl font-bold text-slate-900">持ち物チェックリスト</h2>
                            <p className="text-slate-600 leading-relaxed text-lg">
                                忘れ物を防ぐための、カスタマイズ可能なパッキングリスト。
                                自分だけのリストを作成し、次回の旅行にも再利用できます。
                            </p>
                        </div>
                        <div className="flex-1 bg-slate-100 rounded-3xl h-80 w-full flex items-center justify-center text-slate-400">
                            {/* Placeholder for image */}
                            <span>Screen Image</span>
                        </div>
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
