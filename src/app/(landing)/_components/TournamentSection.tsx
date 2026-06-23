import { MonoLabel } from "./MonoLabel";
import { Section } from "./Section";

// 3 — EL TORNEO. Orange -> amber. The format, as arcade data tiles.
// Note: 6 tables (06) — the layout is built for 6, extensible to more later.
const STATS = [
  { value: "48", label: "Equipos" },
  { value: "12", label: "Grupos" },
  { value: "06", label: "Mesas" },
  { value: "16", label: "Octavos" },
];

export function TournamentSection() {
  return (
    <Section
      id="tournament"
      background="lp-bg-tournament"
      labelledBy="tournament-title"
      className="justify-center gap-8"
    >
      <div className="flex flex-col gap-4">
        <MonoLabel>// El formato</MonoLabel>
        <h2
          id="tournament-title"
          className="lp-display lp-display-lg text-[var(--lp-cream)]"
        >
          El torneo
        </h2>
        <p className="lp-body max-w-md text-[var(--lp-cream-dim)]">
          Grupos de cuatro, todos contra todos. Los mejores cruzan a octavos y
          empieza la eliminatoria directa.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((s) => (
          <li key={s.label} className="lp-card flex flex-col gap-1 p-5">
            <span className="lp-mono text-4xl font-bold leading-none text-[var(--lp-orange)]">
              {s.value}
            </span>
            <span className="lp-label">{s.label}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
