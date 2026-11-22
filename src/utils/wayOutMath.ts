import type { WayOutParams } from '../types/contract';

export interface WayOutCalculation {
  exitMonth: number;
  inLockIn: boolean;
  currentPenaltyInr: number;
  noticeCostInr: number;
  totalCashLossInr: number;
  negotiatedTotalInr: number;
  savingsInr: number;
  headline: string;
  breakdown: string;
}

/** Whole-rupee formatting so no float ever reaches the UI or the breakdown text. */
function money(valueInr: number): string {
  return `₹${Math.round(valueInr).toLocaleString('en-IN')}`;
}

export function calculateWayOutAtMonth(params: WayOutParams, exitMonth: number): WayOutCalculation {
  // Normalise every rupee/month input to a whole number up front: all downstream
  // arithmetic is then integer-only, so the returned figures can never be fractional.
  const rentInr = Math.max(0, Math.round(params.monthly_rent_inr));
  const depositInr = Math.max(0, Math.round(params.deposit_inr));
  const lockInMonths = Math.max(0, Math.round(params.lock_in_months));
  const noticeMonths = Math.max(0, Math.round(params.notice_months));
  const totalMonths = Math.max(1, Math.round(params.total_months || 11));
  const flatExitInr = Math.max(0, Math.round(params.flat_exit_deduction_inr));
  const negotiatedLockInMonths = Math.max(0, Math.round(params.negotiated_lock_in_months));
  const negotiatedFlatInr = Math.max(0, Math.round(params.negotiated_flat_deduction_inr));

  const month = Math.max(1, Math.min(totalMonths, Math.round(exitMonth)));

  if (params.mode === 'loan') {
    const remainingMonths = Math.max(0, totalMonths - month);
    const inLockIn = month < lockInMonths;
    const currentPenaltyInr = inLockIn ? flatExitInr : Math.round(flatExitInr / 2);
    // A foreclosure fee replaces the notice obligation: there is no separate notice rent.
    const noticeCostInr = 0;
    const totalCashLossInr = currentPenaltyInr + noticeCostInr;
    const negotiatedTotalInr = 0;
    const savingsInr = Math.max(0, totalCashLossInr - negotiatedTotalInr);
    return {
      exitMonth: month,
      inLockIn,
      currentPenaltyInr,
      noticeCostInr,
      totalCashLossInr,
      negotiatedTotalInr,
      savingsInr,
      headline: inLockIn
        ? `Prepaying at Month ${month}: ${money(totalCashLossInr)} Foreclosure Fee`
        : `Prepaying at Month ${month}: ${money(totalCashLossInr)} Exit Charge`,
      breakdown: `${remainingMonths} EMIs remaining. Contract exit charge today is ${money(totalCashLossInr)} (${money(currentPenaltyInr)} fee + ${money(noticeCostInr)} notice rent); under the RBI KFS zero-foreclosure rule for floating-rate individual borrowers this is contestable down to ₹0.`,
    };
  }

  if (params.mode === 'employment') {
    const inLockIn = month < lockInMonths;
    const currentPenaltyInr = inLockIn ? flatExitInr : 0;
    const noticeCostInr = rentInr * noticeMonths;
    const totalCashLossInr = currentPenaltyInr + noticeCostInr;
    const negotiatedTotalInr = negotiatedFlatInr;
    const savingsInr = Math.max(0, totalCashLossInr - negotiatedTotalInr);
    return {
      exitMonth: month,
      inLockIn,
      currentPenaltyInr,
      noticeCostInr,
      totalCashLossInr,
      negotiatedTotalInr,
      savingsInr,
      headline: inLockIn
        ? `Resigning at Month ${month}: ${noticeMonths * 30}-Day Lock + Buyout`
        : `Resigning at Month ${month}: Standard Notice Period`,
      breakdown: `Breakdown: ${money(currentPenaltyInr)} lock-in penalty + ${money(noticeCostInr)} (${noticeMonths} months notice) = ${money(totalCashLossInr)} cash loss. Requires ${noticeMonths} months notice (${noticeMonths * 30} days). Negotiating 60-day mutual notice saves buyout stress.${
        negotiatedTotalInr > 0 ? ` Negotiated exit fee ${money(negotiatedTotalInr)} saves ${money(savingsInr)}.` : ''
      }`,
    };
  }

  // Rental mode: pure integer rupee arithmetic
  const inLockIn = lockInMonths > 0 && month < lockInMonths;
  const currentPenaltyInr = inLockIn ? flatExitInr : 0;
  const noticeCostInr = inLockIn ? rentInr * noticeMonths : 0;
  const totalCashLossInr = currentPenaltyInr + noticeCostInr;
  const negotiatedInLockIn = negotiatedLockInMonths > 0 && month < negotiatedLockInMonths;
  const negotiatedTotalInr = negotiatedInLockIn ? negotiatedFlatInr : 0;
  const savingsInr = Math.max(0, totalCashLossInr - negotiatedTotalInr);

  if (month >= totalMonths) {
    return {
      exitMonth: month,
      inLockIn: false,
      currentPenaltyInr: 0,
      noticeCostInr: 0,
      totalCashLossInr: 0,
      negotiatedTotalInr: 0,
      savingsInr: 0,
      headline: `Month ${month}: Natural Lease Expiry`,
      breakdown: `Agreement completes tenure: ${money(0)} penalty + ${money(0)} notice cash loss = ${money(0)} total. Full deposit of ${money(depositInr)} refundable under Model Tenancy Act rules.`,
    };
  }

  if (inLockIn) {
    return {
      exitMonth: month,
      inLockIn: true,
      currentPenaltyInr,
      noticeCostInr,
      totalCashLossInr,
      negotiatedTotalInr,
      savingsInr,
      headline: `Early Exit at Month ${month}: Immediate ${money(totalCashLossInr)} Cash Loss`,
      breakdown: `Breakdown: ${money(currentPenaltyInr)} penalty deduction + ${money(noticeCostInr)} (${noticeMonths} months mandatory notice rent) = ${money(totalCashLossInr)} total cash loss.${
        negotiatedTotalInr > 0 ? ` Negotiated exit fee ${money(negotiatedTotalInr)} saves ${money(savingsInr)}.` : ''
      } After Month ${lockInMonths}, early exit drops to standard 1-month notice.`,
    };
  }

  // At/after lock-in but before expiry: the standard notice period is an ordinary part of
  // renting, so it carries no forfeited rent — the cash loss here is genuinely zero.
  return {
    exitMonth: month,
    inLockIn: false,
    currentPenaltyInr,
    noticeCostInr,
    totalCashLossInr,
    negotiatedTotalInr,
    savingsInr,
    headline: `Exit at Month ${month}: End of Mandatory Lock-in Window`,
    breakdown: `Lock-in expired: ${money(currentPenaltyInr)} penalty + ${money(noticeCostInr)} notice rent = ${money(totalCashLossInr)} cash loss. The standard 1-month notice period applies as usual (serve it, or adjust it against rent due) — it is not an extra penalty. Deposit of ${money(depositInr)} refundable subject to standard inspection.`,
  };
}
