import { createApiServer } from './api.ts';
import { SupabaseGateway } from './supabase.ts';
import { HermesHttpClient } from './hermes-client.ts';
import { AiHordeMarketingImageClient } from './ai-horde-image-client.ts';

const gateway = new SupabaseGateway();
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
  .split(',').map((value) => value.trim()).filter(Boolean);
const marketingImage = process.env.MARKETING_IMAGE_PROVIDER?.trim().toLowerCase() === 'off'
  ? undefined
  : new AiHordeMarketingImageClient();
const server = createApiServer({ gateway, pricing: gateway, allowedOrigins, hermes: new HermesHttpClient(), marketingImage, hermesToolKey: process.env.HERMES_TOOL_API_KEY, hermesWriteToolsEnabled: process.env.HERMES_WRITE_TOOLS_ENABLED === 'true', hermesManagerUserId: process.env.HERMES_MANAGER_USER_ID, n8nWebhookBaseUrl: process.env.N8N_WEBHOOK_BASE_URL, n8nWebhookSecret: process.env.N8N_WEBHOOK_SECRET, managerEmail: process.env.PRINTSHOP_MANAGER_EMAIL });
const port = Number(process.env.PORT ?? 3000);

server.listen(port, '0.0.0.0', () => console.log(`PrintShop AI API listening on port ${port}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
