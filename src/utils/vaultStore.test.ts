import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DOC_BYTES,
  MAX_TOTAL_BYTES,
  OMITTED_FIELD_MARKER,
  VAULT_STORAGE_KEY,
  clearVaultStorage,
  estimateDocBytes,
  loadVault,
  persistVault,
  stripVolatileFields,
} from './vaultStore';
import type { AuditResult, VaultDocument } from '../types/contract';

// ---------------------------------------------------------------------------
// Fake localStorage shim
// ---------------------------------------------------------------------------

interface FakeStorage {
  readonly store: Map<string, string>;
  /** When set, every operation throws (private mode / disabled storage). */
  throwOn: 'never' | 'all' | 'setItem';
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

function createFakeStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    store,
    throwOn: 'never',
    getItem(key: string) {
      if (this.throwOn === 'all') throw new Error('storage disabled');
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      if (this.throwOn === 'all' || this.throwOn === 'setItem') throw new Error('QuotaExceededError');
      store.set(key, value);
    },
    removeItem(key: string) {
      if (this.throwOn === 'all') throw new Error('storage disabled');
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

let activeStorage: FakeStorage | null = null;

function installStorage(throwOn: FakeStorage['throwOn'] = 'never'): FakeStorage {
  const storage = createFakeStorage();
  storage.throwOn = throwOn;
  activeStorage = storage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

function uninstallStorage(): void {
  activeStorage = null;
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

function storedRaw(): string | null {
  return activeStorage ? activeStorage.store.get(VAULT_STORAGE_KEY) ?? null : null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A ~200KB fake JPEG/audio data URL — the exact shape that must never persist. */
function fakeDataUrl(mime: string, bytes: number): string {
  return `data:${mime};base64,${'A'.repeat(bytes)}`;
}

interface DocOptions {
  /** Total characters of bulk text, split into <8000-char note bodies. */
  bulkChars?: number;
  photoUrl?: string;
  audioBase64?: string;
}

function makeDoc(id: string, opts: DocOptions = {}): VaultDocument {
  const bulkChars = opts.bulkChars ?? 0;
  const notes = [];
  for (let written = 0; written < bulkChars; written += 7000) {
    const chunk = Math.min(7000, bulkChars - written);
    notes.push({
      id: `note-${id}-${written}`,
      createdAt: 'Just now',
      tag: 'Private Note',
      text: 'x'.repeat(chunk),
      encrypted: true,
    });
  }

  const audit = {
    id: `audit-${id}`,
    title: `Contract ${id}`,
    subtitle: 'Rental agreement',
    meta_badge: 'LANE A',
    category: 'rental',
    lane: 'A',
    clauses: [],
    findings: [],
    key_terms: [],
    missing_clauses: [],
    qa_presets: [],
    original_photo_url: opts.photoUrl,
    ...(opts.audioBase64 ? { audio_base64: opts.audioBase64 } : {}),
  } as unknown as AuditResult;

  return {
    id,
    customTag: `Tag ${id}`,
    scannedAt: 'Just now',
    statusLabel: 'Active Review',
    audit,
    notes,
    voiceMemoLabel: 'Memo 1',
    voiceMemoDuration: '0:14',
  };
}

// ---------------------------------------------------------------------------
// stripVolatileFields
// ---------------------------------------------------------------------------

test('stripVolatileFields removes original_photo_url + data: strings without mutating input', () => {
  const photo = fakeDataUrl('image/jpeg', 5000);
  const doc = makeDoc('d1', { photoUrl: photo });
  doc.notes = [
    { id: 'n1', createdAt: 'Just now', tag: 'Private Note', text: 'Deposit is too high.', encrypted: true },
    { id: 'n2', createdAt: 'Just now', tag: 'Photo', text: fakeDataUrl('image/png', 4000), encrypted: true },
  ];

  const stripped = stripVolatileFields(doc);

  // Image field is gone entirely.
  assert.equal('original_photo_url' in stripped.audit, false);
  // data: URL in a nested note text is replaced by the marker.
  assert.equal(stripped.notes[1].text, OMITTED_FIELD_MARKER);
  // Normal content and audio *metadata* survive.
  assert.equal(stripped.notes[0].text, 'Deposit is too high.');
  assert.equal(stripped.voiceMemoLabel, 'Memo 1');
  assert.equal(stripped.voiceMemoDuration, '0:14');
  assert.equal(stripped.audit.title, 'Contract d1');

  // No mutation of the input tree.
  assert.equal(doc.audit.original_photo_url, photo);
  assert.equal(doc.notes[1].text, fakeDataUrl('image/png', 4000));

  // Deep clone: mutating the copy must not touch the original.
  stripped.customTag = 'Changed';
  assert.equal(doc.customTag, 'Tag d1');

  // The stripped copy is JSON-serializable and free of the blob.
  assert.equal(JSON.stringify(stripped).includes('data:image'), false);
});

test('stripVolatileFields truncates oversized (non-data:) strings to the marker', () => {
  const doc = makeDoc('d2');
  doc.notes = [
    { id: 'n1', createdAt: 'Just now', tag: 'Paste', text: 'y'.repeat(12000), encrypted: true },
    { id: 'n2', createdAt: 'Just now', tag: 'Short', text: 'z'.repeat(100), encrypted: true },
  ];

  const stripped = stripVolatileFields(doc);
  assert.equal(stripped.notes[0].text, OMITTED_FIELD_MARKER);
  assert.equal(stripped.notes[1].text, 'z'.repeat(100));
  assert.equal(doc.notes[0].text.length, 12000);
});

// ---------------------------------------------------------------------------
// estimateDocBytes
// ---------------------------------------------------------------------------

test('estimateDocBytes is positive and far smaller after stripping a big data URL', () => {
  const doc = makeDoc('d3', { photoUrl: fakeDataUrl('image/jpeg', 150_000) });

  // Raw on-the-wire size if we naively JSON.stringify'd the doc (image included).
  const naiveBytes = new TextEncoder().encode(JSON.stringify(doc)).length;
  const estimated = estimateDocBytes(doc);
  const strippedBytes = new TextEncoder().encode(JSON.stringify(stripVolatileFields(doc))).length;

  assert.ok(naiveBytes > 150_000, `expected the fixture to be >150KB raw, got ${naiveBytes}`);
  assert.ok(estimated > 0, 'estimate must stay positive');
  assert.equal(estimated, strippedBytes, 'estimate must measure the *stripped* doc');
  assert.ok(estimated < naiveBytes / 10, `${estimated} should be far smaller than ${naiveBytes}`);
  assert.ok(estimated < MAX_DOC_BYTES);
});

// ---------------------------------------------------------------------------
// persistVault — per-doc cap
// ---------------------------------------------------------------------------

test('persistVault drops an over-budget doc (too_large) and keeps the big-image doc without its image', () => {
  const storage = installStorage();

  const huge = makeDoc('huge', { bulkChars: 40_000 }); // ~40KB stripped ⇒ too large
  const imaged = makeDoc('imaged', { photoUrl: fakeDataUrl('image/jpeg', 120_000) }); // ~120KB raw, tiny stripped
  const small = makeDoc('small');

  const report = persistVault([huge, imaged, small]);

  assert.equal(report.usedStorage, true);
  assert.deepEqual(
    report.persisted.map((d) => d.id),
    ['imaged', 'small'],
  );
  assert.deepEqual(report.dropped, [{ id: 'huge', reason: 'too_large' }]);
  assert.ok(report.totalBytes > 0 && report.totalBytes <= MAX_TOTAL_BYTES);

  // The image doc was stored, but *without* the image payload.
  const raw = storedRaw();
  assert.ok(raw, 'expected the vault key to be written');
  assert.equal(raw.includes('data:image'), false);
  assert.equal(raw.includes('A'.repeat(1000)), false);

  const loaded = loadVault();
  assert.deepEqual(
    loaded.map((d) => d.id),
    ['imaged', 'small'],
  );
  assert.equal('original_photo_url' in loaded[0].audit, false);

  uninstallStorage();
  assert.equal(storage.store.size, 1);
});

// ---------------------------------------------------------------------------
// persistVault — total cap
// ---------------------------------------------------------------------------

test('persistVault enforces the total cap newest-first and reports total_cap', () => {
  installStorage();

  // Each doc is ~18.5KB stripped; ~480KB / 18.5KB ≈ 25 fit, the rest are skipped.
  const docs = Array.from({ length: 40 }, (_, i) => makeDoc(`cap-${i}`, { bulkChars: 18_000 }));
  for (const doc of docs) {
    const size = estimateDocBytes(doc);
    assert.ok(size <= MAX_DOC_BYTES, `fixture ${doc.id} must fit the per-doc cap (${size}B)`);
  }

  const report = persistVault(docs);

  assert.equal(report.usedStorage, true);
  assert.ok(report.persisted.length > 0 && report.persisted.length < docs.length);
  assert.ok(report.totalBytes <= MAX_TOTAL_BYTES);

  const capDropped = report.dropped.filter((d) => d.reason === 'total_cap');
  assert.ok(capDropped.length > 0, 'expected some docs dropped for the total cap');
  assert.equal(report.dropped.some((d) => d.reason === 'too_large'), false);

  // Newest-first: the prefix of the input is what survives, in order.
  assert.deepEqual(
    report.persisted.map((d) => d.id),
    docs.slice(0, report.persisted.length).map((d) => d.id),
  );
  // Every doc is accounted for exactly once.
  assert.equal(report.persisted.length + report.dropped.length, docs.length);

  uninstallStorage();
});

test('persistVault stops adding once the total cap is hit (strict newest-first prefix)', () => {
  installStorage();

  const docs = Array.from({ length: 40 }, (_, i) => makeDoc(`stop-${i}`, { bulkChars: 18_000 }));
  docs.push(makeDoc('tiny-late')); // would fit on its own, but arrives after the budget is spent

  const report = persistVault(docs);

  assert.equal(report.usedStorage, true);
  assert.equal(report.persisted.some((d) => d.id === 'tiny-late'), false);
  assert.deepEqual(
    report.dropped.find((d) => d.id === 'tiny-late'),
    { id: 'tiny-late', reason: 'total_cap' },
  );

  const lastPersistedIndex = docs.findIndex((d) => d.id === report.persisted.at(-1)?.id);
  const firstDroppedIndex = docs.findIndex((d) => d.id === report.dropped[0]?.id);
  assert.ok(lastPersistedIndex < firstDroppedIndex, 'persisted docs must form a prefix of the input');

  uninstallStorage();
});

// ---------------------------------------------------------------------------
// persistVault / loadVault — hostile storage
// ---------------------------------------------------------------------------

test('persistVault never throws and reports usedStorage=false when setItem throws (quota)', () => {
  installStorage('setItem');
  const report = persistVault([makeDoc('q1'), makeDoc('q2')]);
  assert.equal(report.usedStorage, false);
  assert.equal(storedRaw(), null);
  uninstallStorage();
});

test('loadVault returns [] when storage throws', () => {
  installStorage('all');
  assert.deepEqual(loadVault(), []);
  uninstallStorage();
});

test('loadVault returns [] for garbage or non-array payloads', () => {
  installStorage();
  const storage = activeStorage as FakeStorage;

  storage.store.set(VAULT_STORAGE_KEY, 'not json {');
  assert.deepEqual(loadVault(), []);

  storage.store.set(VAULT_STORAGE_KEY, '{"nope":true}');
  assert.deepEqual(loadVault(), []);

  storage.store.set(VAULT_STORAGE_KEY, 'null');
  assert.deepEqual(loadVault(), []);

  storage.store.set(VAULT_STORAGE_KEY, '[]');
  assert.deepEqual(loadVault(), []);

  uninstallStorage();
});

test('Vault helpers are safe with no localStorage at all (non-browser env)', () => {
  uninstallStorage();
  assert.deepEqual(loadVault(), []);
  assert.doesNotThrow(() => clearVaultStorage());
  const report = persistVault([makeDoc('ssr')]);
  assert.equal(report.usedStorage, false);
});

// ---------------------------------------------------------------------------
// clearVaultStorage
// ---------------------------------------------------------------------------

test('clearVaultStorage removes the vault key and never throws', () => {
  installStorage();
  persistVault([makeDoc('c1')]);
  assert.ok(storedRaw());

  clearVaultStorage();
  assert.equal(storedRaw(), null);
  assert.deepEqual(loadVault(), []);

  // Idempotent + safe when storage throws.
  clearVaultStorage();
  const storage = activeStorage as FakeStorage;
  storage.throwOn = 'all';
  assert.doesNotThrow(() => clearVaultStorage());

  uninstallStorage();
});

// ---------------------------------------------------------------------------
// Audio / base64 payloads are never persisted
// ---------------------------------------------------------------------------

test('audio content is never persisted, but the voice memo label is', () => {
  installStorage();

  const audioBlob = fakeDataUrl('audio/wav;base64', 90_000);
  const doc = makeDoc('voice', { audioBase64: audioBlob });
  doc.voiceMemoLabel = 'Deposit negotiation notes';
  doc.voiceMemoDuration = '0:42';

  const stripped = stripVolatileFields(doc);
  const serialized = JSON.stringify(stripped);
  assert.equal(serialized.includes('data:audio'), false);
  assert.equal(serialized.includes('base64'), false);
  assert.equal(serialized.includes('A'.repeat(1000)), false);
  assert.equal(stripped.voiceMemoLabel, 'Deposit negotiation notes');

  const report = persistVault([doc]);
  assert.equal(report.usedStorage, true);
  assert.equal(report.persisted.length, 1);

  const raw = storedRaw() as string;
  assert.equal(raw.includes('data:audio'), false);
  assert.equal(raw.includes('base64'), false);
  assert.equal(raw.includes('Deposit negotiation notes'), true);

  // Round-trip: the loaded doc still carries the label, not the audio.
  const [loaded] = loadVault();
  assert.equal(loaded.voiceMemoLabel, 'Deposit negotiation notes');
  assert.equal('audio_base64' in (loaded.audit as unknown as Record<string, unknown>), false);

  uninstallStorage();
});

test('persistVault writes nothing beyond the caps and is JSON round-trippable', () => {
  installStorage();
  const docs = [makeDoc('r1', { photoUrl: fakeDataUrl('image/jpeg', 60_000) }), makeDoc('r2')];
  const report = persistVault(docs);

  assert.equal(report.usedStorage, true);
  const raw = storedRaw() as string;
  const parsed = JSON.parse(raw) as VaultDocument[];
  assert.deepEqual(
    parsed.map((d) => d.id),
    ['r1', 'r2'],
  );
  // Report totalBytes is the sum of per-doc sizes, i.e. the raw payload minus
  // the JSON array brackets/commas — never more than what was handed to storage.
  const rawBytes = new TextEncoder().encode(raw).length;
  assert.ok(report.totalBytes <= rawBytes, `${report.totalBytes} <= ${rawBytes}`);
  assert.ok(report.totalBytes > rawBytes - 32, 'totalBytes should track the written payload');
  assert.ok(report.totalBytes <= MAX_TOTAL_BYTES);

  uninstallStorage();
});
