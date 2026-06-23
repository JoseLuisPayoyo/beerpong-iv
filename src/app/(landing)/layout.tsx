import { Anton, Inter, Space_Mono } from "next/font/google";
import "./landing.css";

// Landing shell (public festival side, served at "/").
//
// This is where the landing's identity lives, and ONLY here:
//   - Display fonts (loaded with next/font, same nested-layout pattern the
//     /torneo shell uses for Geist) so they never enter the operational bundle.
//   - landing.css, whose every rule is scoped under `.landing-root` because
//     Next does not unload a layout's CSS on client navigation — scoping is
//     what guarantees none of it reaches /torneo.
//
// Animation providers (Motion / Lenis / R3F) arrive in later steps and will be
// mounted HERE too. Do not add them yet.

// Anton — brutal condensed display for the giant headlines (single weight).
const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Space Mono — every tournament datum: counters, times, statuses, codenames.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

// Inter — the little running copy there is.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      lang="es"
      className={`${anton.variable} ${spaceMono.variable} ${inter.variable} landing-root flex flex-1 flex-col`}
    >
      {/* Warm backdrop pinned behind content so iOS overscroll never flashes
          the shared white <body>. */}
      <div aria-hidden className="lp-bg-base" />
      {children}
    </div>
  );
}
