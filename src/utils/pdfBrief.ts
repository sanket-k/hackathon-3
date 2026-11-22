import { jsPDF } from 'jspdf';
import type { AuditResult } from '../types/contract';

export function exportOnePageBriefPDF(audit: AuditResult): void {
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

  y += 10;
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
  doc.setTextColor(19, 27, 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text("TOP 3 THINGS YOU'RE AGREEING TO", margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  audit.summary.top_3_bullets.forEach((b, idx) => {
    const lines = doc.splitTextToSize(`${idx + 1}. ${b.title} — ${b.detail}`, 174);
    doc.text(lines, margin + 2, y);
    y += lines.length * 4.5 + 2;
  });

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('VERIFIED FLAGGED CLAUSES & NEGOTIATION ASKS', margin, y);
  y += 6;

  audit.findings.slice(0, 4).forEach((f) => {
    if (y > 255) return;
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
    const askLines = doc.splitTextToSize(`Recommended Ask: ${f.negotiation.polite_ask}`, 174);
    doc.text(askLines, margin + 2, y);
    y += askLines.length * 4.2 + 4;
  });

  // Footer disclaimer
  doc.setDrawColor(196, 197, 215);
  doc.line(margin, 276, 194, 276);
  doc.setFontSize(8);
  doc.setTextColor(116, 118, 134);
  doc.text(
    'Informational legal clarity only — not formal legal representation. Prepared locally on-device by LawLens AI.',
    margin,
    282,
  );

  const safeName = audit.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  doc.save(`${safeName}-brief.pdf`);
}
