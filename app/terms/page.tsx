import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white pt-16 text-slate-900">
      <PublicHeader />

      <main className="prose prose-slate mx-auto max-w-4xl px-6 py-20">
        <div>
          <h1>利用規約</h1>
          <p>
            この利用規約（以下、「本規約」といいます。）は、TraveLog（以下、「本サービス」といいます。）が提供するサービス（以下、「本サービス」といいます。）の利用条件を定めるものです。ユーザーの皆さま（以下、「ユーザー」といいます。）には、本規約に従って本サービスをご利用いただきます。
          </p>

          <h2>第1条（適用）</h2>
          <p>
            本規約は、ユーザーと本サービスとの間の本サービスの利用に関わる一切の関係に適用されるものとします。
          </p>

          <h2>第2条（禁止事項）</h2>
          <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ul>
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>本サービスの運営を妨害するおそれのある行為</li>
          </ul>

          <h2>第3条（本サービスの提供の停止等）</h2>
          <p>
            本サービスは、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく本サービスの全部または一部の提供を停止または中断することができます。
          </p>

          <h2>第4条（免責事項）</h2>
          <p>
            本サービスの債務不履行責任は、本サービスの故意または重大な過失によらない場合には免責されるものとします。
          </p>

          <h2>第5条（サービス内容の変更等）</h2>
          <p>
            本サービスは、ユーザーへの事前の告知なく、本サービスの内容を変更し、または提供を中止することができます。
          </p>

          <h2>第6条（利用規約の変更）</h2>
          <p>
            本サービスは必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができます。
          </p>

          <h2>第7条（準拠法・裁判管轄）</h2>
          <p>
            本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、本サービスの所在地を管轄する裁判所を専属的合意管轄とします。
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
