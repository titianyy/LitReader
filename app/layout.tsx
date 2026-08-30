import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LitReader — Scientific reading log",
  description: "A private, local-first daily scientific literature reading log.",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
