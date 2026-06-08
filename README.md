# Beerpong IV

Web app to run a beer pong tournament: online registration, automatic group generation, knockout bracket, and live results that update in real time as referees enter them.

Built to replace the manual paper/Excel process used to run the event (a yearly village tournament: up to 48 teams in pairs, plus a few hundred spectators, one night in early August).

## Features (v1)

- Online team registration (pairs), with automatic close at capacity and a waiting list
- Admin panel: generate groups automatically, build and edit the knockout bracket, manage registrations and payments
- Public view: group standings, knockout bracket, and the current/next match per table
- Referee view: enter results for your table via a PIN, no account needed
- Live updates on every screen via realtime
- Mobile-first, clean and minimal UI

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Supabase (Postgres + Auth + Realtime)
- Deployed on Vercel

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

Environment variables (Supabase keys, etc.) go in `.env.local` — see `.env.example` once it's added.

## Roles

- Admin: full control of the tournament (login).
- Referee: submits results for one table (PIN, no account).
- Public / teams: read-only, no login.

## Roadmap

- v2: automatic notifications to teams (WhatsApp/SMS), online payment, cross-edition stats and history.

## Project context

Architecture decisions, tournament rules, and conventions are documented in `CLAUDE.md` and `/docs/design.md`.