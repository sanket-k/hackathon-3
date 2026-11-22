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
}

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
  return { provider, timeoutMs, maxRetries: 1 };
}

const MODEL_BY_TIER: Record<'openrouter' | 'anthropic', Record<LlmTier, string>> = {
  openrouter: {
    fast: process.env.OPENROUTER_MODEL_FAST || 'anthropic/claude-haiku-4.5',
    reasoning: process.env.OPENROUTER_MODEL_REASONING || 'anthropic/claude-sonnet-4.5',
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
          max_tokens: 2800,
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
        max_tokens: 2800,
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
 * Call the model with a hard timeout and exactly one retry on any failure.
 * A missing key fails fast (no retry) so the caller can fall back immediately.
 */
export async function callLLMChat(params: LlmChatParams, config = resolveLlmConfig()): Promise<string> {
  try {
    return await callOnce(params, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'NO_LLM_KEY_CONFIGURED') throw err;
    // Exactly one retry.
    return callOnce(params, config);
  }
}
