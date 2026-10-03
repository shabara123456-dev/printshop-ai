import type { HermesChatClient, HermesChatMessage } from './api.ts';

const REQUEST_TIMEOUT_MS = 50_000;

/** Authenticated client for Hermes Agent's OpenAI-compatible API server. */
export class HermesRemoteHttpClient implements HermesChatClient {
  private readonly baseUrl = process.env.HERMES_BASE_URL?.trim().replace(/\/+$/, '');
  private readonly apiKey = process.env.HERMES_API_KEY?.trim();
  private readonly model = process.env.HERMES_MODEL?.trim() || 'hermes-agent';

  async complete(messages: Array<HermesChatMessage | { role: 'system'; content: string }>) {
    if (!this.baseUrl) throw new Error('Hermes remote API is not configured. Set HERMES_BASE_URL.');
    if (!this.apiKey) throw new Error('Hermes remote API is selected but HERMES_API_KEY is not configured.');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages, stream: false }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new Error('Hermes remote API could not be reached. Check the hosted gateway URL, TLS, and service health.');
    }

    if (!response.ok) {
      // Do not return response bodies; third-party gateways may include sensitive diagnostics.
      throw new Error(`Hermes remote API returned HTTP ${response.status}. Check gateway authentication and logs.`);
    }

    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new Error('Hermes remote API returned an invalid JSON response.'); }
    if (!payload || typeof payload !== 'object') throw new Error('Hermes remote API returned an invalid response.');

    const data = payload as { model?: unknown; choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('Hermes remote API returned an empty response.');
    const usage = typeof data.usage?.prompt_tokens === 'number' && typeof data.usage?.completion_tokens === 'number'
      ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens }
      : undefined;
    return { content: content.trim(), model: typeof data.model === 'string' ? data.model : this.model, usage };
  }
}
