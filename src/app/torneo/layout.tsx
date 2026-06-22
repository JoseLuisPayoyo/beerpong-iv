import { Geist, Geist_Mono } from "next/font/google";

// Tournament shell (operational side, served under "/torneo").
//
// Clean, minimal, mobile-first. The Geist fonts live here — not in the root
// layout — so the public landing can ship its own display fonts without pulling
// Geist into its bundle, and vice versa. No animation libraries belong here:
// this view has to stay light and fast during the live event.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function TorneoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} font-sans flex flex-1 flex-col`}
    >
      {children}
    </div>
  );
}
