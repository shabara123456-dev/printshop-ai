import type { MarketingImageClient } from './api.ts';
import { AppError } from './errors.ts';

type HordeCheck = { done?: boolean; faulted?: boolean; wait_time?: number };
type HordeStatus = { generations?: Array<{ img?: string; model?: string }> };

/** Free community-powered image generation. Anonymous jobs may wait in a shared queue. */
export class AiHordeMarketingImageClient implements MarketingImageClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(
    baseUrl = process.env.AI_HORDE_BASE_URL?.trim() || 'https://stablehorde.net/api/v2',
    apiKey = process.env.AI_HORDE_API_KEY?.trim() || '0000000000',
    timeoutMs = 150_000,
    pollIntervalMs = 3_000
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.pollIntervalMs = pollIntervalMs;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          apikey: this.apiKey,
          'Client-Agent': 'printshop-ai:1.0.0',
          ...(init?.headers ?? {})
        },
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      throw new AppError('IMAGE_PROVIDER_UNAVAILABLE', 503, 'The free community image service could not be reached.');
    }
    if (!response.ok) {
      throw new AppError(response.status === 429 ? 'IMAGE_PROVIDER_RATE_LIMITED' : 'IMAGE_GENERATION_FAILED', response.status === 429 ? 429 : 502, response.status === 429 ? 'The image service is busy. Try again later.' : 'The image service rejected the generation request.');
    }
    try {
      return await response.json() as T;
    } catch {
      throw new AppError('IMAGE_GENERATION_FAILED', 502, 'The image service returned an invalid response.');
    }
  }

  async generate(prompt: string): Promise<{ data: Buffer; mimeType: string; model: string; estimatedCostUsd: number | null }> {
    const startedAt = Date.now();
    const submitted = await this.request<{ id?: string }>('/generate/async', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: `${prompt}\n\nHigh-quality commercial print marketing photograph, realistic materials and lighting, no readable text, no watermarks.`,
        params: {
          width: 512,
          height: 512,
          steps: 20,
          n: 1,
          cfg_scale: 7,
          sampler_name: 'k_euler_a',
          negative_prompt: 'text, watermark, logo, blurry, low quality, distorted, extra fingers'
        },
        nsfw: false,
        censor_nsfw: true,
        r2: false
      })
    });
    if (!submitted.id || !/^[a-zA-Z0-9-]{8,100}$/.test(submitted.id)) {
      throw new AppError('IMAGE_GENERATION_FAILED', 502, 'The image service did not return a valid job ID.');
    }

    let check: HordeCheck = {};
    while (Date.now() - startedAt < this.timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      check = await this.request<HordeCheck>(`/generate/check/${encodeURIComponent(submitted.id)}`);
      if (check.faulted) throw new AppError('IMAGE_GENERATION_FAILED', 502, 'The image service could not complete this request.');
      if (check.done) break;
    }
    if (!check.done) throw new AppError('IMAGE_GENERATION_TIMEOUT', 504, 'The free image queue is taking too long. The caption draft is still available.');

    const result = await this.request<HordeStatus>(`/generate/status/${encodeURIComponent(submitted.id)}`);
    const encoded = result.generations?.[0]?.img;
    if (!encoded || encoded.startsWith('https://')) throw new AppError('IMAGE_GENERATION_FAILED', 502, 'The image service returned no embedded image data.');
    const dataUrl = encoded.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
    const data = Buffer.from(dataUrl?.[2] ?? encoded, 'base64');
    if (data.length < 100 || data.length > 12_000_000) throw new AppError('IMAGE_GENERATION_FAILED', 502, 'The generated image has an invalid size.');
    const mimeType = dataUrl?.[1]
      ?? (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
        : data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg'
          : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
            : null);
    if (!mimeType) throw new AppError('IMAGE_GENERATION_FAILED', 502, 'The image service returned an unsupported image format.');
    return { data, mimeType, model: `AI Horde · ${result.generations?.[0]?.model || 'community image model'}`, estimatedCostUsd: 0 };
  }
}
