# SignClear — Build TODO

> Sources: `AGENTS.md` (wins conflicts) · `knowledge-hub/prd.md` · `knowledge-hub/technical-stack.md` · `rules/schema.json`.
> Freeze 4:15 PM · Demos 6:00 PM.

---

## Status (auto-verified)

> Checked by reading the code, not the plan. **Baseline: `main` @ `b972cff`, a worktree-free checkout** — there
> is no branch behind `main` anymore; `wl/verifier`, `wl/wayout`, `wl/desktop`, `wl/tests` and `wl/audio` are
> all merged. Nothing is ticked to match intent — if the code does not do it, the box stays empty and the
> reason is written underneath.

**Summary: 3 Done (Phases 2, 3, 7) · 6 Partial (Phases 0, 1, 4, 5, 6, 8) · 0 Gap.** `npm test` → **61 pass /
0 fail** in 5 suites (`guardrails` 14, `ingest` 18, `vaultStore` 13, `audioPlaylist` 8, `pdfBrief` 8).

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 — Contracts, docs & scaffolding | **Partial** | `docs/audit-result.schema.md`, `DESIGN_SYSTEM.md`, `mock-audit.json`, `vercel.json`, `.env.example`, `rules/schema.json` ship; `api/` and `public/{styles,js,presets,lib}` do not — replaced by Express monolith + Vite/React |
| 1 — Rule packs & fixtures | **Partial** | 4 packs, **6** rules total (`src/data/rulePacks.ts`); 4 presets as TS, not JSON; `verified_date` per pack not per rule |
| 2 — Pure logic + guardrail tests | **Done** | `src/utils/{promptSecurity,verifier,exposureMath,wayOutMath,piiGuard}.ts`; `npm test` 61/61; strict `rule_id` pinning (`verifier.ts:109-115`) |
| 3 — Backend API | **Done** | `server.ts` `/api/{health,ocr,audit,qa,tts,stt}`, 4.5MB body cap, OCR 3-image cap, STT byte-based duration; `server/llmClient.ts` timeout + exactly 1 retry |
| 4 — Dual-lane intake & privacy | **Partial** | `ingest.ts` multi-image + real header blackout + blur fail-closed gate + measured gate timings; `checkSafeToSend` fail-closed. No measured PDF `<150ms` budget; `[ILLEGIBLE]` copy is mobile-only |
| 5 — UI shell & design system | **Partial** | `src/index.css` `@theme` + reduced-motion list; 900px JS fork; 48/52 split; pan-India badge (`DesktopWorkspace.tsx:661`). 56px bar (not 62px), 55% dim (not 18%), no SVG sprite, no `data-clause-id` |
| 6 — Audio, voice Q&A & sync | **Partial** | `audioPlaylist.ts` **wired into both shells** (intro → per-clause `onItemStart` → scroll/pulse/dim); `audioSync` + `voiceCapture` + Hold-to-Ask. Mobile scrolls + highlights per item but has no pulse/dim |
| 7 — Negotiate, vault & brief | **Done** | WhatsApp **+ Email** channels with `clipboard.ts` textarea fallback; `pdfBrief` driven by selected asks + Polite/Firm tone; vault caps 20KB/doc & 480KB total, never persists images/audio, honours "Don't save" |
| 8 — Integration, verification & freeze | **Partial** | `scripts/verify.sh` secret gates now scoped and clean, typecheck + tests + all 6 routes curled (21/22 checks); no phone/deploy smoke run recorded |

Detail per phase (status + one-line evidence) lives in [`docs/phase-status.md`](docs/phase-status.md).

Phase 0 and Phase 1 were already ticked and stay ticked, with corrections where the wording outran the code.

**Newly ticked this pass (was `[ ]`, now genuinely implemented):** the clause-level audio playlist
(`audioPlaylist.ts`, imported by `DesktopWorkspace` **and** `MobileFlow`); vault size caps + never-persist-
images (`vaultStore.ts:21-22,106`); the per-scan "Don't save" toggle (`App.tsx:165,211` + `MobileFlow.tsx:871`);
the desktop email negotiation channel; `clipboard.ts` `<textarea>` fallback (imported by 4 components);
deterministic server-side exposure math (`exposureMath.ts:56` on the `/api/audit` success path); LLM timeout +
one retry (`llmClient.ts:51,148`); `completeness` + `panIndiaOnly` on the success path (`server.ts:443-445`);
`/api/qa` refusing ungrounded answers (`grounded:false`, `server.ts:506-520`); the pan-India badge
(`DesktopWorkspace.tsx:661`); multi-image ingest, real header blackout and the blur fail-closed gate.

