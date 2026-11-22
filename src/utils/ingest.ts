/**
 * Client-side Dual-Lane Ingestion Engine:
 * - Lane A: Vector PDF extraction via pdfjs-dist (falls back to Lane B if scanned image PDF)
 * - Lane B: Canvas downscale to max 1500px color JPEG 0.80 (EXIF stripped) + 100ms blur check
 *
 * Everything here runs on-device: no upload happens until the caller decides to
 * (and header blackout, when requested, is applied before that upload).
 */

import type { IntakeStats } from '../types/ui';

export interface ImagePrepResult {
  dataUrl: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  blurScore: number;
  isSharp: boolean;
  verdict: 'Sharp & Legible' | 'Slightly Soft' | 'Blurry — Retake Suggested';
}

export interface PdfExtractResult {
  isScannableVector: boolean;
  pageCount: number;
  wordCount: number;
  extractedText: string;
}

/** Explicit lane routing decision for one picked file, safe to surface in the UI. */
export interface LaneADecision {
  lane: 'A' | 'B';
  reason: string;
  isScannableVector: boolean;
  pageCount: number;
  wordCount: number;
  extractedText: string;
}

/** Blur-score thresholds, in Laplacian-variance units from `computeSharpnessScore`. */
export const SHARP_BLUR_THRESHOLD = 90;
export const SOFT_BLUR_THRESHOLD = 45;

export const PHOTO_CHECK_DEMO_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBQEWhn92ZG0CX1BO4ZhSsVuuAZHoqEJyfq2NuM4B-85eQPBob5UQWmbgoxvbUYJTi-HAXyPCTI_7K6Rpnlm-xcjzt_DrUsU4InNNnQFtDrxvy0LsZrMwV_x0X9qwTs7qEOub2lmpJaTas9HHHHhPL487arB62SLHhYw1JRr6V-qNdMVeXKcD0kEV3imqa4p3bKq_ZVtV66jwoWb4WKQ_ErFxK5Xu188-pO8aHS6MM';

export const ORIGINAL_SCAN_DEMO_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAAYDWMFFs8hkg_39murQVLJSw-ZLbxjGhtlyYkumnc9B8fJf8q7f8Ud3nbfrE5dZhUFIVgNWnU8eodWTtM3hQewZCss9121WRH2LBcvELQaSUxDl_43XJ1TxZivZMuCC7tmwVgZ6BnN7NiKEOMwWWDtx-C338nFsNneS2ReKx9Npm9zbla-8gUGmsiKfmTxs_iJyZXzO7ov5ewe91zhDSQRte8cLa61xrQrUoWJ2E';

/**
 * Pure grayscale Laplacian variance approximation for client-side blur check (<100ms)
 */
export function computeSharpnessScore(rgba: Uint8ClampedArray, width: number, height: number): number {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  const lumaAt = (x: number, y: number): number => {
    const idx = (y * width + x) * 4;
    return 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
  };

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const lap =
        lumaAt(x - step, y) +
        lumaAt(x + step, y) +
        lumaAt(x, y - step) +
        lumaAt(x, y + step) -
        4 * lumaAt(x, y);
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return Math.round(sumSq / count - mean * mean);
}

/**
 * Maps a measured sharpness score to the user-facing verdict.
 *
 * Pure + deterministic so the thresholds can be unit-tested without a canvas:
 * - `>= 90` → 'Sharp & Legible'
 * - `45 … 89` → 'Slightly Soft' (still legible, so not blocked)
 * - `< 45` → 'Blurry — Retake Suggested'
 *
 * Observed at 1500px working resolution, this is how we tell the user the truth
 * instead of always claiming a crisp capture.
 */
export function blurVerdictFor(blurScore: number): ImagePrepResult['verdict'] {
  if (!Number.isFinite(blurScore)) return 'Blurry — Retake Suggested';
  if (blurScore >= SHARP_BLUR_THRESHOLD) return 'Sharp & Legible';
  if (blurScore >= SOFT_BLUR_THRESHOLD) return 'Slightly Soft';
  return 'Blurry — Retake Suggested';
}

/**
 * Fail-open gate: only a genuinely blurry capture should stop the pipeline.
 * 'Slightly Soft' is deliberately allowed through — it is still readable.
 */
export function shouldBlockBlurry(prep: ImagePrepResult): boolean {
  return prep.verdict === 'Blurry — Retake Suggested';
}

