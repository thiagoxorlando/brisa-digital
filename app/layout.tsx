import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { RoleProvider } from "@/lib/RoleProvider";
import { LanguageProvider } from "@/lib/LanguageContext";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brisa Digital",
  description: "Sistema para gerenciar staff, eventos, contratos e pagamentos",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-zinc-900 font-sans">
        <LanguageProvider><RoleProvider>{children}</RoleProvider></LanguageProvider>
      </body>
    </html>
  );
}
