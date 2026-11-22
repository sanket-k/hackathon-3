# Phase Status — verified against the code

Matrix for Phase 0–8. **Status is read off the implementation, not the plan.** Evidence is a file or module
you can open; where a line number is given it was true at the time of writing.

Baseline: this worktree (`wl/docs` @ `f2917c3`). `main` is 8 commits ahead (`wl/verifier`, `wl/wayout`,
`wl/desktop`, `wl/tests`); facts that hold **only** on `main` are marked `(main)`.

| Phase | Status | Evidence |
| --- | --- | --- |
| **0 — Contracts, docs & scaffolding** | **Partial** | `docs/audit-result.schema.md`, `DESIGN_SYSTEM.md`, `mock-audit.json`, `vercel.json`, `.env.example`, `rules/schema.json`, `public/manifest.webmanifest` all exist; the planned `api/` and `public/{styles,js,presets,lib}` trees do not — the build is Express (`server.ts`) + Vite/React (`src/`) |
| **1 — Rule packs & fixtures** | **Partial** | `src/data/rulePacks.ts` — 4 packs, **6 rules total** (3 KA rental, 1 RBI loan, 1 employment, 1 general); `src/data/presets.ts` — 4 presets as TS, not `public/presets/*.json` |
| **2 — Pure logic + guardrail tests** | **Done** | `src/utils/promptSecurity.ts`, `verifier.ts`, `exposureMath.ts`, `wayOutMath.ts`, `piiGuard.ts`; `npm test` → 5/5 green (14/14 on `main`) |
| **3 — Backend API** | **Done** | `server.ts` `/api/{health,ocr,audit,qa,tts,stt}`; `server/llmClient.ts` (provider switch, timeout, exactly one retry) |
| **4 — Dual-lane intake & privacy** | **Partial** | `src/utils/ingest.ts` (Lane A PDF.js, Lane B canvas 1500px/JPEG 0.80, blur verdict) + `src/utils/piiGuard.ts`; **gap:** no `[ILLEGIBLE]` refusal copy, no measured PDF `<150ms` budget |
| **5 — UI shell & design system** | **Partial** | `src/index.css` (`@theme` tokens, reduced-motion block) + `src/components/{DesktopLanding,DesktopWorkspace,MobileFlow,Modals,DesktopSubViews}.tsx`; **deviations:** 56px bar (not 62px), no SVG sprite, light-only |
| **6 — Audio, voice Q&A & sync** | **Partial** | `src/utils/audioSync.ts` + `voiceCapture.ts` + Hold-to-Ask wired in both shells; **gap:** the clause playlist (`audioPlaylist.ts`, `onItemStart`) exists only on the unmerged `wl/audio` branch and is imported by nothing |
| **7 — Negotiate, vault & brief** | **Partial** | `src/utils/pdfBrief.ts` (one-page jsPDF), negotiation builder in `DesktopWorkspace.tsx` / `MobileFlow.tsx`; **gaps:** no "Don't save" toggle, no ~20KB/doc quota, `original_photo_url` base64 is persisted |
| **8 — Integration, verification & freeze** | **Gap** | `scripts/verify.sh` exists (typecheck + tests + 4 route curls) but **secret-scan gate fails** on doc strings, `ocr`/`stt` are not curled, and no desktop/phone/deploy smoke run is recorded |

**Tally: 2 Done (Phases 2, 3) · 6 Partial (Phases 0, 1, 4, 5, 6, 7) · 1 Gap (Phase 8).**

---

## Evidence detail

### Phase 0 — Partial
- `docs/audit-result.schema.md` — rewritten to cover `injection_defense`, success-path `completeness`,
  `panIndiaOnly`, deterministic `rupee_exposure_inr`, and the `/api/qa` `grounded` refusal.
- `DESIGN_SYSTEM.md` — §6.1 (audio-driven pulse), §7.1 (reduced-motion rule), §7.2 (toast **is** `aria-live`),
  §7.3 (gaps), §8.1 (56px bar, 1.1s × 2 pulse).
