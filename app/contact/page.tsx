import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 pt-16">
            <PublicHeader />

            <main className="py-20 px-6 max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold mb-8 text-center text-slate-900">お問い合わせ</h1>
                <p className="text-slate-600 mb-8 text-center">
                    ご質問やご要望がございましたら、以下のフォームよりお気軽にお問い合わせください。
                </p>

                <form className="space-y-6">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">お名前</label>
                        <input type="text" id="name" className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 text-sm" placeholder="山田 太郎" />
                    </div>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">メールアドレス</label>
                        <input type="email" id="email" className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 text-sm" placeholder="name@example.com" />
                    </div>
                    <div>
                        <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1">お問い合わせ内容</label>
                        <textarea id="message" rows={5} className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 text-sm" placeholder="ご自由にご記入ください"></textarea>
                    </div>
                    <button type="button" className="w-full rounded-full bg-slate-900 py-3 text-white font-bold hover:bg-slate-700 transition">
                        送信する
                    </button>
                </form>
            </main>

            <PublicFooter />
        </div>
    );
}
