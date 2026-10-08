import { createApiServer } from './api.ts';
import { SupabaseGateway } from './supabase.ts';
import { HermesHttpClient } from './hermes-client.ts';
import { AiHordeMarketingImageClient } from './ai-horde-image-client.ts';
import { drainAutomationOutbox } from './automation-outbox.ts';
import { N8nManagementClient } from './n8n-management-client.ts';
import { integrationHealthUrl } from './integration-probes.ts';

const gateway = new SupabaseGateway();
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
  .split(',').map((value) => value.trim()).filter(Boolean);
const marketingImage = process.env.MARKETING_IMAGE_PROVIDER?.trim().toLowerCase() === 'off'
  ? undefined
  : new AiHordeMarketingImageClient();
const server = createApiServer({
  gateway,
  pricing: gateway,
  allowedOrigins,
  hermes: new HermesHttpClient(),
  hermesProbeUrl: process.env.HERMES_HEALTH_URL || integrationHealthUrl(process.env.HERMES_BASE_URL, 'health'),
  n8nProbeUrl: process.env.N8N_HEALTH_URL || integrationHealthUrl(process.env.N8N_WEBHOOK_BASE_URL, 'healthz'),
  marketingImage,
  hermesToolKey: process.env.HERMES_TOOL_API_KEY,
  hermesWriteToolsEnabled: process.env.HERMES_WRITE_TOOLS_ENABLED === 'true',
  hermesManagerUserId: process.env.HERMES_MANAGER_USER_ID,
  n8nWebhookBaseUrl: process.env.N8N_WEBHOOK_BASE_URL,
  n8nWebhookSecret: process.env.N8N_WEBHOOK_SECRET,
  n8nManagement: new N8nManagementClient({ baseUrl: process.env.N8N_API_BASE_URL || process.env.N8N_WEBHOOK_BASE_URL, apiKey: process.env.N8N_API_KEY }),
  managerEmail: process.env.PRINTSHOP_MANAGER_EMAIL
});
const port = Number(process.env.PORT ?? 3000);

server.listen(port, '0.0.0.0', () => console.log(`PrintShop AI API listening on port ${port}`));

let draining = false;
const drain = async () => {
  if (draining || !process.env.N8N_WEBHOOK_BASE_URL || !process.env.N8N_WEBHOOK_SECRET) return;
  draining = true;
  try {
    await drainAutomationOutbox({ gateway, webhookBaseUrl: process.env.N8N_WEBHOOK_BASE_URL, secret: process.env.N8N_WEBHOOK_SECRET, managerEmail: process.env.PRINTSHOP_MANAGER_EMAIL, logger: (message) => console.error(message) });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'automation.outbox.poll_failed', error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }));
  } finally { draining = false; }
};
const outboxTimer = setInterval(() => { void drain(); }, 5_000);
outboxTimer.unref();
void drain();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { clearInterval(outboxTimer); server.close(() => process.exit(0)); });
}
