export type LanguageCode = 'kn' | 'hi' | 'ta' | 'en';

export type Severity = 'critical' | 'caution' | 'safe';

export type BasisType = 'statutory_conflict' | 'above_local_norm' | 'missing_protection' | 'standard';

export type ScreenRoute =
  | 'landing'
  | 'photo_check'
  | 'telemetry'
  | 'workspace'
  | 'inspector'
  | 'negotiate'
  | 'voice_qa'
  | 'vault'
  | 'benchmarks'
  | 'privacy';

export interface RulePackRule {
  rule_id: string;
  category: string;
  title: string;
  basis_type: BasisType;
  severity: Severity;
  benchmark: {
    metric: string;
    max_fair_value?: number;
    typical_label: string;
  };
  statutory_citation: {
    act: string;
    section: string;
    source_url: string;
  };
  detection_hint: string;
  negotiation_ask: {
    short_title: string;
    polite_ask: string;
    firm_ask: string;
    replacement_wording: string;
  };
}

export interface RulePack {
  schema_version: 'rule_pack_v1';
  pack_id: string;
  display_name: string;
  jurisdiction: {
    country: string;
    state: string;
    cities: string[];
  };
  contract_types: string[];
  verified_date: string;
  rules: RulePackRule[];
  expected_clauses: Array<{
    id: string;
    label: string;
    why_it_matters: string;
  }>;
}

export interface ContractClause {
  clause_id: string;
  section_label: string;
  page_num: number;
  line_ref?: string;
  severity: Severity;
  badge_label: string;
  right_badge?: string;
  text: string;
  ocr_highlight_token?: string;
  ocr_confidence?: number;
  ocr_verified?: boolean;
  warning_footer?: string;
}

export interface AuditFinding {
  finding_id: string;
  clause_id: string;
  severity: Severity;
  category: string;
  line_ref: string;
  headline: string;
  statutory_rule_text?: string;
  plain_explanation: string;
  risk_detail?: string;
  impact_label?: string;
  spoken_script: string;
  verbatim_quote: string;
  verification: {
    status: 'verified' | 'dropped';
    char_start: number;
    char_end: number;
    jaccard: number;
  };
  rule_ref: {
    rule_id: string;
    basis_type: BasisType;
    citation_label: string;
  };
  negotiation: {
    default_selected: boolean;
    short_title: string;
    impact_badge: string;
    polite_ask: string;
    firm_ask: string;
    replacement_wording: string;
  };
}

export interface KeyTerm {
  label: string;
  in_contract: string;
  typical: string;
  status: 'worse' | 'ok' | 'missing';
}

export interface MissingClause {
  label: string;
  why_it_matters: string;
  recommended_addendum?: string;
}

export interface WayOutParams {
  mode: 'rental' | 'loan' | 'employment';
  monthly_rent_inr: number;
  deposit_inr: number;
  lock_in_months: number;
  notice_months: number;
  total_months: number;
  flat_exit_deduction_inr: number;
  negotiated_lock_in_months: number;
  negotiated_flat_deduction_inr: number;
}

export interface AuditResult {
  id: string;
  title: string;
  subtitle: string;
  meta_badge: string;
  category: 'rental' | 'loan' | 'employment';
  lane: 'A' | 'B';
  stamp_header: {
    reg_line: string;
    stamp_value: string;
    doc_title: string;
    doc_subtitle: string;
    recitals: string;
    stamp_cert_id: string;
    stamp_issued: string;
    lessor_name: string;
    lessee_name: string;
  };
  completeness: {
    status: 'complete' | 'missing_pages';
    missing_gaps: string[];
  };
  pii_masked_tokens: Array<{
    label: string;
    masked_preview: string;
    status: 'MASKED' | 'HASHED' | 'REDACTED' | 'VERIFIED LOCAL';
  }>;
  rule_pack_applied: {
    pack_id: string;
    display_name: string;
    is_exact_jurisdiction_match: boolean;
    verified_date: string;
    match_pct: number;
    /** True when only pan-India norms apply (no state-specific match). */
    panIndiaOnly?: boolean;
  };
  summary: {
    risk_score: number;
    risk_band: 'critical' | 'caution' | 'safe';
    risk_band_label: string;
    rupee_exposure_inr: number;
    exposure_caption: string;
    breakdown_cards: Array<{
      label: string;
      value: string;
      sublabel: string;
      tone: 'error' | 'caution' | 'neutral';
    }>;
    alert_banner: string;
    top_3_bullets: Array<{
      title: string;
      detail: string;
    }>;
    walkthrough_intro_spoken: Record<LanguageCode, string>;
    audio_duration_label: string;
  };
  clauses: ContractClause[];
  findings: AuditFinding[];
  key_terms: KeyTerm[];
  missing_clauses: MissingClause[];
  way_out_params: WayOutParams;
  original_photo_url?: string;
  qa_presets: Array<{
    chip: string;
    question_native: string;
    question_en: string;
    answer_native: string;
    answer_en: string;
    statutory_note: string;
    clause_id: string;
    excerpt: string;
  }>;
}

export interface VaultNote {
  id: string;
  createdAt: string;
  tag: string;
  text: string;
  encrypted: boolean;
}

export interface VaultDocument {
  id: string;
  customTag: string;
  scannedAt: string;
  statusLabel: 'Active Review' | 'Archived' | 'Verified';
  audit: AuditResult;
  notes: VaultNote[];
  voiceMemoLabel?: string;
  voiceMemoDuration?: string;
}
