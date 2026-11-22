# Phase Status — verified against the code

Matrix for Phase 0–8. **Status is read off the implementation, not the plan.** Evidence is a file, symbol or
line you can open. Baseline: `main` @ `b972cff` — a worktree-free checkout, so nothing here is "on a branch but
not merged". `npm test` → **61 pass / 0 fail** across 5 suites.

| Phase | Status | Evidence |
| --- | --- | --- |
| **0 — Contracts, docs & scaffolding** | **Partial** | `docs/audit-result.schema.md`, `DESIGN_SYSTEM.md`, `mock-audit.json`, `vercel.json`, `.env.example`, `rules/schema.json`, `public/manifest.webmanifest` exist; the planned `api/` and `public/{styles,js,presets,lib}` trees still do not — the build is a monolith `server.ts` + Vite/React `src/` |
| **1 — Rule packs & fixtures** | **Partial** | `src/data/rulePacks.ts` — 4 packs but only **6 rules** (3 KA rental, 1 RBI loan, 1 employment, 1 general), not the 18 planned; `verified_date` is per pack (`2026-11-21`), not per rule; presets are TS (`src/data/presets.ts`), not `public/presets/*.json` |
| **2 — Pure logic + guardrail tests** | **Done** | `src/utils/{promptSecurity,verifier,exposureMath,wayOutMath,piiGuard}.ts` + 5 suites (`guardrails` 14, `ingest` 18, `vaultStore` 13, `audioPlaylist` 8, `pdfBrief` 8); `filterVerifiedFindings` now fails closed on a **missing** `rule_ref.rule_id` (`verifier.ts:109-115`) |
| **3 — Backend API** | **Done** | `server.ts` — 6 routes (`/api/{health,ocr,audit,qa,tts,stt}`), `express.json({limit:'4.5mb'})`, `OCR_MAX_IMAGES=3`, `/api/audit` success path carries `injection_defense` + `completeness` + `panIndiaOnly`; `server/llmClient.ts` timeout + exactly one retry. Caveat: monolith, no `api/`; live LLM/Sarvam calls need funded keys |
| **4 — Dual-lane intake & privacy** | **Partial** | `src/utils/ingest.ts` — multi-image (`prepareImagesForUpload`, cap 3), real pixel `blackoutHeaderRegion`, blur **fail-closed** gate (`shouldBlockBlurry`, `App.tsx:500`), measured `gateTimingsMs`; `checkSafeToSend` fail-closed before every `fetch`. Gap: no measured PDF `<150ms` budget, `[ILLEGIBLE]` copy is mobile-only |
| **5 — UI shell & design system** | **Partial** | `src/index.css` `@theme` + reduced-motion block; 900px JS fork (`App.tsx:187`); 48/52 split; pan-India badge (`DesktopWorkspace.tsx:661`). Deviations: **56px** bar (not 62px), **55%** dim (not 18%), light-only, no SVG sprite, no `data-clause-id` anchors (refs + `jumpToClause`) |
| **6 — Audio, voice Q&A & sync** | **Partial** | Clause playlist **is** wired into both shells: `buildClausePlaylist`/`playClausePlaylist` → `onItemStart` → `jumpToClause` (`DesktopWorkspace.tsx:186-242` scroll+pulse+dim `:1507`), `MobileFlow.tsx:250-277` (scroll + per-item `scrollIntoView`). Gap: mobile has no pulse/dim, only an active-clause highlight |
| **7 — Negotiate, vault & brief** | **Done** | Negotiate tab + m6 with **WhatsApp *and* Email** channels and `copyText()` `<textarea>` fallback (`DesktopWorkspace.tsx:285-293`, `MobileFlow.tsx:1618-1645`); `pdfBrief.ts` `selectBriefFindings` + `exportBriefPDF` driven by selected asks + tone; vault `vaultStore.ts` caps (~20KB/doc, ~480KB total), never persists images/audio, and honours the per-scan "Don't save" policy (toggle is mobile-only) |
| **8 — Integration, verification & freeze** | **Partial** | `scripts/verify.sh` — 3 secret gates are now **scoped** (`:(exclude)scripts/verify.sh`, docs, dist, assets) and clean; typecheck + tests + `curl` of all **6** routes (`health,ocr,audit,qa,tts,stt`) — 21/22 checks green. Gap: no desktop/phone/deploy smoke run is recorded |

**Tally: 3 Done (Phases 2, 3, 7) · 6 Partial (Phases 0, 1, 4, 5, 6, 8) · 0 Gap.**

---

## Evidence detail

### Phase 0 — Partial
`docs/*`, `DESIGN_SYSTEM.md`, `mock-audit.json` (6 clauses / 4 findings / 3 severities), `vercel.json`,
`.env.example`, `rules/schema.json`, `public/manifest.webmanifest` + icons exist.
**Missing:** `api/` (superseded by `server.ts`) and `public/{styles,js,presets,lib}` (superseded by `src/`).

### Phase 1 — Partial
`rulePacks.ts:11,105,146,187` → `IN_KA_DEPOSIT_CAP`, `IN_KA_RENT_ESCALATION`, `IN_KA_LOCKIN_EXIT`,
`IN_RBI_FORECLOSURE_CAP`, `IN_ICA_SEC27_NONCOMPETE`, `IN_GEN_ARBITRATION_NEUTRALITY`. 6 of ~18 planned:
no KFS/APR/penal-charge cap, no notice symmetry, no bond/clawback, no ESOP lock-in. `validateRulePack()` is a
structural assertion set (T5), not a JSON-Schema evaluation.

