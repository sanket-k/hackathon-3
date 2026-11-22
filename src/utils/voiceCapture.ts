import type { LanguageCode } from '../types/contract';

/**
 * Hold-to-Ask voice capture controller.
 *
 * Wraps getUserMedia + MediaRecorder in a tiny promise-based handle so UI code can do:
 *
 *   const handle = await startVoiceCapture();      // mic opens, recording begins
 *   const audio = await handle.stop();             // { dataUrl, base64, mimeType, durationMs }
 *   handle.cleanup();                              // release the mic
 *
 * Anything that can go wrong (unsupported browser, insecure context, permission denied,
 * no microphone, recorder failure) is surfaced as a `VoiceCaptureError` whose `code` lets
 * the caller silently fall back to text / sample questions.
 */

/** Hard cap on a single capture. The server-side STT model also accepts <= 30s. */
export const MAX_VOICE_CAPTURE_MS = 30_000;

/** Anything shorter than this is treated as a tap, not a held question. */
export const MIN_VOICE_CAPTURE_MS = 500;

export type VoiceCaptureErrorCode =
  | 'unsupported'
  | 'insecure_context'
  | 'permission_denied'
  | 'no_device'
  | 'device_busy'
  | 'empty_audio'
  | 'recorder_error'
  | 'cancelled';

const ERROR_MESSAGES: Record<VoiceCaptureErrorCode, string> = {
  unsupported: 'This browser cannot record audio.',
  insecure_context: 'Microphone access requires HTTPS or localhost.',
  permission_denied: 'Microphone permission was denied.',
  no_device: 'No microphone was found on this device.',
  device_busy: 'The microphone is already in use by another app.',
  empty_audio: 'No audio was captured.',
  recorder_error: 'Recording failed.',
  cancelled: 'Voice capture was cancelled.',
};

export class VoiceCaptureError extends Error {
  readonly code: VoiceCaptureErrorCode;
  /** Callers should fall back to text / sample questions rather than retrying. */
  readonly fallbackRecommended = true;

  constructor(code: VoiceCaptureErrorCode, message?: string) {
    super(message || ERROR_MESSAGES[code]);
    this.name = 'VoiceCaptureError';
    this.code = code;
    // Keep `instanceof` working when down-levelled.
    Object.setPrototypeOf(this, VoiceCaptureError.prototype);
  }
}

export interface VoiceCaptureResult {
  /** `data:audio/webm;base64,...` — send as-is as `audio_base64` to /api/stt. */
  dataUrl: string;
  /** Same payload without the `data:` prefix. */
  base64: string;
  mimeType: string;
  durationMs: number;
  /** True when the recorder auto-stopped at the max-duration cap. */
  truncated: boolean;
}

export interface VoiceCaptureHandle {
  readonly isRecording: boolean;
  readonly elapsedMs: number;
  readonly mimeType: string;
  /** Stop recording and resolve with the audio. Safe to call more than once. */
  stop(): Promise<VoiceCaptureResult>;
  /** Abort and discard the recording (rejects the pending promise with `cancelled`). */
  cancel(): void;
  /** Stop the mic tracks and clear timers. Always call once you are done. */
  cleanup(): void;
}

export interface StartVoiceCaptureOptions {
  /** Defaults to / is clamped at MAX_VOICE_CAPTURE_MS (30s). */
  maxDurationMs?: number;
  /** Fired when the 30s cap stops the recording for you. */
  onAutoStop?: (result: VoiceCaptureResult) => void;
  /** Hint such as `audio/webm;codecs=opus`; otherwise the best supported codec wins. */
  mimeType?: string;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav',
];

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

export function isVoiceCaptureSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

function pickMimeType(explicit?: string): string {
  if (explicit) {
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(explicit)) {
      return explicit;
    }
  }
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

function stopStreamTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  });
}

