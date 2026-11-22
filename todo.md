# SignClear — Build TODO

> Sources: `AGENTS.md` (wins conflicts) · `knowledge-hub/prd.md` · `knowledge-hub/technical-stack.md` · `rules/schema.json`.
> Freeze 4:15 PM · Demos 6:00 PM.

---

## Status (auto-verified)

> Checked by reading the code, not the plan. **Baseline: this worktree (`wl/docs` @ `f2917c3`).**
> `main` is 8 commits ahead (`wl/verifier`, `wl/wayout`, `wl/desktop`, `wl/tests`); anything that only
> holds there is tagged **(main)**. Nothing is ticked to match intent — if the code does not do it, the box
> stays empty and the reason is written underneath.

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 — Contracts, docs & scaffolding | **Partial** | `docs/audit-result.schema.md`, `DESIGN_SYSTEM.md`, `mock-audit.json`, `vercel.json`, `.env.example`, `rules/schema.json` ship; `api/` and `public/{styles,js,presets,lib}` do not — replaced by Express + Vite/React |
| 1 — Rule packs & fixtures | **Partial** | 4 packs, 6 rules total (`src/data/rulePacks.ts`); 4 presets as TS, not JSON (`src/data/presets.ts`) |
| 2 — Pure logic + guardrail tests | **Done** | `src/utils/{promptSecurity,verifier,exposureMath,wayOutMath,piiGuard}.ts`; `npm test` 5/5 (14/14 on `main`) |
| 3 — Backend API | **Done** | `server.ts` `/api/{health,ocr,audit,qa,tts,stt}`; `server/llmClient.ts` provider switch + timeout + 1 retry |
| 4 — Dual-lane intake & privacy | **Partial** | `src/utils/ingest.ts`, `src/utils/piiGuard.ts`; no `[ILLEGIBLE]` refusal copy, no measured PDF timing budget |
| 5 — UI shell & design system | **Partial** | `src/index.css` + `src/components/*`; 56px bar (not 62px), no SVG sprite, no `data-clause-id` anchors |
| 6 — Audio, voice Q&A & sync | **Partial** | `audioSync.ts` + `voiceCapture.ts` + Hold-to-Ask wired; the clause *playlist* exists only on the unmerged `wl/audio` branch and is not imported |
| 7 — Negotiate, vault & brief | **Partial** | `src/utils/pdfBrief.ts` OK; vault persists whole audits incl. photo `data:` URLs, no "Don't save" toggle |
| 8 — Integration, verification & freeze | **Gap** | `scripts/verify.sh` covers 4 of 6 routes; secret-scan gate not clean (doc strings); smoke/deploy runs unrecorded |

Detail per phase (status + one-line evidence) lives in [`docs/phase-status.md`](docs/phase-status.md).

Phase 0 and Phase 1 were already ticked and stay ticked, with corrections where the wording outran the code.

**Newly ticked this pass (was `[ ]`, now genuinely implemented):** all of Phase 2 — `promptSecurity.ts`,
`verifier.ts`, `exposureMath.ts`, `wayOutMath.ts`, `piiGuard.ts`, the guardrail suite. All of Phase 3 —
`server/llmClient.ts`, `rulePacks.ts`, `prompts.ts`, and the `/api/{ocr,audit,qa,tts,stt}` routes. Phase 4:
Lane B canvas prep, blur verdict, 1-tap header blackout, PII shield badge + token popover, fail-closed abort,
telemetry stepper. Phase 5: `@theme` tokens, 900px split, `hydrateAuditFromApiPayload`, surface wiring,
manifest + icons. Phase 6: `spoken_script` sanitizer, `speechSynthesis` fallback, Hold-to-Ask, gesture-gated
playback. Phase 7: negotiation asks, Polite/Firm, WhatsApp (+ `mailto:` on mobile), jsPDF one-page brief,
vault edit/note/delete/clear. Phase 8: `npm test` green.

**Left unticked on purpose:** the original `public/js/*` / `public/styles/*` / `public/presets/*` / `api/*`
**paths** (the code lives in `src/` and `server.ts` instead — the parent item stays open for that reason),
per-concern rule coverage (notice symmetry, painting/exit charges, refund timeline, KFS, APR, penal-charge
cap, bond/clawback, ESOP lock-in), per-rule `verified_date`, Lane A `<150ms` scannability budget,
`[ILLEGIBLE]` refusal copy, `data-clause-id` anchors, the clause-level audio playlist and audio-driven pulse,
18% dim, vault "Don't save" / quota / no-image-persistence, a clean secret scan, and the live smoke runs on
desktop and phone plus the deploy check.

