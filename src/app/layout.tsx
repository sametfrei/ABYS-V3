import type { Metadata } from "next";
import "./globals.css";

// Yazı tipleri sistem yığınlarından gelir (globals.css'te tanımlı).
// next/font/google KULLANILMAZ: derleme anında Google'dan font indirmek,
// çevrimdışı/kısıtlı ağlarda üretim derlemesini kırıyordu ve dış bağımlılıktı.

export const metadata: Metadata = {
  title: "ABYS Intelligence",
  description: "Company intelligence, calmly delivered.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
