import type { AuditResult, VaultDocument } from '../types/contract';
import { ORIGINAL_SCAN_DEMO_URL } from '../utils/ingest';

export const PRESET_BLR_RENTAL: AuditResult = {
  id: 'blr-rental',
  title: 'Bengaluru Rental Agreement • Flat 304 Indiranagar',
  subtitle: 'Standard 11-Month Tenancy Template',
  meta_badge: '3 Pages • 1.4 MB • KA Reg.',
  category: 'rental',
  lane: 'A',
  original_photo_url: ORIGINAL_SCAN_DEMO_URL,
  stamp_header: {
    reg_line: 'KARNATAKA REG. ACT NO. 15 // DOC ID: BLR-IND-2024-8049',
    stamp_value: 'STAMP VALUE: ₹500 PAID',
    doc_title: 'RESIDENTIAL LEASE AGREEMENT',
    doc_subtitle: '(INDIRANAGAR / WARD 112, BENGALURU URBAN)',
    recitals:
      'THIS AGREEMENT is entered into on this 1st day of October, 2024 between [LESSOR_NAME_REDACTED], hereinafter referred to as the "Lessor", and [LESSEE_NAME_REDACTED], hereinafter referred to as the "Lessee".',
    stamp_cert_id: 'IN-KA09283019385938W',
    stamp_issued: 'ISSUED: 01-OCT-2024',
    lessor_name: 'Mr. Ramesh Kumar',
    lessee_name: 'Mr. Varun Kumar',
  },
  completeness: {
    status: 'missing_pages',
    missing_gaps: [
      'Maintenance fee formula and sinking fund splits are explicitly referenced in Clause 6.2, but Annexure A is missing from your scanned 3-page upload. Ask the landlord for the complete schedule before signing.',
    ],
  },
  pii_masked_tokens: [
    { label: 'Lessor Full Name', masked_preview: '[LESSOR_NAME_REDACTED]', status: 'MASKED' },
    { label: 'Tenant Aadhaar ID', masked_preview: 'XXXX-XXXX-8912', status: 'HASHED' },
    { label: 'Lessor Bank Account / IFSC', masked_preview: 'SBIN000**** / 9182390****', status: 'REDACTED' },
    { label: 'Tenant Primary Mobile', masked_preview: '+91 99000 *****', status: 'MASKED' },
    { label: 'Sub-Registrar Stamp Serial', masked_preview: 'IN-KA09283019385938W', status: 'VERIFIED LOCAL' },
  ],
  rule_pack_applied: {
    pack_id: 'in-ka-rental',
    display_name: 'Karnataka Model Tenancy Act 2021',
    is_exact_jurisdiction_match: true,
    verified_date: '2026-11-21',
    match_pct: 85,
  },
  summary: {
    risk_score: 62,
    risk_band: 'caution',
    risk_band_label: '62 · Caution',
    rupee_exposure_inr: 135000,
    exposure_caption: 'above statutory norms',
    breakdown_cards: [
      { label: 'Deposit Lock', value: '₹2,50,000', sublabel: 'Cap: ₹50,000', tone: 'error' },
      { label: 'Escalation Hike', value: '₹3,750/mo', sublabel: '+15% Unilateral', tone: 'caution' },
      { label: 'Exit Risk (Mo 3)', value: '₹75,000', sublabel: '6-Mo Lock-in', tone: 'error' },
    ],
    alert_banner:
      'Bengaluru Tenancy Alert: The requested 10-month interest-free deposit and 15% automatic escalation clause heavily exceed Section 10 of Karnataka Model Tenancy Act standards.',
    top_3_bullets: [
      {
        title: '₹2,50,000 security deposit exceeds legal cap',
        detail: '10 months rent surrendered interest-free upfront. Section 10 KMTA mandates a strict 2-month cap for residential premises.',
      },
      {
        title: 'Mandatory 6-Month Lock-in with ₹75k penalty',
        detail: 'If job transfer requires vacating at Month 3, you forfeit ₹25,000 deposit penalty plus mandatory 2 months notice rent.',
      },
      {
        title: 'Unilateral 15% rent hike on renewal',
        detail: 'Landlord can increase base rent to ₹28,750 without negotiating or referencing prevailing market inflation rates.',
      },
    ],
    walkthrough_intro_spoken: {
      kn: 'ನಮಸ್ಕಾರ ವರುಣ್ ಅವರೇ. ಈ ಅಗ್ರಿಮೆಂಟ್‌ನಲ್ಲಿ ಹತ್ತು ತಿಂಗಳ ಡೆಪಾಸಿಟ್, ಅಂದ್ರೆ ಎರಡು ಲಕ್ಷ ಐವತ್ತು ಸಾವಿರ ರೂಪಾಯಿ ಕೇಳಿದ್ದಾರೆ. ಕರ್ನಾಟಕ ಬಾಡಿಗೆ ನಿಯಮ ಪ್ರಕಾರ ಎರಡು ತಿಂಗಳಿಗಿಂತ ಹೆಚ್ಚು ಕೇಳುವಂತಿಲ್ಲ.',
      hi: 'नमस्ते, इस एग्रीमेंट में दस महीने का सिक्योरिटी डिपॉजिट दो लाख पचास हजार रुपये मांगा गया है। कर्नाटक रेंट एक्ट के तहत सामान्य सीमा दो महीने की है।',
      ta: 'வணக்கம், இந்த ஒப்பந்தத்தில் பத்து மாத வாடகை இரண்டு லட்சத்து ஐம்பதாயிரம் ரூபாய் டெபாசிட் கேட்கப்பட்டுள்ளது. கர்நாடக விதிப்படி இரண்டு மாத வரம்பு மட்டுமே உள்ளது.',
      en: 'Before you sign this Bengaluru lease, watch out for three clauses: a ten-month security deposit of two lakh fifty thousand rupees, a six-month lock-in penalty, and a unilateral fifteen percent annual rent hike.',
    },
    audio_duration_label: '1:14 min • Deposit cap & exit trap warnings',
  },
  clauses: [
    {
      clause_id: 'target-clause-4-1',
      section_label: 'Clause 4.1 • Safe Baseline',
      page_num: 2,
      line_ref: 'Lines 28–41',
      severity: 'safe',
      badge_label: 'Clause 4.1 • Safe Baseline',
      text: '4.1 Monthly Rent: The Tenant shall pay to the Landlord a monthly rent of ₹25,000/- (Rupees Twenty-Five Thousand Only) on or before the 5th day of each successive calendar month through direct NEFT/RTGS bank transfer. Utility tariffs including BESCOM power and BWSSB water shall be billed strictly against monthly sub-meter usage.',
    },
    {
      clause_id: 'target-clause-4-2',
      section_label: 'Clause 4.2 • Critical Discrepancy',
      page_num: 2,
      line_ref: 'Lines 42–56',
      severity: 'critical',
      badge_label: 'Clause 4.2 • Critical Discrepancy',
      right_badge: 'Exceeds KRTA Sec 10',
      text: '4.2 Security Deposit: The Tenant shall deposit with the Landlord an interest-free refundable caution deposit of ₹2,50,000/- (Rupees Two Lakhs Fifty Thousand Only) prior to the handover of keys. The Landlord reserves the absolute and unquestioned right to deduct repainting charges, deep cleaning debits, and any unspecified breakages prior to returning the balance within 45 days post physical handover.',
      ocr_highlight_token: '₹2,50,000/-',
      ocr_confidence: 99.8,
      ocr_verified: false,
      warning_footer: '10-Month deposit is 500% over statutory 2-month threshold',
    },
    {
      clause_id: 'target-clause-8-2',
      section_label: 'Clause 8.2 • High Penalty Lock-In',
      page_num: 2,
      line_ref: 'Lines 57–74',
      severity: 'caution',
      badge_label: 'Clause 8.2 • High Penalty Lock-In',
      right_badge: 'Enforceability: Partial',
      text: '8.2 Lock-in Period & Early Termination: Neither party shall be entitled to terminate this agreement during the initial 6 (six) months ("Lock-in Window"). In the event that the Lessee desires to vacate the leased premises prior to the expiration of the said six-month lock-in, the Lessee shall forfeit one full month\'s rental sum (₹25,000/-) as liquidated damages and remain obligated to satisfy two (2) months mandatory advance notice fee.',
    },
    {
      clause_id: 'target-clause-14-1',
      section_label: 'Clause 14.1 • Caution Escalation',
      page_num: 2,
      line_ref: 'Line 104',
      severity: 'caution',
      badge_label: 'Clause 14.1 • Caution Escalation',
      right_badge: '+15% Unilateral',
      text: '14.1 Escalation: Upon the successful completion of the initial eleven (11) month tenure, if mutually renewed, the Lessor reserves the sole right to automatically escalate the base monthly rent by 15% (fifteen percent) without separate arbitration or comparative locality index assessment.',
    },
  ],
  findings: [
    {
      finding_id: 'f-deposit',
      clause_id: 'target-clause-4-2',
      severity: 'critical',
      category: 'deposit',
      line_ref: 'Lines 42–56',
      headline: 'Clause 4.2 & 8.2: 10-Month Security Deposit (₹2,50,000)',
      statutory_rule_text:
        'Statutory Rule: Karnataka Model Tenancy Act caps residential deposits at maximum 2 months rent (₹50,000). Overcommit required: ₹2,00,000.',
      plain_explanation:
        'You are asked to lock ₹2,50,000 upfront. Under the Model Tenancy Act, residential deposits are capped at 2 months (₹50,000).',
      risk_detail:
        'Landlord retains unilateral authority to debit subjective repainting costs and enforce 45-day return lag.',
      spoken_script:
        'Clause 4.2 ಅಲ್ಲಿ security deposit ಎರಡು ಲಕ್ಷ ಐವತ್ತು ಸಾವಿರ ರೂಪಾಯಿ ಕೇಳಿದ್ದಾರೆ, ಅಂದ್ರೆ ಹತ್ತು ತಿಂಗಳ ಬಾಡಿಗೆ. ಕರ್ನಾಟಕ ನಿಯಮ ಪ್ರಕಾರ ಎರಡು ತಿಂಗಳ ಬಾಡಿಗೆ ಮಾತ್ರ ಕೇಳಬಹುದು.',
      verbatim_quote:
        'The Tenant shall deposit with the Landlord an interest-free refundable caution deposit of ₹2,50,000/- (Rupees Two Lakhs Fifty Thousand Only) prior to the handover of keys.',
      verification: { status: 'verified', char_start: 0, char_end: 165, jaccard: 1.0 },
      rule_ref: {
        rule_id: 'IN_KA_DEPOSIT_CAP',
        basis_type: 'statutory_conflict',
        citation_label: 'Model Tenancy Act: 2-Mo Cap',
      },
      negotiation: {
        default_selected: true,
        short_title: 'Cap Security Deposit at 2 Months (₹50k)',
        impact_badge: 'Saves ₹2,00,000 lock-in',
        polite_ask:
          'Security deposit: Would you be open to a 2–3 month deposit instead of 10 months, in line with Karnataka Model Tenancy Act guidelines?',
        firm_ask:
          'RE: CLAUSE 4.2: Statutory cap under Section 10 KMTA 2021 restricts residential deposit to 2 months rent (₹50,000). Current 10-month demand (₹2.5L) must be revised.',
        replacement_wording:
          'Tenant shall deposit a refundable sum equivalent to two (2) months rent (₹50,000/-), refundable within 15 days of key handover.',
      },
    },
    {
      finding_id: 'f-escalation',
      clause_id: 'target-clause-14-1',
      severity: 'caution',
      category: 'escalation',
      line_ref: 'Line 104',
      headline: 'Clause 14.1: Unilateral 15% Rent Escalation',
      plain_explanation:
        'Standard Bengaluru locality indexation is 5% to 8% with 90 days mutual notice. This contract enforces an automatic 15% (₹3,750/mo increase) on Day 331 without tenant assent.',
      impact_label: 'Impact: +₹45,000/yr',
      spoken_script:
        'Clause 14.1 ಅಲ್ಲಿ ಹನ್ನೊಂದು ತಿಂಗಳ ನಂತರ ಹದಿನೈದು ಪರ್ಸೆಂಟ್ ಬಾಡಿಗೆ ಹೆಚ್ಚಳ ಮಾಡಲಾಗಿದೆ. ಬೆಂಗಳೂರಿನಲ್ಲಿ ಸಾಮಾನ್ಯವಾಗಿ ಐದರಿಂದ ಎಂಟು ಪರ್ಸೆಂಟ್ ಇರುತ್ತದೆ.',
      verbatim_quote:
        'the Lessor reserves the sole right to automatically escalate the base monthly rent by 15% (fifteen percent) without separate arbitration or comparative locality index assessment.',
      verification: { status: 'verified', char_start: 0, char_end: 173, jaccard: 1.0 },
      rule_ref: {
        rule_id: 'IN_KA_RENT_ESCALATION',
        basis_type: 'above_local_norm',
        citation_label: 'Standard Practice: 5–8%',
      },
      negotiation: {
        default_selected: true,
        short_title: 'Limit Renewal Escalation to 6% (Mutual Notice)',
        impact_badge: 'Saves ₹2,250/mo',
        polite_ask:
          'Annual Escalation: Requesting a standard 5–6% hike upon mutual consent rather than an automatic 15%.',
        firm_ask:
          'RE: CLAUSE 14.1: Unilateral 15% escalation is non-standard. Cap at local indexation (5%) with 90-day mutual notice.',
        replacement_wording:
          'Base monthly rent may escalate by 5% upon mutual written renewal after 11 months.',
      },
    },
    {
      finding_id: 'f-lockin',
      clause_id: 'target-clause-8-2',
      severity: 'caution',
      category: 'lock_in',
      line_ref: 'Lines 57–74',
      headline: 'Clause 8.2: Mandatory 6-Month Lock-in & Double Exit Fee',
      plain_explanation:
        'Vacating before Month 6 triggers a ₹25,000 penalty forfeiture plus 2 months mandatory notice rent (₹75,000 total impact).',
      impact_label: 'Impact: ₹75,000 exit loss',
      spoken_script:
        'Clause 8.2 ಪ್ರಕಾರ ನೀವು ಆರು ತಿಂಗಳ ಒಳಗೆ ಮನೆ ಖಾಲಿ ಮಾಡಿದರೆ ಒಂದು ತಿಂಗಳ ಬಾಡಿಗೆ ಕಡಿತವಾಗುತ್ತದೆ ಮತ್ತು ಎರಡು ತಿಂಗಳ ನೋಟೀಸ್ ಬಾಡಿಗೆ ಕಟ್ಟಬೇಕಾಗುತ್ತದೆ.',
      verbatim_quote:
        'the Lessee shall forfeit one full month\'s rental sum (₹25,000/-) as liquidated damages and remain obligated to satisfy two (2) months mandatory advance notice fee.',
      verification: { status: 'verified', char_start: 0, char_end: 158, jaccard: 1.0 },
      rule_ref: {
        rule_id: 'IN_KA_LOCKIN_EXIT',
        basis_type: 'above_local_norm',
        citation_label: 'Mutual 1-Mo Notice Norm',
      },
      negotiation: {
        default_selected: false,
        short_title: 'Mutual 1-Month Notice, No Lock-in Forfeiture',
        impact_badge: 'Flexibility',
        polite_ask:
          'Termination: Standard 30 days notice for tenant exit after month 3 without penalty forfeiture.',
        firm_ask:
          'RE: CLAUSE 8.2: 6-month lock-in penalty clause to be amended to mutual 1-month notice without double forfeiture.',
        replacement_wording:
          'Either party may terminate after Month 3 with 30 days prior written notice and zero liquidated damages.',
      },
    },
  ],
  key_terms: [
    { label: 'Monthly Rent', in_contract: '₹25,000 / mo', typical: '₹25,000 / mo', status: 'ok' },
    { label: 'Security Deposit', in_contract: '₹2,50,000 (10 mo)', typical: '₹50,000 (2 mo)', status: 'worse' },
    { label: 'Annual Escalation', in_contract: '15% automatic', typical: '5%–8% mutual', status: 'worse' },
    { label: 'Lock-in & Exit Notice', in_contract: '6 mo + 2-mo notice', typical: '1-mo mutual notice', status: 'worse' },
  ],
  missing_clauses: [
    {
      label: 'Maintenance & Structural Repair SLA',
      why_it_matters:
        'Zero mention of landlord liability for external seepage, core electrical lines, or elevator dues. In Karnataka, major structural repairs legally remain the lessor\'s duty.',
      recommended_addendum:
        'Add Annexure A specifying Lessor liability for structural seepage, main electrical lines, and society sinking fund.',
    },
  ],
  way_out_params: {
    mode: 'rental',
    monthly_rent_inr: 25000,
    deposit_inr: 250000,
    lock_in_months: 6,
    notice_months: 2,
    total_months: 11,
    flat_exit_deduction_inr: 25000,
    negotiated_lock_in_months: 0,
    negotiated_flat_deduction_inr: 0,
  },
  qa_presets: [
    {
      chip: 'How do I negotiate this?',
      question_native: 'Lock-in period ಮುಗಿಯೋ ಮುಂಚೆ ಮನೆ ಖಾಲಿ ಮಾಡಿದ್ರೆ deposit ವಾಪಸ್ ಸಿಗುತ್ತಾ?',
      question_en: 'If I vacate before the lock-in period ends, do I get my deposit back?',
      answer_native:
        'ಇಲ್ಲ, Clause 8.2 ಪ್ರಕಾರ ನೀವು 6 ತಿಂಗಳ ಒಳಗೆ ಖಾಲಿ ಮಾಡಿದರೆ 1 ತಿಂಗಳ ಬಾಡಿಗೆ (₹25,000) ಕಡಿತವಾಗುತ್ತದೆ.',
      answer_en:
        'No. According to Clause 8.2, vacating before Month 6 forfeits 1 full month’s rent (₹25,000) as an early termination penalty, and requires 2 months prior written notice.',
      statutory_note:
        'Warning: Karnataka Model Tenancy Act mandates max 1-month notice without punitive forfeiture. This clause is unusually aggressive.',
      clause_id: 'target-clause-8-2',
      excerpt:
        'In the event that the Lessee desires to vacate the leased premises prior to the expiration of the said six-month lock-in, the Lessee shall forfeit one full month\'s rental sum (₹25,000/-) as liquidated damages and remain obligated to satisfy two (2) months mandatory advance notice fee.',
    },
    {
      chip: 'Can owner deduct painting fee?',
      question_native: 'ಮನೆ ಬಿಡುವಾಗ landlord painting charges cut ಮಾಡಬಹುದಾ?',
      question_en: 'Can the landlord deduct arbitrary painting charges from my deposit?',
      answer_native:
        'Clause 4.2 ರಲ್ಲಿ ಮಾಲೀಕರಿಗೆ ಸಂಪೂರ್ಣ ಹಕ್ಕು ನೀಡಲಾಗಿದೆ, ಆದರೆ ಸಾಮಾನ್ಯ wear and tear ಗೆ ಹಣ ಕಡಿತ ಮಾಡುವಂತಿಲ್ಲ.',
      answer_en:
        'Clause 4.2 grants broad deduction authority for repainting and deep cleaning, which risks unfair ₹15k–₹25k cuts unless capped to actual itemized bills beyond normal wear and tear.',
      statutory_note:
        'KMTA norms protect tenants against deductions for normal wear and tear without photographic exit inspection.',
      clause_id: 'target-clause-4-2',
      excerpt:
        'The Landlord reserves the absolute and unquestioned right to deduct repainting charges, deep cleaning debits, and any unspecified breakages prior to returning the balance within 45 days post physical handover.',
    },
    {
      chip: 'Draft WhatsApp response',
      question_native: 'Deposit ಕಡಿಮೆ ಮಾಡಲು WhatsApp message ಬೇಕು',
      question_en: 'How should I ask the landlord on WhatsApp to lower the deposit?',
      answer_native:
        'Negotiate ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಕರ್ನಾಟಕ ಬಾಡಿಗೆ ನಿಯಮ ಉಲ್ಲೇಖಿಸಿ ಸಿದ್ಧವಾದ Polite WhatsApp ಸಂದೇಶವನ್ನು ಬಳಸಿ.',
      answer_en:
        'Use the Negotiate tab or Draft WhatsApp Message button to politely propose 2–3 months deposit aligned with KMTA Section 10 and 5% annual escalation.',
      statutory_note:
        'Polite framing referencing standard Bengaluru norms has the highest landlord acceptance rate.',
      clause_id: 'target-clause-4-2',
      excerpt:
        'The Tenant shall deposit with the Landlord an interest-free refundable caution deposit of ₹2,50,000/- (Rupees Two Lakhs Fifty Thousand Only) prior to the handover of keys.',
    },
  ],
};

