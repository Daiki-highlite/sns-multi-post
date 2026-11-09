import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
