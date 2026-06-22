// Public landing for Beerpong IV ("/").
//
// Skeleton only: six placeholder sections in narrative order. No animation, no
// 3D, no copy beyond signposting — those arrive in later steps. Each section is
// anchored by id so navigation/scroll can target it once the real content and
// animation providers land.
export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Section id="hero" title="Hero" note="Beerpong IV — hype + cuenta atrás" />
      <Section id="dusk" title="Cae la tarde" note="Transición de ambiente" />
      <Section id="tournament" title="El torneo" note="Cómo funciona: grupos y bracket" />
      <Section id="night" title="Cae la noche / DJ" note="Fiesta y música" />
      <Section id="editions" title="Ediciones" note="Historia: I, II, III… y esta IV" />
      <Section
        id="register"
        title="El vaso — inscripción"
        note="Aquí irá el formulario de inscripción (placeholder; escribirá vía /api en un paso posterior)"
      />
    </main>
  );
}

function Section({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note: string;
}) {
  return (
    <section
      id={id}
      className="flex min-h-svh flex-col items-center justify-center gap-2 border-b p-8 text-center"
    >
      <p className="text-muted-foreground text-xs font-mono uppercase tracking-widest">
        #{id}
      </p>
      <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground max-w-md text-balance text-sm">{note}</p>
    </section>
  );
}
