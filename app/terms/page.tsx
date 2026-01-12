import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 pt-16">
            <PublicHeader />

            <main className="py-20 px-6 max-w-4xl mx-auto prose prose-slate">
                <h1>利用規約</h1>
                <p>この利用規約（以下「本規約」）は、TraveLog（以下「当アプリ」）の利用条件を定めるものです。</p>

                <h2>第1条（適用）</h2>
                <p>本規約は、ユーザーと当アプリとの間のサービス利用に関わる一切の関係に適用されます。</p>

                <h2>第2条（利用登録）</h2>
                <p>登録希望者が当アプリの定める方法によって利用登録を申請し、当アプリがこれを承認することによって、利用登録が完了するものとします。</p>

                {/* ... More detailed terms content would go here ... */}
            </main>

            <PublicFooter />
        </div>
    );
}
