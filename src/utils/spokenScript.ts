/**
 * spoken_script rules enforcement for TTS payloads.
 *
 * Contract: native Indic script + English legal terms, 12-16 word sentences,
 * and absolutely no markdown, slashes or SSML markup reaching the voice layer.
 */

export interface SpokenScriptIssue {
  kind: string;
  detail: string;
}

const MAX_SENTENCE_WORDS = 16;
const MIN_SENTENCE_WORDS = 4;
const MIN_CHUNK_WORDS = 8;

/** Words that end with a period without terminating the sentence. */
const ABBREVIATIONS = new Set([
  'no',
  'nos',
  'sec',
  'sect',
  'art',
  'cl',
  'para',
  'reg',
  'rule',
  'mr',
  'mrs',
  'ms',
  'dr',
  'shri',
  'smt',
  'rs',
  'inr',
  'vs',
  'etc',
  'viz',
  'approx',
  'fig',
  'govt',
  'ltd',
  'pvt',
  'sr',
  'jr',
  'st',
  'e.g',
  'i.e',
  'eg',
  'ie',
]);

/** Conjunctions that make a safe sentence boundary when a sentence is too long. */
const CONJUNCTIONS = new Set([
  'and',
  'or',
  'but',
  'so',
  'because',
  'while',
  'whereas',
  'which',
  'that',
  'then',
  'however',
  'ಆದರೆ',
  'ಮತ್ತು',
  'ಹಾಗೂ',
  'ಏಕೆಂದರೆ',
  'और',
  'लेकिन',
  'एवं',
  'तथा',
  'क्योंकि',
  'ஆனால்',
  'மற்றும்',
  'அல்லது',
  'എന്നാൽ',
  'കൂടാതെ',
  'അല്ലെങ്കിൽ',
  'అయితే',
  'మరియు',
  'কিন্তু',
  'এবং',
]);

const SENTENCE_TERMINATORS = '.!?।';

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function countWords(text: string): number {
  return words(text).length;
}

function stripPunctuation(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function isAbbreviation(lastWord: string): boolean {
  const bare = lastWord.replace(/[.!?।]+$/, '').toLowerCase();
  if (!bare) return false;
  if (ABBREVIATIONS.has(bare)) return true;
  // Single-letter initials such as "A." in "A. Sharma"
  return /^[a-z]$/.test(bare);
}

/**
 * Split into sentences without breaking on abbreviations ("Sec. 12", "Rs. 500"),
 * keeping the terminator attached to the sentence it closes.
 */
function splitSentences(text: string): string[] {
  const rough = text.split(new RegExp(`(?<=[${SENTENCE_TERMINATORS}])\\s+`));
  const merged: string[] = [];
  for (const part of rough) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const previous = merged[merged.length - 1];
    const lastToken = previous?.match(/(\S+)$/)?.[1] ?? '';
    if (previous && isAbbreviation(lastToken)) {
      merged[merged.length - 1] = `${previous} ${trimmed}`;
    } else {
      merged.push(trimmed);
    }
  }
  return merged;
}

function ensureTerminator(sentence: string): string {
  const trimmed = sentence.trim().replace(/[,;:\-\u2013\u2014]+$/, '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?') || trimmed.endsWith('।')
    ? trimmed
    : `${trimmed}.`;
}

/** Re-chunk an over-long sentence at commas/conjunctions, never exceeding `max` words. */
function chunkLongSentence(sentence: string, max = MAX_SENTENCE_WORDS): string[] {
  const parts = sentence.split(/\s+/).filter(Boolean);
  if (parts.length <= max) return [sentence];

  const chunks: string[] = [];
  let start = 0;

  while (parts.length - start > max) {
    let breakAt = start + max;

    for (let k = start + max; k >= start + MIN_CHUNK_WORDS; k--) {
      const word = parts[k - 1];
      if (!word) break;
      if (/[,;:]$/.test(word) || CONJUNCTIONS.has(stripPunctuation(word).toLowerCase())) {
        breakAt = k;
        break;
      }
    }

    // Avoid orphaning a sub-minimum tail at the end of the sentence.
    const remaining = parts.length - breakAt;
    if (remaining > 0 && remaining < MIN_SENTENCE_WORDS && parts.length - start >= MIN_CHUNK_WORDS) {
      breakAt = Math.max(start + MIN_SENTENCE_WORDS, parts.length - MIN_SENTENCE_WORDS);
    }

    chunks.push(parts.slice(start, breakAt).join(' '));
    start = breakAt;
  }

  chunks.push(parts.slice(start).join(' '));
  return chunks;
}

/** Fold fragments shorter than the minimum sentence length into a neighbour. */
function mergeShortSentences(sentences: string[], min = MIN_SENTENCE_WORDS, max = MAX_SENTENCE_WORDS): string[] {
  const out: string[] = [];
  for (const sentence of sentences) {
    const previous = out[out.length - 1];
    if (
      previous &&
      countWords(sentence) < min &&
      countWords(previous) + countWords(sentence) <= max
    ) {
      out[out.length - 1] = `${previous.replace(/[.!?\u0964]+$/, '')}, ${sentence}`;
      continue;
    }
    out.push(sentence);
  }
  return out;
}

