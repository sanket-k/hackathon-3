import { jsPDF } from 'jspdf';
import type { AuditFinding, AuditResult } from '../types/contract';
import type { BriefExportRequest } from '../types/ui';

/** Hard cap on asks rendered on the single-page brief. */
const MAX_BRIEF_FINDINGS = 5;

/**
 * Pick the findings that belong on the Pre-Sign Brief.
 *
 * Rules, in order:
 *  1. `selectedClauseIds` non-empty → keep findings whose `clause_id` OR
 *     `finding_id` appears in the list (the Negotiate screen sends whichever
 *     identifier it has). Order follows `audit.findings` so the brief reads in
 *     document order. If nothing matches, we fall through to the defaults
 *     below rather than emit an empty brief.
 *  2. `selectedClauseIds` empty (or no match) → findings flagged
 *     `negotiation.default_selected === true`.
 *  3. Still nothing → every finding, so the page is never blank.
 *
 * The result is capped at {@link MAX_BRIEF_FINDINGS}.
 *
 * Note: unknown ids therefore yield the default-selected set (or all findings
 * when no defaults exist) — never an empty array unless the audit itself has
 * no findings.
 */
export function selectBriefFindings(audit: AuditResult, selectedClauseIds: string[]): AuditFinding[] {
  const findings = audit.findings ?? [];
  const wanted = new Set((selectedClauseIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0));

  let picked: AuditFinding[] = [];
  if (wanted.size > 0) {
    picked = findings.filter((f) => wanted.has(f.clause_id) || wanted.has(f.finding_id));
  }

  if (picked.length === 0) {
    picked = findings.filter((f) => f.negotiation?.default_selected === true);
  }

  if (picked.length === 0) {
    picked = findings.slice();
  }

  return picked.slice(0, MAX_BRIEF_FINDINGS);
}

/** The ask wording for the chosen tone, with a graceful fallback to the other. */
function askForTone(finding: AuditFinding, tone: BriefExportRequest['tone']): string {
  const polite = finding.negotiation?.polite_ask ?? '';
  const firm = finding.negotiation?.firm_ask ?? '';
  const primary = tone === 'firm' ? firm : polite;
  const fallback = tone === 'firm' ? polite : firm;
  return (primary || fallback || '').trim();
}

/**
 * Render the one-page Pre-Sign Brief for the asks and tone the user actually
 * chose in the Negotiate screen.
 */
export function exportBriefPDF(audit: AuditResult, request: BriefExportRequest): void {
  const tone: BriefExportRequest['tone'] = request?.tone === 'firm' ? 'firm' : 'polite';
  const toneLabel = tone === 'firm' ? 'Firm' : 'Polite';
  const selected = selectBriefFindings(audit, request?.selectedClauseIds ?? []);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 16;
  let y = 18;

  // Header strip
  doc.setFillColor(0, 55, 176);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('LAWLENS PRO — PRE-SIGN EXECUTIVE BRIEF', margin, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated on-device · Zero cloud retention · Rule Pack: ${audit.rule_pack_applied.display_name}`, margin, 17);

  y = 32;
  doc.setTextColor(19, 27, 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(audit.title, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(67, 70, 85);
  doc.text(`${audit.subtitle}  |  Risk Score: ${audit.summary.risk_score}/100 (${audit.summary.risk_band_label})`, margin, y);

  // Header meta: the user's chosen tone + how many asks made the page.
  y += 5.5;
  doc.setFontSize(9);
  doc.setTextColor(0, 55, 176);
  doc.text(`Negotiation Tone: ${toneLabel}  |  ${selected.length} Negotiation Ask${selected.length === 1 ? '' : 's'} Included`, margin, y);

  y += 8;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(margin, y, 178, 18, 2, 2, 'FD');
  doc.setTextColor(186, 26, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`UNCHECKED FINANCIAL EXPOSURE: INR ${audit.summary.rupee_exposure_inr.toLocaleString('en-IN')}`, margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(67, 70, 85);
  const alertLines = doc.splitTextToSize(audit.summary.alert_banner, 170);
  doc.text(alertLines.slice(0, 2), margin + 4, y + 13);

  y += 26;

  const bullets = audit.summary.top_3_bullets ?? [];
  if (bullets.length > 0) {
    doc.setTextColor(19, 27, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text("TOP 3 THINGS YOU'RE AGREEING TO", margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    bullets.forEach((b, idx) => {
      const lines = doc.splitTextToSize(`${idx + 1}. ${b.title} — ${b.detail}`, 174);
      doc.text(lines, margin + 2, y);
      y += lines.length * 4.5 + 2;
    });

    y += 4;
  }

  doc.setTextColor(19, 27, 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('VERIFIED FLAGGED CLAUSES & NEGOTIATION ASKS', margin, y);
  y += 6;

  let rendered = 0;
  let overflowed = false;

  const drawFinding = (f: AuditFinding): void => {
    if (y > 255) {
      overflowed = true;
      return;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(f.severity === 'critical' ? 186 : 127, f.severity === 'critical' ? 26 : 37, 0);
    doc.text(`[${f.severity.toUpperCase()}] ${f.headline} (${f.rule_ref.citation_label})`, margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(67, 70, 85);
    const expLines = doc.splitTextToSize(`Explanation: ${f.plain_explanation}`, 174);
    doc.text(expLines, margin + 2, y);
    y += expLines.length * 4.2 + 1;
    const askLines = doc.splitTextToSize(`Recommended Ask (${toneLabel}): ${askForTone(f, tone)}`, 174);
    doc.text(askLines, margin + 2, y);
    y += askLines.length * 4.2 + 4;
    rendered += 1;
  };

  for (const f of selected) {
    drawFinding(f);
  }

  const omitted = selected.length - rendered;
  if (overflowed && omitted > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(116, 118, 134);
    // Sit the note just under the last rendered ask, but never on top of the footer rule at y=276.
    const noteY = y + 2 > 268 ? 271 : y + 2;
    doc.text(`${omitted} more asks omitted for brevity — see the Negotiate screen for the full list.`, margin, noteY);
  }

  // Footer disclaimer
  doc.setDrawColor(196, 197, 215);
  doc.line(margin, 276, 194, 276);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(116, 118, 134);
  doc.text(
    'Informational legal clarity only — not formal legal representation. Prepared locally on-device by LawLens AI.',
    margin,
    282,
  );

  const safeName = audit.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  doc.save(`${safeName}-brief.pdf`);
}

/**
 * Legacy entry point: every `default_selected` finding, polite wording.
 * Kept so existing callers keep working unchanged.
 */
export function exportOnePageBriefPDF(audit: AuditResult): void {
  exportBriefPDF(audit, { auditId: audit.id, selectedClauseIds: [], tone: 'polite' });
}
