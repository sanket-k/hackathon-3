/**
 * Clause-level audio playlist for the walkthrough.
 *
 * Plays the audit's walkthrough intro, then each finding's `spoken_script` in findings
 * order — one item per *clause*, never word-level karaoke. The UI subscribes to
 * `onItemStart` to scroll to `clauseId`, pulse it (`clause-active-pulse`, DESIGN_SYSTEM
 * §6.1) and dim the other clauses to 55% for the duration of that item.
 *
 * Design notes:
 * - Ordering is driven by the speech layer's `onEnd` callback, never by setTimeout polling.
 * - Everything is cancellable: `stop()` flips a flag, calls `stopAllSpeech()` and unblocks
 *   the in-flight item so a late `onEnd` can never advance the queue.
 * - No DOM access at module scope: this file is importable from Node tests.
 */
import type { AuditFinding, LanguageCode } from '../types/contract';
import { playRegionalSpeech, stopAllSpeech } from './audioSync';

export interface PlaylistItem {
  kind: 'intro' | 'clause';
  clauseId?: string;
  findingId?: string;
  text: string;
}

export interface PlaylistCallbacks {
  /** Fired when an item starts. The UI should scroll to clauseId, pulse it, dim others. */
  onItemStart?: (item: PlaylistItem, index: number) => void;
  onItemEnd?: (item: PlaylistItem, index: number) => void;
  onComplete?: () => void;
  onFallback?: (reason: string) => void;
}

export interface PlaylistController {
  stop: () => void;
  readonly playing: boolean;
}

/**
 * Injectable utterance runner. Resolves when the utterance is finished (not merely
 * started). The default implementation bridges `playRegionalSpeech`'s `onEnd`.
 */
export type PlaylistPlayer = (text: string, language: LanguageCode) => Promise<void>;

/**
 * Build the ordered clause playlist: optional intro first, then one item per finding that
 * actually carries a `spoken_script` (findings without one are skipped, order preserved).
 */
export function buildClausePlaylist(
  introSpoken: string,
  findings: AuditFinding[],
  language: LanguageCode,
): PlaylistItem[] {
  // Reserved: localized item text is resolved by the speech layer today.
  void language;

  const items: PlaylistItem[] = [];

  const intro = typeof introSpoken === 'string' ? introSpoken : '';
  if (intro.trim()) {
    items.push({ kind: 'intro', text: intro });
  }

  for (const finding of findings ?? []) {
    if (!finding) continue;
    const script = typeof finding.spoken_script === 'string' ? finding.spoken_script : '';
    if (!script.trim()) continue;
    items.push({
      kind: 'clause',
      clauseId: finding.clause_id,
      findingId: finding.finding_id,
      text: script,
    });
  }

  return items;
}

/**
 * Default player: one `playRegionalSpeech` call per item, resolving on the speech layer's
 * `onEnd` (which already covers the browser-synthesis and silent-timeout fallbacks).
 */
function createSpeechPlayer(onFallback?: (reason: string) => void): PlaylistPlayer {
  return (text, language) =>
    new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const started = playRegionalSpeech(text, language, 1.0, {
        onEnd: settle,
        onFallback: (reason) => onFallback?.(reason),
      });

      // `playRegionalSpeech` resolves as soon as playback is kicked off; a rejection means
      // it never started, so settle to keep the queue moving instead of wedging forever.
      void Promise.resolve(started).catch(settle);
    });
}

/**
 * Plays items sequentially. Returns a controller with stop().
 *
 * @param player Optional injectable runner (tests). Defaults to `playRegionalSpeech`.
 */
export function playClausePlaylist(
  items: PlaylistItem[],
  language: LanguageCode,
  callbacks: PlaylistCallbacks = {},
  player?: PlaylistPlayer,
): PlaylistController {
  const queue = Array.isArray(items) ? items.slice() : [];
  const run = player ?? createSpeechPlayer(callbacks.onFallback);

  let cancelled = false;
  let playing = queue.length > 0;

  // Resolved by stop() so the in-flight await unblocks immediately instead of waiting for
  // an audio element that was just paused (and will never fire `ended`).
  let signalCancel: () => void = () => {};
  const cancelSignal = new Promise<void>((resolve) => {
    signalCancel = resolve;
  });

  const stop = (): void => {
    if (!cancelled) {
      cancelled = true;
      playing = false;
    }
    // Always force silence, even on a repeated stop().
    stopAllSpeech();
    signalCancel();
  };

  const runQueue = async (): Promise<void> => {
    for (let i = 0; i < queue.length; i += 1) {
      if (cancelled) return;
      const item = queue[i];

      callbacks.onItemStart?.(item, i);
      // A callback may stop the walkthrough synchronously.
      if (cancelled) return;

      try {
        await Promise.race([run(item.text, language).catch(() => undefined), cancelSignal]);
      } catch {
        // A failed utterance must not wedge the queue; fall through to onItemEnd.
      }
      if (cancelled) return;

      callbacks.onItemEnd?.(item, i);
      if (cancelled) return;
    }

    if (cancelled) return;
    playing = false;
    callbacks.onComplete?.();
  };

  // Defer the first tick so callers always receive the controller before any callback
  // fires — `onItemStart` can then safely call `controller.stop()`.
  queueMicrotask(() => {
    void runQueue();
  });

  return {
    stop,
    get playing() {
      return playing;
    },
  };
}