/**
 * Convert arbitrary text (often markdown or SSML-laced model output) into clean,
 * TTS-ready prose: no markup, no slashes, sentences capped at 16 words.
 */
export function sanitizeSpokenScript(text: string): string {
  if (!text) return '';

  let clean = String(text).replace(/\r\n?/g, '\n');

  // 1. SSML / HTML tags (including <speak>, <break .../>, <emphasis>, stray markup)
  clean = clean.replace(/<[^>\n]*>/g, ' ');

  // 2. Markdown links/images -> label text, and bare autolinks stay readable
  clean = clean.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  clean = clean.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  clean = clean.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');

  // 3. Code fences, inline code, emphasis, strikethrough, heading and quote markers
  clean = clean.replace(/```[a-zA-Z0-9]*/g, ' ');
  clean = clean.replace(/`/g, '');
  clean = clean.replace(/\*\*|__|~~/g, '');
  clean = clean.replace(/[*_]/g, '');
  clean = clean.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  clean = clean.replace(/^[ \t]{0,3}>[ \t]?/gm, '');

  // 4. List bullets and ordered-list markers at line starts
  clean = clean.replace(/^[ \t]{0,3}(?:[-+*\u2022\u25E6\u2023\u00B7]|\d{1,3}[.)])[ \t]+/gm, '');

  // 5. Slashes (and markdown escapes) become word boundaries
  clean = clean.replace(/[\\/]+/g, ' ');

  // 6. Excessive / decorative punctuation
  clean = clean.replace(/\u2026/g, '.');
  clean = clean.replace(/[\u2013\u2014]/g, ',');
  clean = clean.replace(/([!?.,;:\u0964])\1+/g, '$1');
  clean = clean.replace(/[!?]{2,}/g, '?');
  clean = clean.replace(/([.,;:])(?:\s*[.,;:])+/g, '$1');
  clean = clean.replace(/[ \t]+([,.!?;:\u0964])/g, '$1');
  clean = clean.replace(/,\s*,+/g, ',');

  // 7. Collapse whitespace into single spaces
  clean = clean.replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  // 8. Normalize sentence lengths (4-16 words) and rejoin as prose
  const sentences = mergeShortSentences(
    splitSentences(clean)
      .flatMap((sentence) => chunkLongSentence(sentence))
      .map((sentence) => ensureTerminator(sentence))
      .filter((sentence) => sentence.length > 0),
  );

  return sentences.join(' ');
}

/**
 * Rule check for a spoken_script payload. Run this on the raw script; `sanitizeSpokenScript`
 * is the repair path for anything flagged here.
 */
export function validateSpokenScript(text: string): {
  ok: boolean;
  issues: SpokenScriptIssue[];
  wordCount: number;
} {
  const issues: SpokenScriptIssue[] = [];
  const raw = typeof text === 'string' ? text : '';

  if (!raw.trim()) {
    return { ok: false, issues: [{ kind: 'empty', detail: 'Spoken script is empty' }], wordCount: 0 };
  }

  // Markdown: bold/italic/code, headings, blockquote, links, list bullets
  if (/\*\*|__|~~|`|^\s{0,3}#{1,6}\s/m.test(raw)) {
    issues.push({ kind: 'markdown', detail: 'Contains markdown emphasis, code or heading markers' });
  }
  if (/^\s{0,3}>\s?/m.test(raw)) {
    issues.push({ kind: 'markdown', detail: 'Contains a markdown blockquote marker' });
  }
  if (/\[[^\]]*\]\([^)]*\)/.test(raw)) {
    issues.push({ kind: 'markdown', detail: 'Contains a markdown link' });
  }
  if (/^\s{0,3}(?:[-+*\u2022\u25E6\u2023\u00B7]|\d{1,3}[.)])\s+/m.test(raw)) {
    issues.push({ kind: 'markdown', detail: 'Contains a list bullet or numbered list marker' });
  }

  // Slashes
  if (/[\\/]/.test(raw)) {
    issues.push({ kind: 'slash', detail: 'Contains a slash or backslash, which TTS reads literally' });
  }

  // SSML / inline tags
  const tagMatch = raw.match(/<[^>\n]*>/);
  if (tagMatch) {
    issues.push({ kind: 'ssml', detail: `Contains markup tag "${tagMatch[0]}"` });
  }

  // Sentence lengths
  const sentences = splitSentences(raw.replace(/\s+/g, ' ').trim());
  sentences.forEach((sentence, index) => {
    const count = countWords(sentence);
    if (count > MAX_SENTENCE_WORDS) {
      issues.push({
        kind: 'sentence_too_long',
        detail: `Sentence ${index + 1} has ${count} words (max ${MAX_SENTENCE_WORDS})`,
      });
    } else if (count > 0 && count < MIN_SENTENCE_WORDS) {
      issues.push({
        kind: 'sentence_too_short',
        detail: `Sentence ${index + 1} has ${count} words (min ${MIN_SENTENCE_WORDS})`,
      });
    }
  });

  return { ok: issues.length === 0, issues, wordCount: countWords(raw) };
}
