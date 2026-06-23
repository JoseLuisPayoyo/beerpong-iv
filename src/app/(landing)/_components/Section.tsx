import type { ReactNode } from "react";

// Full-viewport section shell. `background` is one of the `.lp-bg-*` classes
// that paint this section's spot on the orange -> magenta scroll journey.
// The <section> itself is the positioned ancestor (lp-section is relative), so
// absolutely-positioned children (e.g. the hero scroll cue) anchor to it.
export function Section({
  id,
  background,
  labelledBy,
  className = "",
  children,
}: {
  id: string;
  background: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`lp-section ${background}`}>
      <div className={`mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 ${className}`}>
        {children}
      </div>
    </section>
  );
}
