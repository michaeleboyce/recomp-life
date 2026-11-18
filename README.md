# ReComp Life

A workout tracker for the GZCLP linear progression program that acts as a coach and shows
its working: every planned weight, forecast and adjustment comes with the rule and the
research behind it. Built for one lifter, offline-first, as an installable web app with an
iOS wrapper.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npx vitest run       # tests
npx tsc --noEmit     # type-check
npx eslint .         # lint
npm run build:native # static export for the iOS app (Capacitor)
```

Sync needs `DATABASE_URL` (Neon Postgres) and `SYNC_SECRET` (the shared passphrase) in the
environment; without them the app works on the device alone.

## Where things are

- `CLAUDE.md`: conventions and the program rules the code must keep.
- `docs/architecture.md`: a map of the code and how data flows.
- `docs/plans/`: the design and plan for each piece of work, newest last.
- `docs/coaching-rules.md`: every coaching rule with its evidence grade (generated from
  `src/lib/evidence/`; regenerate with `npm run docs:evidence`).
- `docs/research/`: notes behind the models.
