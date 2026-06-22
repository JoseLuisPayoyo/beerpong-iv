import type { Metadata } from "next";
import "./globals.css";

// Thin root layout. It owns only <html>/<body>, the shared globals.css, and
// base metadata — nothing else. Display fonts, animation providers, and
// section-specific styling live in the nested layouts ((landing) and torneo)
// so the two sides of the app stay isolated from each other.
export const metadata: Metadata = {
  title: "Beerpong IV",
  description:
    "Run the Beerpong IV tournament: registration, groups, knockout bracket, and live results.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