### Phase 2 — Done
`promptSecurity.ts` (`injectionDefense@1` `:6`, `sanitizeForPrompt`, `wrapUntrustedContract`, `cyrb53`,
4-stage `parseJSONFromLLMResponse`); `verifier.ts` (substring → 2-sentence Jaccard ≥0.80, <3-token floor,
**strict rule pinning**); `exposureMath.ts:56`; `wayOutMath.ts`; `piiGuard.ts` (`maskIndianPII`,
`checkSafeToSend`, `assertNoPiiLeak`, `rehydrateParsedObject`).

### Phase 3 — Done
`server.ts` route map: `:281 health`, `:318 ocr`, `:367 audit`, `:469 qa`, `:544 tts`, `:605 stt`.
`BODY_LIMIT='4.5mb'` (`:54`, applied `:279`, echoed by `/api/health`); `OCR_MAX_IMAGES=3` with a `400
TOO_MANY_IMAGES` beyond it (`:328`); `/api/stt` estimates duration from decoded bytes
(`SARVAM_STT_BYTES_PER_SECOND * 34`, `:51,643`).
`/api/audit` success path: `injection_defense` `:436`, `completeness` `:445` (`normaliseCompleteness` `:85`,
`detectClauseNumberingGap` `:109`), `panIndiaOnly` `:443`, deterministic exposure `:414-426`.
`/api/qa` refuses with `grounded:false` `:506-520`. `prompts.ts:17,88` is the only route to a model.
`llmClient.ts:51` `withTimeout`, `:148-155` exactly one retry (missing key fails fast).

### Phase 4 — Partial
`ingest.ts:113` `compressImageAndCheckBlur` (1500px, JPEG 0.80, EXIF stripped by re-encode), `:94` verdict,
`:105` `shouldBlockBlurry` (**fail-closed**: only `'Blurry — Retake Suggested'` blocks), `:273`
`blackoutHeaderRegion` (real canvas fill, `BLACKOUT_FILL='#111827'`), `:557` `prepareImagesForUpload` (cap 3),
`:332/356` real stats from measured values, `:383` concurrency cap 3. `App.tsx:335-470` measures each gate
(`blurMs`, `piiGateMs`, `auditGateMs`, `groundGateMs`) and blocks on `checkSafeToSend`.
**Gaps:** no measured `<150ms` PDF budget (word-count heuristic, `:153`); `[ILLEGIBLE]` refusal copy ships on
mobile only (`MobileFlow.tsx:1385-1400`).

### Phase 5 — Partial
`index.css` `@theme` tokens + `.clause-active-pulse` (`:122`) + reduced-motion list (`:127`);
`MobileFlow.tsx` 56px app bar; `DesktopWorkspace.tsx:1507` `clause-active-pulse` / `opacity-55`.
**Deviations:** 56px ≠ 62px, 55% ≠ 18%, no SVG sprite (Material Symbols ligatures), no dark styles.

### Phase 6 — Partial
`audioPlaylist.ts:48` `buildClausePlaylist`, `:108` `playClausePlaylist` (+ injectable player, `stop()`),
imported by `DesktopWorkspace.tsx:6` and `MobileFlow.tsx:9`. Desktop `onItemStart` → `jumpToClause` →
scroll + pulse + dim; mobile `onItemStart` → `setFocusedClauseId` + per-item `scrollIntoView`.
`audioSync.ts` `playRegionalSpeech` → `speechSynthesis` fallback; `voiceCapture.ts` (30s) → `/api/stt` →
`/api/qa` → `/api/tts`.
**Gaps:** mobile drives scroll + highlight per item, not `.clause-active-pulse`/dim; `DESIGN_SYSTEM.md` §6.1/§8
still says the playlist "is imported by no component" — **that sentence is now stale** (outside this pass's
edit scope).

### Phase 7 — Done
`pdfBrief.ts:27` `selectBriefFindings` (selected clause/finding ids → default-selected → all, cap 5) and `:60`
`exportBriefPDF(audit, {selectedClauseIds, tone})`; callers `DesktopWorkspace.tsx:271-274`,
`MobileFlow.tsx:1924-1937`, `Modals.tsx:189`. Negotiation: Polite/Firm, WhatsApp modal, **Email** channel
(`mailto:`) on both shells, `clipboard.ts:10` `copyText` with `execCommand` textarea fallback.
Vault: `vaultStore.ts:21-22` caps, `:106` `stripVolatileFields` (drops `original_photo_url`/`data:`/8KB+
fields), `:154` `persistVault` report; `App.tsx:165-170` `vaultSavePolicy`, `:211` `dont_save` early return,
`:540` reset per intake, mobile toggle `MobileFlow.tsx:868-884` wired from `App.tsx:698`;
`DesktopSubViews.tsx:48,220` byte accounting + over-budget flag.
**Gap (deliberate):** the "Don't save" control exists on mobile only — desktop scans always persist — and the
`:540` reset means the policy does not survive an intake boundary by design.

### Phase 8 — Partial
`scripts/verify.sh` — secret gates A/B/C scoped with `:(exclude)` entries (re-run manually: no hits),
`tsc --noEmit`, `npm test`, then `check_route` for `GET /api/health` and `POST /api/{audit,qa,tts,stt}`.
**Gaps:** `/api/ocr` is not curled (6 routes exposed, 5 exercised); 7 smoke tests on desktop 1440×900, the
phone-via-QR run, the resilience passes, the 2-minute rehearsal, the 4:15 PM freeze and the deployed-URL check
are all unrecorded in the repo.
