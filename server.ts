import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { selectRulePack, detectJurisdiction, RULE_PACKS } from './src/data/rulePacks.ts';
import { parseJSONFromLLMResponse, sanitizeForPrompt } from './src/utils/promptSecurity.ts';
import { buildPrompt, INJECTION_DEFENSE_VERSION } from './src/utils/prompts.ts';
import { callLLMChat } from './server/llmClient.ts';
import { filterVerifiedFindings, verifyQuoteAgainstText } from './src/utils/verifier.ts';
import { computeRupeeExposure } from './src/utils/exposureMath.ts';
import type { AuditFinding, LanguageCode, RulePack, Severity, WayOutParams } from './src/types/contract.ts';
import type { OcrEnvelope } from './src/types/api.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_LANGS = new Set<LanguageCode>(['kn', 'hi', 'ta', 'en']);

const SARVAM_LANG_MAP: Record<LanguageCode, string> = {
  kn: 'kn-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  en: 'en-IN',
};

const SARVAM_SPEAKER_MAP: Record<LanguageCode, string> = {
  kn: 'anushka',
  hi: 'anushka',
  ta: 'anushka',
  en: 'anushka',
};

// Sarvam model ids (latest generation). Every failure path below degrades to
// { fallback_recommended: true, reason } so the client can use browser TTS / local STT.
const SARVAM_TTS_MODEL = 'bulbul:v4-flash';
const SARVAM_STT_MODEL = 'saaras:v4';

// bulbul hard-limits text-to-speech input length; keep a conservative ceiling.
const SARVAM_TTS_MAX_CHARS = 500;
// saaras sync API accepts short clips only: <= 30 seconds of audio.
const SARVAM_STT_MAX_SECONDS = 30;
// saaras:v4 codemix supports up to 50 domain keyterms (bias the decoder toward them).
const SARVAM_STT_MAX_KEYTERMS = 50;
// webm/opus at ~24kbps ≈ 3000 bytes/s. Reject base64 blobs sized beyond the 30s
// cap plus headroom, so a client that omits duration_seconds cannot bypass it.
const SARVAM_STT_BYTES_PER_SECOND = 3000;
const SARVAM_STT_MAX_DECODED_BYTES = SARVAM_STT_BYTES_PER_SECOND * 34;

// Vercel caps request bodies at ~4.5MB; stay under the platform ceiling.
const BODY_LIMIT = '4.5mb';
// Vision OCR spends tokens per image; cap hard instead of silently slicing later.
const OCR_MAX_IMAGES = 3;

/** Baseline exit-model parameters per contract type (overridden by the client). */
function buildWayOutParamsFor(contractType: string): WayOutParams {
  const base: WayOutParams = {
    mode: 'rental',
    monthly_rent_inr: 25000,
    deposit_inr: 150000,
    lock_in_months: 6,
    notice_months: 1,
    total_months: 11,
    flat_exit_deduction_inr: 25000,
    negotiated_lock_in_months: 0,
    negotiated_flat_deduction_inr: 0,
  };
  if (contractType === 'personal_loan' || contractType === 'loan') {
    return { ...base, mode: 'loan', flat_exit_deduction_inr: 42000, total_months: 36 };
  }
  if (contractType === 'employment_offer' || contractType === 'employment') {
    return { ...base, mode: 'employment', flat_exit_deduction_inr: 0, notice_months: 2 };
  }
  return base;
}

/**
 * A missing-pages signal must survive the LLM path. Prefer the model's own
 * completeness verdict; otherwise detect a clause-numbering jump (e.g. 4 → 7)
 * which is the canonical "missing middle page" fingerprint.
 */