/**
 * Compress image to max 1500px color JPEG 0.80 (naturally strips EXIF metadata via Canvas re-encode).
 * Never binarizes or thresholds so ₹100 e-stamp patterns stay legible.
 */
export async function compressImageAndCheckBlur(file: File): Promise<ImagePrepResult> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1500;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imgData = ctx.getImageData(0, 0, width, height);
  const blurScore = computeSharpnessScore(imgData.data, width, height);
  const verdict = blurVerdictFor(blurScore);
  const isSharp = blurScore >= SOFT_BLUR_THRESHOLD;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const compressedBytes = Math.round(((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3) / 4);

  return {
    dataUrl,
    originalBytes: file.size,
    compressedBytes,
    width,
    height,
    blurScore,
    isSharp,
    verdict,
  };
}

/**
 * Lane A: Extracts vector text locally from PDF without uploading raw file.
 */
export async function extractPdfTextLocally(file: File): Promise<PdfExtractResult> {
  try {
    const pdfjs = await import('pdfjs-dist');
    const workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= Math.min(doc.numPages, 25); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) {
        pages.push(`--- Page ${i} ---\n${pageText}`);
      }
    }

    const extractedText = pages.join('\n\n');
    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
    return {
      isScannableVector: wordCount >= 30,
      pageCount: doc.numPages,
      wordCount,
      extractedText,
    };
  } catch {
    // Fallback heuristic if worker blocked in offline sandbox
    const raw = await file.text();
    const readable = raw.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = readable.split(/\s+/).filter(Boolean).length;
    return {
      isScannableVector: false,
      pageCount: 1,
      wordCount,
      extractedText: '',
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Lane routing                                                              */
/* -------------------------------------------------------------------------- */

/** Reason string surfaced when a PDF has no usable text layer. */
export const SCANNED_PDF_REASON = 'scanned or image-only PDF — route to photo pipeline';

/**
 * Decides which lane a picked PDF belongs to, using the *real* on-device
 * extraction result. Text is only ever returned when pdfjs actually produced
 * it — nothing is fabricated here (callers must not fill a Lane B result with
 * preset text and claim it came from the document).
 *
 * Extraction failures are reported as Lane B: that is the fail-safe route,
 * because the photo pipeline is what handles image-only/undecodable PDFs.
 */
export async function decidePdfLane(file: File): Promise<LaneADecision> {
  let result: PdfExtractResult;
  try {
    result = await extractPdfTextLocally(file);
  } catch {
    return {
      lane: 'B',
      reason: SCANNED_PDF_REASON,
      isScannableVector: false,
      pageCount: 0,
      wordCount: 0,
      extractedText: '',
    };
  }

  if (result.isScannableVector && result.extractedText.trim().length > 0) {
    return {
      lane: 'A',
      reason: `vector text layer found — ${result.wordCount} words over ${result.pageCount} page${
        result.pageCount === 1 ? '' : 's'
      }`,
      isScannableVector: true,
      pageCount: result.pageCount,
      wordCount: result.wordCount,
      extractedText: result.extractedText,
    };
  }

  return {
    lane: 'B',
    reason: SCANNED_PDF_REASON,
    isScannableVector: result.isScannableVector,
    pageCount: result.pageCount,
    wordCount: result.wordCount,
    extractedText: '',
  };
}

/* -------------------------------------------------------------------------- */
/* Header blackout (real pixel redaction)                                    */
/* -------------------------------------------------------------------------- */

/** Fill colour for redacted header pixels — obviously not part of the document. */
export const BLACKOUT_FILL = '#111827';

/** Fraction of image height covered by the default header blackout. */
export const DEFAULT_BLACKOUT_FRACTION = 0.22;

/**
 * Permanently paints over the top `fraction` of the image and re-encodes it as
 * JPEG. This is true pixel redaction, not a CSS overlay: the original header
 * pixels are gone from the returned data URL, so header names never leave the
 * device when the caller uploads the result.
 *
 * Only CORS-safe sources are accepted — the data URLs produced by
 * `compressImageAndCheckBlur` (and any `data:`/`blob:` URL) are same-origin by
 * construction. A cross-origin `http(s):` URL would taint the canvas and make
 * `toDataURL` throw, so it is rejected up front with a clear message instead.
 */
export async function blackoutHeaderRegion(
  dataUrl: string,
  fraction: number = DEFAULT_BLACKOUT_FRACTION,
): Promise<string> {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    throw new Error('blackoutHeaderRegion: a non-empty data URL is required');
  }
  const isCorsSafe = dataUrl.startsWith('data:') || dataUrl.startsWith('blob:');
  if (!isCorsSafe) {
    throw new Error('blackoutHeaderRegion: only data:/blob: URLs can be redacted (canvas would be tainted)');
  }

  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : DEFAULT_BLACKOUT_FRACTION;
  if (clamped === 0) return dataUrl;

  const image = await loadImage(dataUrl);

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new Error('blackoutHeaderRegion: image has no intrinsic dimensions');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.drawImage(image, 0, 0, width, height);

  // At least one pixel tall, even for tiny images.
  const band = Math.max(1, Math.round(height * clamped));
  ctx.fillStyle = BLACKOUT_FILL;
  ctx.fillRect(0, 0, width, band);

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Promise wrapper around `Image` decoding for a data/blob URL. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('blackoutHeaderRegion: could not decode image'));
    image.src = src;
  });
}