---

# Phase 0 — Contracts, Docs & Scaffolding

- [x] Freeze the data contract
  - [x] Map `rules/schema.json` required fields (rule + `expected_clauses`).
  - [x] Write `docs/audit-result.schema.md` (`/api/audit` response: score, exposure, findings[], clauses[], spoken_script, completeness).
  - [x] Define `mock-audit.json` shape to match that schema.
- [x] Unblock design — write `DESIGN_SYSTEM.md` (tokens, 900px breakpoint, mobile 62px sticky bar, desktop `[Report|Split|Contract]` 48/52, clause dim-to-18%, telemetry stepper).
  Doc exists and is now **synchronised with the code**: shipped values are 56px bar and 55% dim, both
  recorded as deviations in `DESIGN_SYSTEM.md` §8. Pulse and reduced-motion list verified against `src/index.css`.
- [ ] Scaffold directories — **partial**: config files landed, the JS/`api` trees were superseded
  - [ ] `public/` (`index.html`, `manifest.webmanifest`, `styles/`, `js/`, `presets/`, `lib/`) — only
        `public/manifest.webmanifest`, `public/icons/`, `public/assets/` exist. `styles/`, `js/`,
        `presets/`, `lib/` were replaced by the Vite + React tree (`src/`, root `index.html`).
  - [ ] `api/` (`ocr.js`, `audit.js`, `qa.js`, `tts.js`, `stt.js`, `_lib/`) — replaced: all five routes
        are Express handlers in `server.ts`; shared logic is `src/utils/*` and `server/llmClient.ts`.
  - [x] `tests/guardrails.test.mjs` — shipped as `src/utils/guardrails.test.ts`, run by `npm test`.
  - [x] `vercel.json`, `.env.example`, `.gitignore`
- [x] Define the 7 smoke tests (replaces the missing §13.2)
  - [x] PII token count visible pre-upload.
  - [x] BLR preset → Kannada audio plays, Clause 3 pulses, others dim.
  - [x] Way-Out slider shows ₹ saved vs current exposure.
  - [x] Kanglish Hold-to-Ask → grounded answer + scroll to clause.
  - [x] Missing Page 3 → amber banner + `Clause 4 → 7` gap.
  - [x] Polite WhatsApp draft copies cleanly.
  - [x] Mobile QR modal serves the same flow on a phone.
- [x] Env + provider contract
  - [x] `.env.example`: `LLM_PROVIDER`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `SARVAM_API_KEY`.
  - [x] Document one-var switch (`openrouter` default → `anthropic` at credits).

**✓ Checkpoint 0:** Audit schema frozen, `mock-audit.json` shape agreed, design spec exists, all directories and config files present, 7 smoke tests written down.

> **As verified:** schema + design spec + fixtures + config files are present. "All directories" is not —
> `api/` and `public/{styles,js,presets,lib}` were never created (Express + React replaced them).

---

# Phase 1 — Rule Packs & Fixtures

- [ ] `in-ka-rental` — deposit norm, lock-in months, notice symmetry, painting/exit charges, refund timeline.
  **Partial:** 3 rules only — `IN_KA_DEPOSIT_CAP`, `IN_KA_RENT_ESCALATION`, `IN_KA_LOCKIN_EXIT`
  (`src/data/rulePacks.ts:4`). Notice symmetry, painting/exit charges and refund timeline are not rules.
- [ ] `in-central-rbi-loan` — KFS disclosure, APR/all-in cost, prepayment penalty, penal-charge cap.
  **Partial:** 1 rule only — `IN_RBI_FORECLOSURE_CAP`. KFS, APR and penal-charge cap are not rules.
- [ ] `in-central-employment` — Sec 27 non-compete void, bond/clawback, notice, ESOP lock-in.
  **Partial:** 1 rule only — `IN_ICA_SEC27_NONCOMPETE`. Bond/clawback, notice and ESOP lock-in are not rules.
- [ ] Every rule carries `basis_type`, `severity`, `statutory_citation`, `verified_date`, `negotiation_ask` (polite + firm + replacement).
  All five present **except** `verified_date`, which is declared per **pack** (`pack.verified_date =
  '2026-11-21'`), not per rule. `communication`-style fields are not modelled at all.
- [x] Validate all packs against `rules/schema.json` (`pack_id`, `rule_id`, `verified_date`).
  `validateRulePack()` (`src/data/rulePacks.ts:267`) + test T5. It is a structural assertion set, not a
  JSON-Schema evaluation — the packs are TypeScript, so `rules/schema.json` documents the shape.
