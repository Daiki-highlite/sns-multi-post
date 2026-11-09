import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
import "./approval-dashboard.css";
import "./swipe-approval.css";
import "./destinations.css";

export const metadata: Metadata = {
  title: "Highlite | 投稿ダッシュボード",
  description: "原稿を確認して、承認した投稿を届ける。Highliteのプライベート投稿管理。",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet"/></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