/* -------------------------------------------------------------------------- */
/* IntakeStats builders                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Builds the real telemetry shape for a Lane B (photo) scan from the measured
 * values — no placeholders. `piiCountsByType` must be *this* scan's counts.
 */
export function buildLaneBStats(
  prep: ImagePrepResult,
  piiCountsByType: Record<string, number>,
): IntakeStats {
  const counts = { ...(piiCountsByType ?? {}) };
  const piiTotalMasked = Object.values(counts).reduce(
    (sum, n) => sum + (Number.isFinite(n) ? n : 0),
    0,
  );

  return {
    lane: 'B',
    blurVerdict: prep.verdict,
    isSharp: prep.isSharp,
    blurScore: prep.blurScore,
    piiCountsByType: counts,
    piiTotalMasked,
  };
}

/**
 * Builds the real telemetry shape for a Lane A (vector PDF) scan: page and word
 * counts come from the actual extraction, never from a preset.
 */
export function buildLaneAStats(
  decision: LaneADecision,
  piiCountsByType: Record<string, number>,
): IntakeStats {
  const counts = { ...(piiCountsByType ?? {}) };
  const piiTotalMasked = Object.values(counts).reduce(
    (sum, n) => sum + (Number.isFinite(n) ? n : 0),
    0,
  );

  return {
    lane: decision.lane,
    pageCount: decision.pageCount,
    wordCount: decision.wordCount,
    piiCountsByType: counts,
    piiTotalMasked,
  };
}

/* -------------------------------------------------------------------------- */
/* Concurrent-processing primitives (pure client-side, additive)              */
/* -------------------------------------------------------------------------- */

/**
 * Default cap for concurrent image preparation. Keeps peak memory bounded:
 * each in-flight image can hold a full-res bitmap + 1500px canvas.
 */
export const DEFAULT_IMAGE_CONCURRENCY_LIMIT = 3;

/**
 * Builds a DOMException named 'AbortError', preserving the original
 * `signal.reason` (if any) as `cause` so callers can inspect why.
 */
function createAbortError(signal?: AbortSignal): DOMException {
  const reason: unknown = signal?.reason;
  if (reason instanceof DOMException && reason.name === 'AbortError') {
    return reason;
  }
  const error = new DOMException('The operation was aborted.', 'AbortError');
  if (reason !== undefined) {
    try {
      Object.defineProperty(error, 'cause', { value: reason, configurable: true, writable: true });
    } catch {
      // Older runtimes may not allow defining `cause`; the AbortError itself is enough.
    }
  }
  return error;
}