- [ ] Presets in `public/presets/*.json` — shipped as `src/data/presets.ts` (`ALL_PRESETS`), not JSON fixtures.
  - [x] Actual ids: `blr-rental`, `hdfc-loan`, `techcorp-offer`, `missing-page-stress`.
  - [x] Each = contract text fixture + expected pack id + expected flags.
  - [x] Missing Page 3 encodes the `Clause 4 → 7` gap.
- [x] `mock-audit.json` — 6 clauses, 4 findings, all 3 severities, `rupee_exposure_inr`, `way_out_params`.
  Note it is not read at runtime (the app hydrates from `src/data/presets.ts`); it is the paper fixture.

**✓ Checkpoint 1:** All 4 packs validate; 4 presets exist; `mock-audit.json` renders a full report on paper.

---

# Phase 2 — Pure Logic + Guardrail Tests

- [x] `public/js/prompt-security.js` — shipped as `src/utils/promptSecurity.ts`
  - [x] `sanitizeForPrompt()` + `<untrusted_contract_text>` fence + `injectionDefense@1` (`promptSecurity.ts:6,23,42`).
  - [x] `escapeHTML()` (`promptSecurity.ts:47`) — exported but unused; React JSX escapes interpolations.
  - [x] 4-stage `parseJSONFromLLMResponse()` (`promptSecurity.ts:76`).
  - [x] cyrb53 `templateHash` for the 3-prompt catalog (`promptSecurity.ts:8`, `src/utils/prompts.ts:88`).
- [x] `public/js/verifier.js` — shipped as `src/utils/verifier.ts` + `exposureMath.ts` + `wayOutMath.ts`
  - [x] Jaccard ≥0.80; drop unmatched quotes (`verifier.ts:32,95`; sub-3-token quotes always dropped).
  - [x] Pure-JS rupee exposure math (`exposureMath.ts:56`) — integer rupees, early-exit model is the floor.
  - [x] Way-Out computation (current vs negotiated loss at exit month) (`wayOutMath.ts:15`).
  - [x] Rule-id pinning: no `rule_id` in active pack ⇒ statute not rendered — **(main)** only: there
        `verifier.ts` fails closed on a missing/empty `rule_ref.rule_id`. At this commit an allow-list hit
        is skipped when `rule_ref` is absent, so such a finding survives.
- [x] `public/js/pii-guard.js` (logic only) — shipped as `src/utils/piiGuard.ts`
  - [x] Detectors: Aadhaar, PAN, +91, email, UPI, party headers (`MaskedTokenEntry['type']` union).
  - [x] Never mask cities/states (`PROTECTED_LOCATIONS` allow-list; asserted by T1 here, T8 on `main`).
  - [x] Fail-closed: unmaskable hit ⇒ `{ safeToSend: false }` — `checkSafeToSend()` returns the verdict
        (`piiGuard.ts:147`) but is unused: the live path calls `assertNoPiiLeak()`, which **throws**
        `PII_LEAK` or, failing open, appends `[..._REDACTED]`. Same policy, different return type.
- [x] `tests/guardrails.test.mjs` — shipped as `src/utils/guardrails.test.ts`; `npm test` green (5/5 here, 14/14 on `main`).
  - [x] Injection corpus (T2 here; T11 on `main`).
  - [x] Jaccard boundary (0.799 fails / 0.80 passes) — **(main)** T6.
  - [x] PII true/false positives incl. cities/states (T1 here; T8 on `main`).
  - [x] Rupee + Way-Out arithmetic (T4 here; T9 covers exposure recompute on `main`).
  - [x] Unknown-statute rejection — **(main)** T7 / T7b.
  - [x] Malformed / fenced / truncated JSON parse (T2 here; T10 on `main`).

**✓ Checkpoint 2:** `node --test tests/guardrails.test.mjs` green; no DOM dependencies in these modules.

---

# Phase 3 — Backend API

- [x] `api/_lib/llm-client.js` — shipped as `server/llmClient.ts`: one `LLM_PROVIDER` switch
  (`openrouter` default → `anthropic`), per-request timeout and exactly one retry, tiered models
  (`fast`/haiku for OCR @0.0, `reasoning`/sonnet for audit @0.1 and QA @0.15).
  Deviation: configured ids are `claude-haiku-4.5` / `claude-sonnet-4.5` (env-overridable), not 5.5.
