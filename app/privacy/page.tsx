import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white pt-16 text-slate-900">
      <PublicHeader />

      <main className="prose prose-slate mx-auto max-w-4xl px-6 py-20">
        <div>
          <h1>プライバシーポリシー</h1>
          <p>
            TraveLog（以下、「本サービス」といいます。）は、本サービスにおけるユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下、「本ポリシー」といいます。）を定めます。
          </p>

          <h2>第1条（個人情報）</h2>
          <p>
            「個人情報」とは、個人情報保護法にいう個人情報を指し、生存する個人に関する情報であって、氏名、メールアドレスその他の記述等により特定の個人を識別できる情報をいいます。
          </p>

          <h2>第2条（個人情報の収集方法）</h2>
          <p>
            本サービスは、ユーザーが利用登録をする際に、氏名、メールアドレスなどの個人情報をお尋ねすることがあります。
          </p>

          <h2>第3条（個人情報を収集・利用する目的）</h2>
          <p>本サービスが個人情報を収集・利用する目的は、以下のとおりです。</p>
          <ul>
            <li>本サービスの提供・運営のため</li>
            <li>ユーザーからのお問い合わせに回答するため</li>
            <li>サービス改善や新機能開発のため</li>
            <li>利用規約に違反したユーザーの特定および対応のため</li>
          </ul>

          <h2>第4条（利用目的の変更）</h2>
          <p>
            本サービスは、利用目的が変更前と関連性を有すると合理的に認められる場合に限り、個人情報の利用目的を変更するものとします。
          </p>

          <h2>第5条（個人情報の第三者提供）</h2>
          <p>
            本サービスは、法令に定める場合を除いて、あらかじめユーザーの同意を得ることなく第三者に個人情報を提供しません。
          </p>

          <h2>第6条（個人情報の開示）</h2>
          <p>
            本サービスは、本人から個人情報の開示を求められたときは、本人に対し遅滞なくこれを開示します。ただし、法令により開示義務を負わない場合はこの限りではありません。
          </p>

          <h2>第7条（プライバシーポリシーの変更）</h2>
          <p>
            本サービスは、法令その他本ポリシーに別段の定めのある事項を除いて、ユーザーに通知することなく本ポリシーの内容を変更することができます。
          </p>

          <h2>第8条（お問い合わせ窓口）</h2>
          <p>
            本ポリシーに関するお問い合わせは、アプリ内のお問い合わせ窓口または運営者が指定する連絡先までお願いいたします。
          </p>

          <p>2025年7月15日 制定</p>
        </div>

        <div className="mt-10 flex items-center gap-4 text-sm font-semibold not-prose text-slate-500">
          <Link href="/privacy" className="transition hover:text-slate-900">
            プライバシーポリシー
          </Link>
          <Link href="/terms" className="transition hover:text-slate-900">
            利用規約
          </Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
