import { CapacityMeter } from "./CapacityMeter";
import { Cta } from "./Cta";
import { ScrollCue } from "./ScrollCue";
import { Section } from "./Section";

// 1 — HERO. Orange reigns. The whole page's single <h1> lives here.
export function HeroSection() {
  return (
    <Section
      id="hero"
      background="lp-bg-hero"
      labelledBy="hero-title"
      className="justify-between gap-10"
    >
      {/* top kicker */}
      <div className="lp-label flex items-center justify-between">
        {/* TODO: organizing peña / crew name slots in here */}
        <span>Beerpong · IV</span>
        <span>06 Ago · 2026</span>
      </div>

      {/* the shout */}
      <div className="flex flex-col items-start">
        <h1
          id="hero-title"
          aria-label="Beerpong IV — 6 de agosto de 2026"
          className="lp-display lp-display-hero text-[var(--lp-cream)]"
        >
          <span className="block">Beer</span>
          <span className="block">Pong</span>
        </h1>
        <div aria-hidden className="mt-3 flex items-end gap-4">
          <span className="lp-mono lp-display-xl font-bold leading-none text-[var(--lp-orange)]">
            IV
          </span>
          <span className="lp-mono pb-2 text-2xl text-[var(--lp-cream-faint)]">
            2026
          </span>
        </div>
      </div>

      {/* the ask */}
      <div className="flex flex-col gap-6">
        <CapacityMeter />
        <Cta href="#register" className="self-start">
          Inscribe a tu equipo →
        </Cta>
      </div>

      <ScrollCue />
    </Section>
  );
}
