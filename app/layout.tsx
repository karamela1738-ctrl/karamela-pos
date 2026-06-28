import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Karamela POS",
    template: "%s | Karamela POS",
  },
  description:
    "Premium POS system for sales, inventory, waste management, reconciliation and business insights.",
  applicationName: "Karamela POS",
  keywords: [
    "POS",
    "Inventory",
    "Sales",
    "Restaurant",
    "Hotel",
    "Karamela",
    "Kenya",
  ],
  authors: [
    {
      name: "Karamela",
    },
  ],
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/karamela-icon.jpeg",
    shortcut: "/icons/karamela-icon.jpeg",
    apple: "/icons/karamela-icon.jpeg",
  },
};

export const viewport: Viewport = {
  themeColor: "#080604",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-[#080604] text-white selection:bg-[#d08a35]/40 selection:text-white">
        {children}
      </body>
    </html>
  );
}
