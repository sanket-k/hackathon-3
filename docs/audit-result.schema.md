# `/api/audit` — Response Contract

Contract for `POST /api/audit`, the statutory audit route (`contract.audit@1`).
Sources of truth: `server.ts` (§2 `/api/audit`, lines ~333–412), `src/types/contract.ts` (`AuditResult`,
`AuditFinding`, `ContractClause`, `MissingClause`), `src/App.tsx` (`hydrateAuditFromApiPayload`, lines 32–86),
`src/utils/verifier.ts` (dual-anchor quote verification).

> **The API envelope is not the client shape.** The route returns a *partial* audit — summary, findings,
> missing clauses, rule-pack metadata — and the client hydrates it on top of a known-good fallback
> `AuditResult` (the Bengaluru rental preset). Fields the server never sends (`clauses`,
> `completeness`, `key_terms`, `id`, `title`, `way_out_params`, …) come from that fallback base.
> See [§4](#4-client-shape--envelope-vs-auditresult).

---

## 1. Request

```http
POST /api/audit
Content-Type: application/json
```

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `contract_text` | `string` | **yes** | — | PII-masked, prompt-sanitized contract body. Rejected if `trim().length < 20`. Fenced in `<untrusted_contract_text>` and truncated to 35 000 chars before the LLM call. |
| `language` | `'kn' \| 'hi' \| 'ta' \| 'en'` | no | `'kn'` | Anything else silently coerced to `'en'`. Governs `spoken_script` language. |
| `contract_type` | `string` | no | `'residential_rental'` | Used with the text to select the active rule pack. |
| `title` | `string` | no | `'Uploaded Contract'` | Echoed into the hydrated `AuditResult.title`; not returned by the route. |

Callers are same-origin (`/api/audit`, no CORS headers); the browser only ever sends **masked** text
after `assertNoPiiLeak`.

---

## 2. Response — success (200)

| Key | Type | Meaning |
| --- | --- | --- |
| `ok` | `true` | Envelope success flag. Always `true` on both the LLM path and the fallback path. |
| `prompt_id` | `string` | Prompt template version, pinned to `"contract.audit@1"`. Use for eval/trace correlation. |
| `template_hash` | `string` | `cyrb53(systemPrompt)` in base-16 — a hash of the *rendered* system prompt (rule pack + language instructions). Changing the pack or the language changes the hash. |
| `rule_pack_applied` | `object` | The jurisdiction pack that scored this contract. See §2.1. |
| `dropped_unverified_count` | `number` | Findings the dual-anchor verifier **discarded** (quote not found ≥ 0.80 Jaccard, or `rule_id` outside the active pack). Surfaced as a quality signal; a high count means the model hallucinated. |
| `summary` | `object \| undefined` | `{risk_score, risk_band, rupee_exposure_inr, top_3_bullets, walkthrough_intro_spoken, …}` as emitted by the model. Passed through verbatim — **not validated field-by-field**. |
| `findings` | `AuditFinding[]` | Only findings that passed verification, each with a `verification` block attached. Possibly `[]`. |
| `missing_clauses` | `Array<{label, why_it_matters}>` | Expected-but-absent clauses. Defaults to `[]`. |

### 2.1 `rule_pack_applied`

| Field | Type | Notes |
| --- | --- | --- |
| `pack_id` | `string` | e.g. `rule_pack_v1`-scoped pack id. |
| `display_name` | `string` | Human label shown in the workspace compliance bar. |
| `is_exact_jurisdiction_match` | `boolean` | `true` when the contract type + detected city matched the pack exactly. |
| `verified_date` | `string` | Pack currency date, rendered as the "Nov 2026" style badge. |
| `match_pct` | `number` | Derived, not measured: `88` when `is_exact_jurisdiction_match`, else `65`. |

### 2.2 `findings[]` — `AuditFinding`

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
| `impact_label` | `string` | no | e.g. `+₹40,000`. |
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

**Verification rule (dual anchor, `src/utils/verifier.ts`).** A finding survives only if
(1) `rule_ref.rule_id ∈ pack.rules[].rule_id`, **and** (2) `verbatim_quote` is located in the contract —
first as a case-insensitive substring (score `1.0`), else via a two-sentence sliding window with token
Jaccard `≥ 0.80`. Quotes under 3 tokens are always dropped. Everything else increments
`dropped_unverified_count`.

---

## 3. Response — error and fallback paths

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
| `reason` | `string` | Upstream error string (`LLM unavailable`, `ANTHROPIC_HTTP_*`, `NO_LLM_KEY_CONFIGURED`, …). |
| `audit` | `AuditResult` | A **complete** audit (`buildLocalDeterministicAudit`), including `clauses` and `completeness`. |

Client handling: `if (payload.audit) return { ...fallbackBase, ...payload.audit, lane, original_photo_url }`.

### 3.3 Output shape by branch

```
ok:true, prompt_id, template_hash, rule_pack_applied, dropped_unverified_count,
summary, findings, missing_clauses                    → partial audit, hydrate over fallback
ok:true, fallback_used:true, reason, audit            → complete audit, use as-is
ok:false, error | INVALID_TEXT                        → 400, do not hydrate
```

---

## 4. Client shape — envelope vs `AuditResult`

`AuditResult` (`src/types/contract.ts`) is the shape the UI renders. The four values the product
actually talks about map as follows:

| Product concept | API key | `AuditResult` field |
| --- | --- | --- |
| **score** | `summary.risk_score` | `summary.risk_score` (`0–100`) |
| **exposure** | `summary.rupee_exposure_inr` | `summary.rupee_exposure_inr` + `summary.exposure_caption` |
| **findings** | `findings[]` | `findings[]` (verified only) |
| **clauses** | *(not returned)* | `clauses[]` — inherited from the fallback base |
| **spoken script** | `findings[].spoken_script` + `summary.walkthrough_intro_spoken` | same; intro is a `Record<LanguageCode, string>` |
| **completeness** | *(not returned)* | `completeness: {status: 'complete' \| 'missing_pages', missing_gaps: string[]}` — inherited from the fallback base; drives the amber "Completeness Gate Triggered" banner |

Hydration also **recomputes** the band from the score — the server's `risk_band` is not trusted:

```
risk_score >= 75 → 'critical'
risk_score >= 45 → 'caution'
else             → 'safe'
risk_band_label   = `${riskScore} · ${Critical|Caution|Safe}`
```

Full `AuditResult`, for completeness:

| Field | Type | Origin |
| --- | --- | --- |
| `id`, `title`, `subtitle`, `meta_badge`, `category`, `lane` | `string` | fallback (`title` ← request `title`, `lane` ← `'A'` vector / `'B'` photo) |
| `stamp_header` | `{reg_line, stamp_value, doc_title, doc_subtitle, recitals, stamp_cert_id, stamp_issued, lessor_name, lessee_name}` | fallback |
| `completeness` | `{status, missing_gaps}` | fallback |
| `pii_masked_tokens` | `Array<{label, masked_preview, status}>` | client (`maskIndianPII`), status ∈ `MASKED \| HASHED \| REDACTED \| VERIFIED LOCAL` |
| `rule_pack_applied` | `{pack_id, display_name, is_exact_jurisdiction_match, verified_date, match_pct}` | **API** |
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

## 5. Example

### 5.1 Request

```json
{
  "contract_text": "Clause 8.2: The lessee shall remain locked in for eleven (11) months from commencement. Clause 14.1: A non-refundable painting fee of INR 12,000 applies at vacating.",
  "language": "kn",
  "contract_type": "residential_rental",
  "title": "HSR Layout 2BHK Rent Agreement"
}
```

### 5.2 Response (abridged)

```json
{
  "ok": true,
  "prompt_id": "contract.audit@1",
  "template_hash": "3f9a1c7be24d0",
  "rule_pack_applied": {
    "pack_id": "pack_ka_blr_rental_v1",
    "display_name": "Karnataka Model Tenancy — Bengaluru",
    "is_exact_jurisdiction_match": true,
    "verified_date": "2026-11-01",
    "match_pct": 88
  },
  "dropped_unverified_count": 1,
  "summary": {
    "risk_score": 78,
    "risk_band": "critical",
    "rupee_exposure_inr": 52000,
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
      "plain_explanation": "You cannot leave for eleven months without paying the full remaining rent.",
      "spoken_script": "ಹನ್ನೊಂದು ತಿಂಗಳ ಲಾಕ್-ಇನ್ ಇದೆ. ಮಧ್ಯದಲ್ಲಿ ಹೊರಟರೆ ಪೂರ್ಣ ಬಾಕಿ ಬಾಡಿಗೆ ಕಟ್ಟಬೇಕು.",
      "verbatim_quote": "The lessee shall remain locked in for eleven (11) months from commencement.",
      "verification": { "status": "verified", "char_start": 0, "char_end": 74, "jaccard": 1.0 },
      "rule_ref": {
        "rule_id": "R-LOCKIN-11M",
        "basis_type": "above_local_norm",
        "citation_label": "Karnataka Model Tenancy Act §10"
      },
      "negotiation": {
        "default_selected": true,
        "short_title": "Trim lock-in to 6 months",
        "impact_badge": "+₹22,000",
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

### 5.3 Hydration result the UI renders

`risk_score: 78` → `risk_band: "critical"`, `risk_band_label: "78 · Critical"`, red band, red
`● 78` avatar in the vault rail, and the clause cards for `c-8-2` pulsing on selection while the rest
dim to `opacity-55`.

---

## 6. Client rules of engagement

1. **Never trust `summary.risk_band`** — recompute from `risk_score` (§4).
2. **`findings` may be empty** even on `ok:true` — a low-yield contract, or everything was dropped. Fall
   back to `fallbackBase.findings`, never render a blank report.
3. **`summary` may be `undefined`** (unparseable LLM JSON on a 200). `hydrateAuditFromApiPayload` spreads
   `...(payload.summary || {})` and keeps the fallback score.
4. **`clauses` and `completeness` never arrive over the wire** in the partial envelope; do not add
   consumers that assume they do without extending the server route first.
5. **`dropped_unverified_count` is telemetry, not an error.** A silent drop is by design: an unverifiable
   quote is worse than a missing finding.
6. **`template_hash` pairs with `prompt_id`** as the audit trail for any given run; log both.
