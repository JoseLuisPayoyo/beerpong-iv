import { Cta } from "./Cta";
import { MonoLabel } from "./MonoLabel";
import { Section } from "./Section";

// 6 — LA INSCRIPCIÓN. The climax. Warm orange+magenta pool, centred.
//
// FUTURE WORK lands right here, in two later steps:
//   (a) the 3D beer-pong ball (R3F) that drops into the cup in this section, and
//   (b) the REAL registration form — these inputs submit nowhere yet. The live
//       version POSTs to a /api route handler that validates on the server and
//       writes via the Supabase service role (never directly from the browser).
//
// Fields mirror the team registration model: team name, two players, contact.
export function RegisterSection() {
  return (
    <Section
      id="register"
      background="lp-bg-register"
      labelledBy="register-title"
      className="justify-center gap-8"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <MonoLabel>// La inscripción</MonoLabel>
        <h2
          id="register-title"
          className="lp-display lp-display-xl text-[var(--lp-cream)]"
        >
          ¿Te quedas fuera?
        </h2>
      </div>

      {/* Placeholder form — intentionally not wired to anything. */}
      <form
        className="flex w-full max-w-md flex-col gap-3 self-center"
        aria-label="Inscripción de equipo (próximamente)"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reg-team" className="lp-label">
            Nombre del equipo
          </label>
          <input
            id="reg-team"
            name="team"
            className="lp-field"
            placeholder="Los Tiracopas"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reg-p1" className="lp-label">
              Jugador 1
            </label>
            <input
              id="reg-p1"
              name="player1"
              className="lp-field"
              placeholder="Nombre"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reg-p2" className="lp-label">
              Jugador 2
            </label>
            <input
              id="reg-p2"
              name="player2"
              className="lp-field"
              placeholder="Nombre"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reg-contact" className="lp-label">
            Contacto
          </label>
          <input
            id="reg-contact"
            name="contact"
            type="tel"
            inputMode="tel"
            className="lp-field"
            placeholder="Teléfono"
            autoComplete="off"
          />
        </div>

        {/* Will POST to /api once the real form lands. */}
        <Cta className="mt-2 w-full">Inscribe a tu equipo →</Cta>
      </form>

      {/* Status echo of the hero counter — also live via Realtime later. */}
      <p className="lp-label text-center">
        <span className="text-[var(--lp-lime)]">Quedan 06</span> · Lista de
        espera pronto
      </p>
    </Section>
  );
}