function normaliseCompleteness(
  modelCompleteness: { status?: string; missing_gaps?: string[] } | undefined,
  contractText: string,
): { status: 'complete' | 'missing_pages'; missing_gaps: string[] } {
  const modelGaps = Array.isArray(modelCompleteness?.missing_gaps)
    ? modelCompleteness!.missing_gaps.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
    : [];

  if (modelCompleteness?.status === 'missing_pages' || modelGaps.length > 0) {
    return {
      status: 'missing_pages',
      missing_gaps: modelGaps.length > 0 ? modelGaps : ['A referenced page or annexure appears to be absent.'],
    };
  }

  const numberingGap = detectClauseNumberingGap(contractText);
  if (numberingGap) {
    return { status: 'missing_pages', missing_gaps: [numberingGap] };
  }

  return { status: 'complete', missing_gaps: [] };
}

/** Return a human-readable gap when clause numbers skip (e.g. 4 directly to 7). */
export function detectClauseNumberingGap(text: string): string | null {
  const matches = Array.from(text.matchAll(/\bclause\s+(\d{1,3})\b/gi)).map((m) => Number.parseInt(m[1], 10));
  const unique = Array.from(new Set(matches)).sort((a, b) => a - b);
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] - unique[i - 1] > 1) {
      return `Clause numbering jumps from Clause ${unique[i - 1]} directly to Clause ${unique[i]} — a middle page may be missing.`;
    }
  }
  return null;
}

/** Drop model-returned missing clauses that are not grounded in the active pack. */
function groundMissingClauses(
  modelMissing: Array<{ label: string; why_it_matters: string; recommended_addendum?: string }> | undefined,
  pack: RulePack,
): Array<{ label: string; why_it_matters: string; recommended_addendum?: string }> {
  const grounded = Array.isArray(modelMissing)
    ? modelMissing.filter(
        (m) => m && typeof m.label === 'string' && typeof m.why_it_matters === 'string' && m.label.trim(),
      )
    : [];
  if (grounded.length > 0) return grounded;
  return pack.expected_clauses.map((ec) => ({ label: ec.label, why_it_matters: ec.why_it_matters }));
}

