import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

// Public Sans: a plain, highly readable typeface made for public-service websites.
const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CSULB Services Assistant",
  description:
    "Ask questions about CSULB student services. Answers come only from official CSULB web pages, with sources.",
  // A student class project that uses Long Beach State's mascot: keep it out of search results so it
  // isn't mistaken for an official CSULB service (Entry 30).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
