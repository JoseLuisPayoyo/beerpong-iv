import type { CSSProperties } from "react";

// Capacity block: status dot + big remaining/total count + progress bar.
//
// STATIC for this step — numbers are hardcoded. In a later step `remaining`
// (and therefore the status + bar) becomes LIVE via Supabase Realtime on the
// matches/teams data, updating on every screen as teams register.
//
// All three states are wired here so the live step only has to pick one:
//   free -> lime    "PLAZAS LIBRES"
//   last -> amber   "ÚLTIMAS PLAZAS"
//   full -> magenta "COMPLETO · LISTA DE ESPERA"
type Status = "free" | "last" | "full";

const STATUS: Record<Status, { color: string; label: string }> = {
  free: { color: "var(--lp-lime)", label: "Plazas libres" },
  last: { color: "var(--lp-amber)", label: "Últimas plazas" },
  full: { color: "var(--lp-magenta)", label: "Completo · Lista de espera" },
};

const pad = (n: number) => n.toString().padStart(2, "0");

export function CapacityMeter({
  remaining = 6,
  total = 48,
  status = "free",
}: {
  remaining?: number;
  total?: number;
  status?: Status;
}) {
  const taken = Math.max(0, total - remaining);
  const takenPct = total > 0 ? (taken / total) * 100 : 0;
  const s = STATUS[status];

  return (
    <div className="w-full max-w-xs">
      <div
        className="lp-status"
        style={{ "--lp-status": s.color } as CSSProperties}
      >
        <span className="lp-status-dot" aria-hidden />
        <span>{s.label}</span>
      </div>

      <p className="lp-mono mt-3 flex items-baseline gap-2">
        <span className="text-5xl font-bold leading-none text-[var(--lp-cream)]">
          {pad(remaining)}
        </span>
        <span className="text-xl text-[var(--lp-cream-faint)]">
          / {pad(total)}
        </span>
      </p>

      <div
        className="lp-meter-track mt-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={taken}
        aria-label={`${taken} de ${total} plazas ocupadas`}
      >
        <div className="lp-meter-fill" style={{ width: `${takenPct}%` }} />
      </div>
    </div>
  );
}
