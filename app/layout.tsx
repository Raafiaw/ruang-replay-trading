import type { Metadata } from "next";
import "./globals.css";
import "./terminal.css";

export const metadata: Metadata = {
  title: "Ruang Replay — Laboratorium Trading",
  description: "Latihan trading virtual, replay candle MT5, dan backtest Pine terbatas. Pelajari keputusan Anda, satu candle pada satu waktu.",
  icons: {
    icon: "/replay.svg",
    shortcut: "/replay.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
