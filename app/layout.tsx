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
  title: { default: "BrisaHub", template: "%s — BrisaHub" },
  description:
    "BrisaHub gives creative agencies a private workspace with branded talent portal, digital contracts, escrow payments and internal agents — all in one platform.",
  keywords: [
    "talent management",
    "agency platform",
    "digital contracts",
    "talent portal",
    "escrow payments",
    "creative agency",
    "talent booking",
    "agency workspace",
    "BrisaHub",
  ],
  icons: { icon: "/logo.png" },
  openGraph: {
    title: "BrisaHub — Agency Talent Management Platform",
    description:
      "Private workspace for creative agencies: branded talent portal, digital contracts, escrow payments and internal agents in one place.",
    url: "https://brisahub.com.br",
    siteName: "BrisaHub",
    images: [
      {
        url: "/images/screenshots/agencydashboard.png",
        width: 1280,
        height: 800,
        alt: "BrisaHub agency dashboard",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BrisaHub — Agency Talent Management Platform",
    description:
      "Private workspace for creative agencies: branded talent portal, digital contracts, escrow payments and internal agents in one place.",
    images: ["/images/screenshots/agencydashboard.png"],
  },
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
