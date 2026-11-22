/**
 * OWASP LLM01 prompt injection hygiene & resilient JSON recovery.
 */

/** Version tag for the injection-defence policy; bump when the rules change. */
export const INJECTION_DEFENSE_VERSION = 'injectionDefense@1';

export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function sanitizeForPrompt(rawInput: string, maxLength = 45000): string {
  let cleaned = rawInput
    // Strip ASCII control chars except \n, \r, \t
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Neutralize fence breakout tags
    .replace(/<\/untrusted_contract_text\s*>/gi, '[CLOSED_UNTRUSTED_CONTRACT_TEXT]')
    .replace(/<untrusted_contract_text\s*>/gi, '[OPENED_UNTRUSTED_CONTRACT_TEXT]')
    // Strip role-override tags
    .replace(/<\/?(?:system|assistant|developer|override|instructions?)\b[^>]*>/gi, '[FILTERED_TAG]')
    // Neutralize common chat-template delimiters
    .replace(/<\|(?:im_start|im_end|endoftext)\|>/gi, '[FILTERED_TOKEN]')
    .replace(/\[\/?INST\]/gi, '[FILTERED_TOKEN]');

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + '\n[TRUNCATED_FOR_SAFETY]';
  }
  return cleaned;
}

export function wrapUntrustedContract(rawInput: string, maxLength = 45000): string {
  const safe = sanitizeForPrompt(rawInput, maxLength);
  return `<untrusted_contract_text>\n${safe}\n</untrusted_contract_text>`;
}

export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Try to parse a JSON candidate, cleaning trailing commas as a last resort. */
function tryParse<T>(candidate: string): T | undefined {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as T;
    } catch {
      return undefined;
    }
  }
}

/**
 * 4-stage JSON recovery for LLM output:
 *  1. direct parse
 *  2. fenced ```json block
 *  3. outermost {...} or [...] slice (object *or* array root)
 *  4. trailing-comma cleanup inside that slice
 */
export function parseJSONFromLLMResponse<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  const direct = tryParse<T>(trimmed);
  if (direct !== undefined) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const parsed = tryParse<T>(fenced[1].trim());
    if (parsed !== undefined) return parsed;
  }

  const firstObj = trimmed.indexOf('{');
  const lastObj = trimmed.lastIndexOf('}');
  const firstArr = trimmed.indexOf('[');
  const lastArr = trimmed.lastIndexOf(']');

  // Prefer whichever root delimiter opens first and closes after it.
  const candidates: Array<[number, number]> = [];
  if (firstObj !== -1 && lastObj > firstObj) candidates.push([firstObj, lastObj]);
  if (firstArr !== -1 && lastArr > firstArr) candidates.push([firstArr, lastArr]);
  candidates.sort((a, b) => a[0] - b[0]);

  for (const [start, end] of candidates) {
    const parsed = tryParse<T>(trimmed.slice(start, end + 1));
    if (parsed !== undefined) return parsed;
  }

  throw new Error('JSON_PARSE_FAILED: Could not recover valid JSON from LLM response');
}
