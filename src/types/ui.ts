/**
 * Cross-component UI contracts shared by the desktop and mobile trees.
 *
 * These types exist so parallel feature work (intake pipeline, telemetry,
 * brief export, vault persistence) agrees on one shape instead of each
 * surface inventing its own props.
 */

/** Live per-scan facts surfaced to the telemetry stepper while work is in flight. */
export interface IntakeStats {
  lane: 'A' | 'B';
  /** Set only for Lane B (photo) scans. */
  blurVerdict?: 'Sharp & Legible' | 'Slightly Soft' | 'Blurry — Retake Suggested';
  isSharp?: boolean;
  /** Measured Laplacian variance, integer. */
  blurScore?: number;
  /** Pages detected for a Lane A vector PDF. */
  pageCount?: number;
  wordCount?: number;
  /** Real PII token counts for *this* scan (not a previous audit's). */
  piiCountsByType: Record<string, number>;
  piiTotalMasked: number;
  /** Rule pack the in-flight scan is being matched against. */
  packDisplayName?: string;
  packMatchPct?: number;
  /** Milliseconds each gate actually took, keyed by gate step (1-4). */
  gateTimingsMs?: Record<number, number>;
  /** True when the PII shield blocked the upload (fail-closed). */
  blocked?: boolean;
  blockReason?: string;
}

/** Pre-upload redaction strategy chosen by the user on the photo screen. */
export type BlackoutStrategy = 'none' | 'header';

/** Vault persistence policy for a single scan. */
export type VaultSavePolicy = 'save' | 'dont_save';

export interface BriefExportRequest {
  auditId: string;
  /** Clause ids the user ticked in Negotiate; empty = use all default_selected. */
  selectedClauseIds: string[];
  tone: 'polite' | 'firm';
}

export interface NegotiationChannel {
  kind: 'whatsapp' | 'email';
  subject?: string;
  body: string;
}
