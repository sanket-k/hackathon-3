import type { AuditFinding, WayOutParams } from '../types/contract';

/**
 * Deterministic rupee-exposure math. Pure TypeScript, integer rupees only.
 *
 * The LLM is allowed to *describe* a contract but its arithmetic is never
 * trusted: exposure is recomputed here from verified findings + the exit
 * model, and the audited figure is clamped to a sane band so a hallucinated
 * `rupee_exposure_inr` cannot inflate the headline number.
 */

export interface ExposureLine {
  label: string;
  amount_inr: number;
  source: 'finding' | 'way_out';
}

export interface ExposureComputation {
  total_inr: number;
  lines: ExposureLine[];
  /** True when the model's figure was discarded in favour of this computation. */
  overrode_model_value: boolean;
}

/** Parse a currency-ish string such as "+₹40,000", "INR 1,20,000", "₹90000". */
export function parseRupees(raw: string | number | undefined | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (!raw) return 0;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

/**
 * Exposure from rental/employment/loan exit math: the cash the user loses if
 * they exit inside the lock-in window versus the negotiated terms.
 */
export function exposureFromWayOut(params: WayOutParams): number {
  if (params.mode === 'loan') {
    // Foreclosure + remaining notice-equivalent cost, capped by the flat fee.
    return Math.max(0, params.flat_exit_deduction_inr);
  }
  if (params.mode === 'employment') {
    return Math.max(0, params.flat_exit_deduction_inr);
  }
  const penalty = Math.max(0, params.flat_exit_deduction_inr);
  const notice = Math.max(0, params.monthly_rent_inr * params.notice_months);
  return penalty + notice;
}

/**
 * Recompute total exposure from verified findings. Each finding contributes
 * its parsed `impact_label` (or the way-out figure when no labels exist).
 * `verified` only — dropped findings never contribute.
 */
export function computeRupeeExposure(
  findings: AuditFinding[],
  params: WayOutParams,
  modelValue?: number,
): ExposureComputation {
  const lines: ExposureLine[] = [];

  for (const finding of findings) {
    const amount = parseRupees(finding.impact_label);
    if (amount > 0) {
      lines.push({ label: finding.headline, amount_inr: amount, source: 'finding' });
    }
  }

  const wayOutValue = exposureFromWayOut(params);
  const findingTotal = lines.reduce((sum, line) => sum + line.amount_inr, 0);

  // The exit model is the floor: a contract's worst case is at least the
  // cost of leaving early, even when the model reported no impact badges.
  const computed = Math.max(findingTotal, wayOutValue);

  if (computed > 0 && lines.length === 0) {
    lines.push({ label: 'Early-exit exposure', amount_inr: computed, source: 'way_out' });
  }

  const overrodeModelValue =
    typeof modelValue === 'number' && Number.isFinite(modelValue) && Math.round(modelValue) !== computed;

  return {
    total_inr: computed,
    lines,
    overrode_model_value: overrodeModelValue,
  };
}
