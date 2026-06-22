// Operational home ("/torneo"). Placeholder for now — live standings and the
// "next up" board will replace this in a later step.
export default function TorneoPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Operativa del torneo
      </h1>
      <p className="text-muted-foreground max-w-md text-balance">
        Standings, bracket y entrada de resultados en directo. Placeholder
        mientras se construye.
      </p>
    </main>
  );
}