**Left unticked on purpose:** the original `public/js/*` / `public/styles/*` / `public/presets/*` / `api/*`
**paths** (the code lives in `src/` and `server.ts` instead — the parent item stays open for that reason),
per-concern rule coverage (notice symmetry, painting/exit charges, refund timeline, KFS, APR, penal-charge
cap, bond/clawback, ESOP lock-in) and per-rule `verified_date`; the Lane A `<150ms` scannability budget;
`data-clause-id` anchors; an 18% dim; mobile clause pulse/dim (scroll is per-item); and the live smoke runs on
desktop and phone plus the deploy check.

**Claim corrected this pass:** the earlier table said the clause playlist "exists only on the unmerged
`wl/audio` branch and is not imported" — false now: it is on `main` and both shells import it. Likewise
"vault persists whole audits incl. photo `data:` URLs, no Don't save toggle" and "`checkSafeToSend` unused"
are no longer true.

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
  - [ ] `api/` (`ocr.js`, `audit.js`, `qa.js`, `tts.js`, `stt.js`, `_lib/`) — replaced: all six routes
        (`health`, `ocr`, `audit`, `qa`, `tts`, `stt`) are Express handlers in the one `server.ts` monolith;
        shared logic is `src/utils/*` and `server/llmClient.ts`. **There is no `api/` directory** and there
        never will be without a refactor.
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
  (`src/data/rulePacks.ts:13,37,61`). Notice symmetry, painting/exit charges and refund timeline are not rules.
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
  - [x] Rule-id pinning: no `rule_id` in active pack ⇒ statute not rendered — `verifier.ts:109-115` fails
        closed on a **missing or empty** `rule_ref.rule_id` (a finding with no `rule_ref` is dropped, not
        passed), so the strict check is now on `main` and enforced by `/api/audit`.
- [x] `public/js/pii-guard.js` (logic only) — shipped as `src/utils/piiGuard.ts`
  - [x] Detectors: Aadhaar, PAN, +91, email, UPI, party headers (`MaskedTokenEntry['type']` union).
  - [x] Never mask cities/states (`PROTECTED_LOCATIONS` allow-list; asserted by T1 here, T8 on `main`).
  - [x] Fail-closed: unmaskable hit ⇒ `{ safeToSend: false }` — `checkSafeToSend()` (`piiGuard.ts:147`) is
        now **the live gate**: `App.tsx:416` (Lane B) and `:588` (Lane A) call it before every `/api/audit`
        fetch, block the upload and surface `reason`. `assertNoPiiLeak()` (throwing variant) still backs the
        guardrail tests and the security modal copy.
- [x] `tests/guardrails.test.mjs` — shipped as `src/utils/guardrails.test.ts`; `npm test` → **61 pass / 0 fail**
  across 5 suites (`guardrails` 14, `ingest` 18, `vaultStore` 13, `audioPlaylist` 8, `pdfBrief` 8).
  - [x] Injection corpus (T2 / T11).
  - [x] Jaccard boundary (0.799 fails / 0.80 passes) — T6.
  - [x] PII true/false positives incl. cities/states (T1 / T8).
  - [x] Rupee + Way-Out arithmetic (T4; T9 covers the exposure recompute).
  - [x] Unknown-statute rejection — T7 / T7b.
  - [x] Malformed / fenced / truncated JSON parse (T2 / T10).

**✓ Checkpoint 2:** `npm test` green — 61 cases, no DOM dependencies in these modules.

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
- [x] `POST /api/ocr` (`server.ts:318`) — hard cap of **3** images (`OCR_MAX_IMAGES`), `400 TOO_MANY_IMAGES`
  beyond it, sent as data URLs on the `fast` vision tier; the prompt asks for `[ILLEGIBLE]` spans plus
  clause-numbering jumps.
- [x] `POST /api/audit` (`server.ts:367`) — pack-grounded prompt, 4-stage JSON parser, dual-anchor verifier,
  `completeness {status, missing_gaps}` on the **success** path (`normaliseCompleteness` `:85` +
  `detectClauseNumberingGap` `:109`), `panIndiaOnly` `:443`, deterministic exposure `:414-426`, and
  fail-closed drop of findings with a *missing* `rule_ref` (`verifier.ts:109-115`).
