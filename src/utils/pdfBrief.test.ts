import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBriefFindings } from './pdfBrief';
import type { AuditFinding, AuditResult } from '../types/contract';

/**
 * Pure selection tests only — jsPDF is never invoked here, so this file can run
 * under plain `node --test` without a DOM.
 */

function finding(
  id: string,
  clauseId: string,
  defaultSelected: boolean,
  severity: AuditFinding['severity'] = 'caution',
): AuditFinding {
  return {
    finding_id: id,
    clause_id: clauseId,
    severity,
    category: 'deposit',
    line_ref: '4.2',
    headline: `Headline ${id}`,
    plain_explanation: `Explanation ${id}`,
    spoken_script: `Spoken ${id}`,
    verbatim_quote: `Quote ${id}`,
    verification: { status: 'verified', char_start: 0, char_end: 8, jaccard: 1 },
    rule_ref: { rule_id: 'IN_KA_DEPOSIT_CAP', basis_type: 'statutory_conflict', citation_label: 'KMTA s.13' },
    negotiation: {
      default_selected: defaultSelected,
      short_title: `Short ${id}`,
      impact_badge: 'HIGH',
      polite_ask: `Polite ask ${id}`,
      firm_ask: `Firm ask ${id}`,
      replacement_wording: `Wording ${id}`,
    },
  };
}

/** Minimal AuditResult stub — only `findings` matters to the selector. */
function auditWith(findings: AuditFinding[]): AuditResult {
  return { id: 'audit-1', title: 'Rental Agreement', findings } as unknown as AuditResult;
}

test('explicit selectedClauseIds filter, matching by clause_id', () => {
  const audit = auditWith([finding('f1', 'c1', true), finding('f2', 'c2', true), finding('f3', 'c3', false)]);

  const picked = selectBriefFindings(audit, ['c2']);

  assert.deepEqual(
    picked.map((f) => f.finding_id),
    ['f2'],
  );
});

test('explicit selectedClauseIds filter, matching by finding_id', () => {
  const audit = auditWith([finding('f1', 'c1', true), finding('f2', 'c2', true), finding('f3', 'c3', false)]);

  const picked = selectBriefFindings(audit, ['f3']);

  assert.deepEqual(
    picked.map((f) => f.clause_id),
    ['c3'],
  );
});

test('mixed clause_id and finding_id ids both match, output stays in document order', () => {
  const audit = auditWith([finding('f1', 'c1', false), finding('f2', 'c2', false), finding('f3', 'c3', false)]);

  const picked = selectBriefFindings(audit, ['f3', 'c1']);

  assert.deepEqual(
    picked.map((f) => f.finding_id),
    ['f1', 'f3'],
  );
});

test('empty ids falls back to default_selected findings only', () => {
  const audit = auditWith([
    finding('f1', 'c1', true),
    finding('f2', 'c2', false),
    finding('f3', 'c3', true),
    finding('f4', 'c4', false),
  ]);

  const picked = selectBriefFindings(audit, []);

  assert.deepEqual(
    picked.map((f) => f.finding_id),
    ['f1', 'f3'],
  );
});

test('empty ids and no default_selected falls back to all findings', () => {
  const audit = auditWith([finding('f1', 'c1', false), finding('f2', 'c2', false), finding('f3', 'c3', false)]);

  const picked = selectBriefFindings(audit, []);

  assert.equal(picked.length, 3);
});

test('caps the result at 5 findings even when all 8 are selected', () => {
  const findings = Array.from({ length: 8 }, (_, i) => finding(`f${i + 1}`, `c${i + 1}`, true));
  const audit = auditWith(findings);

  const byIds = selectBriefFindings(
    audit,
    findings.map((f) => f.clause_id),
  );
  const byDefault = selectBriefFindings(audit, []);

  assert.equal(byIds.length, 5);
  assert.equal(byDefault.length, 5);
  assert.deepEqual(
    byIds.map((f) => f.finding_id),
    ['f1', 'f2', 'f3', 'f4', 'f5'],
  );
});

test('unknown ids do NOT produce an empty brief — they fall back to default_selected, then to all', () => {
  const withDefaults = auditWith([finding('f1', 'c1', true), finding('f2', 'c2', false)]);
  assert.deepEqual(
    selectBriefFindings(withDefaults, ['does-not-exist']).map((f) => f.finding_id),
    ['f1'],
  );

  const noDefaults = auditWith([finding('f1', 'c1', false), finding('f2', 'c2', false)]);
  assert.deepEqual(
    selectBriefFindings(noDefaults, ['does-not-exist']).map((f) => f.finding_id),
    ['f1', 'f2'],
  );
});

test('an audit with zero findings yields an empty list', () => {
  assert.deepEqual(selectBriefFindings(auditWith([]), ['c1']), []);
  assert.deepEqual(selectBriefFindings(auditWith([]), []), []);
});
