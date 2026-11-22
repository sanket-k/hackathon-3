import type { LanguageCode } from '../types/contract';

export interface SpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onFallback?: (reason: string) => void;
}

const LANG_BCP47: Record<LanguageCode, string> = {
  kn: 'kn-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  en: 'en-IN',
};

let activeAudioEl: HTMLAudioElement | null = null;

export function stopAllSpeech(): void {
  if (activeAudioEl) {
    activeAudioEl.pause();
    activeAudioEl.currentTime = 0;
    activeAudioEl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export async function playRegionalSpeech(
  text: string,
  language: LanguageCode,
  pace = 1.0,
  callbacks: SpeechCallbacks = {},
): Promise<'sarvam' | 'browser_fallback'> {
  stopAllSpeech();

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, pace }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        audio_base64?: string;
        content_type?: string;
        fallback_recommended?: boolean;
      };
      if (data.audio_base64 && !data.fallback_recommended) {
        const audio = new Audio(`data:${data.content_type || 'audio/wav'};base64,${data.audio_base64}`);
        audio.playbackRate = pace;
        activeAudioEl = audio;
        audio.onplay = () => callbacks.onStart?.();
        audio.onended = () => {
          activeAudioEl = null;
          callbacks.onEnd?.();
        };
        audio.onerror = () => {
          activeAudioEl = null;
          speakWithBrowserFallback(text, language, pace, callbacks);
        };
        await audio.play();
        return 'sarvam';
      }
    }
  } catch {
    // Fall through to deterministic browser speechSynthesis
  }

  speakWithBrowserFallback(text, language, pace, callbacks);
  return 'browser_fallback';
}

function speakWithBrowserFallback(
  text: string,
  language: LanguageCode,
  pace: number,
  callbacks: SpeechCallbacks,
): void {
  callbacks.onFallback?.('Using local device voice synthesis');
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = LANG_BCP47[language] || 'en-IN';
    utter.rate = pace;
    utter.onstart = () => callbacks.onStart?.();
    utter.onend = () => callbacks.onEnd?.();
    utter.onerror = () => callbacks.onEnd?.();
    window.speechSynthesis.speak(utter);
  } else {
    callbacks.onStart?.();
    setTimeout(() => callbacks.onEnd?.(), 1500);
  }
}
