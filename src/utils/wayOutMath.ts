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

export function calculateWayOutAtMonth(params: WayOutParams, exitMonth: number): WayOutCalculation {
  const month = Math.max(1, Math.min(params.total_months || 11, Math.round(exitMonth)));

  if (params.mode === 'loan') {
    const remainingMonths = Math.max(0, params.total_months - month);
    const inLockIn = month < params.lock_in_months;
    const currentPenaltyInr = inLockIn ? params.flat_exit_deduction_inr : Math.round(params.flat_exit_deduction_inr * 0.5);
    const negotiatedTotalInr = 0;
    const totalCashLossInr = currentPenaltyInr;
    return {
      exitMonth: month,
      inLockIn,
      currentPenaltyInr,
      noticeCostInr: 0,
      totalCashLossInr,
      negotiatedTotalInr,
      savingsInr: totalCashLossInr - negotiatedTotalInr,
      headline: inLockIn
        ? `Prepaying at Month ${month}: ₹${totalCashLossInr.toLocaleString('en-IN')} Foreclosure Fee`
        : `Prepaying at Month ${month}: ₹${totalCashLossInr.toLocaleString('en-IN')} Exit Charge`,
      breakdown: `${remainingMonths} EMIs remaining. With RBI KFS zero-foreclosure amendment, exit cost drops to ₹0.`,
    };
  }

  if (params.mode === 'employment') {
    const inLockIn = month < params.lock_in_months;
    const currentPenaltyInr = inLockIn ? params.flat_exit_deduction_inr : 0;
    const noticeCostInr = params.monthly_rent_inr * params.notice_months;
    const totalCashLossInr = currentPenaltyInr + noticeCostInr;
    const negotiatedTotalInr = params.negotiated_flat_deduction_inr;
    return {
      exitMonth: month,
      inLockIn,
      currentPenaltyInr,
      noticeCostInr,
      totalCashLossInr,
      negotiatedTotalInr,
      savingsInr: Math.max(0, totalCashLossInr - negotiatedTotalInr),
      headline: inLockIn
        ? `Resigning at Month ${month}: ${params.notice_months * 30}-Day Lock + Buyout`
        : `Resigning at Month ${month}: Standard Notice Period`,
      breakdown: `Requires ${params.notice_months} months notice (${params.notice_months * 30} days). Negotiating 60-day mutual notice saves buyout stress.`,
    };
  }

  // Rental mode: pure integer rupee arithmetic
  const inLockIn = params.lock_in_months > 0 && month < params.lock_in_months;
  const currentPenaltyInr = inLockIn ? params.flat_exit_deduction_inr : 0;
  const noticeCostInr = inLockIn ? params.monthly_rent_inr * params.notice_months : 0;
  const totalCashLossInr = currentPenaltyInr + noticeCostInr;
  const negotiatedInLockIn = params.negotiated_lock_in_months > 0 && month < params.negotiated_lock_in_months;
  const negotiatedTotalInr = negotiatedInLockIn ? params.negotiated_flat_deduction_inr : 0;
  const savingsInr = Math.max(0, totalCashLossInr - negotiatedTotalInr);

  if (month >= params.total_months) {
    return {
      exitMonth: month,
      inLockIn: false,
      currentPenaltyInr: 0,
      noticeCostInr: 0,
      totalCashLossInr: 0,
      negotiatedTotalInr: 0,
      savingsInr: 0,
      headline: `Month ${month}: Natural Lease Expiry`,
      breakdown: `Agreement completes tenure. Full deposit of ₹${params.deposit_inr.toLocaleString('en-IN')} refundable under Model Tenancy Act rules.`,
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
      headline: `Early Exit at Month ${month}: Immediate ₹${totalCashLossInr.toLocaleString('en-IN')} Cash Loss`,
      breakdown: `Breakdown: ₹${currentPenaltyInr.toLocaleString('en-IN')} penalty deduction + ₹${noticeCostInr.toLocaleString('en-IN')} (${params.notice_months} months mandatory notice rent). After Month ${params.lock_in_months}, early exit drops to standard 30-day notice.`,
    };
  }

  return {
    exitMonth: month,
    inLockIn: false,
    currentPenaltyInr: 0,
    noticeCostInr: params.monthly_rent_inr,
    totalCashLossInr: 0,
    negotiatedTotalInr: 0,
    savingsInr: 0,
    headline: `Exit at Month ${month}: End of Mandatory Lock-in Window`,
    breakdown: `Lock-in expired. Penalty drops to ₹0 (standard 1-month notice period). Deposit of ₹${params.deposit_inr.toLocaleString('en-IN')} refundable subject to standard inspection.`,
  };
}
