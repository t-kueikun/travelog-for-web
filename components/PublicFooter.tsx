"use client";

import Link from "next/link";

export default function PublicFooter() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="border-t border-slate-100 bg-white py-12 text-sm text-slate-500">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="grid gap-12 md:grid-cols-4 lg:gap-8">
                    <div className="col-span-2">
                        <Link href="/" className="text-lg font-bold tracking-tight text-slate-900 hover:text-slate-700">
                            TraveLog
                        </Link>
                        <p className="mt-6 max-w-sm leading-relaxed">
                            複雑な旅の計画を、シンプルに。<br />
                            TraveLogは、あなたの旅をよりスマートに、<br />
                            一元管理するためのオールインワン・プラットフォームです。
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-900 mb-4">Site Map</h4>
                        <ul className="space-y-3">
                            <li><Link href="/" className="hover:text-slate-900 transition-colors">Home</Link></li>
                            <li><Link href="/features" className="hover:text-slate-900 transition-colors">Features</Link></li>
                            <li><Link href="/howto" className="hover:text-slate-900 transition-colors">How to use</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-900 mb-4">Legal & Support</h4>
                        <ul className="space-y-3">
                            <li><Link href="/contact" className="hover:text-slate-900 transition-colors">Contact</Link></li>
                            <li><Link href="/terms" className="hover:text-slate-900 transition-colors">Terms of Service</Link></li>
                            <li><Link href="/privacy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="mt-12 border-t border-slate-100 pt-8 text-center md:text-left">
                    <p>&copy; {currentYear} TraveLog. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}
