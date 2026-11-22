/**
 * Single LLM client with a provider switch, per-request timeout and exactly
 * one retry. Server-side only — never import from a client bundle.
 *
 * Provider selection is a single env var:
 *   LLM_PROVIDER=openrouter (default) → OPENROUTER_API_KEY
 *   LLM_PROVIDER=anthropic            → ANTHROPIC_API_KEY
 */

export type LlmTier = 'fast' | 'reasoning';

export interface LlmChatParams {
  system: string;
  userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  temperature: number;
  tier: LlmTier;
}

export interface LlmConfig {
  provider: 'openrouter' | 'anthropic';
  timeoutMs: number;
  maxRetries: number;
  maxTokens: number;
  /** Send `reasoning: {enabled:false}` to OpenRouter. Needed for reasoner models. */
  disableReasoning: boolean;
}

/**
 * Default completion budget. Reasoning models spend a large share of this on hidden
 * chain-of-thought before emitting any JSON, so a tight cap truncates the audit
 * payload mid-object (`finish_reason: "length"` → JSON_PARSE_FAILED).
 */
export const DEFAULT_MAX_TOKENS = 6000;

export const DEFAULT_LLM_TIMEOUT_MS = 45_000;
export const MIN_LLM_TIMEOUT_MS = 5_000;
export const MAX_LLM_TIMEOUT_MS = 120_000;

export function resolveLlmConfig(): LlmConfig {
  const provider = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase() === 'anthropic'
    ? 'anthropic'
    : 'openrouter';
  // LLM_TIMEOUT_MS overrides the per-request LLM timeout, clamped to [5000, 120000] ms.
  const requestedTimeoutMs = Number(process.env.LLM_TIMEOUT_MS) || DEFAULT_LLM_TIMEOUT_MS;
  const timeoutMs = Math.min(MAX_LLM_TIMEOUT_MS, Math.max(MIN_LLM_TIMEOUT_MS, requestedTimeoutMs));
  // LLM_MAX_TOKENS raises the completion budget for reasoner models; clamped to a
  // sane range so a typo cannot request an unbounded (expensive) completion.
  const requestedMaxTokens = Number(process.env.LLM_MAX_TOKENS) || DEFAULT_MAX_TOKENS;
  const maxTokens = Math.min(16_000, Math.max(1_000, requestedMaxTokens));
  // Default on: a reasoner model that is not told otherwise spends the budget thinking
  // and gets truncated before the JSON closes. Set LLM_DISABLE_REASONING=0 to keep it.
  const disableReasoning = (process.env.LLM_DISABLE_REASONING || '1') !== '0';
  return { provider, timeoutMs, maxRetries: 1, maxTokens, disableReasoning };
}

const MODEL_BY_TIER: Record<'openrouter' | 'anthropic', Record<LlmTier, string>> = {
  openrouter: {
    // Free tier: OCR needs image input, so this one must be multimodal.
    fast: process.env.OPENROUTER_MODEL_FAST || 'nvidia/nemotron-3.5-super-vl:free',
    // Free tier: largest free NVIDIA model — the small ones fail to emit the audit schema.
    reasoning: process.env.OPENROUTER_MODEL_REASONING || 'nvidia/nemotron-3-ultra-550b-a55b:free',
  },
  anthropic: {
    fast: process.env.ANTHROPIC_MODEL_FAST || 'claude-haiku-4-5-20251001',
    reasoning: process.env.ANTHROPIC_MODEL_REASONING || 'claude-sonnet-4-5-20250929',
  },
};

/** Reject a promise if it does not settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${ms}MS`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function callOnce(params: LlmChatParams, config: LlmConfig): Promise<string> {
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const model = MODEL_BY_TIER[config.provider][params.tier];

  const request = (async (): Promise<string> => {
    if (config.provider === 'anthropic' && anthropicKey) {
      const contentBlocks =
        typeof params.userContent === 'string'
          ? [{ type: 'text', text: params.userContent }]
          : params.userContent.map((part) => {
              if (part.type === 'image_url' && part.image_url?.url) {
                const match = part.image_url.url.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
                if (match) {
                  return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
                }
              }
              return { type: 'text', text: part.text || '' };
            });

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: config.maxTokens,
          temperature: params.temperature,
          system: params.system,
          messages: [{ role: 'user', content: contentBlocks }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`ANTHROPIC_HTTP_${resp.status}: ${errText.slice(0, 180)}`);
      }
      const data = (await resp.json()) as { content?: Array<{ text?: string }> };
      return data.content?.[0]?.text || '';
    }

    if (!openrouterKey) throw new Error('NO_LLM_KEY_CONFIGURED');

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'LawLens AI Consumer Legal Clarity',
      },
      body: JSON.stringify({
        model,
        temperature: params.temperature,
        max_tokens: config.maxTokens,
        // Reasoning models otherwise spend most of the budget on hidden thinking and
        // return `finish_reason: "length"` with truncated JSON. Harmless for models
        // that do not support it — OpenRouter ignores the flag for those.
        ...(config.disableReasoning ? { reasoning: { enabled: false } } : {}),
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.userContent },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OPENROUTER_HTTP_${resp.status}: ${errText.slice(0, 180)}`);
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || '';
  })();

  return withTimeout(request, config.timeoutMs, 'LLM');
}

/**
 * Backoff before the single retry, used only when the provider returned 429. Free
 * models are rate-limited per minute, so an instant retry just re-hits the same window.
 */
const RATE_LIMIT_RETRY_DELAY_MS = 3_000;

/**
 * Call the model with a hard timeout and exactly one retry on any failure.
 * A missing key fails fast (no retry) so the caller can fall back immediately.
 */
export async function callLLMChat(params: LlmChatParams, config = resolveLlmConfig()): Promise<string> {
  try {
    return await callOnce(params, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'NO_LLM_KEY_CONFIGURED') throw err;
    if (message.includes('HTTP_429')) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS));
    }
    // Exactly one retry.
    return callOnce(params, config);
  }
}
