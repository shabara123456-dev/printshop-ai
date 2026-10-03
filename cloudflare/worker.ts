import { httpServerHandler } from 'cloudflare:node';
import { createApiServer } from '../apps/api/src/api.ts';
import { SupabaseGateway } from '../apps/api/src/supabase.ts';
import { AiHordeMarketingImageClient } from '../apps/api/src/ai-horde-image-client.ts';

const gateway = new SupabaseGateway();
const apiServer = createApiServer({
  gateway,
  pricing: gateway,
  allowSameOrigin: true,
  marketingImage: process.env.MARKETING_IMAGE_PROVIDER?.trim().toLowerCase() === 'off'
    ? undefined
    : new AiHordeMarketingImageClient(),
  // Hermes currently runs as a local CLI and is intentionally not bundled into a public Worker.
  hermesWriteToolsEnabled: false,
  n8nWebhookBaseUrl: process.env.N8N_WEBHOOK_BASE_URL,
  n8nWebhookSecret: process.env.N8N_WEBHOOK_SECRET,
  managerEmail: process.env.PRINTSHOP_MANAGER_EMAIL
});
apiServer.listen(8080);
const handleNodeApi = httpServerHandler({ port: 8080 });

export default {
  fetch(request: Request): Response | Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health' || path.startsWith('/api/')) return handleNodeApi.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
