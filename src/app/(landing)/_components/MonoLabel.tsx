import type { ReactNode } from "react";

// The mono "kicker" that opens most sections (e.g. "// CAE LA NOCHE").
// `.lp-label` handles the uppercase + tracking; `accent` recolours it magenta
// for the night/fiesta half of the page.
export function MonoLabel({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: "magenta";
}) {
  return (
    <p
      className="lp-label"
      style={accent === "magenta" ? { color: "var(--lp-magenta)" } : undefined}
    >
      {children}
    </p>
  );
}
