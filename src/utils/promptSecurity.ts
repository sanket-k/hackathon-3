/**
 * OWASP LLM01 Prompt Injection Hygiene & 4-stage JSON recovery
 */

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
    .replace(/<\/?(?:system|assistant|developer|override|instructions?)\b[^>]*>/gi, '[FILTERED_TAG]');

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

/**
 * 4-stage JSON parser for resilient LLM output recovery
 */
export function parseJSONFromLLMResponse<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  // Stage 1: Direct JSON.parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  // Stage 2: Extract fenced ```json ... ``` block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // Stage 3: Extract outermost { ... } or [ ... ]
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice) as T;
    } catch {
      // Stage 4: Clean trailing commas before } or ]
      const noTrailing = slice.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(noTrailing) as T;
    }
  }

  throw new Error('JSON_PARSE_FAILED: Could not recover valid JSON from LLM response');
}
