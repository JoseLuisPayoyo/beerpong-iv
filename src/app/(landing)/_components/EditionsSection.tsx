import type { CSSProperties } from "react";
import { MonoLabel } from "./MonoLabel";
import { Section } from "./Section";

// 5 — EDICIONES. Magenta night. Social proof as a sober scoreboard: two prior
// sell-outs read as urgency. Sold-out results glow orange (the king accent);
// lime/amber/magenta stay reserved for live capacity states.
const EDITIONS: { n: string; result: string; soldOut: boolean }[] = [
  { n: "I", result: "Sold out", soldOut: true },
  { n: "II", result: "Sold out", soldOut: true },
  { n: "III", result: "48 equipos", soldOut: false },
];

export function EditionsSection() {
  return (
    <Section
      id="editions"
      background="lp-bg-editions"
      labelledBy="editions-title"
      className="justify-center gap-8"
    >
      <div className="flex flex-col gap-4">
        <MonoLabel accent="magenta">// Lo que ya fue</MonoLabel>
        <h2
          id="editions-title"
          className="lp-display lp-display-md text-[var(--lp-cream)]"
        >
          Ediciones
        </h2>
      </div>

      <ul className="flex flex-col">
        {EDITIONS.map((e) => (
          <li key={e.n} className="lp-edition-row">
            <span className="uppercase text-[var(--lp-cream)]">
              Edición {e.n}
            </span>
            <span className="lp-edition-leader" aria-hidden />
            <span
              className="uppercase"
              style={
                {
                  color: e.soldOut
                    ? "var(--lp-orange)"
                    : "var(--lp-cream-dim)",
                } as CSSProperties
              }
            >
              {e.result}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