export const PRESET_HDFC_LOAN: AuditResult = {
  id: 'hdfc-loan',
  title: 'HDFC Personal Loan T&C • ₹5L Renovation Facility',
  subtitle: '₹5,00,000 Home Renovation Facility',
  meta_badge: '8 Pages • Standard Bank Print',
  category: 'loan',
  lane: 'A',
  stamp_header: {
    reg_line: 'RETAIL CREDIT FACILITY // REF: HDFC-PL-2024-500K',
    stamp_value: 'KFS DISCLOSURE PENDING',
    doc_title: 'PERSONAL LOAN FACILITY AGREEMENT',
    doc_subtitle: '(RETAIL LENDING DIVISION — BENGALURU)',
    recitals:
      'THIS FACILITY AGREEMENT is executed between HDFC Bank Ltd. ("Lender") and [BORROWER_NAME_REDACTED] ("Borrower") for a principal sum of ₹5,00,000/- over 36 EMIs.',
    stamp_cert_id: 'IN-DL-PL-8849201',
    stamp_issued: 'ISSUED: 04-AUG-2024',
    lessor_name: 'HDFC Bank Ltd.',
    lessee_name: 'Borrower',
  },
  completeness: { status: 'complete', missing_gaps: [] },
  pii_masked_tokens: [
    { label: 'Borrower Name', masked_preview: '[BORROWER_NAME_REDACTED]', status: 'MASKED' },
    { label: 'PAN Card', masked_preview: 'ABCDE****F', status: 'HASHED' },
    { label: 'Loan Account Ref', masked_preview: 'LN-9048****21', status: 'REDACTED' },
  ],
  rule_pack_applied: {
    pack_id: 'in-central-rbi-loan',
    display_name: 'RBI Fair Practices Code & Key Fact Statement (2024)',
    is_exact_jurisdiction_match: true,
    verified_date: '2026-11-21',
    match_pct: 92,
  },
  summary: {
    risk_score: 88,
    risk_band: 'critical',
    risk_band_label: '88 · Critical',
    rupee_exposure_inr: 42000,
    exposure_caption: 'hidden fee & penalty risk',
    breakdown_cards: [
      { label: 'Prepayment Trap', value: '4% + GST', sublabel: '₹20,000 on ₹5L', tone: 'error' },
      { label: 'Processing + Stamp', value: '₹14,500', sublabel: 'Non-refundable', tone: 'caution' },
      { label: 'Penal Interest', value: '24% p.a.', sublabel: 'Compounded', tone: 'error' },
    ],
    alert_banner:
      'RBI Fair Practices Alert: Compounding penal interest and undisclosed all-in APR conflict with RBI 2024 Penal Charges & Key Facts Statement (KFS) mandates.',
    top_3_bullets: [
      {
        title: '4% Prepayment lock-in fee + 18% GST',
        detail: 'Closing the loan early costs ₹23,600 even after 12 regular EMIs.',
      },
      {
        title: 'Compounded 2% monthly penal interest on delayed EMI',
        detail: 'RBI circular prohibits compounding penal charges onto principal.',
      },
      {
        title: 'Missing mandatory Key Fact Statement (KFS) APR table',
        detail: 'All-in effective APR including ₹14,500 upfront processing fee is omitted.',
      },
    ],
    walkthrough_intro_spoken: {
      kn: 'ಈ ಪರ್ಸನಲ್ ಲೋನ್ ಒಪ್ಪಂದದಲ್ಲಿ ನಾಲ್ಕು ಪರ್ಸೆಂಟ್ ಪ್ರೀ-ಪೇಮೆಂಟ್ ದಂಡ ಮತ್ತು ಕಂಪೌಂಡ್ ಪೆನಲ್ ಬಡ್ಡಿ ಇದೆ. ಸಹಿ ಮಾಡುವ ಮುಂಚೆ ಆರ್‌ಬಿಐ ಕೆಎಫ್‌ಎಸ್ ಶೀಟ್ ಕೇಳಿ.',
      hi: 'इस पर्सनल लोन एग्रीमेंट में चार प्रतिशत प्री-पेमेंट पेनल्टी और कंपाउंडिंग पीनल ब्याज है। साइन करने से पहले आरबीआई केएफएस शीट जरूर मांगें।',
      ta: 'இந்த தனிநபர் கடன் ஒப்பந்தத்தில் நான்கு சதவீத முன் கூட்டியே அடைப்பு கட்டணம் மற்றும் கூட்டு வட்டி அபராதம் உள்ளது.',
      en: 'This loan agreement has two high-risk hidden traps: a four percent prepayment lock-in penalty and compounded overdue charges that conflict with RBI 2024 rules.',
    },
    audio_duration_label: '0:58 min • Prepayment trap & RBI KFS check',
  },
  clauses: [
    {
      clause_id: 'target-loan-6-4',
      section_label: 'Clause 6.4 • Critical Prepayment Trap',
      page_num: 4,
      line_ref: 'Lines 88–102',
      severity: 'critical',
      badge_label: 'Clause 6.4 • Critical Trap',
      right_badge: '4% + GST Lock-in',
      text: '6.4 Prepayment & Foreclosure: The Borrower shall not prepay the loan within the first 12 EMIs. Any foreclosure thereafter shall attract a prepayment charge of 4% on outstanding principal plus applicable GST, alongside compound penal interest of 2% per month on overdue instalments.',
      ocr_highlight_token: '4% on outstanding principal',
      ocr_confidence: 99.4,
      warning_footer: 'Compound penal interest conflicts with RBI Penal Charges Circular 2024',
    },
  ],
  findings: [
    {
      finding_id: 'f-loan-foreclosure',
      clause_id: 'target-loan-6-4',
      severity: 'critical',
      category: 'prepayment',
      line_ref: 'Lines 88–102',
      headline: 'Clause 6.4: 4% Prepayment Lock-in & Compound Penal Interest',
      statutory_rule_text:
        'Statutory Rule: RBI 2024 KFS & Penal Charges norms bar capitalization/compounding of penal charges and require upfront APR disclosure.',
      plain_explanation:
        'You face a 4% + GST exit fee (up to ₹23,600) plus 24% compounded penal interest if an EMI bounces.',
      spoken_script:
        'Clause 6.4 ರಲ್ಲಿ ನಾಲ್ಕು ಪರ್ಸೆಂಟ್ ಫೋರ್‌ಕ್ಲೋಷರ್ ಶುಲ್ಕ ಮತ್ತು ತಿಂಗಳಿಗೆ ಎರಡು ಪರ್ಸೆಂಟ್ ಕಂಪೌಂಡ್ ದಂಡದ ಬಡ್ಡಿ ಹಾಕಲಾಗಿದೆ.',
      verbatim_quote:
        'Any foreclosure thereafter shall attract a prepayment charge of 4% on outstanding principal plus applicable GST, alongside compound penal interest of 2% per month on overdue instalments.',
      verification: { status: 'verified', char_start: 0, char_end: 180, jaccard: 1.0 },
      rule_ref: {
        rule_id: 'IN_RBI_FORECLOSURE_CAP',
        basis_type: 'statutory_conflict',
        citation_label: 'RBI KFS & Penal Circular 2024',
      },
      negotiation: {
        default_selected: true,
        short_title: 'Waive 4% Prepayment Lock-in & Compound Penal Fee',
        impact_badge: 'Saves ₹23,600',
        polite_ask:
          'Could you share the official RBI Key Facts Statement (KFS) and confirm zero foreclosure penalty after 6 EMIs?',
        firm_ask:
          'Under RBI 2024 Penal Charges guidelines, penal charges cannot be compounded. Please revise Clause 6.4 and attach the KFS APR sheet.',
        replacement_wording:
          'Borrower may prepay after 6 EMIs with 0% foreclosure charge; overdue penal charges shall remain simple and uncompounded.',
      },
    },
  ],
  key_terms: [
    { label: 'Principal Facility', in_contract: '₹5,00,000', typical: '₹5,00,000', status: 'ok' },
    { label: 'Foreclosure Penalty', in_contract: '4% + GST (12-mo lock)', typical: '0%–2% after 6 EMIs', status: 'worse' },
    { label: 'Penal Charges', in_contract: '2%/mo compounded', typical: 'Simple penal fee (RBI)', status: 'worse' },
  ],
  missing_clauses: [
    {
      label: 'Key Fact Statement (APR % Table)',
      why_it_matters: 'RBI requires an upfront 1-page KFS disclosing true all-in Annual Percentage Rate.',
    },
  ],
  way_out_params: {
    mode: 'loan',
    monthly_rent_inr: 16800,
    deposit_inr: 500000,
    lock_in_months: 12,
    notice_months: 0,
    total_months: 36,
    flat_exit_deduction_inr: 23600,
    negotiated_lock_in_months: 6,
    negotiated_flat_deduction_inr: 0,
  },
  qa_presets: [
    {
      chip: 'Is compound penalty legal?',
      question_native: 'EMI late ಆದ್ರೆ compound penalty ಹಾಕಬಹುದಾ?',
      question_en: 'Can the bank charge compound penal interest on a late EMI?',
      answer_native:
        'ಇಲ್ಲ, RBI 2024 ನಿಯಮ ಪ್ರಕಾರ ಬ್ಯಾಂಕ್‌ಗಳು penal charges ಮೇಲೆ compound ಬಡ್ಡಿ ಹಾಕುವಂತಿಲ್ಲ.',
      answer_en:
        'No. Under RBI Master Direction on Penal Charges (2024), lenders cannot capitalize or compound penal charges onto your loan principal.',
      statutory_note: 'Cite RBI/2023-24/53 Fair Lending Practice — Penal Charges in Loan Accounts.',
      clause_id: 'target-loan-6-4',
      excerpt:
        'Any foreclosure thereafter shall attract a prepayment charge of 4% on outstanding principal plus applicable GST, alongside compound penal interest of 2% per month on overdue instalments.',
    },
  ],
};

