import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import Image from "next/image";

export default function FeaturesPage() {
    const features = [
        {
            title: "Visual Timeline",
            heading: "視覚的なタイムライン",
            description: "作成したプランは美しいタイムライン形式で表示。フライトの時間やホテルのチェックインなど、旅の流れを一目で直感的に把握できます。",
            icon: "📅",
            color: "bg-blue-50 text-blue-600",
            image: "/389shots_so.webp"
        },
        {
            title: "Budget Control",
            heading: "スマートな予算管理",
            description: "「今回の旅は予算10万円」。目標を設定すれば、残りの予算や使用状況をグラフで可視化。使いすぎを防ぎながら、賢く旅を楽しめます。",
            icon: "💳",
            color: "bg-indigo-50 text-indigo-600",
            image: "/645shots_so.webp"
        },
        {
            title: "Centralized Info",
            heading: "情報の集約",
            description: "Eチケットの控え、予約確認メール、行きたいお店のURL。散らばりがちな旅の情報を、プランの中にまとめて保存しておけます。",
            icon: "📂",
            color: "bg-orange-50 text-orange-600",
            image: "/723shots_so.webp"
        }
    ];

    return (
        <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900 pt-20">
            <PublicHeader />

            <main>
                <section className="relative py-24 lg:py-32 overflow-hidden">
                    {/* Clean background without grid */}
                    <div className="absolute inset-0 -z-10 h-full w-full bg-white"></div>

                    <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
                        <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-6xl mb-6">
                            Powerful Features <br className="hidden sm:block" />
                            <span className="text-blue-600">for Travelers</span>
                        </h1>
                        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                            計画も、準備も、このアプリひとつで。<br />
                            TraveLogには、あなたの旅をサポートする機能が詰まっています。
                        </p>
                    </div>
                </section>

                <section className="py-24 px-6 max-w-7xl mx-auto space-y-32">
                    {features.map((feature, index) => (
                        <div key={feature.title} className={`flex flex-col gap-12 lg:gap-24 items-center ${index % 2 === 1 ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}>
                            <div className="flex-1 space-y-8">
                                <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest ${feature.color}`}>
                                    <span>{feature.icon}</span>
                                    {feature.title}
                                </div>
                                <div>
                                    <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl mb-6">{feature.heading}</h2>
                                    <div className="h-1 w-20 bg-slate-900 mb-6"></div>
                                    <p className="text-slate-600 leading-loose text-lg font-medium">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 w-full">
                                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-lg group">
                                    <Image
                                        src={feature.image}
                                        alt={feature.heading}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </section>

                <section className="py-24 bg-slate-900 text-white text-center">
                    <div className="max-w-4xl mx-auto px-6">
                        <h2 className="text-3xl font-bold mb-8">体験してみませんか？</h2>
                        <a href="/" className="inline-block rounded-full bg-white px-8 py-4 text-slate-900 font-bold hover:bg-blue-50 transition-colors">
                            無料でアカウント作成
                        </a>
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