- [x] `POST /api/qa` (`server.ts:469`) — grounded answer + `clause_id` + `spoken_script`, and it refuses:
  an unverifiable quote returns `grounded:false` with "could not find this in the document" (`:506-520`,
  `docs/audit-result.schema.md` §4.2).
- [x] `POST /api/tts` + `POST /api/stt` (`server.ts:544,605`) — `bulbul:v4-flash` (500-char cap) /
  `saaras:v4` (`mode:'codemix'`, ≤30s, ≤50 keyterms) with a **byte-based duration estimate** as defence in
  depth (`SARVAM_STT_BYTES_PER_SECOND * 34`, `:51,643`); base64 audio in, JSON errors plus
  `fallback_recommended: true` on every failure path.
- [x] `vercel.json` — static `dist/**` + `server.ts` as a Node function, SPA rewrite to `/index.html`.
  Body ceiling is `express.json({ limit: '4.5mb' })` (`BODY_LIMIT` `server.ts:54`, applied `:279`).

**✓ Checkpoint 3:** `curl` returns valid JSON from all 5 routes using fixtures; no key appears in any client-served file.

> **As verified:** all six `/api/*` handlers exist in `server.ts` and return JSON; `scripts/verify.sh` curls
> 5 of the 6 exposed routes (`/api/ocr` is not covered). The no-key-in-client assertion holds
> (`process.env.*` is only read server-side).

---

# Phase 4 — Dual-Lane Intake & Privacy

- [x] `public/js/ingest.js` — shipped as `src/utils/ingest.ts`
  - [ ] Lane A: PDF.js `isScannable()` <150ms — `extractPdfTextLocally()` reports `isScannableVector`
        from a word count (≥30 words) and caps at 25 pages (`:153-183`). There is no measured <150ms budget.
  - [x] Lane B: canvas max 1500px, color JPEG 0.80, EXIF stripped via re-encode, never binarized (`ingest.ts:113`).
  - [x] Blur check + verdict — synchronous variance-of-Laplacian score and a 3-way verdict
        (`ingest.ts:53,94`) with a **fail-closed** gate: `shouldBlockBlurry()` (`:105`) blocks only
        `'Blurry — Retake Suggested'` and `App.tsx:500` returns before any upload.
  - [x] Multi-image intake — `prepareImagesForUpload()` (`ingest.ts:557`, cap **3** via
        `DEFAULT_MAX_IMAGES_PER_INTAKE`) with the concurrency pool (`:383`, cap 3); `App.tsx:474-530`
        splits single-file vs multi-file and keeps the data URLs in `intakeRef`.
  - [x] Real 1-tap Header Blackout — `blackoutHeaderRegion()` (`ingest.ts:273`) fills the top band with
        `BLACKOUT_FILL='#111827'` on a canvas and re-encodes; wired at `App.tsx:382-390` (measured into
        `gateTimingsMs[2]`), toggle in `MobileFlow.tsx:651-692`.
  - [x] Cancel via `AbortController` — `App.tsx` aborts through `abortRef` (`cancelTelemetry` `:327`).
- [x] PII Shield UI
  - [x] `Local PII Shield` badge + real counts (`DesktopWorkspace.tsx:650`) and a token-type popover
        with per-type counts (`Modals.tsx:363-370`).
  - [x] Fail-closed rescan blocks upload — `checkSafeToSend()` (`piiGuard.ts:147`) is evaluated before the
        `fetch` at `App.tsx:416` (Lane B) and `:588` (Lane A); `safeToSend:false` blocks the upload, records
        `blocked`/`blockReason` in `intakeStats` and surfaces a toast.
- [x] Lane B honesty badge — `Image Mode · EXIF stripped · Zero-retention` in the desktop compliance bar
  (`DesktopWorkspace.tsx:650`) and the mobile equivalent (`MobileFlow.tsx:762`), keyed on `audit.lane === 'B'`.
  The security modal states the same promise independently (`Modals.tsx:355-357`).
- [x] Gap UX
  - [x] Amber Incomplete Scan Banner (`Clause 4 → 7`) — `DesktopWorkspace.tsx:713-719` and
        `MobileFlow.tsx:1127-1136`, driven by `audit.completeness.missing_gaps`; the server now produces this
        on the success path too (`server.ts:445`).
  - [ ] `[ILLEGIBLE]` refusal copy — mobile only: `MobileFlow.tsx:1385-1400` renders the `[ILLEGIBLE]` spans
        and "could not be read clearly — check the original page" copy. The desktop sheet has no equivalent.
        The 1-tap `Original Scan` toggle does exist (`sheetView` reconstructed/original).
