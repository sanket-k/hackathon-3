import type { RulePack } from '../types/contract';

export const RULE_PACKS: Record<string, RulePack> = {
  'in-ka-rental': {
    schema_version: 'rule_pack_v1',
    pack_id: 'in-ka-rental',
    display_name: 'Karnataka Model Tenancy Act 2021',
    jurisdiction: { country: 'IN', state: 'KA', cities: ['Bengaluru', 'Mysuru', 'Hubballi'] },
    contract_types: ['residential_rental'],
    verified_date: '2026-11-21',
    rules: [
      {
        rule_id: 'IN_KA_DEPOSIT_CAP',
        category: 'deposit',
        title: 'Security Deposit Cap',
        basis_type: 'statutory_conflict',
        severity: 'critical',
        benchmark: {
          metric: 'months_of_rent',
          max_fair_value: 2,
          typical_label: "Up to 2 months' rent",
        },
        statutory_citation: {
          act: 'Karnataka Model Tenancy Act 2021',
          section: 'Section 10 / Security Deposit Limit',
          source_url: 'https://indiacode.nic.in',
        },
        detection_hint: 'Flag if security deposit exceeds 2 months of monthly rent.',
        negotiation_ask: {
          short_title: 'Cap Security Deposit at 2 Months (₹50k)',
          polite_ask: 'Would you be open to reducing the security deposit closer to 2–3 months rent in line with Karnataka Model Tenancy Act norms?',
          firm_ask: 'Under Section 10 of the Karnataka Model Tenancy Act, residential deposits are capped at 2 months rent. Please revise Clause 4.2 accordingly.',
          replacement_wording: 'Tenant shall pay a refundable security deposit equivalent to two (2) months rent, refundable within 15 days of handing over keys.',
        },
      },
      {
        rule_id: 'IN_KA_RENT_ESCALATION',
        category: 'escalation',
        title: 'Annual Rent Escalation Norm',
        basis_type: 'above_local_norm',
        severity: 'caution',
        benchmark: {
          metric: 'annual_percent',
          max_fair_value: 8,
          typical_label: '5%–8% with mutual notice',
        },
        statutory_citation: {
          act: 'Karnataka Rent Control & Bengaluru Market Index',
          section: 'Standard Revision Clause',
          source_url: 'https://indiacode.nic.in',
        },
        detection_hint: 'Flag unilateral renewal escalation above 8% without mutual notice.',
        negotiation_ask: {
          short_title: 'Limit Renewal Escalation to 5–6% (Mutual Notice)',
          polite_ask: 'Can we cap the annual renewal increase at 5–6% upon mutual consent instead of an automatic 15%?',
          firm_ask: 'Unilateral 15% escalation is above Bengaluru standard practice (5–8%). Please cap escalation at 5% with 60 days mutual notice.',
          replacement_wording: 'Upon mutual renewal after 11 months, monthly rent may be revised by up to 5% with 60 days prior written agreement.',
        },
      },
      {
        rule_id: 'IN_KA_LOCKIN_EXIT',
        category: 'lock_in',
        title: 'Early Exit & Lock-In Proportionality',
        basis_type: 'above_local_norm',
        severity: 'caution',
        benchmark: {
          metric: 'notice_months',
          max_fair_value: 1,
          typical_label: 'Mutual 1-month notice',
        },
        statutory_citation: {
          act: 'Indian Contract Act §74 / Model Tenancy Norms',
          section: 'Reasonable Liquidated Damages',
          source_url: 'https://indiacode.nic.in',
        },
        detection_hint: 'Flag asymmetric lock-in or combined penalty + 2-month notice forfeiture.',
        negotiation_ask: {
          short_title: 'Mutual 1-Month Notice, No Lock-in Forfeiture',
          polite_ask: 'Could we make the 1-month notice period mutual for both sides without extra penalty forfeiture?',
          firm_ask: 'Clause 8.2 combines a 1-month forfeiture with 2 months notice. Please revise to a mutual 1-month notice period.',
          replacement_wording: 'Either party may terminate this agreement after Month 3 by serving thirty (30) days written notice without additional penalty.',
        },
      },
    ],
    expected_clauses: [
      {
        id: 'repair_timeline',
        label: 'Maintenance & Structural Repair SLA',
        why_it_matters: 'Without a written SLA, landlords can delay external seepage or core electrical repairs.',
      },
      {
        id: 'annexure_a',
        label: 'Annexure A Maintenance Schedule',
        why_it_matters: 'Referenced in lease terms for sinking fund splits and society dues.',
      },
    ],
  },
  'in-central-rbi-loan': {
    schema_version: 'rule_pack_v1',
    pack_id: 'in-central-rbi-loan',
    display_name: 'RBI Fair Practices Code & Key Fact Statement (2024)',
    jurisdiction: { country: 'IN', state: 'ALL', cities: [] },
    contract_types: ['personal_loan', 'retail_credit'],
    verified_date: '2026-11-21',
    rules: [
      {
        rule_id: 'IN_RBI_FORECLOSURE_CAP',
        category: 'prepayment',
        title: 'Prepayment & Foreclosure Penalty Disclosure',
        basis_type: 'statutory_conflict',
        severity: 'critical',
        benchmark: {
          metric: 'percent_fee',
          max_fair_value: 2,
          typical_label: '0% floating / ≤2% fixed disclosed in KFS',
        },
        statutory_citation: {
          act: 'RBI Master Direction — Key Facts Statement (KFS)',
          section: 'RBI/2024-25/18 Penal Charges & Foreclosure',
          source_url: 'https://www.rbi.org.in',
        },
        detection_hint: 'Flag hidden 4%+ prepayment lock-in fees or compounding penal interest.',
        negotiation_ask: {
          short_title: 'Waive 4% Prepayment Lock-in & Compound Penal Fee',
          polite_ask: 'Could you provide the KFS APR sheet and confirm zero foreclosure penalty after 6 EMIs?',
          firm_ask: 'Under RBI 2024 KFS & Penal Charges circulars, penal charges cannot be capitalized/compounded. Please amend Clause 6.4.',
          replacement_wording: 'Borrower may prepay part or full principal after 6 EMIs with zero foreclosure fee; penal charges shall remain simple and uncompounded.',
        },
      },
    ],
    expected_clauses: [
      {
        id: 'kfs_apr',
        label: 'Key Fact Statement (APR % Table)',
        why_it_matters: 'RBI mandates all-in Annual Percentage Rate disclosure before loan execution.',
      },
    ],
  },
  'in-central-employment': {
    schema_version: 'rule_pack_v1',
    pack_id: 'in-central-employment',
    display_name: 'Indian Contract Act §27 & Shops/Establishment Norms',
    jurisdiction: { country: 'IN', state: 'ALL', cities: [] },
    contract_types: ['employment_offer'],
    verified_date: '2026-11-21',
    rules: [
      {
        rule_id: 'IN_ICA_SEC27_NONCOMPETE',
        category: 'non_compete',
        title: 'Post-Employment Non-Compete Restraint',
        basis_type: 'statutory_conflict',
        severity: 'caution',
        benchmark: {
          metric: 'months_post_exit',
          max_fair_value: 0,
          typical_label: 'Void post-employment under ICA §27',
        },
        statutory_citation: {
          act: 'Indian Contract Act, 1872',
          section: 'Section 27 (Restraint of Trade)',
          source_url: 'https://indiacode.nic.in',
        },
        detection_hint: 'Flag post-termination non-compete bans or excessive 90-day unilateral notice periods.',
        negotiation_ask: {
          short_title: 'Remove Post-Exit Non-Compete & Align 60-Day Notice',
          polite_ask: 'Could we clarify that the non-compete applies only during active employment and set notice at 60 days mutual?',
          firm_ask: 'Post-employment non-compete clauses are void under Section 27 of the Indian Contract Act. Please restrict Clause 9.1 to active tenure.',
          replacement_wording: 'Restrictions on competing engagements shall apply solely during active employment, with a mutual 60-day notice period.',
        },
      },
    ],
    expected_clauses: [
      {
        id: 'side_project_ip',
        label: 'Off-Hours Personal IP Carve-Out',
        why_it_matters: 'Broad IP assignment can claim weekend open-source or personal projects.',
      },
    ],
  },
  'in-general-fallback': {
    schema_version: 'rule_pack_v1',
    pack_id: 'in-general-fallback',
    display_name: 'Pan-India General Consumer Norms',
    jurisdiction: { country: 'IN', state: 'GENERAL', cities: [] },
    contract_types: ['general'],
    verified_date: '2026-11-21',
    rules: [
      {
        rule_id: 'IN_GEN_ARBITRATION_NEUTRALITY',
        category: 'dispute',
        title: 'Unilateral Arbitrator Appointment',
        basis_type: 'statutory_conflict',
        severity: 'caution',
        benchmark: {
          metric: 'mutual_appointment',
          max_fair_value: 1,
          typical_label: 'Mutual appointment (Arbitration Act §12)',
        },
        statutory_citation: {
          act: 'Arbitration and Conciliation Act, 1996',
          section: 'Section 12(5) & Fifth Schedule',
          source_url: 'https://indiacode.nic.in',
        },
        detection_hint: 'Flag clauses where one party unilaterally appoints the sole arbitrator.',
        negotiation_ask: {
          short_title: 'Ensure Mutual Arbitrator Appointment',
          polite_ask: 'Can we update the dispute clause so any arbitrator is appointed mutually?',
          firm_ask: 'Unilateral arbitrator appointment is unenforceable under Supreme Court precedent. Please amend to mutual appointment.',
          replacement_wording: 'Any dispute shall be resolved by a sole arbitrator mutually appointed by both parties.',
        },
      },
    ],
    expected_clauses: [
      {
        id: 'dispute_venue',
        label: 'Dispute Resolution & Arbitration Clause',
        why_it_matters: 'Missing dispute resolution leaves venue and small-claims remedies ambiguous.',
      },
    ],
  },
};

