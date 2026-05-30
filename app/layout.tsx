import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import { RoleProvider } from "@/lib/RoleProvider";
import { LanguageProvider } from "@/lib/LanguageContext";
import { resolveLang } from "@/lib/i18n";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BrisaHub",
  description: "Platform for managing talent, contracts, payments and bookings",
  icons: { icon: "/logo.png" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve language from the request cookie so the server and client agree on
  // the initial lang, avoiding the SSR→hydration flash for EN users.
  const cookieStore = await cookies();
  const initialLang = resolveLang(cookieStore.get("lang")?.value);

  return (
    <html lang={initialLang} className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-zinc-900 font-sans">
        <LanguageProvider initialLang={initialLang}>
          <RoleProvider>{children}</RoleProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