- [x] `api/_lib/rules.js` — shipped as `src/data/rulePacks.ts`: `getPackById()`; the audit prompt injects
  only `rule_id`, title, category, `detection_hint`, `benchmark`, `basis_type`, `severity`, citation
  (`src/utils/prompts.ts:39`); unknown pack/jurisdiction ⇒ `in-general-fallback` with `panIndiaOnly: true`
  and `is_exact_jurisdiction_match: false` (`rulePacks.ts:240`).
- [x] `api/_lib/prompts.js` — shipped as `src/utils/prompts.ts`: `PROMPT_IDS` is exactly those three;
  `buildPrompt()` returns `{prompt_id, template_hash, system, user}` and all three routes echo it.
- [x] `POST /api/ocr` (`server.ts:295`) — accepts 1–5 but sends at most 3 (`images.slice(0,3)`) as data
  URLs on the `fast` vision tier; the prompt asks for `[ILLEGIBLE]` spans plus clause-numbering jumps.
- [x] `POST /api/audit` (`server.ts:337`) — pack-grounded prompt, 4-stage JSON parser, dual-anchor
  verifier, and `completeness {status, missing_gaps}` is now emitted on the **success** path too
  (`normaliseCompleteness` + `detectClauseNumberingGap`, `server.ts:76-109`).
  Strict fail-closed drop of findings with a *missing* `rule_ref` is **(main)** only (see Phase 2).
- [x] `POST /api/qa` (`server.ts:439`) — grounded answer + `clause_id` + `spoken_script`, and it refuses:
  an unverifiable quote returns `grounded:false` with "could not find this in the document" (`docs/audit-result.schema.md` §4.2).
- [x] `POST /api/tts` + `POST /api/stt` (`server.ts:514,575`) — `bulbul:v4-flash` (500-char cap) /
  `saaras:v4` (`mode:'codemix'`, ≤30s, ≤50 keyterms); base64 audio in, JSON errors plus
  `fallback_recommended: true` on every failure path.
- [x] `vercel.json` — static `dist/**` + `server.ts` as a Node function, SPA rewrite to `/index.html`.
  Body ceiling is `express.json({ limit: '5mb' })` (`server.ts:270`), above the 4.5MB platform limit.

**✓ Checkpoint 3:** `curl` returns valid JSON from all 5 routes using fixtures; no key appears in any client-served file.

> **As verified:** all five `/api/*` handlers exist in `server.ts` and return JSON; `scripts/verify.sh` curls
> 4 of the 6 exposed routes. The no-key-in-client assertion holds (`process.env.*` is only read server-side).

---

# Phase 4 — Dual-Lane Intake & Privacy

- [x] `public/js/ingest.js` — shipped as `src/utils/ingest.ts`
  - [ ] Lane A: PDF.js `isScannable()` <150ms — `extractPdfTextLocally()` reports `isScannableVector`
        from a word count (≥30 words) and caps at 25 pages. There is no measured <150ms budget.
  - [x] Lane B: canvas max 1500px, color JPEG 0.80, EXIF stripped via re-encode, never binarized (`ingest.ts:68`).
  - [x] 100ms blur check + verdict — synchronous variance-of-Laplacian score and a 3-way verdict
        (`ingest.ts:34,88`). The check is inline, so there is no separate 100ms budget to speak of.
  - [x] Optional 1-tap Header Blackout — `blackoutEnabled` toggle + copy (`MobileFlow.tsx:651-692`).
  - [x] concurrency cap 3; Cancel via `AbortController` — `mapWithConcurrencyLimit` /
        `prepareImagesWithLimit` (`ingest.ts:198,303`, cap `DEFAULT_IMAGE_CONCURRENCY_LIMIT = 3`); `App.tsx`
        aborts through `abortRef`. Both helpers are unused on the hot path today (one photo per scan).
- [x] PII Shield UI
  - [x] `Local PII Shield` badge + real counts (`DesktopWorkspace.tsx:505`) and a token-type popover
        with per-type counts (`Modals.tsx:348-358`).
  - [x] Fail-closed rescan blocks upload — `assertNoPiiLeak()` throws `PII_LEAK` before the `fetch`, so
        nothing is sent; the message surfaces as a toast rather than a dedicated blocking screen.
- [x] Lane B honesty badge — `Image Mode · EXIF stripped · Zero-retention` on **(main)** in the workspace
  compliance bar (keyed on `audit.lane === 'B'`); this worktree predates that commit. The security modal
  states the same promise independently (`Modals.tsx:336`).