/**
 * Promise-based worker pool.
 *
 * - Runs at most `limit` workers concurrently (always at least 1).
 * - Preserves input order in the returned array.
 * - Rejects as soon as any worker rejects (first error wins).
 * - Aborts promptly: if `signal` is already aborted it rejects immediately
 *   without invoking any worker; if it aborts mid-flight the returned promise
 *   rejects with a DOMException named 'AbortError' and no further workers are
 *   started. Already-started work cannot be cancelled (promises are not
 *   cancellable) but its results are discarded, so `worker` should cooperate
 *   by checking the `signal` it receives when it holds resources worth freeing.
 *
 * Pure TypeScript: no DOM APIs beyond `AbortSignal`/`DOMException`.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number, signal?: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }

  const total = items.length;
  if (total === 0) return [];

  const requested = Number.isFinite(limit) ? Math.floor(limit) : total;
  const poolSize = Math.max(1, Math.min(requested, total));

  const results = new Array<R>(total);

  return new Promise<R[]>((resolve, reject) => {
    let nextIndex = 0;
    let activeCount = 0;
    let finished = false;

    const detach = (): void => {
      if (signal) signal.removeEventListener('abort', handleAbort);
    };

    function handleAbort(): void {
      if (finished) return;
      finished = true;
      detach();
      reject(createAbortError(signal));
    }

    const settleError = (err: unknown): void => {
      if (finished) return;
      finished = true;
      detach();
      reject(err);
    };

    const startNext = (): void => {
      if (finished) return;

      if (nextIndex >= total) {
        if (activeCount === 0) {
          finished = true;
          detach();
          resolve(results);
        }
        return;
      }

      const index = nextIndex++;
      activeCount += 1;

      let pending: Promise<R>;
      try {
        pending = Promise.resolve(worker(items[index], index, signal));
      } catch (err) {
        activeCount -= 1;
        settleError(err);
        return;
      }

      pending.then(
        (value) => {
          if (finished) return;
          results[index] = value;
          activeCount -= 1;
          startNext();
        },
        (err: unknown) => {
          activeCount -= 1;
          settleError(err);
        },
      );
    };

    if (signal) signal.addEventListener('abort', handleAbort, { once: true });
    for (let i = 0; i < poolSize; i += 1) startNext();
  });
}

/**
 * Stable cache key for a `File`: name + size + lastModified.
 * Identical across re-selections of the same on-disk file, distinct after an
 * edit (size/mtime change).
 */
export function cacheKeyForFile(file: File): string {
  const name = typeof file.name === 'string' ? file.name : '';
  const size = Number.isFinite(file.size) ? file.size : 0;
  const lastModified = Number.isFinite(file.lastModified) ? file.lastModified : 0;
  return `${name}:${size}:${lastModified}`;
}

/**
 * Prepares many images with bounded concurrency (default 3) via
 * `compressImageAndCheckBlur`. Output order matches `files`.
 *
 * Abort semantics: aborting `signal` rejects with a DOMException named
 * 'AbortError'; jobs that have not started are skipped and the worker also
 * re-checks the signal before/after the (uncancellable) canvas work so a
 * completed-but-aborted result is never returned.
 */
export async function prepareImagesWithLimit(
  files: File[],
  limit: number = DEFAULT_IMAGE_CONCURRENCY_LIMIT,
  signal?: AbortSignal,
): Promise<ImagePrepResult[]> {
  return mapWithConcurrencyLimit<File, ImagePrepResult>(
    files,
    limit,
    async (file, _index, workerSignal) => {
      if (workerSignal?.aborted) throw createAbortError(workerSignal);
      const result = await compressImageAndCheckBlur(file);
      if (workerSignal?.aborted) throw createAbortError(workerSignal);
      return result;
    },
    signal,
  );
}

/** Default cap on how many photos one intake may carry at once. */
export const DEFAULT_MAX_IMAGES_PER_INTAKE = 3;

/**
 * Documented entry point for multi-photo intake: prepares up to `limit` files
 * with bounded concurrency and returns results in selection order.
 *
 * This is the function UI code should call. It is a thin, stable wrapper over
 * `prepareImagesWithLimit` (which stays the implementation) so the concurrency
 * primitive is actually exercised in the app instead of sitting as dead code.
 *
 * Files beyond `limit` are ignored rather than throwing, so a 10-photo
 * selection degrades gracefully to the first `limit` shots.
 */
export async function prepareImagesForUpload(
  files: File[],
  limit: number = DEFAULT_MAX_IMAGES_PER_INTAKE,
  signal?: AbortSignal,
): Promise<ImagePrepResult[]> {
  if (signal?.aborted) throw createAbortError(signal);

  const requested = Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_MAX_IMAGES_PER_INTAKE;
  const budget = Math.max(0, requested);
  if (budget === 0 || files.length === 0) return [];

  const accepted = files.slice(0, budget);
  return prepareImagesWithLimit(accepted, Math.min(budget, DEFAULT_IMAGE_CONCURRENCY_LIMIT), signal);
}
