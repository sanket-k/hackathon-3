import type { AuditFinding, AuditResult, LanguageCode, Severity } from './contract';

/** The three and only three prompt templates this product ships. */
export type PromptId = 'contract.ocr@1' | 'contract.audit@1' | 'contract.qa@1';

export interface PromptEnvelope {
  prompt_id: PromptId;
  template_hash: string;
  system: string;
  user: string;
}

export interface RulePackAppliedEnvelope {
  pack_id: string;
  display_name: string;
  is_exact_jurisdiction_match: boolean;
  verified_date: string;
  match_pct: number;
  /**
   * True when no state-specific pack matched and only pan-India norms apply.
   * Drives the "Pan-India norms only" badge instead of implying a local match.
   */
  panIndiaOnly: boolean;
}

export interface AuditCompletenessEnvelope {
  status: 'complete' | 'missing_pages';
  missing_gaps: string[];
}

/** Success envelope for `POST /api/audit` (partial — hydrated over a base). */
export interface AuditSuccessEnvelope {
  ok: true;
  prompt_id: Extract<PromptId, 'contract.audit@1'>;
  template_hash: string;
  rule_pack_applied: RulePackAppliedEnvelope;
  completeness: AuditCompletenessEnvelope;
  dropped_unverified_count: number;
  summary?: Record<string, unknown>;
  findings: AuditFinding[];
  missing_clauses: Array<{ label: string; why_it_matters: string; recommended_addendum?: string }>;
}

/** Fallback envelope for `POST /api/audit` when the LLM is unavailable. */
export interface AuditFallbackEnvelope {
  ok: true;
  fallback_used: true;
  reason: string;
  audit: AuditResult;
}

export interface QaSuccessEnvelope {
  ok: true;
  prompt_id: Extract<PromptId, 'contract.qa@1'>;
  template_hash: string;
  spoken_script: string;
  answer_en: string;
  statutory_note: string;
  verbatim_quote: string;
  clause_id: string;
  grounded: boolean;
  verification: {
    status: 'verified' | 'dropped';
    char_start: number;
    char_end: number;
    jaccard: number;
  };
}

export interface OcrClauseEnvelope {
  clause_id: string;
  section_label: string;
  page_num: number;
  text: string;
  needs_visual_check_tokens?: string[];
}

export interface OcrEnvelope {
  ok: boolean;
  prompt_id: Extract<PromptId, 'contract.ocr@1'>;
  template_hash: string;
  data?: {
    detected_type?: string;
    detected_jurisdiction?: string;
    completeness?: AuditCompletenessEnvelope;
    clauses?: OcrClauseEnvelope[];
  };
  fallback_recommended?: boolean;
  error?: string;
}

/** Fail-closed verdict returned by the PII shield before any upload. */
export interface PiiLeakVerdict {
  safeToSend: boolean;
  reason?: string;
  tokenTypes?: string[];
}

export type { AuditFinding, LanguageCode, Severity };