function mapGetUserMediaError(error: unknown): VoiceCaptureError {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return new VoiceCaptureError('permission_denied');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new VoiceCaptureError('no_device');
    case 'NotReadableError':
    case 'TrackStartError':
      return new VoiceCaptureError('device_busy');
    default:
      return new VoiceCaptureError('recorder_error', 'Could not open the microphone.');
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new VoiceCaptureError('unsupported', 'This browser cannot encode recorded audio.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new VoiceCaptureError('recorder_error', 'Unable to encode the recording.'));
    };
    reader.onerror = () => reject(new VoiceCaptureError('recorder_error', 'Unable to read the recording.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Opens the mic and starts recording. Rejects with a `VoiceCaptureError` when the
 * browser cannot record or the user blocks the microphone.
 */
export async function startVoiceCapture(options: StartVoiceCaptureOptions = {}): Promise<VoiceCaptureHandle> {
  if (!isVoiceCaptureSupported()) {
    const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
    throw new VoiceCaptureError(insecure ? 'insecure_context' : 'unsupported');
  }

  const maxDurationMs = Math.min(Math.max(1_000, options.maxDurationMs ?? MAX_VOICE_CAPTURE_MS), MAX_VOICE_CAPTURE_MS);

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    throw mapGetUserMediaError(error);
  }

  const mimeType = pickMimeType(options.mimeType);

  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    stopStreamTracks(stream);
    throw new VoiceCaptureError('recorder_error', 'This audio input cannot be recorded.');
  }

  const startedAt = now();
  const chunks: Blob[] = [];
  let durationMs = 0;
  let truncated = false;
  let cancelled = false;
  let cleanedUp = false;
  let settled = false;
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

  let resolveResult!: (result: VoiceCaptureResult) => void;
  let rejectResult!: (error: unknown) => void;
  const resultPromise = new Promise<VoiceCaptureResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  // Never surface an unhandled rejection if the caller never awaits the promise.
  resultPromise.catch(() => undefined);

  const settleOk = (result: VoiceCaptureResult): void => {
    if (settled) return;
    settled = true;
    resolveResult(result);
  };

  const settleError = (error: unknown): void => {
    if (settled) return;
    settled = true;
    rejectResult(error);
  };

  const clearAutoStop = (): void => {
    if (autoStopTimer !== null) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }
  };

  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearAutoStop();
    stopStreamTracks(stream);
  };

  const requestStop = (): void => {
    if (recorder.state === 'inactive') return;
    try {
      recorder.stop();
    } catch {
      cleanup();
      settleError(new VoiceCaptureError('recorder_error'));
    }
  };

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  recorder.onerror = () => {
    cleanup();
    settleError(new VoiceCaptureError('recorder_error'));
  };

  recorder.onstop = () => {
    clearAutoStop();
    stopStreamTracks(stream);
    durationMs = Math.round(now() - startedAt);

    if (cancelled) {
      settleError(new VoiceCaptureError('cancelled'));
      return;
    }

    const resolvedType = mimeType || recorder.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: resolvedType });

    if (blob.size === 0) {
      settleError(new VoiceCaptureError('empty_audio'));
      return;
    }

    blobToDataUrl(blob)
      .then((dataUrl) => {
        const comma = dataUrl.indexOf(',');
        const result: VoiceCaptureResult = {
          dataUrl,
          base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
          mimeType: resolvedType,
          durationMs,
          truncated,
        };
        if (truncated) {
          try {
            options.onAutoStop?.(result);
          } catch {
            /* host callback must not break capture */
          }
        }
        settleOk(result);
      })
      .catch((error: unknown) => {
        settleError(error instanceof VoiceCaptureError ? error : new VoiceCaptureError('recorder_error'));
      });
  };

  try {
    // No timeslice: Safari/Chrome emit one complete blob on stop.
    recorder.start();
  } catch {
    cleanup();
    throw new VoiceCaptureError('recorder_error', 'Recording could not be started.');
  }

  autoStopTimer = setTimeout(() => {
    truncated = true;
    requestStop();
  }, maxDurationMs);

  return {
    get isRecording() {
      return recorder.state === 'recording';
    },
    get elapsedMs() {
      return Math.round(now() - startedAt);
    },
    get mimeType() {
      return mimeType || recorder.mimeType || 'audio/webm';
    },
    stop() {
      if (settled) return resultPromise;
      if (recorder.state === 'inactive') {
        cleanup();
        settleError(new VoiceCaptureError('empty_audio'));
        return resultPromise;
      }
      requestStop();
      return resultPromise;
    },
    cancel() {
      cancelled = true;
      settleError(new VoiceCaptureError('cancelled'));
      requestStop();
      cleanup();
    },
    cleanup,
  };
}

export interface TranscriptionOutcome {
  ok: boolean;
  transcript: string;
  detectedLanguage?: string;
  reason?: string;
}

/**
 * Sends a captured data URL to POST /api/stt.
 * Never throws — a `{ ok: false }` outcome means "fall back to text".
 */
export async function transcribeAudio(dataUrl: string, language: LanguageCode): Promise<TranscriptionOutcome> {
  if (!dataUrl) return { ok: false, transcript: '', reason: 'EMPTY_AUDIO' };

  try {
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_base64: dataUrl, language }),
    });

    if (!res.ok) return { ok: false, transcript: '', reason: `HTTP_${res.status}` };

    const data = (await res.json()) as {
      transcript?: string;
      detected_language?: string;
      fallback_recommended?: boolean;
      reason?: string;
    };

    const transcript = (data.transcript || '').trim();
    if (data.fallback_recommended || !transcript) {
      return {
        ok: false,
        transcript: '',
        detectedLanguage: data.detected_language,
        reason: data.reason || 'EMPTY_TRANSCRIPT',
      };
    }

    return { ok: true, transcript, detectedLanguage: data.detected_language };
  } catch {
    return { ok: false, transcript: '', reason: 'NETWORK_ERROR' };
  }
}
