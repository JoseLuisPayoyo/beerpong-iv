import type { ReactNode } from "react";

// The one button we want pressed: solid orange, dark ink. Renders an anchor
// when given an `href` (the hero CTA jumps to #register); otherwise a non-
// submitting <button> placeholder (the register form isn't wired to /api yet).
export function Cta({
  href,
  children,
  className = "",
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const classes = `lp-cta ${className}`;
  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={classes}>
      {children}
    </button>
  );
}
