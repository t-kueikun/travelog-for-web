import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraveLog",
  description: "TraveLog web",
  applicationName: "TraveLog",
  manifest: "/manifest.webmanifest",
  themeColor: "#F2F2F7",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TraveLog"
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  },
  other: {
    "apple-itunes-app": "app-id=6748625749"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
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
