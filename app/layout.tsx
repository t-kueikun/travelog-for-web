import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraveLog",
  description: "TraveLog web"
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