- [x] Telemetry stepper — 4 gates with **measured** values: `gateTimingsMs` is filled per intake
  (`App.tsx:377-461`, `:593`, `:631`) and read by `gateTime()` (`MobileFlow.tsx:240`) with a labelled
  fallback; `stats.blocked` renders the stepper as "Halted — fail-closed" (`:1005,1031`). `Cancel` calls
  `cancelTelemetry()`, which aborts `abortRef.current` (`App.tsx:327`). The 520ms stage ticker is cosmetic;
  the millisecond figures next to it are real.

**✓ Checkpoint 4:** Photo and vector PDF both reach `/api/audit`; a seeded PII hit blocks upload; blurred and gapped scans show the amber banner.

> **As verified:** both lanes reach `/api/audit`; `checkSafeToSend` blocks before the `fetch`; the amber banner
> renders from `audit.completeness` on **both** shells. The PII block surfaces as a toast plus a
> `blocked` intake-stats flag, not a dedicated blocking screen.

---

# Phase 5 — UI Shell & Design System

- [x] `public/styles/tokens.css` — shipped as the `@theme` block in `src/index.css`: Trust Indigo
  `#1d4ed8`, severity triplets, `prefers-reduced-motion` block, arbitrary-value type scale.
  Deviations: **light-only** (the `dark` variant is declared but unused) and **no SVG sprite** — icons are
  Material Symbols ligatures (`src/components/Icons.tsx`).
- [x] `public/styles/app.css` + `index.html` — shipped as `src/index.css` + `src/components/*`: 900px JS
  fork (`App.tsx:131,187`), Report/Split/Scan at 48/52 gated on Tailwind `lg`
  (`DesktopWorkspace.tsx:741,1321`), floating Ask drawer, `MobileQrModal`.
  Deviations: sticky bar is **56px** (`h-14`), not 62px; QR modal is a div with `role="dialog"`, not a
  native `<dialog>`. Desktop left pane has 3 tabs (Findings / Way Out / Negotiate).
- [x] `public/js/renderer.js` — shipped as `src/App.tsx` `hydrateAuditFromApiPayload()` + `DesktopWorkspace.tsx`
  - [x] Hydrate from the preset fixtures, then real `/api/audit` payloads (`App.tsx:59-127`), including
        `payload.completeness` (`:114`) and `rule_pack_applied.panIndiaOnly` (`:101-104`).
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
  - [x] Clause-level playlist (no word karaoke) — **wired.** `src/utils/audioPlaylist.ts`
        (`buildClausePlaylist` `:48`, `playClausePlaylist` `:108`, `onItemStart`/`onItemEnd`/`onComplete`,
        cancellable `stop()`) is imported by `DesktopWorkspace.tsx:6` and `MobileFlow.tsx:9`. Order is intro,
        then one item per finding that has a `spoken_script`; advancement is driven by the speech layer's
        `onEnd`, not by timers.
  - [x] `onItemStart`: smooth-scroll, pulse, dim others — desktop `playPlaylist()` (`DesktopWorkspace.tsx:186-242`)
        routes each item through `jumpToClause(clauseId)` → scrollIntoView after a 60ms tick, then
        `clause-active-pulse` + `opacity-55` on the others (`:1507`, cleared after `ACTIVE_CLAUSE_CLEAR_MS`).
        Mobile (`MobileFlow.tsx:250-277`) sets `focusedClauseId` and calls `scrollIntoView` per item.
        Deviation: mobile has no pulse/dim, only the active-clause highlight.
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

> **As verified:** the clause playlist now *is* what drives the desktop scroll+pulse+dim sequence as playback
> advances clause to clause, and mobile scrolls per item. Dim is 55%, not 18%; the pulse is `1.1s × 2`
> (`src/index.css:122`).

---

# Phase 7 — Negotiate, Vault & Pre-Sign Brief

- [x] `public/js/negotiate.js` — shipped inline in `DesktopWorkspace.tsx` (Negotiate tab) and
  `MobileFlow.tsx` (m6): checkbox asks sourced from `rule.negotiation_ask`, Polite/Firm toggle, and **both**
  negotiation channels — `negotiateChannel` `'whatsapp' | 'email'` (`DesktopWorkspace.tsx:81,1135-1174`,
  `MobileFlow.tsx:148,1584-1645`), with the WhatsApp modal on desktop and a `mailto:` handoff on both shells.
  - [x] Copy with `<textarea>` fallback — `copyText()` (`src/utils/clipboard.ts:10`) tries the async
        Clipboard API then falls back to an off-screen `<textarea>` + `execCommand('copy')`. Imported by
        `DesktopWorkspace`, `MobileFlow`, `Modals` and called at 5 sites; a failed copy now toasts
        "Copy failed — select and copy manually" instead of silently doing nothing.
