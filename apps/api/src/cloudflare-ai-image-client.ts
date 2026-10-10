import type { MarketingImageClient } from './api.ts';
import { AppError } from './errors.ts';

export interface CloudflareAiBinding {
  run(model: string, input: { prompt: string; steps?: number }): Promise<{ image?: string }>;
}

/** Uses the Worker's Cloudflare AI binding; no browser key or volunteer queue is involved. */
export class CloudflareAiImageClient implements MarketingImageClient {
  constructor(private readonly ai: CloudflareAiBinding) {}

  async generate(prompt: string): Promise<{ data: Buffer; mimeType: string; model: string; estimatedCostUsd: number | null }> {
    let result: { image?: string };
    try {
      result = await this.ai.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: `${prompt}\n\nPhotorealistic commercial print product photography. No readable text, logos, or watermarks.`.slice(0, 2048),
        steps: 4
      });
    } catch {
      throw new AppError('IMAGE_GENERATION_FAILED', 502, 'Cloudflare could not generate this image right now. Try again later or upload a photo.');
    }

    if (typeof result.image !== 'string' || !result.image) {
      throw new AppError('IMAGE_GENERATION_FAILED', 502, 'Cloudflare returned no image. Try again later or upload a photo.');
    }

    const data = Buffer.from(result.image, 'base64');
    if (data.length < 100 || data.length > 12_000_000 || data[0] !== 0xff || data[1] !== 0xd8) {
      throw new AppError('IMAGE_GENERATION_FAILED', 502, 'Cloudflare returned an invalid image. Try again or upload a photo.');
    }
    return { data, mimeType: 'image/jpeg', model: 'Cloudflare Workers AI · FLUX.1 schnell', estimatedCostUsd: 0 };
  }
}