- `mock-audit.json` — 6 clauses, 4 findings, 3 severities, `way_out_params`. Paper fixture only; the app
  hydrates from `src/data/presets.ts`.
- Missing: `api/` — superseded by `server.ts`; `public/{styles,js,presets,lib}` — superseded by `src/`.

### Phase 1 — Partial
- `src/data/rulePacks.ts:3` `RULE_PACKS`; `:240` `selectRulePack`; `:267` `validateRulePack`.
- Rules: `IN_KA_DEPOSIT_CAP`, `IN_KA_RENT_ESCALATION`, `IN_KA_LOCKIN_EXIT`, `IN_RBI_FORECLOSURE_CAP`,
  `IN_ICA_SEC27_NONCOMPETE`, `IN_GEN_ARBITRATION_NEUTRALITY`.
- `verified_date` is per **pack** (`'2026-11-21'`), not per rule.
- `src/data/presets.ts` — `PRESET_BLR_RENTAL`, `PRESET_HDFC_LOAN`, `PRESET_TECHCORP_OFFER`,
  `PRESET_MISSING_PAGE`; the last encodes the `Clause 4 → 7` gap (`presets.ts:605`).

### Phase 2 — Done
- `promptSecurity.ts:6` `injectionDefense@1`, `:23` `sanitizeForPrompt`, `:42` `wrapUntrustedContract`,
  `:47` `escapeHTML` (unused — React escapes), `:76` `parseJSONFromLLMResponse` (4-stage), `:8` `cyrb53`.
- `verifier.ts:32` `verifyQuoteAgainstText` (substring → 2-sentence Jaccard ≥ 0.80, <3 tokens dropped),
  `:95` `filterVerifiedFindings`. Fail-closed on a missing `rule_ref.rule_id` is `(main)` @ `32040c9`.
- `exposureMath.ts:56` `computeRupeeExposure` — integer rupees, exit model is the floor.
- `wayOutMath.ts:15` `calculateWayOutAtMonth` — rental / loan / employment branches.
- `piiGuard.ts:81` `maskIndianPII`, `:147` `checkSafeToSend` (unused), `:182` `assertNoPiiLeak` (throws
  `PII_LEAK`), `:208` `rehydrateParsedObject`.
- `src/utils/guardrails.test.ts` — T1 PII, T2 injection+JSON, T3 Jaccard, T4 way-out, T5 pack validation.

### Phase 3 — Done
- `server.ts:295` `/api/ocr` (`images.slice(0,3)`, `tier:'fast'`), `:337` `/api/audit`, `:439` `/api/qa`,
  `:514` `/api/tts` (`bulbul:v4-flash`, 500-char cap), `:575` `/api/stt` (`saaras:v4`, codemix, ≤30s,
  ≤50 keyterms), `:272` `/api/health`.
- `server/llmClient.ts:28` provider switch, `:35` `MODEL_BY_TIER`, `:137` timeout, `:150` exactly one retry.
- `src/utils/prompts.ts:17` `PROMPT_IDS` (exactly three), `:88` `buildPrompt` → `{prompt_id, template_hash}`.
- `/api/audit` extras: `:406` `injection_defense`, `:415` success-path `completeness`, `:413` `panIndiaOnly`,
  `:384-396` deterministic exposure, `:476-490` `/api/qa` refusal with `grounded:false`.

### Phase 4 — Partial
- `src/utils/ingest.ts:68` `compressImageAndCheckBlur` (1500px, JPEG 0.80, EXIF stripped by re-encode),
  `:34` `computeSharpnessScore`, `:88` 3-way verdict, `:108` `extractPdfTextLocally` (word-count
  `isScannableVector`, no `<150ms` budget), `:198,303` concurrency pool (cap 3) — implemented, unused on the
  one-photo hot path.
- `MobileFlow.tsx:651-692` 1-tap header blackout toggle.
- PII shield: `DesktopWorkspace.tsx:505` badge + counts, `Modals.tsx:348-358` token-type popover,
  `App.tsx:310,386` fail-closed `assertNoPiiLeak` before every outbound `fetch`.
