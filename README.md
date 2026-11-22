# LawLens AI — Consumer Legal Clarity

Understand any Indian consumer contract in about 60 seconds, in your language — on-device PII
shielding, a clause-by-clause risk X-ray, regional voice walkthroughs, and polite negotiation drafts.

## Quick start

```bash
npm install
cp .env.example .env      # then paste your keys (see below)
npm run dev               # → http://localhost:3000
```

That's it. `npm run dev` starts a single Express server on **http://localhost:3000** with Vite in
middleware mode, so you get HMR and the API from one process — there is no separate frontend port
to open.

### Keys

`.env` is gitignored; never commit it. Only the **LLM** key is required for the core audit flow.

| Variable | Required | What it powers |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes (default provider) | OCR, audit, grounded Q&A |
| `ANTHROPIC_API_KEY` | Only if `LLM_PROVIDER=anthropic` | Same, billed directly |
| `SARVAM_API_KEY` | Optional | Regional TTS / STT voice walkthrough |
| `PORT` | No (default `3000`) | Server port |
| `APP_URL` | No | Base URL used for share links |

Switch providers with one variable — `LLM_PROVIDER=openrouter` (default) or `LLM_PROVIDER=anthropic`.

**No key? It still runs.** `/api/audit` falls back to a local deterministic audit
(`fallback_used: true`) and the voice routes return `fallback_recommended: true` so the browser's own
TTS/STT takes over. You can explore the whole UI without credentials — the LLM-backed parts just
degrade.

Check what the server actually sees:

```bash
curl -s localhost:3000/api/health
```

`llmConfigured` / `sarvamConfigured` tell you whether your keys landed.

## Scripts

```bash
npm run dev         # dev server with HMR (Vite middleware)
npm start           # production mode: serves the prebuilt dist/ — run npm run build first
npm run build       # build the client into dist/
npm test            # unit tests (node:test via tsx)
npm run typecheck   # tsc --noEmit  (alias: npm run lint)
bash scripts/verify.sh   # full end-to-end harness: secret scan, typecheck, tests, all 6 API routes
```

`npm start` serves `dist/`, so `npm run build` must be run first. For local development always use
`npm run dev`, which reads source directly — otherwise edits won't show up.

## Verify everything

```bash
bash scripts/verify.sh
```

Boots the server on a scratch port and checks secrets-are-clean, typecheck, the test suite, and live
`curl`s of all six routes (`health`, `ocr`, `audit`, `qa`, `tts`, `stt`). Every check prints a
replayable command; each is `PASS`, `FAIL`, or `SKIP` (e.g. a quota-limited key). Exits non-zero on
any failure. Use `PORT=3300 bash scripts/verify.sh` if the default port is busy.

## Deploy to Vercel

One project serves both the SPA and the API. `api/[...path].ts` wraps the Express app from
`server.ts` as a single serverless function, so every `/api/*` route keeps its path.

```bash
npx vercel            # first run links the project and previews a deploy
npx vercel --prod     # promote to production
```

Or push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new) — the
checked-in `vercel.json` supplies the build command (`vite build`), output directory (`dist`), and
the function's memory/timeout. No dashboard build settings are needed.

Set these under **Project → Settings → Environment Variables** before the first deploy:

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes (default provider) | Without it, `/api/audit` silently uses the local fallback |
| `ANTHROPIC_API_KEY` | Only if `LLM_PROVIDER=anthropic` | |
| `SARVAM_API_KEY` | Optional | Voice degrades to the browser's own TTS/STT |
| `LLM_PROVIDER` | No | `openrouter` (default) or `anthropic` |

Do **not** set `PORT` or `NODE_ENV` — Vercel manages both. `APP_URL` is only used for share links.

Verify a deploy the same way as local, against the live URL:

```bash
curl -s https://<your-app>.vercel.app/api/health
```

`llmConfigured` / `sarvamConfigured` in that response tell you whether the env vars landed. If
`llmConfigured` is `false`, the keys are missing or scoped to the wrong environment.

Two things to know about this setup:

- **Uploads are capped at 4.5 MB** (`BODY_LIMIT` in `server.ts`), which is Vercel's request-body
  ceiling. Larger multi-page scans are rejected with `413 PAYLOAD_TOO_LARGE` — that is the platform
  limit, not a bug.
- **Long OCR calls need headroom.** The function is configured for `maxDuration: 60`, which requires
  a Pro plan; on Hobby the platform caps execution at 10s, so multi-page vision OCR may time out.
  Reduce pages per request or upgrade if you see 504s.



One codebase, two deliberate experiences — both at the same URL:

- **Desktop (≥1024px)** — workspace: contract lanes, clause risk X-ray, negotiation drafts, brief export.
- **Mobile** — camera-first capture flow with the blur and PII gates before anything is uploaded.

## Docs

- `docs/phase-status.md` — what's built, what's partial, and known gaps (honest status per phase).
- `DESIGN_SYSTEM.md` — visual language, type scale, motion, and the pinned screen specs.
- `docs/audit-result.schema.md` — the audit response contract the server enforces.
- `todo.md` — the phase checklist in detail.
