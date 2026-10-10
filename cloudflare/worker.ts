import { httpServerHandler } from 'cloudflare:node';
import { timingSafeEqual } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createApiServer } from '../apps/api/src/api.ts';
import { SupabaseGateway } from '../apps/api/src/supabase.ts';
import { AiHordeMarketingImageClient } from '../apps/api/src/ai-horde-image-client.ts';
import { HermesRemoteHttpClient } from '../apps/api/src/hermes-http-client.ts';
import { drainAutomationOutbox } from '../apps/api/src/automation-outbox.ts';
import { N8nManagementClient } from '../apps/api/src/n8n-management-client.ts';
import { createPrintshopMcpServer } from '../apps/hermes/src/tools.ts';

let handleNodeApi: ReturnType<typeof httpServerHandler> | undefined;
let gatewayInstance: SupabaseGateway | undefined;

/** Cloudflare's module Worker bindings are the authoritative runtime config. */
interface WorkerEnvironment {
  N8N_API_BASE_URL?: string;
  N8N_API_KEY?: string;
  N8N_HEALTH_URL?: string;
  N8N_WEBHOOK_BASE_URL?: string;
  N8N_WEBHOOK_SECRET?: string;
  HERMES_TOOL_API_KEY?: string;
  [key: string]: unknown;
}

function bindingOrProcess(env: WorkerEnvironment, name: string): string | undefined {
  const value = env[name] ?? process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function integrationProbeUrl(base: string | undefined, healthPath = 'healthz'): string | undefined {
  if (!base?.trim()) return undefined;
  try { return new URL(`${base.replace(/\/+$/, '')}/${healthPath.replace(/^\/+/, '')}`).toString(); }
  catch { return undefined; }
}

function sameSecret(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes);
}

async function handleHermesMcp(request: Request, env: WorkerEnvironment): Promise<Response> {
  const key = bindingOrProcess(env, 'HERMES_TOOL_API_KEY');
  if (!key) return new Response(JSON.stringify({ error: 'MCP service is not configured.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  const auth = request.headers.get('authorization');
  const bearer = auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '') : null;
  if (!sameSecret(request.headers.get('x-printshop-hermes-key') ?? bearer, key)) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return new Response('Method not allowed.', { status: 405, headers: { allow: 'GET, POST, DELETE' } });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 262_144 });
  // Dispatch MCP tools into this Worker’s API handler directly. Fetching the
  // Worker’s public hostname from itself is not a supported internal route and
  // can be intercepted by the static asset layer.
  const server = createPrintshopMcpServer({
    apiBase: new URL(request.url).origin,
    managerToolKey: key,
    internalFetch: (apiRequest) => getNodeApi(env).fetch(apiRequest)
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

function getNodeApi(env: WorkerEnvironment): ReturnType<typeof httpServerHandler> {
  if (handleNodeApi) return handleNodeApi;

  // Defer binding-dependent initialization until a request arrives. Wrangler
  // imports the module during deployment validation, before runtime secrets and
  // variables are attached, so constructing SupabaseGateway at module scope
  // makes every deployment fail with a misleading missing-environment error.
  const gateway = getGateway();
  const apiServer = createApiServer({
    gateway,
    pricing: gateway,
    allowSameOrigin: true,
    // Use the authenticated hosted Hermes API when configured. It is intentionally
    // absent until HERMES_BASE_URL and HERMES_API_KEY are set as Worker secrets.
    hermes: process.env.HERMES_BASE_URL?.trim() && process.env.HERMES_API_KEY?.trim()
      ? new HermesRemoteHttpClient()
      : undefined,
    hermesProbeUrl: integrationProbeUrl(process.env.HERMES_BASE_URL, 'v1/models'),
    hermesProbeHeaders: process.env.HERMES_API_KEY?.trim() ? { authorization: `Bearer ${process.env.HERMES_API_KEY.trim()}` } : undefined,
    n8nProbeUrl: bindingOrProcess(env, 'N8N_HEALTH_URL') || integrationProbeUrl(bindingOrProcess(env, 'N8N_WEBHOOK_BASE_URL'), 'healthz'),
    marketingImage: process.env.MARKETING_IMAGE_PROVIDER?.trim().toLowerCase() === 'off'
      ? undefined
      : new AiHordeMarketingImageClient(),
    // The Worker only proxies authenticated manager chat. Hermes runs separately with
    // the restricted printshop-ai MCP toolset; its server-to-server key is never
    // exposed to browser requests. Manager write actions remain disabled by default.
    hermesToolKey: process.env.HERMES_TOOL_API_KEY,
    hermesManagerUserId: process.env.HERMES_MANAGER_USER_ID,
    hermesWriteToolsEnabled: process.env.HERMES_WRITE_TOOLS_ENABLED === 'true',
    n8nWebhookBaseUrl: bindingOrProcess(env, 'N8N_WEBHOOK_BASE_URL'),
    n8nWebhookSecret: bindingOrProcess(env, 'N8N_WEBHOOK_SECRET'),
    n8nManagement: new N8nManagementClient({
      baseUrl: bindingOrProcess(env, 'N8N_API_BASE_URL') || bindingOrProcess(env, 'N8N_WEBHOOK_BASE_URL'),
      apiKey: bindingOrProcess(env, 'N8N_API_KEY')
    }),
    managerEmail: process.env.PRINTSHOP_MANAGER_EMAIL
  });
  apiServer.listen(8080);
  handleNodeApi = httpServerHandler({ port: 8080 });
  return handleNodeApi;
}

function getGateway(): SupabaseGateway {
  if (!gatewayInstance) gatewayInstance = new SupabaseGateway();
  return gatewayInstance;
}

export default {
  fetch(request: Request, env: WorkerEnvironment): Response | Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/mcp') return handleHermesMcp(request, env);
    if (path === '/health' || path === '/ready' || path.startsWith('/api/')) return getNodeApi(env).fetch(request);
    return new Response('Not found', { status: 404 });
  },
  scheduled(_event: unknown, env: WorkerEnvironment, context: { waitUntil(promise: Promise<unknown>): void }): void {
    const baseUrl = bindingOrProcess(env, 'N8N_WEBHOOK_BASE_URL');
    const secret = bindingOrProcess(env, 'N8N_WEBHOOK_SECRET');
    if (!baseUrl || !secret) return;
    context.waitUntil(drainAutomationOutbox({
      gateway: getGateway(),
      webhookBaseUrl: baseUrl,
      secret,
      managerEmail: process.env.PRINTSHOP_MANAGER_EMAIL,
      logger: (message) => console.error(message)
    }).catch((error) => {
      console.error(JSON.stringify({ level: 'error', event: 'automation.outbox.poll_failed', error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }));
    }));
  }
};
