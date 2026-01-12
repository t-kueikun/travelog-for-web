import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function HowToPage() {
    const steps = [
        {
            num: "01",
            title: "アカウント作成",
            desc: "メールアドレス、またはApple IDを使って数秒で登録。面倒な入力項目はありません。"
        },
        {
            num: "02",
            title: "プランの作成",
            desc: "「新しいLogを作成」ボタンをタップ。目的地、日程を決めたら、そこから旅の計画が始まります。"
        },
        {
            num: "03",
            title: "予定の追加",
            desc: "フライト、ホテル、観光スポット。決まった予定をどんどん追加していきましょう。"
        },
        {
            num: "04",
            title: "旅を楽しむ",
            desc: "準備は完了です。当日はアプリを見ながら、心置きなく旅を楽しんでください！"
        }
    ];

    return (
        <div className="min-h-screen bg-white font-sans text-slate-900 pt-20">
            <PublicHeader />

            <main>
                <section className="bg-slate-50 py-24 px-6 text-center">
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl mb-6">
                        How to use
                    </h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        シンプルで直感的な操作性。<br />
                        マニュアルを読まなくても、すぐに使い始められます。
                    </p>
                </section>

                <section className="py-24 px-6 max-w-5xl mx-auto">
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                        {steps.map((step) => (
                            <div key={step.num} className="group relative">
                                <div className="relative h-full bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-start transition-all hover:shadow-md hover:border-slate-300">
                                    <span className="text-5xl font-black text-slate-100 mb-6 group-hover:text-blue-50 transition-colors">
                                        {step.num}
                                    </span>
                                    <h3 className="text-xl font-bold text-slate-900 mb-4">
                                        {step.title}
                                    </h3>
                                    <p className="text-slate-600 leading-relaxed text-sm">
                                        {step.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-20 rounded-3xl bg-slate-50 border border-slate-100 p-8 sm:p-12 text-center">
                        <h3 className="text-2xl font-bold text-slate-900 mb-4">使い方はあなた次第</h3>
                        <p className="text-slate-600 mb-8 max-w-2xl mx-auto">
                            きっちり計画を立てたい派も、大まかな予定だけで旅する派も。<br />
                            TraveLogはあらゆる旅のスタイルにフィットします。
                        </p>
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
