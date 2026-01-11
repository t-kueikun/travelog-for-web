"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function PublicHeader() {
    const pathname = usePathname();
    const router = useRouter();

    const handleLoginClick = () => {
        // If we are on the home page (landing page), we might want to trigger the login view.
        // Since AuthGate controls the login view state, pushing to "/" is the simplest way 
        // to get back to the entry point. The user will click "Login" on the Landing Page there.
        // Ideally, we could use a query param to auto-open it, but for now simple navigation is fine.
        router.push("/");
    };

    const navItems = [
        { label: "特徴", href: "/features" },
        { label: "使い方", href: "/howto" },
        { label: "ギャラリー", href: "/gallery" },
    ];

    return (
        <header className="fixed top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-100">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
                <Link href="/" className="text-xl font-bold tracking-tight text-slate-900 hover:opacity-80 transition">
                    TraveLog
                </Link>

                <nav className="hidden md:flex items-center gap-8">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`text-sm font-medium transition ${pathname === item.href
                                    ? "text-blue-600"
                                    : "text-slate-600 hover:text-slate-900"
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleLoginClick}
                        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 hover:shadow-lg"
                    >
                        ログイン / 登録
                    </button>
                </div>
            </div>
        </header>
    );
}
