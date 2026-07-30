import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cairo, Space_Grotesk } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "قصّاص AI — قص اللقطات بالذكاء الاصطناعي",
  description:
    "قص أي لقطة من أي فيديو بوصف نصي، مدعوم بنماذج Gemini مع تحليل الصور والصوت وتصدير H.264 متوافق مع Premiere Pro.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${grotesk.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
