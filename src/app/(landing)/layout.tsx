// Landing shell (public festival side, served at "/").
//
// Intentionally minimal for now. In later steps this is where the landing's
// display fonts, animation providers (Motion/Lenis/R3F), and festive stylesheet
// (landing.css) will live — all scoped HERE so they never reach the /torneo
// bundle. Do not add those libraries until their dedicated step.
export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
