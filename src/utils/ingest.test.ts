/**
 * Tests for the ingestion engine's PURE surface only.
 *
 * Deliberately avoids every canvas / Image / createImageBitmap path: Node has no
 * DOM, so `compressImageAndCheckBlur`, `blackoutHeaderRegion`,
 * `extractPdfTextLocally` and `prepareImagesForUpload` are exercised through
 * their pure helpers (`blurVerdictFor`, `shouldBlockBlurry`, the stats
 * builders) instead of being invoked directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blurVerdictFor,
  shouldBlockBlurry,
  buildLaneAStats,
  buildLaneBStats,
  SHARP_BLUR_THRESHOLD,
  SOFT_BLUR_THRESHOLD,
  type ImagePrepResult,
  type LaneADecision,
} from './ingest';

/** Fixture for a prepared photo; overridable so each test states what it needs. */
function makePrep(overrides: Partial<ImagePrepResult> = {}): ImagePrepResult {
  const blurScore = overrides.blurScore ?? 120;
  const verdict = overrides.verdict ?? blurVerdictFor(blurScore);
  return {
    dataUrl: 'data:image/jpeg;base64,AAAA',
    originalBytes: 4_000_000,
    compressedBytes: 420_000,
    width: 1500,
    height: 1125,
    blurScore,
    isSharp: blurScore >= SOFT_BLUR_THRESHOLD,
    verdict,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<LaneADecision> = {}): LaneADecision {
  return {
    lane: 'A',
    reason: 'vector text layer found — 412 words over 3 pages',
    isScannableVector: true,
    pageCount: 3,
    wordCount: 412,
    extractedText: '--- Page 1 ---\nRENTAL AGREEMENT',
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* blurVerdictFor thresholds                                                  */
/* -------------------------------------------------------------------------- */

test('blurVerdictFor: >= 90 is Sharp & Legible', () => {
  assert.equal(blurVerdictFor(90), 'Sharp & Legible');
  assert.equal(blurVerdictFor(91), 'Sharp & Legible');
  assert.equal(blurVerdictFor(250), 'Sharp & Legible');
  assert.equal(blurVerdictFor(Number.MAX_SAFE_INTEGER), 'Sharp & Legible');
});

test('blurVerdictFor: 45-89 is Slightly Soft', () => {
  assert.equal(blurVerdictFor(89), 'Slightly Soft');
  assert.equal(blurVerdictFor(60), 'Slightly Soft');
  assert.equal(blurVerdictFor(45), 'Slightly Soft');
});

test('blurVerdictFor: below 45 is Blurry — Retake Suggested', () => {
  assert.equal(blurVerdictFor(44), 'Blurry — Retake Suggested');
  assert.equal(blurVerdictFor(1), 'Blurry — Retake Suggested');
  assert.equal(blurVerdictFor(0), 'Blurry — Retake Suggested');
  assert.equal(blurVerdictFor(-10), 'Blurry — Retake Suggested');
});

test('blurVerdictFor: thresholds are the documented boundary constants', () => {
  assert.equal(SHARP_BLUR_THRESHOLD, 90);
  assert.equal(SOFT_BLUR_THRESHOLD, 45);
  assert.equal(blurVerdictFor(SHARP_BLUR_THRESHOLD), 'Sharp & Legible');
  assert.equal(blurVerdictFor(SHARP_BLUR_THRESHOLD - 1), 'Slightly Soft');
  assert.equal(blurVerdictFor(SOFT_BLUR_THRESHOLD), 'Slightly Soft');
  assert.equal(blurVerdictFor(SOFT_BLUR_THRESHOLD - 1), 'Blurry — Retake Suggested');
});

test('blurVerdictFor: non-finite scores fail closed to Blurry (never claims sharp)', () => {
  assert.equal(blurVerdictFor(Number.NaN), 'Blurry — Retake Suggested');
  assert.equal(blurVerdictFor(Number.POSITIVE_INFINITY), 'Blurry — Retake Suggested');
  assert.equal(blurVerdictFor(Number.NEGATIVE_INFINITY), 'Blurry — Retake Suggested');
});

test('blurVerdictFor: every score maps to exactly one of the three verdicts', () => {
  const allowed = new Set(['Sharp & Legible', 'Slightly Soft', 'Blurry — Retake Suggested']);
  for (let score = 0; score <= 200; score += 1) {
    assert.ok(allowed.has(blurVerdictFor(score)), `unexpected verdict at score ${score}`);
  }
});

/* -------------------------------------------------------------------------- */
/* shouldBlockBlurry                                                          */
/* -------------------------------------------------------------------------- */

test('shouldBlockBlurry: blocks only genuinely blurry captures', () => {
  assert.equal(shouldBlockBlurry(makePrep({ blurScore: 12, verdict: 'Blurry — Retake Suggested' })), true);
  assert.equal(shouldBlockBlurry(makePrep({ blurScore: 44, verdict: 'Blurry — Retake Suggested' })), true);
});

test('shouldBlockBlurry: lets Sharp and Slightly Soft through', () => {
  assert.equal(shouldBlockBlurry(makePrep({ blurScore: 150, verdict: 'Sharp & Legible' })), false);
  assert.equal(shouldBlockBlurry(makePrep({ blurScore: 60, verdict: 'Slightly Soft' })), false);
});

test('shouldBlockBlurry: verdict is authoritative, not isSharp', () => {
  // A caller that mis-set isSharp must not change the gate decision.
  assert.equal(shouldBlockBlurry(makePrep({ blurScore: 10, isSharp: true, verdict: 'Blurry — Retake Suggested' })), true);
  assert.equal(shouldBlockBlurry(makePrep({ blurScore: 200, isSharp: false, verdict: 'Sharp & Legible' })), false);
});

test('shouldBlockBlurry: matches blurVerdictFor across the score range', () => {
  for (let score = 0; score <= 150; score += 5) {
    const prep = makePrep({ blurScore: score, verdict: blurVerdictFor(score) });
    assert.equal(shouldBlockBlurry(prep), score < SOFT_BLUR_THRESHOLD, `gate wrong at score ${score}`);
  }
});

/* -------------------------------------------------------------------------- */
/* buildLaneBStats                                                            */
/* -------------------------------------------------------------------------- */

test('buildLaneBStats: carries real measured blur numbers for the photo lane', () => {
  const prep = makePrep({ blurScore: 63, verdict: 'Slightly Soft', isSharp: true });
  const stats = buildLaneBStats(prep, {});

  assert.equal(stats.lane, 'B');
  assert.equal(stats.blurScore, 63);
  assert.equal(stats.blurVerdict, 'Slightly Soft');
  assert.equal(stats.isSharp, true);
  assert.equal(stats.piiCountsByType && typeof stats.piiCountsByType, 'object');
  assert.equal(stats.piiTotalMasked, 0);
  // Lane A-only fields must not be invented for a photo.
  assert.equal(stats.pageCount, undefined);
  assert.equal(stats.wordCount, undefined);
});

test('buildLaneBStats: sums PII counts into piiTotalMasked', () => {
  const counts = { AADHAAR: 2, PAN: 1, PHONE: 3 };
  const stats = buildLaneBStats(makePrep({ blurScore: 130 }), counts);

  assert.deepEqual(stats.piiCountsByType, counts);
  assert.equal(stats.piiTotalMasked, 6);
  assert.equal(stats.blurVerdict, 'Sharp & Legible');
});

test('buildLaneBStats: does not alias the caller-supplied counts object', () => {
  const counts: Record<string, number> = { AADHAAR: 1 };
  const stats = buildLaneBStats(makePrep(), counts);
  counts.AADHAAR = 99;
  assert.equal(stats.piiCountsByType.AADHAAR, 1);
  assert.equal(stats.piiTotalMasked, 1);
});

test('buildLaneBStats: tolerates missing/odd count values', () => {
  // Runtime callers may pass a partially-populated record.
  const stats = buildLaneBStats(makePrep(), { AADHAAR: Number.NaN, PAN: 2 } as Record<string, number>);
  assert.equal(stats.piiTotalMasked, 2);
  assert.equal(stats.piiCountsByType.PAN, 2);
});

/* -------------------------------------------------------------------------- */
/* buildLaneAStats                                                            */
/* -------------------------------------------------------------------------- */

test('buildLaneAStats: carries real page and word counts for the vector lane', () => {
  const decision = makeDecision({ pageCount: 7, wordCount: 1320 });
  const stats = buildLaneAStats(decision, { PAN: 1, AADHAAR: 1 });

  assert.equal(stats.lane, 'A');
  assert.equal(stats.pageCount, 7);
  assert.equal(stats.wordCount, 1320);
  assert.deepEqual(stats.piiCountsByType, { PAN: 1, AADHAAR: 1 });
  assert.equal(stats.piiTotalMasked, 2);
  // Lane B-only fields must be absent, not zeroed into a false "blurry" reading.
  assert.equal(stats.blurVerdict, undefined);
  assert.equal(stats.blurScore, undefined);
  assert.equal(stats.isSharp, undefined);
});

test('buildLaneAStats: preserves a Lane B routing decision verbatim', () => {
  const decision = makeDecision({
    lane: 'B',
    reason: 'scanned or image-only PDF — route to photo pipeline',
    isScannableVector: false,
    pageCount: 0,
    wordCount: 0,
    extractedText: '',
  });
  const stats = buildLaneAStats(decision, {});

  assert.equal(stats.lane, 'B');
  assert.equal(stats.pageCount, 0);
  assert.equal(stats.wordCount, 0);
  assert.equal(stats.piiTotalMasked, 0);
});

test('buildLaneAStats: does not alias the caller-supplied counts object', () => {
  const counts: Record<string, number> = { PAN: 2 };
  const stats = buildLaneAStats(makeDecision(), counts);
  counts.PAN = 50;
  assert.equal(stats.piiCountsByType.PAN, 2);
  assert.equal(stats.piiTotalMasked, 2);
});

test('stats builders: both produce every required IntakeStats field', () => {
  const a = buildLaneAStats(makeDecision(), { PAN: 1 });
  const b = buildLaneBStats(makePrep({ blurScore: 150 }), { PHONE: 1 });

  for (const stats of [a, b]) {
    assert.ok(stats.lane === 'A' || stats.lane === 'B');
    assert.equal(typeof stats.piiCountsByType, 'object');
    assert.equal(typeof stats.piiTotalMasked, 'number');
    assert.ok(Number.isFinite(stats.piiTotalMasked));
    assert.ok(!('packDisplayName' in stats), 'pack info belongs to the caller, not the builder');
  }
});
