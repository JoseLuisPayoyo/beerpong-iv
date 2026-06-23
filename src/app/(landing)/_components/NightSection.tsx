import { MonoLabel } from "./MonoLabel";
import { Section } from "./Section";

// 4 — CAE LA NOCHE. The pivot to magenta. The DJ line-up is the hype, kept
// REDACTED on purpose (the ▓▓▓ codenames). Static placeholder: no reveal logic
// and no Supabase data yet.
const DJS = [
  { line: "DJ ▓▓▓ · Techno melódico · 19:00", note: "Sesión de tarde" },
  { line: "DJ ▓▓▓ b2b ▓▓▓ · ??? · 00:00", note: "B2B de medianoche" },
];

export function NightSection() {
  return (
    <Section
      id="night"
      background="lp-bg-night"
      labelledBy="night-title"
      className="justify-center gap-8"
    >
      <div className="flex flex-col gap-4">
        <MonoLabel accent="magenta">// Cae la noche</MonoLabel>
        <h2
          id="night-title"
          className="lp-display lp-display-lg text-[var(--lp-cream)]"
        >
          Empieza la fiesta
        </h2>
      </div>

      <ul className="flex flex-col gap-3">
        {DJS.map((dj) => (
          <li key={dj.line} className="lp-card flex items-center gap-4 p-4">
            <span className="lp-dj-thumb" aria-hidden>
              ?
            </span>
            <div className="flex flex-col gap-1">
              <span className="lp-mono text-[var(--lp-cream)]">{dj.line}</span>
              <span className="lp-label">{dj.note}</span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
