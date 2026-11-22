/**
 * Local vault persistence layer.
 *
 * The vault is 100% on-device (localStorage), so it shares a tiny budget with the
 * rest of the origin. Two hard rules:
 *   1. ~20KB per document, ~480KB total — documents that blow the budget are
 *      dropped from storage instead of blowing up the whole vault.
 *   2. Images and audio are *never* written to storage. `audit.original_photo_url`
 *      is a base64 data URL for the scanned page, and voice memos are recorded as
 *      data URLs; both would instantly exhaust the quota, so they are stripped
 *      here and re-derived in memory when needed.
 *
 * Every function is total: nothing here throws, and everything is safe to call in
 * a non-browser environment (SSR / node / test runners) where `localStorage` does
 * not exist.
 */

import type { VaultDocument } from '../types/contract';

export const VAULT_STORAGE_KEY = 'lawlens_vault_v1';
export const MAX_DOC_BYTES = 20 * 1024; // ~20KB per document
export const MAX_TOTAL_BYTES = 480 * 1024; // ~480KB total (localStorage-safe)

/** Replaces a base64 blob or an oversized text field in the persisted copy. */
export const OMITTED_FIELD_MARKER = '[omitted: image or oversized field]';

/** Any string longer than this is treated as an embedded blob and dropped. */
const MAX_FIELD_CHARS = 8000;

/** URL schemes that always mean "binary payload" (never persisted). */
const VOLATILE_URL_PREFIXES = ['data:', 'blob:'];

/**
 * Keys that hold binary payloads and are removed outright, regardless of value
 * shape (a truncated base64 blob is indistinguishable from text, so we go by key).
 * Deliberately narrow: `voiceMemoLabel`, `voiceMemoDuration` and
 * `summary.audio_duration_label` are plain metadata and must survive.
 */
const DROP_KEY_PATTERNS: RegExp[] = [
  /^original_photo_url$/i,
  /(?:photo|image|capture|thumbnail|screenshot).*(?:base64|blob|buffer|bytes|payload|dataUrl)/i,
  /(?:audio|voice_?memo|voiceMemo).*(?:base64|blob|buffer|bytes|payload|content|data)/i,
  /^(?:raw_?)?(?:audio|voice_?memo)(?:Url|Src|Blob|Buffer|Bytes|Base64|Data|Content|Payload)$/i,
];

/** Minimal structural view of localStorage so tests can inject a shim. */
interface VaultStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistReport {
  persisted: VaultDocument[];
  dropped: Array<{ id: string; reason: 'too_large' | 'total_cap' }>;
  totalBytes: number;
  usedStorage: boolean;
}

function isDroppedKey(key: string): boolean {
  return DROP_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isVolatileString(value: string): boolean {
  if (value.length > MAX_FIELD_CHARS) return true;
  const lower = value.slice(0, 8).toLowerCase();
  return VOLATILE_URL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Deep-clone + scrub. `seen` collapses repeated/cyclic references to null so the
 * clone is always JSON-serializable (documents built from parsed API payloads are
 * plain trees, so this never fires in practice).
 */
function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return isVolatileString(value) ? OMITTED_FIELD_MARKER : value;
  }
  if (value === null) return null;

  const kind = typeof value;
  if (kind === 'number' || kind === 'boolean') return value;
  if (kind !== 'object') return undefined; // functions / symbols / bigints are not serializable

  if (seen.has(value as object)) return null;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((entry) => {
      const scrubbed = scrubValue(entry, seen);
      return scrubbed === undefined ? null : scrubbed;
    });
  }

  const source = value as Record<string, unknown>;
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (isDroppedKey(key)) continue;
    const scrubbed = scrubValue(source[key], seen);
    if (scrubbed !== undefined) clone[key] = scrubbed;
  }
  return clone;
}

/** Strip heavy/binary fields before persisting: never store images or audio. */
export function stripVolatileFields(doc: VaultDocument): VaultDocument {
  return scrubValue(doc, new WeakSet<object>()) as VaultDocument;
}

/** UTF-8 byte length of a string (TextEncoder when available, else char length). */
function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

/** Approximate serialized byte size of a doc after stripping. */
export function estimateDocBytes(doc: VaultDocument): number {
  try {
    const json = JSON.stringify(stripVolatileFields(doc));
    if (typeof json !== 'string') return 0;
    return utf8ByteLength(json);
  } catch {
    return 0;
  }
}

function getStorage(): VaultStorageLike | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const storage = (globalThis as { localStorage?: VaultStorageLike }).localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    return storage;
  } catch {
    // Accessing localStorage can throw (disabled cookies, sandboxed iframe, SSR).
    return null;
  }
}

/**
 * Persist docs to localStorage. Strips volatile fields, enforces per-doc and
 * total caps (newest-first priority), and never throws — returns a report.
 *
 * Ordering: `docs` is treated as the caller's recency order (newest first), so
 * the head of the array wins the budget. Per-doc overflows are skipped and the
 * scan continues; once the *total* budget is exhausted no further doc is added
 * (the rest are reported as `total_cap`), keeping storage a strict prefix.
 *
 * If localStorage is unavailable or throws (quota), usedStorage=false and the
 * caller keeps its in-memory copy. The cap accounting is still reported so the
 * caller can show what would not survive a restart.
 */
export function persistVault(docs: VaultDocument[]): PersistReport {
  const persisted: VaultDocument[] = [];
  const dropped: Array<{ id: string; reason: 'too_large' | 'total_cap' }> = [];
  let totalBytes = 0;

  const source = Array.isArray(docs) ? docs : [];
  // Array order is the caller's recency order (newest first): earliest wins.
  let totalCapHit = false;
  for (const doc of source) {
    if (!doc || typeof doc !== 'object') continue;
    const id = typeof doc.id === 'string' ? doc.id : '';

    if (totalCapHit) {
      // Strict newest-first priority: once the budget is spent we stop adding.
      dropped.push({ id, reason: 'total_cap' });
      continue;
    }

    const size = estimateDocBytes(doc);
    if (size > MAX_DOC_BYTES) {
      dropped.push({ id, reason: 'too_large' });
      continue;
    }
    if (totalBytes + size > MAX_TOTAL_BYTES) {
      dropped.push({ id, reason: 'total_cap' });
      totalCapHit = true;
      continue;
    }

    persisted.push(stripVolatileFields(doc));
    totalBytes += size;
  }

  const storage = getStorage();
  if (!storage) {
    // Nothing was written, but the caller still learns which docs survived the caps.
    return { persisted, dropped, totalBytes, usedStorage: false };
  }

  try {
    storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Quota exceeded / private mode / storage disabled: keep everything in memory.
    return { persisted, dropped, totalBytes, usedStorage: false };
  }

  return { persisted, dropped, totalBytes, usedStorage: true };
}

/** Load docs from localStorage; returns [] on any parse/storage error. */
export function loadVault(): VaultDocument[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is VaultDocument =>
        !!entry && typeof entry === 'object' && typeof (entry as VaultDocument).id === 'string',
    );
  } catch {
    return [];
  }
}

/** Clear the stored vault. Never throws. */
export function clearVaultStorage(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(VAULT_STORAGE_KEY);
  } catch {
    // Nothing we can do; the in-memory vault is still authoritative.
  }
}
