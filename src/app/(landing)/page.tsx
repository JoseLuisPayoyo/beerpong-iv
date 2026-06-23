import { DuskSection } from "./_components/DuskSection";
import { EditionsSection } from "./_components/EditionsSection";
import { HeroSection } from "./_components/HeroSection";
import { NightSection } from "./_components/NightSection";
import { RegisterSection } from "./_components/RegisterSection";
import { TournamentSection } from "./_components/TournamentSection";

// Public landing for Beerpong IV ("/").
//
// Six stacked full-viewport sections in narrative order, told as a single dusk-
// to-night journey: the page warms from orange (hype, the tournament) down to
// magenta (the fiesta) and lands on the registration climax.
//
// STATIC by design at this step: native browser scroll, no scroll-linking, no
// Lenis, no 3D, no Realtime. Movement and the falling ball come in later steps,
// built on top of this layout.
export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <HeroSection />
      <DuskSection />
      <TournamentSection />
      <NightSection />
      <EditionsSection />
      <RegisterSection />
    </main>
  );
}