- [x] Gap UX
  - [x] Amber Incomplete Scan Banner (`Clause 4 → 7`) — `DesktopWorkspace.tsx:558-566`, driven by
        `audit.completeness.missing_gaps`; the server now produces this on the success path too.
  - [ ] `[ILLEGIBLE]` refusal copy — only the OCR *prompt* mentions `[ILLEGIBLE]`; no UI refusal copy
        ships. The 1-tap `Original Scan` toggle does exist (`sheetView` reconstructed/original).
- [x] Telemetry stepper — 4 gates with the real pack `match_pct` (`MobileFlow.tsx:795-846`); `Cancel`
  calls `cancelTelemetry()`, which aborts `abortRef.current` (`App.tsx:250`). The 520ms stage ticker is
  cosmetic, so the gate timings illustrate rather than measure.

**✓ Checkpoint 4:** Photo and vector PDF both reach `/api/audit`; a seeded PII hit blocks upload; blurred and gapped scans show the amber banner.

> **As verified:** both lanes reach `/api/audit`; `assertNoPiiLeak` throws before the `fetch`; the amber banner
> renders from `audit.completeness`. The banner is **desktop-only**, and the PII block surfaces as a toast.

---

# Phase 5 — UI Shell & Design System

- [x] `public/styles/tokens.css` — shipped as the `@theme` block in `src/index.css`: Trust Indigo
  `#1d4ed8`, severity triplets, `prefers-reduced-motion` block, arbitrary-value type scale.
  Deviations: **light-only** (the `dark` variant is declared but unused) and **no SVG sprite** — icons are
  Material Symbols ligatures (`src/components/Icons.tsx`).
- [x] `public/styles/app.css` + `index.html` — shipped as `src/index.css` + `src/components/*`: 900px JS
  fork (`App.tsx:90,126`), Report/Split/Scan at 48/52 gated on Tailwind `lg`
  (`DesktopWorkspace.tsx:586,1110`), floating Ask drawer, `MobileQrModal`.
  Deviations: sticky bar is **56px** (`h-14`), not 62px; QR modal is a div with `role="dialog"`, not a
  native `<dialog>`. Desktop left pane has 3 tabs (Findings / Way Out / Negotiate).
- [x] `public/js/renderer.js` — shipped as `src/App.tsx` `hydrateAuditFromApiPayload()` + `DesktopWorkspace.tsx`
  - [x] Hydrate from the preset fixtures, then real `/api/audit` payloads (`App.tsx:32-86`).
  - [x] Hero order is score + ₹exposure → exactly 3 bullets → Way-Out slider → analysed clauses.
  - [x] `escapeHTML()` — not used; React JSX escapes every interpolation, which is stronger. OCR
        token verify + confidence affordances are wired to the `Original Scan` view.
  - [ ] Clause inspector with `data-clause-id` anchors — not present; navigation uses React refs
        (`clauseRefs`) plus `jumpToClause()`.
- [x] `public/js/main.js` — shipped as `src/App.tsx` + components: KN/HI/TA/EN switcher, preset picker,
  mobile/desktop view switching, telemetry ticker wiring.
- [x] `public/manifest.webmanifest` + `public/icons/icon-{192,512}.svg` — standalone, `theme_color #0037b0`.

**✓ Checkpoint 5:** `mock-audit.json` renders correctly at 390×844 and 1440×900 with zero pinch-zoom.

---

# Phase 6 — Audio, Voice Q&A & Sync

- [x] `public/js/audio-sync.js` — shipped as `src/utils/audioSync.ts` + `src/utils/spokenScript.ts`
  - [ ] Clause-level playlist (no word karaoke) — **not wired.** `src/utils/audioPlaylist.ts`
        (`buildClausePlaylist` / `playClausePlaylist` with `onItemStart`) exists only on the unmerged
        `wl/audio` branch and is imported by no component. Playback today is one utterance per click:
        a finding's Listen button, the walkthrough chip, or a Q&A answer.
  - [ ] `onplay`: smooth-scroll, pulse, dim others — pulse + dim ship, but they are driven by
        `jumpToClause()` (finding click / Q&A answer / history item), **not** by the audio `onplay`.
        Dim is 55%, not 18%; pulse is `1.1s × 2` (`src/index.css:122`).
  - [x] `spoken_script` rules — enforced twice: the prompt contract (`prompts.ts:58`) and
        `sanitizeSpokenScript()` / `validateSpokenScript()` (`spokenScript.ts:194,249`).
  - [x] Mandatory `speechSynthesis` fallback — `speakWithBrowserFallback()` on any Sarvam failure
        (`audioSync.ts:87`).
