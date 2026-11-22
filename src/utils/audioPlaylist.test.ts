import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClausePlaylist, playClausePlaylist } from './audioPlaylist';
import type { PlaylistItem } from './audioPlaylist';
import type { AuditFinding, LanguageCode } from '../types/contract';

function finding(id: string, clauseId: string, spoken: string): AuditFinding {
  return {
    finding_id: id,
    clause_id: clauseId,
    spoken_script: spoken,
    headline: `headline-${id}`,
  } as AuditFinding;
}

const LANGUAGE: LanguageCode = 'kn';

test('buildClausePlaylist: intro first, then findings in order with clause+finding ids', () => {
  const findings = [
    finding('f1', 'c1', 'First clause script.'),
    finding('f2', 'c2', 'Second clause script.'),
  ];

  const items = buildClausePlaylist('Walkthrough intro.', findings, LANGUAGE);

  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { kind: 'intro', text: 'Walkthrough intro.' });
  assert.deepEqual(items[1], {
    kind: 'clause',
    clauseId: 'c1',
    findingId: 'f1',
    text: 'First clause script.',
  });
  assert.deepEqual(items[2], {
    kind: 'clause',
    clauseId: 'c2',
    findingId: 'f2',
    text: 'Second clause script.',
  });
});

test('buildClausePlaylist: empty/absent intro is omitted', () => {
  const findings = [finding('f1', 'c1', 'Only clause.')];

  for (const intro of ['', '   ', '\n\t ']) {
    const items = buildClausePlaylist(intro, findings, LANGUAGE);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'clause');
  }

  assert.equal(buildClausePlaylist('', [], LANGUAGE).length, 0);
});

test('buildClausePlaylist: findings without spoken_script are skipped, order preserved', () => {
  const findings = [
    finding('f1', 'c1', ''),
    finding('f2', 'c2', 'Kept two.'),
    finding('f3', 'c3', '   '),
    finding('f4', 'c4', 'Kept four.'),
  ];

  const items = buildClausePlaylist('', findings, LANGUAGE);

  assert.deepEqual(
    items.map((i) => i.findingId),
    ['f2', 'f4'],
  );
  assert.deepEqual(
    items.map((i) => i.clauseId),
    ['c2', 'c4'],
  );
  assert.ok(items.every((i) => i.kind === 'clause' && i.text.trim().length > 0));
});

test('playClausePlaylist: invokes onItemStart/onItemEnd sequentially, then onComplete', async () => {
  const items: PlaylistItem[] = [
    { kind: 'intro', text: 'Intro.' },
    { kind: 'clause', clauseId: 'c1', findingId: 'f1', text: 'One.' },
    { kind: 'clause', clauseId: 'c2', findingId: 'f2', text: 'Two.' },
  ];

  const events: string[] = [];
  let inFlight = 0;

  const controller = playClausePlaylist(
    items,
    LANGUAGE,
    {
      onItemStart: (item, index) => {
        inFlight += 1;
        assert.equal(inFlight, 1, 'no two items may overlap');
        events.push(`start:${index}:${item.clauseId ?? item.kind}`);
      },
      onItemEnd: (item, index) => {
        inFlight -= 1;
        events.push(`end:${index}:${item.clauseId ?? item.kind}`);
      },
      onComplete: () => events.push('complete'),
    },
    async (text) => {
      events.push(`play:${text}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
    },
  );

  assert.equal(controller.playing, true);
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(events, [
    'start:0:intro',
    'play:Intro.',
    'end:0:intro',
    'start:1:c1',
    'play:One.',
    'end:1:c1',
    'start:2:c2',
    'play:Two.',
    'end:2:c2',
    'complete',
  ]);
  assert.equal(controller.playing, false);
});

test('playClausePlaylist: stop() halts advancement and never fires onComplete', async () => {
  const items: PlaylistItem[] = [
    { kind: 'clause', clauseId: 'c1', findingId: 'f1', text: 'One.' },
    { kind: 'clause', clauseId: 'c2', findingId: 'f2', text: 'Two.' },
    { kind: 'clause', clauseId: 'c3', findingId: 'f3', text: 'Three.' },
  ];

  const started: string[] = [];
  const ended: string[] = [];
  let completes = 0;
  let releaseFirst: () => void = () => {};

  const controller = playClausePlaylist(
    items,
    LANGUAGE,
    {
      onItemStart: (item) => started.push(item.clauseId ?? item.kind),
      onItemEnd: (item) => ended.push(item.clauseId ?? item.kind),
      onComplete: () => {
        completes += 1;
      },
    },
    () =>
      new Promise<void>((resolve) => {
        // First utterance hangs until the test releases it (simulating live audio).
        releaseFirst = resolve;
      }),
  );

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, ['c1']);
  assert.equal(controller.playing, true);

  controller.stop();
  assert.equal(controller.playing, false);

  // A late resolve/onEnd after stop() must not advance to c2.
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(started, ['c1']);
  assert.deepEqual(ended, []);
  assert.equal(completes, 0);

  // Repeated stop() is idempotent.
  controller.stop();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, ['c1']);
  assert.equal(completes, 0);
});

test('playClausePlaylist: a stop() inside onItemStart prevents the item from playing', async () => {
  const items: PlaylistItem[] = [
    { kind: 'clause', clauseId: 'c1', findingId: 'f1', text: 'One.' },
    { kind: 'clause', clauseId: 'c2', findingId: 'f2', text: 'Two.' },
  ];

  const played: string[] = [];
  let controller: { stop: () => void } | undefined;

  controller = playClausePlaylist(
    items,
    LANGUAGE,
    {
      onItemStart: () => controller?.stop(),
    },
    async (text) => {
      played.push(text);
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(played, []);
});

test('playClausePlaylist: empty playlist completes immediately', async () => {
  let completes = 0;
  const controller = playClausePlaylist(
    [],
    LANGUAGE,
    { onComplete: () => { completes += 1; } },
    async () => {},
  );

  assert.equal(controller.playing, false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(completes, 1);
});

test('playClausePlaylist: default player degrades to the speech fallback path', async () => {
  // No `window` in node, so audioSync's fallback resolves via its 1500ms timer.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;

  try {
    const fallbacks: string[] = [];
    const events: string[] = [];

    const controller = playClausePlaylist(
      [{ kind: 'clause', clauseId: 'c1', findingId: 'f1', text: 'Fallback path.' }],
      'en',
      {
        onItemStart: (item) => events.push(`start:${item.clauseId}`),
        onItemEnd: (item) => events.push(`end:${item.clauseId}`),
        onComplete: () => events.push('complete'),
        onFallback: (reason) => fallbacks.push(reason),
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 1800));

    assert.deepEqual(events, ['start:c1', 'end:c1', 'complete']);
    assert.equal(fallbacks.length, 1);
    assert.match(fallbacks[0], /local device voice/i);
    assert.equal(controller.playing, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