export function selectRulePack(contractType: string, stateOrCity?: string): {
  pack: RulePack;
  isExactMatch: boolean;
} {
  const loc = (stateOrCity || '').toLowerCase();
  if (contractType === 'personal_loan' || contractType === 'loan') {
    return { pack: RULE_PACKS['in-central-rbi-loan'], isExactMatch: true };
  }
  if (contractType === 'employment_offer' || contractType === 'employment') {
    return { pack: RULE_PACKS['in-central-employment'], isExactMatch: true };
  }
  if (contractType === 'residential_rental' || contractType === 'rental') {
    if (!loc || loc.includes('ka') || loc.includes('karnataka') || loc.includes('bengaluru') || loc.includes('bangalore') || loc.includes('indiranagar')) {
      return { pack: RULE_PACKS['in-ka-rental'], isExactMatch: true };
    }
    return { pack: RULE_PACKS['in-general-fallback'], isExactMatch: false };
  }
  return { pack: RULE_PACKS['in-general-fallback'], isExactMatch: false };
}

export function validateRulePack(pack: RulePack): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validBasis = new Set(['statutory_conflict', 'above_local_norm', 'missing_protection', 'standard']);
  if (pack.schema_version !== 'rule_pack_v1') errors.push('Invalid schema_version');
  if (!pack.pack_id) errors.push('Missing pack_id');
  if (!pack.verified_date) errors.push('Missing verified_date');
  const seenIds = new Set<string>();
  for (const r of pack.rules) {
    if (!r.rule_id) errors.push('Rule missing rule_id');
    if (seenIds.has(r.rule_id)) errors.push(`Duplicate rule_id: ${r.rule_id}`);
    seenIds.add(r.rule_id);
    if (!validBasis.has(r.basis_type)) errors.push(`Invalid basis_type: ${r.basis_type}`);
  }
  return { valid: errors.length === 0, errors };
}