- Gap UX: `DesktopWorkspace.tsx:558-566` amber completeness banner (desktop only).
- **Missing:** `[ILLEGIBLE]` refusal copy (the token appears only in the OCR prompt), Lane B honesty badge
  `(main)`, measured `<150ms` PDF scan budget.

### Phase 5 — Partial
- `src/index.css` — `@theme` tokens, severity triplets, `:122` pulse, `:127` reduced-motion block.
- `App.tsx:90,126` 900px JS fork, `:140` `useMobileUI`; `:32-86` `hydrateAuditFromApiPayload`.
- `DesktopWorkspace.tsx:586,1110` the 48/52 split, gated on Tailwind `lg`.
- `MobileFlow.tsx:421` 56px app bar; `:1916` 4-tab bottom nav.
- `public/manifest.webmanifest` + `public/icons/icon-{192,512}.svg`.
- **Missing:** `data-clause-id` anchors (navigation uses React refs + `jumpToClause`), SVG sprite
  (Material Symbols ligatures instead), any dark styling.

### Phase 6 — Partial
- `src/utils/audioSync.ts:30` `playRegionalSpeech` (Sarvam → `speechSynthesis` fallback at `:87`),
  `:19` `stopAllSpeech`.
- `src/utils/spokenScript.ts:194,249` `sanitizeSpokenScript` / `validateSpokenScript`.
- `src/utils/voiceCapture.ts:172` capture (30s cap), `:358` `transcribeAudio`.
- Hold-to-Ask wiring: `MobileFlow.tsx:246-268`, `DesktopWorkspace.tsx:254-279` → `/api/qa` →
  `jumpToClause()` → speak. Every play is inside a button handler, so autoplay policy holds.
- **Missing:** the clause playlist. `src/utils/audioPlaylist.ts` (`buildClausePlaylist`, `playClausePlaylist`,
  `onItemStart`) exists only on `wl/audio` and no component imports it — so the scroll+pulse+dim sequence is
  currently triggered per user action (`DesktopWorkspace.tsx:142-155`), not as playback advances.

### Phase 7 — Partial
- Negotiation: `DesktopWorkspace.tsx` Negotiate tab (`generatedDraft` memo, Polite/Firm, WhatsApp modal),
  `MobileFlow.tsx` m6 (+ `mailto:` handoff at `:1361`).
- `src/utils/pdfBrief.ts:4` `exportOnePageBriefPDF`, invoked from `BriefModal` (`Modals.tsx:177`).
- Vault: `App.tsx:16` `VAULT_STORAGE_KEY`, `:20` `loadInitialVault`, `:132` persistence effect; UI in
  `DesktopSubViews.tsx` and `MobileFlow.tsx` m8. Edit tag / note / delete / clear-all all wired.
- **Missing:** "Don't save" toggle, ~20KB/doc quota, and image exclusion — the whole `AuditResult` is
  serialised, so a Lane B `original_photo_url` base64 string lands in `localStorage`.
- **Also missing here (present on `main`):** the `clipboard.ts` `<textarea>` fallback — the module exists but
  nothing imports it at this commit; buttons call `navigator.clipboard?.writeText(...)` and drop failures.

### Phase 8 — Gap
- `scripts/verify.sh` — secret scan, `tsc --noEmit`, guardrail tests, then curls `health`, `audit`, `qa`,
  `tts`. No `ocr`, no `stt`.
- Secret-scan gate **fails as written**: `git grep -E "sk-ant|sk-or-v1"` matches documentation strings in
  `public/assets/aistudio/*` and the pattern literal in `scripts/verify.sh:25`. No live key is committed, but
  the gate needs `:(exclude)` entries before it can go green.
- Not done and not verifiable from the repo: 7 smoke tests on desktop 1440×900, the same on a physical phone
  via the QR modal, the resilience passes (network-off preset, provider-down, cached audit), the 2-minute
  stage-script rehearsal, the 4:15 PM freeze, and the deployed-URL check.
