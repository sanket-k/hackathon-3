# `/api/*` — Response Contracts

Contracts for the three LLM-backed routes: `POST /api/audit` (`contract.audit@1`), `POST /api/qa`
(`contract.qa@1`) and `POST /api/ocr` (`contract.ocr@1`).

Sources of truth: `server.ts` (§`/api/ocr` `:318`, `/api/audit` `:367`, `/api/qa` `:469`, plus
`/api/tts` `:544`, `/api/stt` `:605`, `/api/health` `:281`), `src/types/api.ts` (`AuditSuccessEnvelope`,
`AuditFallbackEnvelope`, `QaSuccessEnvelope`, `OcrEnvelope`, `RulePackAppliedEnvelope`,
`AuditCompletenessEnvelope`), `src/utils/prompts.ts` (the only prompt catalog), `src/utils/promptSecurity.ts`
(`INJECTION_DEFENSE_VERSION`, `cyrb53`, `parseJSONFromLLMResponse`), `src/utils/verifier.ts` (dual-anchor quote
verification + strict `rule_id` pinning), `src/utils/exposureMath.ts` (deterministic rupee math),
`src/data/rulePacks.ts` (`selectRulePack` → `panIndiaOnly`), and `src/App.tsx`
(`hydrateAuditFromApiPayload`, `:59-127`).