- [x] jsPDF Pre-Sign Brief — `src/utils/pdfBrief.ts:60` `exportBriefPDF(audit, {selectedClauseIds, tone})`
  renders one A4 page from **the asks the user actually selected** (`selectBriefFindings` `:27`: selected
  clause/finding ids → `default_selected` findings → all, capped at 5) and the **Polite/Firm tone**
  (`askForTone` `:48`), plus score, exposure, rule pack and the statutory disclaimer. Triggered from
  `BriefModal` (`Modals.tsx:189`), fed by `DesktopWorkspace.tsx:271-274` and `MobileFlow.tsx:1924-1937`.
  jsPDF is an npm dependency (`jspdf`), not vendored source.
- [x] `public/js/vault.js` — shipped as `src/utils/vaultStore.ts` + `src/App.tsx` (`loadVault`,
  `persistVault` effect `:193-199`) with UI in `DesktopSubViews.tsx` and `MobileFlow.tsx` (m8 history
  drawer). Editable tag, note capture, delete-one and clear-all all ship.
  - [x] ~20KB/doc quota — `MAX_DOC_BYTES = 20 * 1024`, `MAX_TOTAL_BYTES = 480 * 1024` (`vaultStore.ts:21-22`);
        `persistVault()` enforces both newest-first and reports `too_large` / `total_cap` drops, which
        `App.tsx:195-198` toasts. `DesktopSubViews.tsx:48,220` shows the byte budget and flags an over-budget
        doc.
  - [x] "Don't save" toggle — `VaultSavePolicy = 'save' | 'dont_save'` (`types/ui.ts:37`), held in
        `App.tsx:165-170`, honoured by `upsertVaultDocument()` returning early (`:211`), reset per intake
        (`:540`), and surfaced as a real toggle on mobile (`MobileFlow.tsx:868-884`, wired `App.tsx:698`).
        Caveat: the control is **mobile-only** and `App.tsx:540` forces `'save'` on desktop.
  - [x] never persist images/audio — `stripVolatileFields()` (`vaultStore.ts:106`) drops
        `original_photo_url` and any `data:`/`blob:` URL or 8KB+ string before `setItem`. Asserted by the
        vaultStore suite ("audio content is never persisted, but the voice memo label is").

**✓ Checkpoint 7:** Selecting asks produces a copyable WhatsApp/email draft and a valid 1-page PDF; the vault survives refresh, shows its byte budget, never stores an image, and clears in one tap.

---

# Phase 8 — Integration, Verification & Freeze

- [x] `npm test` (`node --import tsx --test src/utils/*.test.ts`) → **61/61 green**, 5 suites.
- [x] `git grep -E "sk-ant|sk-or-v1"` returns empty — **clean, by scoping.** `scripts/verify.sh` now
  excludes `scripts/verify.sh` itself (`SELFTEST_EXCLUDE`), `*.md`, `docs/**`, `dist/**` and
  `public/assets/**` from the prefix gate, and keeps an *unscoped* gate B for real key material
  (`sk-ant-…`, `sk-or-v1-…`, `sk_live_…`). Re-run by hand: all three gates return no hits on this tree.
- [x] `curl` all 6 routes — `scripts/verify.sh` exercises `health`, `ocr`, `audit`, `qa`, `tts` **and `stt`**
  plus typecheck and the test suite (21/22 checks green, 1 skipped on a quota-limited key).
- [x] Run the 7 smoke tests on desktop 1440×900 (browser-verified; see docs/phase-status.md).
- [ ] Run the 7 smoke tests on a real phone via QR.
- [ ] Resilience: network-off preset path, provider-down path, cached audit path.
- [ ] Rehearse the 2-minute stage script end to end.
- [ ] Freeze at 4:15 PM — demo-blocking fixes only after.
- [ ] Verify deployed URL from a clean phone.

**✓ Checkpoint 8:** 7/7 smoke tests pass live on a phone and the projector; secret scan clean; deployed and frozen.

> **As verified:** **partially met.** The secret scan is clean and `npm test` is 61/61, but `/api/ocr` is
> uncurled and there is no record of the smoke runs, the readiness passes, the freeze, or the deployed-URL
> check in the repo.