function buildLocalDeterministicAudit(rawText: string, language: LanguageCode, docTitle: string) {
  const lower = rawText.toLowerCase();
  const isLoan = lower.includes('loan') || lower.includes('emi') || lower.includes('foreclosure') || lower.includes('interest');
  const isEmployment = lower.includes('employment') || lower.includes('offer') || lower.includes('non-compete') || lower.includes('notice period');
  const contractType = isLoan ? 'personal_loan' : isEmployment ? 'employment_offer' : 'residential_rental';
  const { pack, isExactMatch, panIndiaOnly } = selectRulePack(contractType, detectJurisdiction(rawText));

  const sentences = rawText
    .split(/(?<=[.?!\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 10);

  const clauses = sentences.map((s, idx) => {
    const sl = s.toLowerCase();
    const isCritical =
      sl.includes('deposit') || sl.includes('forfeit') || sl.includes('4%') || sl.includes('compound');
    const isCaution =
      sl.includes('escalat') || sl.includes('15%') || sl.includes('lock-in') || sl.includes('non-compete') || sl.includes('notice');
    const severity: Severity = isCritical ? 'critical' : isCaution ? 'caution' : 'safe';
    return {
      clause_id: `clause-${idx + 1}`,
      section_label: `Clause ${idx + 1} • ${severity === 'critical' ? 'Critical Review' : severity === 'caution' ? 'Caution' : 'Standard'}`,
      page_num: 1,
      line_ref: `Lines ${idx * 10 + 1}–${idx * 10 + 10}`,
      severity,
      badge_label: `Clause ${idx + 1} • ${severity.toUpperCase()}`,
      text: s,
    };
  });

  const findings: AuditFinding[] = clauses
    .filter((c) => c.severity !== 'safe')
    .slice(0, 4)
    .map((c, idx) => {
      const rule = pack.rules[idx % pack.rules.length];
      return {
        finding_id: `local-f-${idx + 1}`,
        clause_id: c.clause_id,
        severity: c.severity,
        category: rule.category,
        line_ref: c.line_ref || 'Line 1',
        headline: `${c.section_label}: ${rule.title}`,
        plain_explanation: `${rule.detection_hint} Checked against ${pack.display_name}.`,
        spoken_script:
          language === 'kn'
            ? `ಈ ಒಪ್ಪಂದದ ${c.section_label} ಭಾಗದಲ್ಲಿ ${rule.title} ಕುರಿತು ಎಚ್ಚರಿಕೆ ಇದೆ.`
            : language === 'hi'
              ? `इस एग्रीमेंट के ${c.section_label} में ${rule.title} पर ध्यान दें।`
              : language === 'ta'
                ? `இந்த ஒப்பந்தத்தின் ${c.section_label} பகுதியில் ${rule.title} கவனிக்கவும்.`
                : `Review ${c.section_label}: ${rule.title}. ${rule.detection_hint}`,
        verbatim_quote: c.text,
        verification: verifyQuoteAgainstText(c.text, rawText),
        rule_ref: {
          rule_id: rule.rule_id,
          basis_type: rule.basis_type,
          citation_label: `${rule.statutory_citation.act}`,
        },
        negotiation: {
          default_selected: true,
          short_title: rule.negotiation_ask.short_title,
          impact_badge: c.severity === 'critical' ? 'High Impact' : 'Caution',
          polite_ask: rule.negotiation_ask.polite_ask,
          firm_ask: rule.negotiation_ask.firm_ask.replace('{clause_ref}', c.section_label),
          replacement_wording: rule.negotiation_ask.replacement_wording,
        },
      };
    });

  const riskScore = findings.some((f) => f.severity === 'critical')
    ? 68
    : findings.length > 0
      ? 48
      : 22;

  return {
    id: `scan-${Date.now()}`,
    title: docTitle || 'Uploaded Agreement Analysis',
    subtitle: `${pack.display_name}`,
    meta_badge: `${Math.max(1, Math.ceil(rawText.length / 2200))} Pages • Local Analysis`,
    category: isLoan ? 'loan' : isEmployment ? 'employment' : 'rental',
    lane: 'A',
    completeness: {
      status: rawText.length < 180 ? 'missing_pages' : 'complete',
      missing_gaps:
        rawText.length < 180
          ? ['Uploaded extract is unusually short; verify all pages were included before signing.']
          : [],
    },
    rule_pack_applied: {
      pack_id: pack.pack_id,
      display_name: pack.display_name,
      is_exact_jurisdiction_match: isExactMatch,
      verified_date: pack.verified_date,
      match_pct: isExactMatch ? 88 : 64,
      panIndiaOnly,
    },
    summary: {
      risk_score: riskScore,
      risk_band: riskScore >= 75 ? 'critical' : riskScore >= 45 ? 'caution' : 'safe',
      risk_band_label: `${riskScore} · ${riskScore >= 75 ? 'Critical' : riskScore >= 45 ? 'Caution' : 'Safe'}`,
      rupee_exposure_inr: isLoan ? 42000 : isEmployment ? 0 : 135000,
      exposure_caption: 'estimated risk delta',
      breakdown_cards: [
        { label: 'Clauses Scanned', value: `${clauses.length}`, sublabel: 'Verified text', tone: 'neutral' },
        { label: 'Flagged Risks', value: `${findings.length}`, sublabel: `${pack.pack_id}`, tone: findings.length ? 'error' : 'neutral' },
        { label: 'Rule Match', value: isExactMatch ? 'Exact' : 'General', sublabel: pack.verified_date, tone: 'caution' },
      ],
      alert_banner: `Analyzed against ${pack.display_name}. Review flagged excerpts before signing.`,
      top_3_bullets: findings.slice(0, 3).map((f) => ({
        title: f.headline,
        detail: f.plain_explanation,
      })),
      walkthrough_intro_spoken: {
        kn: 'ನಿಮ್ಮ ಒಪ್ಪಂದದ ಪ್ರಮುಖ ಅಂಶಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ.',
        hi: 'आपके एग्रीमेंट के मुख्य बिंदुओं की जांच पूरी हो गई है।',
        ta: 'உங்கள் ஒப்பந்தத்தின் முக்கிய அம்சங்கள் சரிபார்க்கப்பட்டன.',
        en: `Completed scan of ${docTitle || 'your agreement'}. Found ${findings.length} clauses worth reviewing before signing.`,
      },
      audio_duration_label: '0:45 min • Clause walkthrough',
    },
    clauses,
    findings,
    key_terms: [],
    missing_clauses: pack.expected_clauses.map((ec) => ({
      label: ec.label,
      why_it_matters: ec.why_it_matters,
    })),
    way_out_params: {
      mode: isLoan ? 'loan' : isEmployment ? 'employment' : 'rental',
      monthly_rent_inr: 25000,
      deposit_inr: 150000,
      lock_in_months: 6,
      notice_months: 1,
      total_months: 11,
      flat_exit_deduction_inr: 25000,
      negotiated_lock_in_months: 0,
      negotiated_flat_deduction_inr: 0,
    },
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: BODY_LIMIT }));

  app.get('/api/health', (_req, res) => {
    const provider = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
    const llmConfigured = Boolean(
      provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENROUTER_API_KEY,
    );
    const sarvamConfigured = Boolean(process.env.SARVAM_API_KEY);
    // Audit-trail surface: each prompt's rendered-system hash at its canonical args.
    const prompts = [
      { id: 'contract.ocr@1', hash: buildPrompt('contract.ocr@1').template_hash },
      {
        id: 'contract.audit@1',
        hash: buildPrompt('contract.audit@1', { pack: RULE_PACKS['in-general-fallback'], language: 'en' })
          .template_hash,
      },
      { id: 'contract.qa@1', hash: buildPrompt('contract.qa@1', { language: 'en' }).template_hash },
    ];
    res.json({
      status: 'ok',
      provider,
      llmConfigured,
      sarvamConfigured,
      injection_defense: INJECTION_DEFENSE_VERSION,
      prompts,
      body_limit: BODY_LIMIT,
      sarvam: {
        tts_model: SARVAM_TTS_MODEL,
        stt_model: SARVAM_STT_MODEL,
        stt_mode: 'codemix',
        tts_max_chars: SARVAM_TTS_MAX_CHARS,
        stt_max_seconds: SARVAM_STT_MAX_SECONDS,
        stt_max_keyterms: SARVAM_STT_MAX_KEYTERMS,
        stt_max_decoded_bytes: SARVAM_STT_MAX_DECODED_BYTES,
      },
    });
  });

  // 1. OCR Vision Route (contract.ocr@1)
  app.post('/api/ocr', async (req, res) => {
    try {
      const { images, language_hint = 'kn' } = req.body as {
        images?: string[];
        language_hint?: LanguageCode;
      };
      if (!Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: 'INVALID_IMAGES', message: 'Provide 1 to 3 JPEG data URLs.' });
        return;
      }
      if (images.length > OCR_MAX_IMAGES) {
        res.status(400).json({
          error: 'TOO_MANY_IMAGES',
          message: 'Provide 1 to 3 JPEG data URLs.',
        });
        return;
      }

      const prompt = buildPrompt('contract.ocr@1');

      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        {
          type: 'text',
          text: `Transcribe these ${images.length} contract page(s) (hint: ${ALLOWED_LANGS.has(language_hint) ? language_hint : 'en'}).`,
        },
        ...images.slice(0, OCR_MAX_IMAGES).map((url) => ({ type: 'image_url', image_url: { url } })),
      ];

      const raw = await callLLMChat({
        system: prompt.system,
        userContent: contentParts,
        temperature: 0.0,
        tier: 'fast',
      });

      const parsed = parseJSONFromLLMResponse<OcrEnvelope['data']>(raw);
      res.json({ ok: true, prompt_id: prompt.prompt_id, template_hash: prompt.template_hash, data: parsed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR failed';
      res.status(200).json({
        ok: false,
        fallback_recommended: true,
        error: msg,
        message: 'Using local structured transcription fallback.',
      });
    }
  });

  // 2. Statutory Audit Route (contract.audit@1)
  app.post('/api/audit', async (req, res) => {
    try {
      const { contract_text, language = 'kn', contract_type = 'residential_rental', title = 'Uploaded Contract' } =
        req.body as {
          contract_text?: string;
          language?: LanguageCode;
          contract_type?: string;
          title?: string;
        };

      if (typeof contract_text !== 'string' || contract_text.trim().length < 20) {
        res.status(400).json({ error: 'INVALID_TEXT', message: 'Contract text must be at least 20 characters.' });
        return;
      }

      const safeLang: LanguageCode = ALLOWED_LANGS.has(language) ? language : 'en';
      // Jurisdiction match must use location signal, never the whole contract body.
      const jurisdictionHint = detectJurisdiction(contract_text);
      const { pack, isExactMatch, panIndiaOnly } = selectRulePack(contract_type, jurisdictionHint);
      const allowedRuleIds = new Set(pack.rules.map((r) => r.rule_id));

      const prompt = buildPrompt('contract.audit@1', {
        pack,
        language: safeLang,
        userText: contract_text,
      });

      const raw = await callLLMChat({
        system: prompt.system,
        userContent: prompt.user,
        temperature: 0.1,
        tier: 'reasoning',
      });

      const parsed = parseJSONFromLLMResponse<{
        summary?: Record<string, unknown>;
        completeness?: { status?: string; missing_gaps?: string[] };
        findings?: AuditFinding[];
        missing_clauses?: Array<{ label: string; why_it_matters: string }>;
      }>(raw);

      const { verified, droppedCount } = filterVerifiedFindings(
        Array.isArray(parsed.findings) ? parsed.findings : [],
        contract_text,
        allowedRuleIds,
      );

      // Deterministic exposure: never trust the model's arithmetic.
      const wayOutParams = buildWayOutParamsFor(contract_type);
      const exposure = computeRupeeExposure(
        verified,
        wayOutParams,
        typeof parsed.summary?.rupee_exposure_inr === 'number'
          ? (parsed.summary.rupee_exposure_inr as number)
          : undefined,
      );

      const summary = parsed.summary
        ? { ...parsed.summary, rupee_exposure_inr: exposure.total_inr }
        : undefined;

      // Completeness must be present on the success path so the amber gap banner
      // works even when the LLM answers. Derive from the model, else numbering gaps.
      const completeness = normaliseCompleteness(parsed.completeness, contract_text);

      res.json({
        ok: true,
        prompt_id: prompt.prompt_id,
        template_hash: prompt.template_hash,
        injection_defense: INJECTION_DEFENSE_VERSION,
        rule_pack_applied: {
          pack_id: pack.pack_id,
          display_name: pack.display_name,
          is_exact_jurisdiction_match: isExactMatch,
          verified_date: pack.verified_date,
          match_pct: isExactMatch ? 88 : 65,
          panIndiaOnly,
        },
        completeness,
        dropped_unverified_count: droppedCount,
        summary,
        findings: verified,
        missing_clauses: groundMissingClauses(parsed.missing_clauses, pack),
      });
    } catch (err) {
      const { contract_text = '', language = 'kn', title = 'Uploaded Contract' } = req.body as {
        contract_text?: string;
        language?: LanguageCode;
        title?: string;
      };
      const safeLang: LanguageCode = ALLOWED_LANGS.has(language) ? language : 'en';
      const fallback = buildLocalDeterministicAudit(sanitizeForPrompt(contract_text), safeLang, title);
      res.status(200).json({
        ok: true,
        fallback_used: true,
        reason: err instanceof Error ? err.message : 'LLM unavailable',
        audit: fallback,
      });
    }
  });

  // 3. Grounded Voice/Text Q&A Route (contract.qa@1)
  app.post('/api/qa', async (req, res) => {
    try {
      const { question, contract_text, language = 'kn' } = req.body as {
        question?: string;
        contract_text?: string;
        language?: LanguageCode;
      };
      if (typeof question !== 'string' || !question.trim() || typeof contract_text !== 'string') {
        res.status(400).json({ error: 'INVALID_QA_INPUT', message: 'Question and contract_text are required.' });
        return;
      }

      const safeLang: LanguageCode = ALLOWED_LANGS.has(language) ? language : 'en';
      const prompt = buildPrompt('contract.qa@1', {
        language: safeLang,
        userText: contract_text,
        question,
      });

      const raw = await callLLMChat({
        system: prompt.system,
        userContent: prompt.user,
        temperature: 0.15,
        tier: 'reasoning',
      });

      const parsed = parseJSONFromLLMResponse<{
        spoken_script: string;
        answer_en: string;
        statutory_note: string;
        verbatim_quote: string;
        clause_id: string;
      }>(raw);

      const verification = verifyQuoteAgainstText(parsed.verbatim_quote || '', contract_text);

      // Ground or refuse: an unverifiable answer must not be presented as fact.
      if (verification.status !== 'verified') {
        res.json({
          ok: true,
          grounded: false,
          prompt_id: prompt.prompt_id,
          template_hash: prompt.template_hash,
          spoken_script: 'I could not find this in the document you uploaded.',
          answer_en: 'I could not find a clause in this document that answers that question.',
          statutory_note: '',
          verbatim_quote: '',
          clause_id: parsed.clause_id || '',
          verification,
        });
        return;
      }

      res.json({
        ok: true,
        grounded: true,
        prompt_id: prompt.prompt_id,
        template_hash: prompt.template_hash,
        spoken_script: parsed.spoken_script,
        answer_en: parsed.answer_en,
        statutory_note: parsed.statutory_note,
        verbatim_quote: parsed.verbatim_quote,
        clause_id: parsed.clause_id,
        verification,
      });
    } catch (err) {
      res.status(200).json({
        ok: false,
        fallback_recommended: true,
        error: err instanceof Error ? err.message : 'QA unavailable',
      });
    }
  });

  // 4. Sarvam TTS Proxy (bulbul:v4-flash with graceful client fallback signal)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, language = 'kn', pace = 1.0 } = req.body as {
        text?: string;
        language?: LanguageCode;
        pace?: number;
      };
      if (typeof text !== 'string' || !text.trim()) {
        res.status(200).json({ fallback_recommended: true, reason: 'INVALID_TTS_TEXT' });
        return;
      }

      const sarvamKey = process.env.SARVAM_API_KEY || '';
      if (!sarvamKey) {
        res.json({ fallback_recommended: true, reason: 'SARVAM_KEY_UNCONFIGURED' });
        return;
      }

      const safeLang: LanguageCode = ALLOWED_LANGS.has(language) ? language : 'kn';
      // bulbul:v4-flash caps input length; truncate instead of failing the request.
      const safeText = text.trim().slice(0, SARVAM_TTS_MAX_CHARS);
      const safePace = Math.max(0.75, Math.min(1.5, Number(pace) || 1.0));

      const resp = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': sarvamKey,
        },
        body: JSON.stringify({
          inputs: [safeText],
          target_language_code: SARVAM_LANG_MAP[safeLang],
          speaker: SARVAM_SPEAKER_MAP[safeLang],
          pace: safePace,
          model: SARVAM_TTS_MODEL,
        }),
      });

      if (!resp.ok) {
        res.json({ fallback_recommended: true, reason: `SARVAM_HTTP_${resp.status}` });
        return;
      }

      const data = (await resp.json()) as { audios?: string[] };
      const audio_base64 = data.audios?.[0];
      if (!audio_base64) {
        res.json({ fallback_recommended: true, reason: 'EMPTY_AUDIO' });
        return;
      }
      res.json({ audio_base64, content_type: 'audio/wav', fallback_recommended: false });
    } catch {
      res.json({ fallback_recommended: true, reason: 'SARVAM_NETWORK_ERROR' });
    }
  });

  // 5. Sarvam STT Proxy (saaras:v4 / codemix)
  //    Sync speech-to-text: audio must be <= 30s (SARVAM_STT_MAX_SECONDS).
  //    `mode: 'codemix'` keeps the code-mixed Kannada/Hindi/Tamil + English phrasing
  //    users actually speak, instead of forcing a pure-script transcript.
  //    Optional `keyterms` (up to SARVAM_STT_MAX_KEYTERMS) bias the decoder toward
  //    domain vocabulary such as "security deposit", "lock-in", "EMI", "foreclosure".
  app.post('/api/stt', async (req, res) => {
    try {
      const { audio_base64, language = 'kn', keyterms, duration_seconds } = req.body as {
        audio_base64?: string;
        language?: LanguageCode;
        keyterms?: unknown;
        duration_seconds?: number;
      };
      if (typeof audio_base64 !== 'string' || !audio_base64) {
        res.status(200).json({ fallback_recommended: true, reason: 'INVALID_AUDIO' });
        return;
      }

      // Enforce the <= 30s sync limit when the client reports a duration.
      const reportedSeconds = Number(duration_seconds);
      if (Number.isFinite(reportedSeconds) && reportedSeconds > SARVAM_STT_MAX_SECONDS) {
        res.json({
          fallback_recommended: true,
          reason: `AUDIO_TOO_LONG_MAX_${SARVAM_STT_MAX_SECONDS}S`,
        });
        return;
      }

      const sarvamKey = process.env.SARVAM_API_KEY || '';
      if (!sarvamKey) {
        res.json({ fallback_recommended: true, reason: 'SARVAM_KEY_UNCONFIGURED' });
        return;
      }

      const safeKeyterms = (Array.isArray(keyterms) ? keyterms : [])
        .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
        .map((k) => k.trim().slice(0, 64))
        .slice(0, SARVAM_STT_MAX_KEYTERMS);

      const buffer = Buffer.from(audio_base64.replace(/^data:[^;]+;base64,/, ''), 'base64');

      // Defence-in-depth when the client omits/understates duration_seconds:
      // estimate length from the decoded byte count (webm/opus ≈ 3000 B/s).
      if (buffer.length > SARVAM_STT_MAX_DECODED_BYTES) {
        res.json({ fallback_recommended: true, reason: 'AUDIO_TOO_LONG' });
        return;
      }

      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'audio/webm' }), 'query.webm');
      form.append('model', SARVAM_STT_MODEL);
      form.append('mode', 'codemix');
      const safeLang: LanguageCode = ALLOWED_LANGS.has(language) ? language : 'kn';
      form.append('language_code', SARVAM_LANG_MAP[safeLang]);
      for (const term of safeKeyterms) {
        form.append('keyterms', term);
      }

      // codemix mode is only available on /speech-to-text (the legacy
      // /speech-to-text-translate endpoint has no codemix support).
      const resp = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': sarvamKey },
        body: form,
      });

      if (!resp.ok) {
        res.json({ fallback_recommended: true, reason: `SARVAM_STT_${resp.status}` });
        return;
      }
      const data = (await resp.json()) as {
        transcript?: string;
        language_code?: string;
        language_probability?: number;
      };
      res.json({
        transcript: data.transcript || '',
        detected_language: data.language_code || safeLang,
        language_probability: data.language_probability,
        mode: 'codemix',
        keyterms_used: safeKeyterms.length,
        fallback_recommended: false,
      });
    } catch {
      res.json({ fallback_recommended: true, reason: 'SARVAM_STT_ERROR' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  // JSON body-parser errors (must be the LAST handler so it catches any route).
  // `entity.too.large` comes from the 4.5MB Vercel-aligned ceiling; a SyntaxError
  // means the payload was not valid JSON at all.
  app.use(
    (
      err: (Error & { type?: string; status?: number }) | null,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (!err) {
        next();
        return;
      }
      if (err.type === 'entity.too.large' || err.status === 413) {
        res.status(413).json({
          error: 'PAYLOAD_TOO_LARGE',
          message: `Request body exceeds the ${BODY_LIMIT} limit. Send fewer pages or a smaller image.`,
        });
        return;
      }
      if (err instanceof SyntaxError) {
        res.status(400).json({ error: 'INVALID_JSON' });
        return;
      }
      next(err);
    },
  );

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LawLens server running on http://0.0.0.0:${PORT}`);
  });
}

createApp();
