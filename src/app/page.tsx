import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Beerpong IV</h1>
      <p className="text-muted-foreground max-w-md text-balance">
        Tournament app foundation is up. UI styling is wired through Tailwind and
        shadcn/ui.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