- [x] Hold-to-Ask — `voiceCapture.ts` (30s cap, 500ms minimum tap) → `/api/stt` → `/api/qa` → `/api/tts`;
  pinned answer card + `jumpToClause()`; any failure falls back to a sample question
  (`MobileFlow.tsx:245`, `DesktopWorkspace.tsx:253`).
- [x] Mobile playback — every `playRegionalSpeech` call originates inside a button handler, so autoplay
  policy is never tripped.

**✓ Checkpoint 6:** Kannada walkthrough pulses the right clause and dims others; a Kanglish question returns audio + scrolls to its clause; killing the TTS route still speaks via `speechSynthesis`.

> **As verified:** the pulse/dim/scroll sequence and the Kanglish Q&A loop both work, and the
> `speechSynthesis` fallback is real. But the pulse is triggered by the finding click / Q&A answer, **not** by
> the walkthrough advancing clause to clause — see Phase 6 above.

---

# Phase 7 — Negotiate, Vault & Pre-Sign Brief

- [x] `public/js/negotiate.js` — shipped inline in `DesktopWorkspace.tsx` (Negotiate tab) and
  `MobileFlow.tsx` (m6): checkbox asks sourced from `rule.negotiation_ask`, Polite/Firm toggle, WhatsApp
  modal on desktop and a `mailto:` handoff on mobile.
  - [ ] Copy with `<textarea>` fallback — `src/utils/clipboard.ts` implements it, but nothing imports it
        at this commit; the live buttons call `navigator.clipboard?.writeText(...)` and ignore failure.
        Wired on **(main)**.
- [x] jsPDF Pre-Sign Brief — `src/utils/pdfBrief.ts:4` renders one A4 page (score, exposure, top-3
  bullets, flagged clauses + polite asks, statutory disclaimer), triggered from `BriefModal`. jsPDF is an
  npm dependency (`jspdf`), not vendored source.
- [x] `public/js/vault.js` — shipped in `src/App.tsx` (`VAULT_STORAGE_KEY = 'lawlens_vault_v1'`,
  `loadInitialVault`, persistence effect at `App.tsx:132`) with UI in `DesktopSubViews.tsx` and
  `MobileFlow.tsx` (m8 history drawer). Editable tag, note capture, delete-one and clear-all all ship.
  - [ ] ~20KB/doc quota — no size accounting or eviction.
  - [ ] "Don't save" toggle — absent: every completed scan is upserted into the vault.
  - [ ] never persist images/audio — violated: the whole `AuditResult` is serialised, including
        `original_photo_url`, which for Lane B is a base64 `data:` URL. Audio is never persisted.

**✓ Checkpoint 7:** Selecting asks produces a copyable WhatsApp draft and a valid 1-page PDF; vault survives refresh and clears in one tap.

---

# Phase 8 — Integration, Verification & Freeze

- [x] `npm test` (`node --import tsx --test src/utils/guardrails.test.ts`) → 5/5 green here, 14/14 on `main`.
- [ ] `git grep -E "sk-ant|sk-or-v1"` returns empty — **not clean.** The hits are documentation strings in
  `public/assets/aistudio/*` and the gate's own pattern literal in `scripts/verify.sh:25`. No live key is
  committed, but the gate as written does not pass; it needs a `:(exclude)scripts/` + asset exclusion.
- [ ] `curl` all 5 routes — `scripts/verify.sh` exercises 4 (`health`, `audit`, `qa`, `tts`) plus typecheck
  and the test suite. `ocr` and `stt` are not covered. (The build actually exposes 6 routes.)
- [ ] Run the 7 smoke tests on desktop 1440×900.
- [ ] Run the 7 smoke tests on a real phone via QR.
- [ ] Resilience: network-off preset path, provider-down path, cached audit path.
- [ ] Rehearse the 2-minute stage script end to end.
- [ ] Freeze at 4:15 PM — demo-blocking fixes only after.
- [ ] Verify deployed URL from a clean phone.

**✓ Checkpoint 8:** 7/7 smoke tests pass live on a phone and the projector; secret scan clean; deployed and frozen.

> **As verified:** **not met.** The secret-scan gate does not pass as written (doc-string + pattern-literal
> hits), `npm test` is green but covers 5 cases here (14 on `main`), and there is no record of the smoke runs,
> the freeze, or the deployed-URL check in the repo.