export const PRESET_TECHCORP_OFFER: AuditResult = {
  id: 'techcorp-offer',
  title: 'TechCorp Employment Offer • IP & Notice Letter',
  subtitle: 'Senior Frontend Engineer • 5 Pages',
  meta_badge: '5 Pages • Mid-Level Engineer',
  category: 'employment',
  lane: 'A',
  stamp_header: {
    reg_line: 'EMPLOYMENT OFFER // REF: TC-BLR-2024-SDE2',
    stamp_value: 'STANDARD CORPORATE TERMS',
    doc_title: 'OFFER OF EMPLOYMENT & IP AGREEMENT',
    doc_subtitle: '(BENGALURU ENGINEERING CENTER)',
    recitals:
      'TechCorp India Pvt. Ltd. offers [EMPLOYEE_NAME_REDACTED] the role of Senior Frontend Engineer subject to the following terms.',
    stamp_cert_id: 'TC-HR-2024-991',
    stamp_issued: 'ISSUED: 28-JUL-2024',
    lessor_name: 'TechCorp India Pvt. Ltd.',
    lessee_name: 'Candidate',
  },
  completeness: { status: 'complete', missing_gaps: [] },
  pii_masked_tokens: [
    { label: 'Candidate Name', masked_preview: '[EMPLOYEE_NAME_REDACTED]', status: 'MASKED' },
    { label: 'Candidate Email', masked_preview: 'v***@gmail.com', status: 'MASKED' },
  ],
  rule_pack_applied: {
    pack_id: 'in-central-employment',
    display_name: 'Indian Contract Act §27 & Shops/Establishment Norms',
    is_exact_jurisdiction_match: true,
    verified_date: '2026-11-21',
    match_pct: 90,
  },
  summary: {
    risk_score: 34,
    risk_band: 'safe',
    risk_band_label: '34 · Safe',
    rupee_exposure_inr: 0,
    exposure_caption: 'standard terms with 2 advisories',
    breakdown_cards: [
      { label: 'Notice Lock', value: '90 Days', sublabel: 'Mutual or buyout', tone: 'caution' },
      { label: 'Post-Exit Ban', value: '12 Months', sublabel: 'Void under ICA §27', tone: 'caution' },
      { label: 'Base & Equity', value: 'Standard', sublabel: 'Verified ESOP vest', tone: 'neutral' },
    ],
    alert_banner:
      'Overall Fair Offer: Compensation and IP assignment are largely standard, though Clause 9.1 includes a 12-month post-exit non-compete that is void under Indian Contract Act Section 27.',
    top_3_bullets: [
      {
        title: '90-Day Notice Period with salary buyout option',
        detail: 'Longer than 60-day startup norm; can slow future job switches.',
      },
      {
        title: '12-Month post-employment non-compete (unenforceable)',
        detail: 'Indian courts treat post-exit restraints as void under Section 27 of the Contract Act.',
      },
      {
        title: 'Broad IP assignment lacks weekend personal project carve-out',
        detail: 'Request a 1-line carve-out for open-source work built on personal time and hardware.',
      },
    ],
    walkthrough_intro_spoken: {
      kn: 'ಈ ಆಫರ್ ಲೆಟರ್ ಒಟ್ಟಾರೆಯಾಗಿ ಸುರಕ್ಷಿತವಾಗಿದೆ. ಆದರೆ ತೊಂಬತ್ತು ದಿನದ ನೋಟೀಸ್ ಪಿರಿಯಡ್ ಮತ್ತು ಕೆಲಸ ಬಿಟ್ಟ ನಂತರದ ನಾನ್-ಕಂಪೀಟ್ ಷರತ್ತನ್ನು ಗಮನಿಸಿ.',
      hi: 'यह ऑफर लेटर कुल मिलाकर सही है, बस नब्बे दिन का नोटिस पीरियड और नौकरी छोड़ने के बाद वाला नॉन-कम्पीट क्लॉज़ ध्यान में रखें।',
      ta: 'இந்த வேலை வாய்ப்பு கடிதம் பொதுவாக பாதுகாப்பானது, ஆனால் தொண்ணூறு நாள் நோட்டீஸ் காலத்தை கவனிக்கவும்.',
      en: 'This offer letter is overall fair and standard, with two minor points to clarify: a 90-day notice period and a post-employment non-compete that is generally unenforceable under Indian law.',
    },
    audio_duration_label: '0:46 min • Notice period & ICA §27 check',
  },
  clauses: [
    {
      clause_id: 'target-emp-9-1',
      section_label: 'Clause 9.1 • Advisory Notice',
      page_num: 3,
      line_ref: 'Lines 62–78',
      severity: 'caution',
      badge_label: 'Clause 9.1 • ICA §27 Advisory',
      right_badge: 'Void Post-Exit',
      text: '9.1 Notice & Non-Compete: Termination by either party requires ninety (90) days prior written notice. Following separation, the Employee shall not join any competing SaaS entity in India for twelve (12) months.',
    },
  ],
  findings: [
    {
      finding_id: 'f-emp-noncompete',
      clause_id: 'target-emp-9-1',
      severity: 'caution',
      category: 'non_compete',
      line_ref: 'Lines 62–78',
      headline: 'Clause 9.1: 90-Day Notice & 12-Month Post-Exit Non-Compete',
      statutory_rule_text:
        'Statutory Rule: Section 27 of the Indian Contract Act renders post-termination non-compete restraints void.',
      plain_explanation:
        'A 12-month post-exit ban is legally unenforceable in India, and 90 days notice is longer than the typical 60-day tech standard.',
      spoken_script:
        'Clause 9.1 ರಲ್ಲಿ ತೊಂಬತ್ತು ದಿನದ ನೋಟೀಸ್ ಮತ್ತು ಹನ್ನೆರಡು ತಿಂಗಳ ನಾನ್-ಕಂಪೀಟ್ ಇದೆ. ಭಾರತೀಯ ಕಾನೂನಿನಡಿ ಕೆಲಸ ಬಿಟ್ಟ ನಂತರದ ನಾನ್-ಕಂಪೀಟ್ ಮಾನ್ಯವಾಗುವುದಿಲ್ಲ.',
      verbatim_quote:
        'Following separation, the Employee shall not join any competing SaaS entity in India for twelve (12) months.',
      verification: { status: 'verified', char_start: 0, char_end: 102, jaccard: 1.0 },
      rule_ref: {
        rule_id: 'IN_ICA_SEC27_NONCOMPETE',
        basis_type: 'statutory_conflict',
        citation_label: 'Indian Contract Act §27',
      },
      negotiation: {
        default_selected: true,
        short_title: 'Restrict Non-Compete to Active Tenure & 60-Day Notice',
        impact_badge: 'Career Mobility',
        polite_ask:
          'Could we clarify that the non-compete applies only during active employment and set notice to 60 days?',
        firm_ask:
          'Post-employment restraints are void under Section 27 of the Indian Contract Act. Please limit Clause 9.1 to active tenure.',
        replacement_wording:
          'Non-compete obligations apply solely during active employment, with a mutual 60-day notice period.',
      },
    },
  ],
  key_terms: [
    { label: 'Notice Period', in_contract: '90 days', typical: '30–60 days', status: 'worse' },
    { label: 'Post-Exit Non-Compete', in_contract: '12 months', typical: 'Active tenure only', status: 'worse' },
    { label: 'IP Assignment', in_contract: 'Standard + broad', typical: 'Personal time carve-out', status: 'ok' },
  ],
  missing_clauses: [
    {
      label: 'Off-Hours Personal IP Carve-Out',
      why_it_matters: 'Protects weekend open-source or personal apps unrelated to TechCorp business.',
    },
  ],
  way_out_params: {
    mode: 'employment',
    monthly_rent_inr: 150000,
    deposit_inr: 0,
    lock_in_months: 12,
    notice_months: 3,
    total_months: 24,
    flat_exit_deduction_inr: 0,
    negotiated_lock_in_months: 0,
    negotiated_flat_deduction_inr: 0,
  },
  qa_presets: [
    {
      chip: 'Can they stop me switching jobs?',
      question_native: 'ಕೆಲಸ ಬಿಟ್ಟ ಮೇಲೆ competitor ಕಂಪನಿಗೆ ಸೇರಿದರೆ legal problem ಆಗುತ್ತಾ?',
      question_en: 'Can TechCorp legally stop me from joining a competitor after I resign?',
      answer_native:
        'ಇಲ್ಲ, Indian Contract Act Section 27 ಪ್ರಕಾರ ಕೆಲಸ ಬಿಟ್ಟ ನಂತರದ non-compete ಷರತ್ತುಗಳು ಮಾನ್ಯವಾಗುವುದಿಲ್ಲ.',
      answer_en:
        'No. Under Section 27 of the Indian Contract Act, 1872, post-employment non-compete restrictions are void and unenforceable across India.',
      statutory_note: 'Only confidential trade secrets & active-employment moonlighting restrictions are enforceable.',
      clause_id: 'target-emp-9-1',
      excerpt:
        'Following separation, the Employee shall not join any competing SaaS entity in India for twelve (12) months.',
    },
  ],
};

