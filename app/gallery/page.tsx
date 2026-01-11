import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function GalleryPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 pt-16">
            <PublicHeader />

            <main>
                <section className="bg-slate-50 py-20 px-6 text-center">
                    <h1 className="text-4xl font-extrabold text-slate-900 mb-6">ギャラリー</h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        ユーザーの皆様が作成した美しい旅の記録をご紹介します。
                    </p>
                </section>

                <section className="py-20 px-6 max-w-6xl mx-auto">
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3, 4, 5, 6].map((item) => (
                            <div key={item} className="aspect-[4/3] bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                                {/* Image Placeholder */}
                                Sample Image {item}
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
