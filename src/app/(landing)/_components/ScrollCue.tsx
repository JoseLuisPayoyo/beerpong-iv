// Quiet "keep scrolling" nudge pinned to the bottom of the hero. Pure CSS bob
// (defined in landing.css, disabled under prefers-reduced-motion). Decorative,
// so it's hidden from assistive tech.
export function ScrollCue() {
  return (
    <div
      aria-hidden
      className="lp-scroll-cue absolute bottom-6 left-1/2 -translate-x-1/2 text-[var(--lp-cream)]"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