export const PRESET_MISSING_PAGE: AuditResult = {
  ...PRESET_BLR_RENTAL,
  id: 'missing-page-stress',
  title: 'Missing Page Stress Test • Page 2 of 4 Absent',
  subtitle: 'Page 2 of 4 Purposely Absent — Completeness Guard Active',
  meta_badge: '3 of 4 Pages • Gap Detected',
  lane: 'B',
  completeness: {
    status: 'missing_pages',
    missing_gaps: [
      'Page 2 of 4 is missing: Continuous clause numbering jumps from Clause 4 directly to Clause 7 (Clauses 5 & 6 absent).',
      'Arbitration & Dispute Resolution clause is missing from the uploaded scan — execution paused until full document is verified.',
    ],
  },
  summary: {
    ...PRESET_BLR_RENTAL.summary,
    risk_score: 79,
    risk_band: 'critical',
    risk_band_label: '79 · Incomplete Scan',
    alert_banner:
      'INCOMPLETE SCAN GUARD: Page 2 of 4 was omitted (Clause 4 → Clause 7). Never sign an agreement with missing middle pages.',
  },
};

export const ALL_PRESETS: AuditResult[] = [
  PRESET_BLR_RENTAL,
  PRESET_HDFC_LOAN,
  PRESET_TECHCORP_OFFER,
  PRESET_MISSING_PAGE,
];

