import type { AuditFinding } from '../types/contract';

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeTokens(a));
  const tokensB = new Set(normalizeTokens(b));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface QuoteVerification {
  status: 'verified' | 'dropped';
  char_start: number;
  char_end: number;
  jaccard: number;
}

const JACCARD_THRESHOLD = 0.8;

export function verifyQuoteAgainstText(quote: string, contractText: string): QuoteVerification {
  const cleanQuote = quote.trim();
  if (!cleanQuote || !contractText) {
    return { status: 'dropped', char_start: -1, char_end: -1, jaccard: 0 };
  }

  // 1. Exact substring match (case-insensitive)
  const lowerContract = contractText.toLowerCase();
  const lowerQuote = cleanQuote.toLowerCase();
  const exactIdx = lowerContract.indexOf(lowerQuote);
  if (exactIdx !== -1) {
    return {
      status: 'verified',
      char_start: exactIdx,
      char_end: exactIdx + cleanQuote.length,
      jaccard: 1.0,
    };
  }

  // 2. Sliding window token Jaccard >= JACCARD_THRESHOLD (0.80)
  const quoteTokens = normalizeTokens(cleanQuote);
  if (quoteTokens.length < 3) {
    return { status: 'dropped', char_start: -1, char_end: -1, jaccard: 0 };
  }

  const lines = contractText.split(/(?<=[.?!\n])/);
  let bestScore = 0;
  let bestStart = -1;
  let bestEnd = -1;
  let cursor = 0;

  for (let i = 0; i < lines.length; i++) {
    const windowStr = lines.slice(i, i + 2).join(' ');
    const score = jaccardSimilarity(cleanQuote, windowStr);
    if (score > bestScore) {
      bestScore = score;
      bestStart = cursor;
      bestEnd = cursor + windowStr.length;
    }
    cursor += lines[i].length;
  }

  if (bestScore >= JACCARD_THRESHOLD) {
    return {
      status: 'verified',
      char_start: bestStart,
      char_end: bestEnd,
      jaccard: Number(bestScore.toFixed(2)),
    };
  }

  return {
    status: 'dropped',
    char_start: -1,
    char_end: -1,
    jaccard: Number(bestScore.toFixed(2)),
  };
}

/**
 * Dual-anchor verifier: drops any finding whose verbatim_quote fails >= 0.80 verification,
 * is missing or under 3 tokens, or (when allowedRuleIds is provided) whose rule_id is
 * absent, empty, or not in the active rule pack's allowed set.
 */
export function filterVerifiedFindings(
  findings: AuditFinding[],
  contractText: string,
  allowedRuleIds?: Set<string>,
): { verified: AuditFinding[]; droppedCount: number } {
  const verified: AuditFinding[] = [];
  let droppedCount = 0;

  for (const f of findings) {
    // Fail-closed rule anchor: with an allow-list present, a finding must carry a
    // non-empty rule_id inside that set. Missing rule_ref/rule_id is not a pass.
    if (allowedRuleIds) {
      const ruleId = f.rule_ref?.rule_id;
      if (typeof ruleId !== 'string' || ruleId.trim() === '' || !allowedRuleIds.has(ruleId)) {
        droppedCount++;
        continue;
      }
    }

    if (typeof f.verbatim_quote !== 'string') {
      droppedCount++;
      continue;
    }

    // Quotes under 3 tokens are too generic to anchor a finding. verifyQuoteAgainstText
    // only applies this floor on the Jaccard path, so enforce it here too: a 1-2 token
    // quote would otherwise pass via the exact-substring shortcut.
    if (normalizeTokens(f.verbatim_quote).length < 3) {
      droppedCount++;
      continue;
    }

    const v = verifyQuoteAgainstText(f.verbatim_quote, contractText);
    if (v.status === 'verified') {
      verified.push({
        ...f,
        verification: v,
      });
    } else {
      droppedCount++;
    }
  }

  return { verified, droppedCount };
}
