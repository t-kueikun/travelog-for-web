import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 pt-16">
            <PublicHeader />

            <main className="py-20 px-6 max-w-4xl mx-auto prose prose-slate">
                <h1>プライバシーポリシー</h1>
                <p>TraveLog（以下「当アプリ」）は、ユーザーの個人情報を尊重し、その保護に努めます。</p>

                <h2>収集する情報</h2>
                <p>当アプリは、サービスの提供に必要な範囲で、以下の情報を収集することがあります。</p>
                <ul>
                    <li>アカウント情報（お名前、メールアドレスなど）</li>
                    <li>利用状況データ</li>
                    <li>端末情報</li>
                </ul>

                <h2>情報の利用目的</h2>
                <p>収集した情報は、以下の目的で利用します。</p>
                <ul>
                    <li>サービスの提供および改善</li>
                    <li>ユーザーサポート</li>
                    <li>重要なお知らせの通知</li>
                </ul>

                {/* ... More detailed policy content would go here ... */}
            </main>

            <PublicFooter />
        </div>
    );
}
