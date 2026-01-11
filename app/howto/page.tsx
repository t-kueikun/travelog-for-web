import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function HowToPage() {
    const steps = [
        {
            title: "1. アカウント作成",
            desc: "メールアドレスまたはApple IDで簡単に登録できます。"
        },
        {
            title: "2. プランの作成",
            desc: "「新しいLogを作成」ボタンから、行きたい場所や日程を入力します。"
        },
        {
            title: "3. 予定の追加",
            desc: "フライト、ホテル、観光スポットなどの詳細を追加していきます。"
        },
        {
            title: "4. 旅を楽しむ",
            desc: "当日はアプリで行き先や時間を確認しながら、思い出を記録しましょう。"
        }
    ];

    return (
        <div className="min-h-screen bg-white text-slate-900 pt-16">
            <PublicHeader />

            <main>
                <section className="bg-indigo-50 py-20 px-6 text-center">
                    <h1 className="text-4xl font-extrabold text-slate-900 mb-6">TraveLogの使い方</h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        シンプルで直感的な操作。誰でも簡単に使いこなせます。
                    </p>
                </section>

                <section className="py-20 px-6 max-w-4xl mx-auto">
                    <div className="grid gap-8 md:grid-cols-2">
                        {steps.map((step, index) => (
                            <div key={index} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition">
                                <div className="text-indigo-600 font-bold text-xl mb-4">{step.title}</div>
                                <p className="text-slate-600 leading-relaxed">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
