import { MonoLabel } from "./MonoLabel";
import { Section } from "./Section";

// 2 — CAE LA TARDE. Warmer orange. Purely typographic — sets the scene.
export function DuskSection() {
  return (
    <Section
      id="dusk"
      background="lp-bg-dusk"
      labelledBy="dusk-title"
      className="justify-center gap-6"
    >
      <MonoLabel>// 18:00 · Cae la tarde</MonoLabel>
      <h2
        id="dusk-title"
        className="lp-display lp-display-md text-[var(--lp-cream)]"
      >
        Llegan 96 jugadores
      </h2>
      <p className="lp-body max-w-md leading-relaxed text-[var(--lp-cream-dim)]">
        El polideportivo se llena. 48 equipos, una sola pelota y la noche por
        delante. Empieza la batalla por el vaso.
      </p>
    </Section>
  );
}
