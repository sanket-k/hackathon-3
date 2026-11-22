export interface MaskedTokenEntry {
  token: string;
  type: 'AADHAAR' | 'PAN' | 'PHONE' | 'EMAIL' | 'UPI_BANK' | 'PARTY_NAME';
  rawValue: string;
}

export interface PiiMaskResult {
  maskedText: string;
  tokens: MaskedTokenEntry[];
  countsByType: Record<string, number>;
  totalMasked: number;
}

function shortHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 4);
}

const PROTECTED_LOCATIONS = new Set([
  'bengaluru',
  'bangalore',
  'karnataka',
  'indiranagar',
  'koramangala',
  'whitefield',
  'mysuru',
  'mumbai',
  'maharashtra',
  'delhi',
  'chennai',
  'tamil nadu',
  'hyderabad',
  'telangana',
  'india',
]);

export function maskIndianPII(rawText: string): PiiMaskResult {
  const tokens: MaskedTokenEntry[] = [];
  const countsByType: Record<string, number> = {};
  const valueToToken = new Map<string, string>();
  let seq = 1;

  const register = (type: MaskedTokenEntry['type'], rawValue: string): string => {
    const trimmed = rawValue.trim();
    if (!trimmed) return rawValue;
    if (PROTECTED_LOCATIONS.has(trimmed.toLowerCase())) {
      return rawValue;
    }
    const existing = valueToToken.get(trimmed);
    if (existing) return existing;

    const token = `__PII_${shortHex(trimmed)}_${type}_${seq++}__`;
    valueToToken.set(trimmed, token);
    tokens.push({ token, type, rawValue: trimmed });
    countsByType[type] = (countsByType[type] || 0) + 1;
    return token;
  };

  let text = rawText;

  // 1. Aadhaar: 12 digits starting 2-9 with optional spaces/dashes
  text = text.replace(/\b([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})\b/g, (m) => register('AADHAAR', m));

  // 2. PAN: 5 letters + 4 digits + 1 letter
  text = text.replace(/\b([A-Z]{5}\d{4}[A-Z])\b/g, (m) => register('PAN', m));

  // 3. Emails
  text = text.replace(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, (m) => register('EMAIL', m));

  // 4. Indian Mobile (+91 or 10-digit starting 6-9)
  text = text.replace(/(?:\+91[\s-]?)?\b([6-9]\d{4}[\s-]?\d{5})\b/g, (m) => register('PHONE', m));

  // 5. IFSC / Bank Account / UPI IDs
  text = text.replace(/\b([A-Z]{4}0[A-Z0-9]{6})\b/g, (m) => register('UPI_BANK', m));
  text = text.replace(/\b([a-zA-Z0-9._-]+@(?:okicici|okaxis|okhdfcbank|oksbi|ybl|paytm|upi|ibl))\b/gi, (m) =>
    register('UPI_BANK', m),
  );

  // 6. Party names adjacent to legal role headers (Lessor/Lessee/Landlord/Tenant/Borrower/Employee)
  text = text.replace(
    /\b((?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-zA-Z.]*){0,2})/g,
    (m) => register('PARTY_NAME', m),
  );

  text = text.replace(
    /\b(LESSOR|LESSEE|LANDLORD|TENANT|BORROWER|EMPLOYEE)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi,
    (_m, role: string, name: string) => `${role}: ${register('PARTY_NAME', name)}`,
  );

  return {
    maskedText: text,
    tokens,
    countsByType,
    totalMasked: tokens.length,
  };
}

/**
 * Layer 3 fail-closed guard: scans outbound payload for any known unmasked PII or raw Aadhaar/PAN patterns.
 * Re-redacts once if found; throws PII_LEAK if any sensitive token persists.
 */
export function assertNoPiiLeak(serializedOutbound: string, rawTokens: MaskedTokenEntry[]): string {
  let clean = serializedOutbound;
  for (const entry of rawTokens) {
    if (entry.rawValue.length >= 4 && clean.includes(entry.rawValue)) {
      clean = clean.split(entry.rawValue).join(entry.token);
    }
  }

  // Verify again after single re-redaction pass
  for (const entry of rawTokens) {
    if (entry.rawValue.length >= 4 && clean.includes(entry.rawValue)) {
      throw new Error(`PII_LEAK: Sensitive ${entry.type} persisted after fail-closed redaction`);
    }
  }

  // Also check raw Aadhaar or PAN regex in outbound text
  if (/\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/.test(clean) || /\b[A-Z]{5}\d{4}[A-Z]\b/.test(clean)) {
    throw new Error('PII_LEAK: Unmasked Aadhaar or PAN pattern detected in outbound payload');
  }

  return clean;
}

/**
 * Layer 4: Parse JSON first, then safely rehydrate tokens in memory without touching raw DOM.
 */
export function rehydrateParsedObject<T>(obj: T, tokens: MaskedTokenEntry[]): T {
  if (!tokens.length) return obj;
  const tokenMap = new Map(tokens.map((t) => [t.token, t.rawValue]));

  const walk = (val: unknown): unknown => {
    if (typeof val === 'string') {
      let out = val;
      for (const [tok, raw] of tokenMap.entries()) {
        if (out.includes(tok)) {
          out = out.split(tok).join(raw);
        }
      }
      return out;
    }
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === 'object') {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        next[k] = walk(v);
      }
      return next;
    }
    return val;
  };

  return walk(obj) as T;
}
