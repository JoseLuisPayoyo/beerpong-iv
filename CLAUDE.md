# CLAUDE.md

Guidance for Claude Code working in this repository. Read this first, every session.

## What this is

Web app to run a beer pong tournament ("Beerpong IV"), a yearly village event (~48 teams + a few hundred spectators, one night in early August). It replaces a manual paper/Excel process. It handles online registration, automatic group generation, the knockout bracket, and live results that update on everyone's screen as referees enter them.

Full design rationale lives in `/docs/design.md`. This file is the operational summary.

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 (CSS-first theming in `globals.css`)
- shadcn/ui (components copied into `src/components/ui`, base color Neutral)
- Supabase (Postgres + Auth + Realtime)
- Deploy on Vercel
- Package manager: npm

## Architecture (important)

Reads and writes are deliberately split:

- Reads: the browser reads directly from Supabase, using Realtime so public views update live. RLS allows public SELECT only on public-facing data.
- Writes: never directly from the browser. Every write goes through a Next.js route handler (API route) that validates the actor (admin session or referee PIN) on the server, then writes using the Supabase service role. RLS blocks all direct browser writes.

This keeps the database locked down: anyone can read, but only validated actors can change anything.

## Roles & access

- Admin (2 organizers): Supabase Auth login. Full control.
- Referee: access via a per-table PIN, no account. Can only submit results for their own table.
- Public / teams: no login, read-only.

## Tournament rules (build the logic to match these exactly)

- Teams register in pairs. Capacity is 48 teams; when full, registration closes automatically and extra sign-ups go to a waiting list.
- Group stage: groups of exactly 4 teams. `number_of_groups = registered_teams / 4` (so it adapts: 48 teams -> 12 groups, 44 -> 11, etc.).
- Within a group: round-robin (6 matches). With the 4 teams indexed 0-3, the fixed match order is: (0,1), (2,3), (0,2), (1,3), (0,3), (1,2).
- Physical tables: 4 (extensible to 6 later). Time blocks ("turnos"): 3. Each group is assigned to one table and one turno, and plays all 6 of its matches there.
- Match scores must be stored as points for / points against per team, not just the winner. The point difference is needed for tiebreaks.
- Group standings ranking: wins (desc), then point difference (desc), then points for (desc).
- Qualification to the Round of 16: every group winner plus the best runners-up. `best_runners_up = 16 - number_of_groups`. Runners-up are ranked across all groups by point difference.
- Knockout rounds: Round of 16 -> quarterfinals -> semifinals -> final. The bracket is auto-seeded (winners vs runners-up, avoiding same-group early rematches) and the admin can reorder it via drag-and-drop before the stage starts.
- Live operation: no fixed wall-clock times. Matches advance by status (`pending` -> `live` -> `finished`). When a referee finishes a match, the next match on that table becomes current. Public views show the current and next match per table.
- Realtime: subscribe to the matches table; standings, bracket, and "next up" update automatically on all screens.

## Product decisions (v1)

- Payment: manual. Teams pay by Bizum/cash; admin marks a team as paid. No payment gateway.
- Capacity: auto-close at 48 + waiting list.
- Multi-edition: the data model supports reusing the app year after year.
- Notifications to teams (WhatsApp/SMS): out of scope for v1, planned for v2.

## Data per team (registration)

Team name, player 1, player 2, contact phone, optional email, paid (bool, set by admin), checked_in (bool, set by admin).

## Conventions

- All code, identifiers, and comments in English.
- `src/` directory, default `@/*` import alias.
- shadcn components in `src/components/ui`; prefer them over hand-rolled UI.
- Mobile-first. Everyone uses this on a phone during the event.
- Aesthetic: clean, sober, minimal, easy to use. Accessibility matters (keyboard, screen readers) — shadcn gives this by default, don't undo it.
- Brand accent: orange (theming added in a dedicated step; until then, Neutral base is fine).

## Working agreement

- Make small, verifiable changes. Run the dev server and type-check before committing.
- Keep this file and the README up to date as the app evolves (especially the "Status" below).
- This project runs Next.js 16 (App Router, Turbopack). It is newer than most training data, so APIs and conventions may differ from what you remember — when in doubt, check the bundled docs in `node_modules/next/dist/docs/` and heed deprecation notices instead of guessing.

## Status

Foundation scaffolded and verified. Next.js 16 (App Router, `src/`, TypeScript, ESLint) + Tailwind CSS v4 + shadcn/ui (Neutral base color) are installed. `button` and `card` components are in `src/components/ui`; the home page is a minimal "Beerpong IV" placeholder with a Button. Production build and dev server both run clean. Next step: wire up Supabase (client + service-role server access) and the data model.