> **The API envelope is not the client shape.** `/api/audit` returns a *partial* audit — summary, findings,
> missing clauses, rule-pack metadata, completeness — and the client hydrates it on top of a known-good
> fallback `AuditResult` (the Bengaluru rental preset). Fields the server still never sends (`clauses`,
> `key_terms`, `id`, `title`, `way_out_params`, `stamp_header`, …) come from that fallback base.
> See [§6](#6-client-shape--envelope-vs-auditresult).

### Envelope fields at a glance

| Field | Route | Status |
| --- | --- | --- |
| `prompt_id`, `template_hash` | **all three** LLM routes — `/api/ocr` `:354`, `/api/audit` `:434-435`, `/api/qa` `:510-511` (refusal) and `:525-526` (grounded) | From the central catalog — `buildPrompt()` in `src/utils/prompts.ts` is the only way to reach a model |
| `injection_defense` | `/api/audit` `:436`, echoed by `/api/health` `:302` — **not** `/api/ocr` or `/api/qa` | Always `"injectionDefense@1"` |
| `completeness` | `/api/audit` `:445` | On the **success** path, not just the fallback |
| `rule_pack_applied.panIndiaOnly` | `/api/audit` `:443` | `true` = no state-specific pack matched; **rendered** as the "Pan-India norms only" badge |
| `summary.rupee_exposure_inr` | `/api/audit` `:414-426` | **Deterministic** — recomputed server-side, model value discarded (§2.3) |
| `grounded` | `/api/qa` `:509` / `:524` | `false` means the route refused; the exact body is in §4.2 |

### Hard limits on every route

| Limit | Value | Where |
| --- | --- | --- |
| Request body | **4.5MB** (`express.json({limit:'4.5mb'})`) — the Vercel platform ceiling, not `5mb` | `BODY_LIMIT` `server.ts:54`, applied `:279`, echoed by `/api/health` as `body_limit` |
| `/api/ocr` images | **3** — a hard `400 TOO_MANY_IMAGES` above it, no silent slice | `OCR_MAX_IMAGES` `server.ts:56`, guard `:328-334` |
| `/api/audit` contract text | fenced at **35 000** chars in the prompt; `400 INVALID_TEXT` under 20 chars | `prompts.ts:104`, `server.ts:377` |
| `/api/qa` contract / question | **28 000** / **600** chars | `prompts.ts:103-104` |
| `/api/tts` text | **500** chars (truncated, not rejected) | `SARVAM_TTS_MAX_CHARS` `:43`, `:564` |
| `/api/stt` audio | **≤30s**, enforced twice: client-reported `duration_seconds`, then a **byte-based duration estimate** (`SARVAM_STT_BYTES_PER_SECOND = 3000` × 34 ≈ 102 KB) so a caller that omits the duration cannot bypass it | `server.ts:45-51`, `:620`, `:643-646` |

### Prompt identity — the same mechanism on all three LLM routes

`src/utils/prompts.ts` is the **only** way to reach a model: `PROMPT_IDS` (`:17`) is exactly
`contract.ocr@1`, `contract.audit@1`, `contract.qa@1`, and `buildPrompt()` (`:88`) returns
`{prompt_id, template_hash, system, user}`. `template_hash = cyrb53(system)` (`promptSecurity.ts:8`) over the
*rendered* system prompt, so it moves when the rule pack, the language instruction or the defence preamble
moves.

| Route | `prompt_id` | `template_hash` sourced from | Emitted at |
| --- | --- | --- | --- |
| `/api/audit` | `contract.audit@1` | rendered with the **active pack** + the language instruction, so the same code + pack always rehashes identically | `server.ts:434-435` (success), echoed under `prompts[]` by `/api/health` `:289-293` |
| `/api/qa` | `contract.qa@1` | rendered with the language instruction only | `server.ts:510-511` (refusal body) and `:525-526` (grounded body) — present on **both** branches |
| `/api/ocr` | `contract.ocr@1` | rendered with no arguments, so the hash is a constant per build | `server.ts:354` |

`injection_defense` is emitted by `/api/audit` (`:436`) and `/api/health` (`:302`) only; `/api/ocr` and
`/api/qa` still apply the same `<untrusted_contract_text>` fence and role-override filters (they come from the
shared `DEFENCE_PREAMBLE` inside every system prompt) but do not tag it in their response body.

> **Type drift, one field:** `AuditSuccessEnvelope` (`src/types/api.ts:32-42`) declares every success key
> **except** `injection_defense`, even though the route always sends it. The wire is the source of truth; the
> interface just does not model that one key yet. `RulePackAppliedEnvelope` (`:13-24`) does carry
> `panIndiaOnly: boolean` (required — the client defaults it defensively at `App.tsx:101-104`).

---

## 1. `/api/audit` — request

```http
POST /api/audit
Content-Type: application/json
```

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `contract_text` | `string` | **yes** | — | PII-masked, prompt-sanitized contract body. Rejected if `trim().length < 20`. Fenced in `<untrusted_contract_text>` and truncated to 35 000 chars before the LLM call. |
| `language` | `'kn' \| 'hi' \| 'ta' \| 'en'` | no | `'kn'` | Anything else silently coerced to `'en'`. Governs `spoken_script` language and therefore `template_hash`. |
| `contract_type` | `string` | no | `'residential_rental'` | Used with the detected jurisdiction to select the active rule pack **and** to pick the exit model that floors rupee exposure. |
| `title` | `string` | no | `'Uploaded Contract'` | Echoed into the hydrated `AuditResult.title`; not returned by the route. |

Callers are same-origin (`/api/audit`, no CORS headers); the browser only ever sends **masked** text after
`checkSafeToSend()` (`piiGuard.ts:147`) verifies it. That check is fail-closed: a `safeToSend:false` verdict
blocks the `fetch` outright and records `blocked`/`blockReason` in the intake stats (`App.tsx:416` Lane B,
`:588` Lane A). `assertNoPiiLeak()` is the throwing variant used by the guardrail tests.

---

## 2. `/api/audit` — response, success (200)

| Key | Type | Meaning |
| --- | --- | --- |
| `ok` | `true` | Envelope success flag. Always `true` on both the LLM path and the fallback path. |
| `prompt_id` | `'contract.audit@1'` | Typed literal from `PromptId`. Use for eval/trace correlation. |
| `template_hash` | `string` | `cyrb53(systemPrompt)` in base-16 — a hash of the *rendered* system prompt (rule pack + language instructions + defence preamble). Changing the pack, the language, or `INJECTION_DEFENSE_VERSION` changes the hash. |
| `injection_defense` | `'injectionDefense@1'` | Version tag of the prompt-injection policy in force (`INJECTION_DEFENSE_VERSION`, `src/utils/promptSecurity.ts:6`). **Always present on this route**, on every successful audit — it is the evidence that the `<untrusted_contract_text>` fence and the role-override filters were applied. Bump it when the policy changes; hashes change with it. Also echoed by `GET /api/health` (`:302`) next to each prompt's canonical hash. |
| `rule_pack_applied` | `object` | The jurisdiction pack that scored this contract. See §2.1. |
| `completeness` | `{status, missing_gaps}` | **Returned on the success path** (it used to exist only in the fallback payload). See §2.2. |
| `dropped_unverified_count` | `number` | Findings the dual-anchor verifier **discarded** — unlocatable quote (< 0.80 Jaccard), quote under 3 tokens, or a `rule_ref.rule_id` that is **missing, empty or outside the active pack** (§2.4). Surfaced as a quality signal; a high count means the model hallucinated. |
| `summary` | `object \| undefined` | `{risk_score, risk_band, rupee_exposure_inr, top_3_bullets, walkthrough_intro_spoken, …}` as emitted by the model, **except** `rupee_exposure_inr`, which is replaced (§2.3). Not validated field-by-field; `undefined` when the model emitted no summary. |
| `findings` | `AuditFinding[]` | Only findings that passed verification, each with a `verification` block attached. Possibly `[]`. |
| `missing_clauses` | `Array<{label, why_it_matters, recommended_addendum?}>` | Expected-but-absent clauses. When the model returns none (or only malformed entries), the route substitutes `pack.expected_clauses` — `groundMissingClauses()`, `server.ts:121`. Never empty for a pack that declares `expected_clauses`. |

### 2.1 `rule_pack_applied`

| Field | Type | Notes |
| --- | --- | --- |
| `pack_id` | `string` | One of `in-ka-rental`, `in-central-rbi-loan`, `in-central-employment`, `in-general-fallback`. |
| `display_name` | `string` | Human label shown in the workspace compliance bar. |
| `is_exact_jurisdiction_match` | `boolean` | `true` when the contract type + detected state/city matched a pack exactly. |
| `verified_date` | `string` | Pack currency date (all packs: `2026-11-21`), rendered as the "Nov 2026" style badge. |
| `match_pct` | `number` | **Derived, not measured**: `88` when `is_exact_jurisdiction_match`, else `65`. (The local fallback uses `64` instead of `65` — cosmetic drift, both mean "loose match".) |
| `panIndiaOnly` | `boolean` | `true` when no state-specific pack applies and only pan-India norms were used. Comes from `selectRulePack()` (`src/data/rulePacks.ts:247-259`): the loan and employment packs are central acts, so they are `true`; Karnataka rental is `false`; any un-matched rental or unknown type falls to `in-general-fallback` with `true`. Surfaced in the UI as the **"Pan-India norms only"** badge in the desktop compliance bar (`DesktopWorkspace.tsx:661-663`) instead of implying a local match. |

`panIndiaOnly` and `is_exact_jurisdiction_match` are deliberately **not** inverses: an RBI loan pack is an
exact *type* match and still pan-India-only. Read `panIndiaOnly` when you want to know whether local law was
actually consulted; read `is_exact_jurisdiction_match` when you want to know how confident the pack choice was.

The client also defensively defaults it: `hydrateAuditFromApiPayload()` does
`panIndiaOnly: payload.rule_pack_applied.panIndiaOnly ?? fallbackBase.rule_pack_applied.panIndiaOnly ?? false`
(`App.tsx:101-104`), so a cached or older payload cannot silently claim a local match.

### 2.2 `completeness` — present on success

```ts
{ status: 'complete' | 'missing_pages', missing_gaps: string[] }
```

Previously the amber "Completeness Gate Triggered" banner only worked on the deterministic fallback path,
because the LLM path withheld `completeness`. It is now always emitted, so the gate works when the model
answers too. Resolution order, `normaliseCompleteness()` (`server.ts:85`):

1. **Model verdict wins.** If the model returned `completeness.status === 'missing_pages'`, or a non-empty
   `missing_gaps`, the route returns `missing_pages` with the model's own gap strings. If it said
   `missing_pages` without gaps, a generic gap is supplied.
2. **Otherwise, clause-numbering-gap detection runs on the raw contract text.**
3. Only if neither fires is the status `complete`.

**Clause-numbering-gap detection** (`detectClauseNumberingGap()`, `server.ts:109`) is the canonical
"missing middle page" fingerprint — a scan whose page 2 is absent resumes mid-sentence at a higher clause
number:

```
"…Clause 4.2 Security Deposit…"            ← page 1 ends
"…Clause 7.1 Arbitration…"                 ← page 2 (Clauses 5, 6) never arrived
```

The detector matches `/\bclause\s+(\d{1,3})\b/gi` across the whole text, dedupes the numbers, sorts them
ascending, and returns on the **first** gap larger than one:

> `Clause numbering jumps from Clause 4 directly to Clause 7 — a middle page may be missing.`

That single string becomes `missing_gaps[0]` with `status: 'missing_pages'`, which is what drives the amber
banner on **both** shells — `DesktopWorkspace.tsx:713-719` and `MobileFlow.tsx:1127-1136` — and the
`Clause 4 → 7` copy in the missing-page preset. The client does consume it: the hydrator takes
`payload.completeness` (`App.tsx:114`), and for the fallback branch `payload.audit.completeness` (`:78`).

Two honest limitations: the numbers are **sorted**, not read in document order, so a contract that cites
"Clause 14" and "Clause 4" but never spells out the intervening numbers will be flagged even though nothing is
missing; and the regex only sees the literal word "Clause", so `§`, `Article` or bare `4.2`/`7.1` numbering
produces a false `complete`. Treat `complete` as "no evidence of a gap", not as proof of completeness.

### 2.3 `summary.rupee_exposure_inr` is recomputed server-side

**The model's arithmetic is never trusted.** After verification, the route recomputes exposure from the
surviving findings and the contract-type exit model, then overwrites the model's figure
(`server.ts:414-426`):

```ts
const wayOutParams = buildWayOutParamsFor(contract_type);   // server.ts:59 — rental / loan / employment baseline
const exposure = computeRupeeExposure(verified, wayOutParams, parsed.summary?.rupee_exposure_inr);
const summary  = parsed.summary ? { ...parsed.summary, rupee_exposure_inr: exposure.total_inr } : undefined;
```

`computeRupeeExposure()` (`src/utils/exposureMath.ts:56`) works in integer rupees:

- each **verified** finding contributes `parseRupees(finding.impact_label)` (`"+₹40,000"` → `40000`);
  dropped findings contribute nothing;
- `exposureFromWayOut(params)` is the **floor** — the cash lost by exiting early
  (`flat_exit_deduction_inr` for loan/employment; `flat_exit_deduction_inr + monthly_rent_inr ×
  notice_months` for rental);
- `total_inr = max(sum(finding impacts), wayOutValue)`.

Consequences worth knowing: a model that reports `₹52000` for a rental where the exit model floors at
`₹40000` and the finding impacts sum to `₹22000` will be overridden to `40000`. A model that omits
`impact_label` everywhere still yields a non-zero exposure. A hallucinated nine-figure number cannot inflate
the headline. The third argument is only used to set `overrode_model_value` on the returned computation; the
`/api/audit` envelope sends `total_inr` and not the computation itself, so `overrode_model_value` and the
`lines[]` breakdown never reach the client today.

The fallback path uses a hardcoded figure per contract type (`₹42 000` loan / `₹0` employment /
`₹1 35 000` rental, `server.ts:236`) rather than this function — do not read the fallback number as a
computation.

### 2.4 `findings[]` — `AuditFinding`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `finding_id` | `string` | yes | Stable id for selection state. |
| `clause_id` | `string` | yes | Joins to `ContractClause.clause_id`; drives the scroll-sync + pulse. |
| `severity` | `'critical' \| 'caution' \| 'safe'` | yes | Drives the red/amber/emerald triplet. |
| `category` | `string` | yes | Rule category from the pack. |
| `line_ref` | `string` | yes | Rendered in `font-mono`, e.g. `Cl. 8.2 · L.14`. |
| `headline` | `string` | yes | One-line finding title. |
| `statutory_rule_text` | `string` | no | Quoted statute text. |
| `plain_explanation` | `string` | yes | Lay-language "what this means for you". |
| `risk_detail` | `string` | no | |
| `impact_label` | `string` | no | e.g. `+₹40,000`. Feeds the deterministic exposure sum (§2.3). |
| `spoken_script` | `string` | yes | Audio narration, 12–16-word sentences, no markdown, in the requested language. |
| `verbatim_quote` | `string` | yes | **Character-for-character** slice of the contract. The verification anchor. |
| `verification.status` | `'verified' \| 'dropped'` | yes | Client only ever receives `verified` (dropped ones are counted, not returned). |
| `verification.char_start` / `char_end` | `number` | yes | Offsets of the match in the (masked) contract text; `-1` when unmatched — impossible for returned findings. |
| `verification.jaccard` | `number` | yes | `1.0` for an exact case-insensitive substring hit; otherwise the best sliding-window score, `≥ 0.80`. |
| `rule_ref.rule_id` | `string` | yes | Must exist in the active pack or the finding is dropped. |
| `rule_ref.basis_type` | `'statutory_conflict' \| 'above_local_norm' \| 'missing_protection' \| 'standard'` | yes | |
| `rule_ref.citation_label` | `string` | yes | e.g. `Karnataka Model Tenancy Act §10`. |
| `negotiation.default_selected` | `boolean` | yes | Pre-checks the clause in the Negotiate tab. |
| `negotiation.short_title` | `string` | yes | |
| `negotiation.impact_badge` | `string` | yes | |
| `negotiation.polite_ask` | `string` | yes | Soft-tone rewrite request. |
| `negotiation.firm_ask` | `string` | yes | Firm-tone escalation. |
| `negotiation.replacement_wording` | `string` | yes | Drop-in clause text. |

**Verification rule (dual anchor + strict pinning, `src/utils/verifier.ts`).** A finding survives only if all
of these hold:

1. **Strict `rule_id` pinning.** When the route passes its allow-list (`allowedRuleIds`, built from the active
   pack at `server.ts:386`), the finding must carry a **non-empty** `rule_ref.rule_id` that is a member of that
   set. A finding with **no `rule_ref` at all is dropped**, exactly like one citing an unknown id
   (`verifier.ts:109-115`) — this is the fail-closed behaviour, it is on `main`, and `/api/audit` always
   passes an allow-list, so it is enforced in production.
2. `verbatim_quote` must be a string and carry **≥ 3 tokens** (`verifier.ts:117-128`) — the floor is enforced
   here as well as inside the matcher, because a 1–2 token quote would otherwise pass via the exact-substring
   shortcut.
3. `verbatim_quote` must be located in the contract — first as a case-insensitive substring (score `1.0`), else
   via a two-sentence sliding window with token Jaccard `≥ 0.80`.

Everything else increments `dropped_unverified_count`. The consequence for clients: a finding you receive is
always statute-anchored *and* quote-anchored; there is no "unpinned but plausible" category. A high
`dropped_unverified_count` means the model invented either the citation or the quote.

---

## 3. `/api/audit` — error, fallback, and shape by branch

### 3.1 `400` — invalid input

```json
{ "error": "INVALID_TEXT", "message": "Contract text must be at least 20 characters." }
```

### 3.2 `200` with `fallback_used: true` — LLM unavailable

The route never returns 5xx for model failure; it degrades to a deterministic local audit.

| Key | Type | Meaning |
| --- | --- | --- |
| `ok` | `true` | |
| `fallback_used` | `true` | Discriminator — **presence of this key means `audit` is authoritative and the partial envelope keys are absent.** |
| `reason` | `string` | Upstream error string (`LLM unavailable`, `ANTHROPIC_HTTP_*` / `OPENROUTER_HTTP_*`, `NO_LLM_KEY_CONFIGURED`, timeout, …). |
| `audit` | `AuditResult` | A **complete** audit (`buildLocalDeterministicAudit`), including `clauses`, `completeness`, `way_out_params` and a `rule_pack_applied` that also carries `panIndiaOnly`. |

The fallback payload carries **no** `prompt_id`, `template_hash`, `injection_defense`, or
`dropped_unverified_count` — no model was called, so there is no prompt hash to report. Any client that
dereferences `template_hash` unconditionally will break here.

Client handling: `if (payload.audit) return { ...fallbackBase, ...payload.audit, lane, original_photo_url }`.

### 3.3 Output shape by branch

```
ok:true, prompt_id, template_hash, injection_defense, rule_pack_applied,
completeness, dropped_unverified_count, summary, findings, missing_clauses
                                            → partial audit, hydrate over fallback
ok:true, fallback_used:true, reason, audit  → complete audit, use as-is (no prompt_id/hash)
ok:false, error | INVALID_TEXT              → 400, do not hydrate
```

Two properties of the success branch worth pinning in any client or eval harness:

- **`findings[]` is already filtered.** The route never returns an unverified finding. Strict pinning means a
  finding without a resolvable `rule_ref.rule_id` in the active pack is dropped and counted (§2.4), so
  `findings.length + dropped_unverified_count` is the model's raw claim and `findings.length` is what survived.
- **`completeness` and `panIndiaOnly` are on this branch.** They are not fallback-only keys, which is what makes
  the amber gap banner and the pan-India badge work on a live LLM answer rather than on the preset.

### 3.4 `GET /api/health` — the audit-trail surface

`{ status, provider, llmConfigured, sarvamConfigured, injection_defense, prompts[{id, hash}], body_limit,
sarvam{tts_model, stt_model, stt_mode, tts_max_chars, stt_max_seconds, stt_max_keyterms,
stt_max_decoded_bytes} }` (`server.ts:281-315`). It reports each prompt's `template_hash` at canonical args
plus `injection_defense`, so a deploy can be fingerprinted without a model call. `llmConfigured` /
`sarvamConfigured` are booleans only — no key material is ever returned.

---

## 4. `/api/qa` — response contract

Grounded question answering over the same contract text. Powered by `contract.qa@1` from the central catalog.

**Request:** `{ question: string, contract_text: string, language?: 'kn'|'hi'|'ta'|'en' }`. Missing/blank
`question` or non-string `contract_text` → `400 {error: 'INVALID_QA_INPUT'}`. The prompt fences the contract
at 28 000 chars and sanitizes the question at 600. Nothing here is retried against a different answer: the LLM
timeout + one retry in `server/llmClient.ts` happen *before* verification, and only one generation is ever
verified.

**The route answers or refuses — it never guesses.** It verifies the model's `verbatim_quote` against
`contract_text` with the same `verifyQuoteAgainstText()` used by the audit route, then branches.

### 4.1 Grounded (200)

| Key | Type | Notes |
| --- | --- | --- |
| `ok` | `true` | |
| `grounded` | `true` | The quote resolved in the document. **The only field that distinguishes an answer from a refusal.** |
| `prompt_id` | `'contract.qa@1'` | Typed literal (`server.ts:525`). |
| `template_hash` | `string` | `cyrb53(systemPrompt)`; changes with language and defence policy (`server.ts:526`). |
| `spoken_script` | `string` | Audio-ready, in the requested language. |
| `answer_en` | `string` | English answer. |
| `statutory_note` | `string` | Citation or note; may be `''`. |
| `verbatim_quote` | `string` | The verified quote. |
| `clause_id` | `string` | Clause the answer is anchored to (drives scroll + pulse). |
| `verification` | `{status, char_start, char_end, jaccard}` | Same shape as a finding's `verification`; `status: 'verified'` here. |

**Processing budget:** the contract is fenced at 28 000 chars and the question sanitized at 600
(`prompts.ts:103`); the call is the `reasoning` tier at temperature 0.15 with the LLM timeout + one retry.

### 4.2 Refused — unverifiable quote (200, `grounded: false`)

If `verifyQuoteAgainstText()` cannot place the quote (not a substring, Jaccard `< 0.80`, or under 3 tokens)
the answer is **withheld** and replaced with an explicit refusal (`server.ts:506-520`). This is the exact body
— field-for-field, nothing else is added:

```json
{
  "ok": true,
  "grounded": false,
  "prompt_id": "contract.qa@1",
  "template_hash": "…",
  "spoken_script": "I could not find this in the document you uploaded.",
  "answer_en": "I could not find a clause in this document that answers that question.",
  "statutory_note": "",
  "verbatim_quote": "",
  "clause_id": "",
  "verification": { "status": "dropped", "char_start": -1, "char_end": -1, "jaccard": 0.0 }
}
```

Design intent: a plausible-sounding but unanchored legal answer is worse than an admitted gap, so the model's
prose is dropped entirely and the user gets a plain "could not find this in the document" plus an invitation to
re-ask. `statutory_note` and `verbatim_quote` are blanked so nothing from the unverified generation survives.
`clause_id` is the one field passed through as-is (`parsed.clause_id || ''`) — it is a pointer the model chose,
not something the verifier confirmed, so do not navigate on it.

**Client reality check:** the desktop and mobile Q&A handlers gate on
`data.ok && !data.fallback_recommended && data.answer_en` (`DesktopWorkspace.tsx:325`,
`MobileFlow.tsx:325`) and do **not** read `grounded`. Because the refusal body carries an `answer_en` and
`ok: true`, the refusal *text* is shown correctly — but the client also treats it as a normal answer and
scrolls to `clause_id || audit.clauses[0].clause_id`, so a refusal scrolls to the first clause. Consumers should
branch on `grounded` before doing anything positional. This is the one remaining `/api/qa` contract gap: the
route refuses correctly, the UI just does not distinguish a refusal from an answer.

### 4.3 `/api/qa` failure (200)

Non-verification failures (no key, upstream error) return
`{ ok: false, fallback_recommended: true, error }`, and both clients fall back to a preset answer.

---

## 5. `/api/ocr` — response contract

`contract.ocr@1`, vision tier (`fast`, temperature 0.0). **1 to 3** data-URL images; more than 3 is a hard
`400`, not a silent slice (`OCR_MAX_IMAGES = 3`, `server.ts:56`, guard `:324-334`):

```json
{ "error": "TOO_MANY_IMAGES", "message": "Provide 1 to 3 JPEG data URLs." }
```

| Key | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | `true` on a model round-trip, `false` on any failure. |
| `prompt_id` | `'contract.ocr@1'` | From the central catalog (`server.ts:354`). |
| `template_hash` | `string` | `cyrb53(systemPrompt)` derived from the rendered OCR prompt (no pack, no language instruction — this template takes no arguments). |
| `data` | `object` | `{detected_type, detected_jurisdiction, completeness {status, missing_gaps}, clauses[{clause_id, section_label, page_num, text, needs_visual_check_tokens?}]}` as parsed from the model. |
| `fallback_recommended` | `boolean` | Present on failure: `true`, alongside `error` + a human `message`. |

The OCR prompt asks for `[ILLEGIBLE]` spans and clause-numbering jumps, so `data.completeness` can be the
first place a gap is detected. This route does **not** emit `injection_defense`.

---

## 6. Client shape — envelope vs `AuditResult`

`AuditResult` (`src/types/contract.ts`) is the shape the UI renders. The product's headline values map as
follows:

| Product concept | API key | `AuditResult` field |
| --- | --- | --- |
| **score** | `summary.risk_score` | `summary.risk_score` (`0–100`) |
| **exposure** | `summary.rupee_exposure_inr` (server-recomputed) | `summary.rupee_exposure_inr` + `summary.exposure_caption` |
| **findings** | `findings[]` | `findings[]` (verified only) |
| **clauses** | *(not returned)* | `clauses[]` — inherited from the fallback base |
| **spoken script** | `findings[].spoken_script` + `summary.walkthrough_intro_spoken` | same; intro is a `Record<LanguageCode, string>` |
| **completeness** | `completeness` (**returned on success**) | `completeness: {status, missing_gaps}` — **now taken from the payload** (`App.tsx:78`, `:114`) |
| **pan-India** | `rule_pack_applied.panIndiaOnly` | `rule_pack_applied.panIndiaOnly?` — added to `AuditResult` and rendered as the compliance-bar badge |

Hydration also **recomputes** the band from the score — the server's `risk_band` is not trusted:

```
risk_score >= 75 → 'critical'
risk_score >= 45 → 'caution'
else             → 'safe'
risk_band_label   = `${riskScore} · ${Critical|Caution|Safe}`
```

> **History, resolved: the client used to ignore the new `completeness`.** `hydrateAuditFromApiPayload()`
> (`src/App.tsx:59-127`) now destructures and applies `payload.completeness` on both branches
> (`:78` fallback-audit, `:114` partial envelope), so the amber banner reads the server's verdict when the LLM
> answers. `injection_defense` remains audit-trail-only: it is not rendered anywhere in the UI, and nothing
> should assume it is.

Full `AuditResult`, for completeness:

| Field | Type | Origin |
| --- | --- | --- |
| `id`, `title`, `subtitle`, `meta_badge`, `category`, `lane` | `string` | fallback (`title` ← request `title`, `lane` ← `'A'` vector / `'B'` photo) |
| `stamp_header` | `{reg_line, stamp_value, doc_title, doc_subtitle, recitals, stamp_cert_id, stamp_issued, lessor_name, lessee_name}` | fallback |
| `completeness` | `{status, missing_gaps}` | payload (`payload.completeness` on success, `payload.audit.completeness` on fallback), else fallback |
| `pii_masked_tokens` | `Array<{label, masked_preview, status}>` | client (`maskIndianPII`), status ∈ `MASKED \| HASHED \| REDACTED \| VERIFIED LOCAL` |
| `rule_pack_applied` | `{pack_id, display_name, is_exact_jurisdiction_match, verified_date, match_pct, panIndiaOnly?}` | **API** |
| `summary` | `{risk_score, risk_band, risk_band_label, rupee_exposure_inr, exposure_caption, breakdown_cards[], alert_banner, top_3_bullets[], walkthrough_intro_spoken, audio_duration_label}` | **API** (band + label recomputed) |
| `clauses` | `ContractClause[]` | fallback |
| `findings` | `AuditFinding[]` | **API** |
| `key_terms` | `KeyTerm[]` | fallback |
| `missing_clauses` | `MissingClause[]` | **API** |
| `way_out_params` | `WayOutParams` | fallback |
| `original_photo_url` | `string?` | client (Lane B photo) |
| `qa_presets` | `Array<{chip, question_native, question_en, answer_native, answer_en, statutory_note, clause_id, excerpt}>` | fallback |

`ContractClause` (fallback-sourced, rendered in the reconstructed sheet): `clause_id`, `section_label`,
`page_num`, `line_ref?`, `severity`, `badge_label`, `right_badge?`, `text`, `ocr_highlight_token?`,
`ocr_confidence?`, `ocr_verified?`, `warning_footer?`.

---

## 7. Example

### 7.1 Request

```json
{
  "contract_text": "Clause 8.2: The lessee shall remain locked in for eleven (11) months from commencement. Clause 14.1: A non-refundable painting fee of INR 12,000 applies at vacating.",
  "language": "kn",
  "contract_type": "residential_rental",
  "title": "HSR Layout 2BHK Rent Agreement"
}
```

### 7.2 Response (abridged)

```json
{
  "ok": true,
  "prompt_id": "contract.audit@1",
  "template_hash": "3f9a1c7be24d0",
  "injection_defense": "injectionDefense@1",
  "rule_pack_applied": {
    "pack_id": "in-ka-rental",
    "display_name": "Karnataka Model Tenancy Act 2021",
    "is_exact_jurisdiction_match": true,
    "verified_date": "2026-11-21",
    "match_pct": 88,
    "panIndiaOnly": false
  },
  "completeness": {
    "status": "missing_pages",
    "missing_gaps": ["Clause numbering jumps from Clause 8 directly to Clause 14 — a middle page may be missing."]
  },
  "dropped_unverified_count": 1,
  "summary": {
    "risk_score": 78,
    "risk_band": "critical",
    "rupee_exposure_inr": 40000,
    "top_3_bullets": [
      { "title": "11-month lock-in exceeds local norm", "detail": "Lock-ins above the 6-month benchmark are flagged." }
    ],
    "walkthrough_intro_spoken": {
      "kn": "ಈ ಒಪ್ಪಂದದಲ್ಲಿ ಹನ್ನೊಂದು ತಿಂಗಳ ಲಾಕ್-ಇನ್ ಇದೆ. ಇದು ಸ್ಥಳೀಯ ಮಾನದಂಡಕ್ಕಿಂತ ಹೆಚ್ಚು.",
      "hi": "इस अनुबंध में ग्यारह महीने का लॉक-इन है।",
      "ta": "இந்த ஒப்பந்தத்தில் பதினொரு மாத பிணைப்பு உள்ளது.",
      "en": "This contract has an eleven month lock-in, above the local norm."
    },
    "audio_duration_label": "0:48"
  },
  "findings": [
    {
      "finding_id": "f-8-2",
      "clause_id": "c-8-2",
      "severity": "critical",
      "category": "lock_in",
      "line_ref": "Cl. 8.2",
      "headline": "11-month lock-in with no exit clause",
      "impact_label": "+₹22,000",
      "plain_explanation": "You cannot leave for eleven months without paying the full remaining rent.",
      "spoken_script": "ಹನ್ನೊಂದು ತಿಂಗಳ ಲಾಕ್-ಇನ್ ಇದೆ. ಮಧ್ಯದಲ್ಲಿ ಹೊರಟರೆ ಪೂರ್ಣ ಬಾಕಿ ಬಾಡಿಗೆ ಕಟ್ಟಬೇಕು.",
      "verbatim_quote": "The lessee shall remain locked in for eleven (11) months from commencement.",
      "verification": { "status": "verified", "char_start": 0, "char_end": 74, "jaccard": 1.0 },
      "rule_ref": {
        "rule_id": "IN_KA_LOCKIN_EXIT",
        "basis_type": "above_local_norm",
        "citation_label": "Karnataka Model Tenancy Act 2021"
      },
      "negotiation": {
        "default_selected": true,
        "short_title": "Trim lock-in to 6 months",
        "impact_badge": "High Impact",
        "polite_ask": "Could we align the lock-in period with the standard six months?",
        "firm_ask": "Please amend Clause 8.2 to a six-month lock-in; eleven months exceeds the statutory benchmark.",
        "replacement_wording": "The lessee shall be locked in for a period of six (6) months from commencement."
      }
    }
  ],
  "missing_clauses": [
    {
      "label": "Maintenance responsibility",
      "why_it_matters": "Without this clause, structural repairs can be billed to the tenant.",
      "recommended_addendum": "Add: the lessor bears structural repairs; the lessee bears routine upkeep."
    }
  ]
}
```

Note `rupee_exposure_inr: 40000` above even though the model proposed a higher figure: the rental exit model
floors exposure at `flat_exit_deduction_inr (25000) + monthly_rent_inr (25000) × notice_months (1)`, and only
verified `impact_label`s can raise it. Also note `completeness.status: "missing_pages"` on an `ok:true`
response — that is the new behaviour; the amber gate now fires on the LLM path.

### 7.3 Hydration result the UI renders

`risk_score: 78` → `risk_band: "critical"`, `risk_band_label: "78 · Critical"`, red band, red `● 78` avatar in
the vault rail, and the clause cards for `c-8-2` pulsing on selection while the rest dim to `opacity-55`.
The `missing_pages` gap drives the amber banner directly — the hydrator reads `payload.completeness`
(`App.tsx:114`).

---

## 8. Client rules of engagement

1. **Never trust `summary.risk_band`** — recompute from `risk_score` (§6).
2. **Never trust `summary.rupee_exposure_inr` off the wire either, in the sense that matters:** the server has
   already replaced it deterministically (§2.3). Do not recompute it again in the client, and never fall back
   to the model's own figure — it is not in the payload.
3. **`findings` may be empty** even on `ok:true` — a low-yield contract, or everything was dropped. Fall back
   to `fallbackBase.findings`, never render a blank report.
4. **`summary` may be `undefined`** (unparseable LLM JSON on a 200). `hydrateAuditFromApiPayload` spreads
   `...(payload.summary || {})` and keeps the fallback score.
5. **`clauses` still never arrive over the wire.** `completeness` now does and the hydrator consumes it (§6).
   Do not assume any other fallback-only field has been promoted.
6. **`dropped_unverified_count` is telemetry, not an error.** A silent drop is by design: an unverifiable
   quote is worse than a missing finding.
7. **`template_hash` pairs with `prompt_id`** as the audit trail for any given run; log both. On the audit
   route, also log `injection_defense` — together they pin the exact policy and pack that produced the
   verdict.
8. **Branch `/api/qa` on `grounded` before using `clause_id`.** A refusal still has `ok: true` and a non-empty
   `answer_en` (§4.2); only `grounded` tells you the answer is anchored.