export const INITIAL_VAULT_DOCS: VaultDocument[] = [
  {
    id: 'vault-1',
    customTag: 'Flat 304, Indiranagar Lease',
    scannedAt: 'Yesterday, 4:15 PM',
    statusLabel: 'Active Review',
    audit: PRESET_BLR_RENTAL,
    voiceMemoLabel: 'Landlord verbal deposit concession',
    voiceMemoDuration: '0:14',
    notes: [
      {
        id: 'n-1',
        createdAt: 'Oct 2, 2024 • 11:20 AM',
        tag: 'Self-reminder',
        text: 'Verify if the water meter in Flat 304 is independent from Flat 303 before transferring advance.',
        encrypted: true,
      },
      {
        id: 'n-2',
        createdAt: 'Oct 2, 2024 • 02:45 PM',
        tag: 'Call with Broker',
        text: 'Spoke with owner Mr. Ramesh on 12th Aug. Agrees to 2-month deposit, but insists on clause 4.2 paint charges. Ask for revised draft.',
        encrypted: true,
      },
    ],
  },
  {
    id: 'vault-2',
    customTag: '₹5L Home Renovation Loan • 8 Pages',
    scannedAt: 'Aug 4, 2024',
    statusLabel: 'Archived',
    audit: PRESET_HDFC_LOAN,
    notes: [],
  },
  {
    id: 'vault-3',
    customTag: 'Senior Frontend Role • 5 Pages',
    scannedAt: 'Jul 28, 2024',
    statusLabel: 'Verified',
    audit: PRESET_TECHCORP_OFFER,
    notes: [],
  },
];
