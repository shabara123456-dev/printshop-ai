# Marketing image generation

Marketing captions continue to use the configured Hermes text provider. Images use AI Horde, a separate, free community-powered image-generation service; this avoids Gemini image-model access and fees.

## Configuration

- `MARKETING_IMAGE_PROVIDER=ai_horde` enables artwork generation (the default).
- `AI_HORDE_API_KEY` is optional. Without it, the API uses AI Horde's anonymous key, which has the lowest queue priority.
- `AI_HORDE_BASE_URL` defaults to `https://stablehorde.net/api/v2`.
- Set `MARKETING_IMAGE_PROVIDER=off` to disable image generation.

AI Horde runs on volunteer workers. Queue time varies, and a request may time out or fail. Campaign captions still complete if artwork generation fails. The app stores successful artwork in the private `marketing-assets` bucket, records its zero provider fee in AI usage, and keeps it as a pending-approval campaign asset. The monthly n8n workflow waits up to five minutes for the API response and emails the manager a seven-day signed preview link. It does not publish posts.

Campaign prompts are sent to third-party volunteer workers. Keep customer names, uploaded files, order data, and confidential information out of those prompts. The manager must review every image and caption before any future publication.

## Local verification

After setting the variables, restart the API. Request a marketing draft with `generate_image: true` or run the Monthly Marketing Plan workflow. Verify generated assets in the manager Marketing screen. If AI Horde is busy, check `image_status` in the workflow email and try again later; do not treat a failed image as a successful generation.
