"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

type PublicHeaderProps = {
    onLoginClick?: () => void;
};

export default function PublicHeader({ onLoginClick }: PublicHeaderProps) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLoginClick = () => {
        if (onLoginClick) {
            onLoginClick();
        } else {
            router.push("/?login=true");
        }
    };

    const navItems = [
        { label: "特徴", href: "/features" },
        { label: "使い方", href: "/howto" },
        { label: "お問い合わせ", href: "/contact" },
    ];

    return (
        <header className="fixed top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-xl transition-all duration-300">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
                <Link href="/" className="group flex items-center gap-2 transition hover:opacity-80">
                    <Image
                        src="/TraveLog-icon.png"
                        alt="TraveLog"
                        width={120}
                        height={120}
                        className="h-12 w-auto"
                        priority
                        quality={100}
                    />
                </Link>

                <nav className="hidden md:flex items-center gap-8">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group relative text-sm font-medium tracking-wide transition-colors duration-200 ${pathname === item.href
                                ? "text-slate-900"
                                : "text-slate-500 hover:text-slate-900"
                                }`}
                        >
                            {item.label}
                            <span
                                className={`absolute -bottom-1 left-0 h-px w-full origin-left bg-slate-900 transition-transform duration-300 ease-out ${pathname === item.href ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                                    }`}
                            />
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleLoginClick}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-slate-700 hover:shadow-md"
                    >
                        ログイン
                    </button>
                </div>
            </div>
        </header>
    );
}
