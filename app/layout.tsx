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
  title: { default: "CastAnet", template: "%s — CastAnet" },
  applicationName: "CastAnet",
  description:
    "CastAnet gives creative agencies a private workspace with branded talent portal, digital contracts, escrow payments and internal agents — all in one platform.",
  keywords: [
    "talent management",
    "agency platform",
    "digital contracts",
    "talent portal",
    "escrow payments",
    "creative agency",
    "talent booking",
    "agency workspace",
    "CastAnet",
  ],
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { title: "CastAnet" },
  other: { "msapplication-TileImage": "/brand/mstile-150x150.png" },
  openGraph: {
    title: "CastAnet — Agency Talent Management Platform",
    description:
      "Private workspace for creative agencies: branded talent portal, digital contracts, escrow payments and internal agents in one place.",
    url: "https://brisahub.com.br",
    siteName: "CastAnet",
    images: [
      {
        url: "/brand/castanet-og-1200x630.png",
        width: 1200,
        height: 630,
        alt: "CastAnet",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CastAnet — Agency Talent Management Platform",
    description:
      "Private workspace for creative agencies: branded talent portal, digital contracts, escrow payments and internal agents in one place.",
    images: ["/brand/castanet-og-1200x630.png"],
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
