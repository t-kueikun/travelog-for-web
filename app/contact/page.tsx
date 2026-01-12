import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-white font-sans text-slate-900 pt-20">
            <PublicHeader />

            <main className="py-24 px-6">
                <div className="max-w-xl mx-auto">
                    <div className="text-center mb-12">
                        <h1 className="text-3xl font-bold text-slate-900 mb-4">お問い合わせ</h1>
                        <p className="text-slate-600">
                            ご質問やフィードバックなどがございましたら、<br />
                            以下のフォームよりお気軽にご連絡ください。
                        </p>
                    </div>

                    <form className="space-y-6 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                            <label htmlFor="name" className="block text-sm font-bold text-slate-700 mb-2">お名前</label>
                            <input type="text" id="name" className="w-full rounded-xl border-slate-200 bg-slate-50 p-4 text-sm font-medium focus:border-blue-500 focus:ring-blue-500 transition-colors" placeholder="山田 太郎" />
                        </div>
                        <div>
                            <label htmlFor="email" className="block text-sm font-bold text-slate-700 mb-2">メールアドレス</label>
                            <input type="email" id="email" className="w-full rounded-xl border-slate-200 bg-slate-50 p-4 text-sm font-medium focus:border-blue-500 focus:ring-blue-500 transition-colors" placeholder="name@example.com" />
                        </div>
                        <div>
                            <label htmlFor="message" className="block text-sm font-bold text-slate-700 mb-2">お問い合わせ内容</label>
                            <textarea id="message" rows={5} className="w-full rounded-xl border-slate-200 bg-slate-50 p-4 text-sm font-medium focus:border-blue-500 focus:ring-blue-500 transition-colors" placeholder="ご自由にご記入ください"></textarea>
                        </div>
                        <button type="button" className="w-full rounded-xl bg-slate-900 py-4 text-white font-bold hover:bg-slate-700 transition shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                            送信する
                        </button>
                    </form>
                </div>
            </main>

            <PublicFooter />
        </div>
    );
}
