import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.ts';
import { calculateQuote, type PricingRepository, type QuoteLineInput } from './pricing.ts';

export type Role = 'customer' | 'manager' | 'sales' | 'production' | 'marketing' | 'admin';
export type QuoteStatus = 'sent' | 'accepted' | 'rejected' | 'expired';
export type OrderStatus = 'delivered' | 'cancelled';
export type ProductionStatus = 'prepress' | 'printing' | 'finishing' | 'quality_check' | 'ready' | 'cancelled';
export type DesignRequestStatus = 'reviewing' | 'designing' | 'customer_review' | 'approved' | 'rejected' | 'completed';
export type InventoryCommand =
  | { action: 'receive'; materialId: string; quantity: number; unitCost?: number | null }
  | { action: 'adjust'; materialId: string; delta: number }
  | { action: 'reserve' | 'release' | 'consume'; materialId: string; quantity: number; orderId: string };

export type AuthGateway = {
  authenticate(token: string): Promise<{ id: string }>;
  getRole(userId: string): Promise<Role | null>;
  getCustomerId(userId: string): Promise<string | null>;
  customerExists(customerId: string): Promise<boolean>;
  saveQuote(input: { customerId: string; subtotal: string; discount: string; tax: string; total: string; items: Array<Record<string, unknown>> }): Promise<string>;
  listProducts(search?: string, includeInactive?: boolean): Promise<unknown[]>;
  getProduct(id: string): Promise<Record<string, unknown> | null>;
  getQuote(id: string): Promise<Record<string, unknown> | null>;
  listQuotes(customerId?: string): Promise<unknown[]>;
  listCustomers(): Promise<unknown[]>;
  createCustomer(input: { name: string; companyName: string | null; email: string | null; phone: string | null }): Promise<string>;
  getSalesReport(from: string, to: string): Promise<Record<string, unknown>>;
  getBusinessAnalytics?(from: string, to: string): Promise<Record<string, unknown>>;
  createProduct?(input: Record<string, unknown>): Promise<string>;
  updateProduct?(id: string, input: Record<string, unknown>): Promise<void>;
  createProductVariant?(productId: string, input: Record<string, unknown>): Promise<string>;
  updateProductVariant?(id: string, input: Record<string, unknown>): Promise<void>;
  createPriceRule?(actorId: string, input: Record<string, unknown>, reason: string): Promise<string>;
  endPriceRule?(actorId: string, id: string, activeTo: string, reason: string): Promise<void>;
  recordAiRun(input: { feature: string; model: string | null; inputTokens: number; outputTokens: number; estimatedCostUsd?: number | null; latencyMs: number; success: boolean }): Promise<void>;
  updateQuoteStatus(id: string, status: QuoteStatus): Promise<void>;
  createOrderFromQuote(quoteId: string, deliveryMethod: 'delivery' | 'pickup', deliveryAddress: string, deliveryPhone: string | null): Promise<string>;
  getOrder(id: string): Promise<Record<string, unknown> | null>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<void>;
  listOrders(customerId?: string): Promise<unknown[]>;
  listInventory(): Promise<Array<Record<string, unknown>>>;
  runInventoryCommand(command: InventoryCommand): Promise<void>;
  listProduction(): Promise<unknown[]>;
  updateProductionStatus(id: string, status: ProductionStatus): Promise<void>;
  listDesignRequests(customerId?: string): Promise<unknown[]>;
  getDesignRequest(id: string): Promise<Record<string, unknown> | null>;
  updateDesignRequestStatus(id: string, status: DesignRequestStatus): Promise<void>;
  updateDesignRequestFile(id: string, path: string): Promise<void>;
  createDesignRequest(input: { customerId: string; orderId: string | null; brief: string; referenceFiles: string[]; customerNotes: string | null; designFee: number }): Promise<string>;
  orderBelongsToCustomer(orderId: string, customerId: string): Promise<boolean>;
  createMaterial(input: { sku: string; name: string; category: string; unit: string; reorderPoint: number; reorderQuantity: number }): Promise<string>;
  createMaterialRequirement(input: { productId: string; variantId: string; materialId: string; quantityPerUnit: number; wasteFactor: number }): Promise<string>;
  listMarketingAssets(): Promise<unknown[]>;
  createMarketingAsset(input: { orderId: null; productId: string | null; campaignBrief: string; campaignType: string; createdBy: string | null; designUrl: string | null; platform: string; caption: string }): Promise<string>;
  uploadMarketingImage?(input: { id: string; mimeType: string; data: Buffer }): Promise<string>;
  createSignedMarketingImageUrl?(path: string, expiresInSeconds?: number): Promise<string>;
  updateMarketingAssetStatus(id: string, status: 'approved' | 'rejected'): Promise<void>;
  recordAuditLog?(input: { userId: string; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown> }): Promise<void>;
};

export type HermesChatMessage = { role: 'user' | 'assistant'; content: string };
export type HermesChatClient = { complete(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{ content: string; model: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }> };
export type MarketingImageClient = { generate(prompt: string): Promise<{ data: Buffer; mimeType: string; model: string; estimatedCostUsd: number | null }> };
type Dependencies = { gateway: AuthGateway; pricing: PricingRepository; allowedOrigins?: string[]; hermes?: HermesChatClient; marketingImage?: MarketingImageClient; hermesToolKey?: string; hermesWriteToolsEnabled?: boolean; hermesManagerUserId?: string; n8nWebhookBaseUrl?: string; n8nWebhookSecret?: string; managerEmail?: string };
type Actor = { id: string; role: Role };

class UserAiRateLimiter {
  private readonly requests = new Map<string, number[]>();

  check(userId: string, feature: string, limit: number, now = Date.now()): void {
    const key = `${feature}:${userId}`;
    const active = (this.requests.get(key) ?? []).filter((timestamp) => now - timestamp < 60_000);
    if (active.length >= limit) {
      this.requests.set(key, active);
      throw new AppError('AI_RATE_LIMITED', 429, 'You have reached the temporary AI request limit. Please wait a minute and try again.');
    }
    active.push(now);
    this.requests.set(key, active);
    if (this.requests.size > 5000) {
      for (const [entryKey, timestamps] of this.requests) {
        if (timestamps.every((timestamp) => now - timestamp >= 60_000)) this.requests.delete(entryKey);
      }
    }
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new AppError('PAYLOAD_TOO_LARGE', 413, 'Request body exceeds 1 MB.');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object.');
    return value as Record<string, unknown>;
  } catch {
    throw new AppError('INVALID_JSON', 400, 'Request body must be a JSON object.');
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(body));
}

function bearerToken(request: IncomingMessage): string {
  const header = request.headers.authorization;
  const match = header && /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new AppError('UNAUTHORIZED', 401, 'Authorization: Bearer <access-token> is required.');
  return match[1];
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError('INVALID_REQUEST', 400, `${name} must be a valid UUID.`);
  }
  return value;
}

function requiredText(value: unknown, name: string, maxLength = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new AppError('INVALID_REQUEST', 400, `${name} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function positiveNumber(value: unknown, name: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new AppError('INVALID_REQUEST', 400, `${name} must be a positive number.`);
  return parsed;
}

function nonnegativeNumber(value: unknown, name: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new AppError('INVALID_REQUEST', 400, `${name} must be a non-negative number.`);
  return parsed;
}

function optionalDimension(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = positiveNumber(value, name);
  if (parsed > 100_000) throw new AppError('INVALID_REQUEST', 400, `${name} cannot exceed 100000.`);
  return parsed;
}

function optionalPrice(value: unknown, name: string, fallback = '0.00'): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' && typeof value !== 'string') throw new AppError('INVALID_REQUEST', 400, `${name} must be a non-negative amount with up to two decimal places.`);
  const parsed = String(value).trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(parsed)) throw new AppError('INVALID_REQUEST', 400, `${name} must be a non-negative amount with up to two decimal places.`);
  return parsed;
}

function routeId(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const tail = path.slice(prefix.length);
  if (!tail || tail.includes('/')) return null;
  try { return decodeURIComponent(tail); } catch { throw new AppError('INVALID_REQUEST', 400, 'Path contains invalid encoding.'); }
}

function decodePathSegment(value: string, name: string): string {
  try { return decodeURIComponent(value); }
  catch { throw new AppError('INVALID_REQUEST', 400, `${name} contains invalid encoding.`); }
}

function requireRole(actor: Actor, roles: Role[]): void {
  if (!roles.includes(actor.role)) throw new AppError('FORBIDDEN', 403, 'Your role cannot access this operation.');
}

const hermesInstructions = `You are Hermes, the PrintShop AI operations assistant. Use the PrintShop tools for live business facts and supported manager actions. The backend is authoritative for products, prices, stock, orders, and production; never invent business facts or prices. Use read tools before proposing a change when needed. A write tool first creates a pending proposal and returns an action ID. Explain the exact item and values and ask the manager to reply exactly "I CONFIRM THIS CHANGE <action_id>". Do not repeat the write tool until the manager's next message contains that exact phrase and the same ID. Never infer approval from earlier, vague, or unrelated messages. Never use a write tool to set or estimate prices, mark payment as paid, publish social posts, or claim an unavailable integration worked. The sales report measures order value, not cash collected. If a tool fails, report the failure and do not claim success.`;

type PendingHermesAction = { action: string; managerId: string; args: Record<string, unknown>; createdAt: number; state: 'pending' | 'executing' };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}


function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseReportDate(value: unknown, name: string, fallback: Date): Date {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value)) {
    throw new AppError('INVALID_REQUEST', 400, `${name} must be an ISO date or UTC timestamp.`);
  }
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(parsed.getTime())) throw new AppError('INVALID_REQUEST', 400, `${name} is not a valid date.`);
  return parsed;
}

function suppliedHermesKey(request: IncomingMessage, expected: string | undefined): boolean {
  const provided = request.headers['x-printshop-hermes-key'];
  if (!expected || typeof provided !== 'string') return false;
  const actualBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function suppliedIntegrationKey(request: IncomingMessage, expected: string | undefined): boolean {
  const provided = request.headers['x-printshop-integration-key'];
  if (!expected || typeof provided !== 'string') return false;
  const actualBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

async function dispatchN8n(deps: Dependencies, event: Record<string, unknown>): Promise<void> {
  if (!deps.n8nWebhookBaseUrl || !deps.n8nWebhookSecret) return;
  const endpoint = `${deps.n8nWebhookBaseUrl.replace(/\/$/, '')}/webhook/printshop-ai-events`;
  try {
    const result = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-integration-key': deps.n8nWebhookSecret },
      body: JSON.stringify({ ...event, occurred_at: new Date().toISOString() }), signal: AbortSignal.timeout(2500)
    });
    if (!result.ok) console.error(`n8n event delivery returned HTTP ${result.status}.`);
  } catch (error) { console.error('Could not deliver event to n8n.', error); }
}

function sendError(response: ServerResponse, error: unknown, requestId: string): void {
  const appError = error instanceof AppError ? error : new AppError('INTERNAL_ERROR', 500, 'The request could not be completed.');
  if (appError.status >= 500) {
    console.error(JSON.stringify({ level: 'error', event: 'api.request.failed', request_id: requestId, error_code: appError.code, status: appError.status }));
    if (!(error instanceof AppError)) console.error(error);
  }
  send(response, appError.status, { error: { code: appError.code, message: appError.message, request_id: requestId } });
}

export function createApiServer(deps: Dependencies): Server {
  const allowed = new Set(deps.allowedOrigins ?? ['http://localhost:5173', 'http://localhost:3000']);
  const aiRateLimiter = new UserAiRateLimiter();
  const pendingHermesActions = new Map<string, PendingHermesAction>();
  const activeHermesApprovals = new Map<string, Set<string>>();
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    response.once('finish', () => console.log(JSON.stringify({
      level: 'info', event: 'api.request.completed', request_id: requestId,
      method: request.method ?? 'UNKNOWN', path: new URL(request.url ?? '/', 'http://localhost').pathname,
      status: response.statusCode, duration_ms: Date.now() - startedAt
    })));
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin)) {
      send(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This browser origin is not configured for the API.', request_id: requestId } });
      return;
    }
    if (origin) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'Origin');
      response.setHeader('access-control-allow-headers', 'authorization, content-type');
      response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
      response.setHeader('access-control-expose-headers', 'x-request-id');
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const method = request.method ?? 'GET';
    if (method === 'GET' && path === '/health') { send(response, 200, { status: 'ok' }); return; }
    if (method === 'GET' && path === '/api/integrations/daily-report') {
      if (!suppliedIntegrationKey(request, deps.n8nWebhookSecret)) {
        send(response, 401, { error: { code: 'UNAUTHORIZED', message: 'PrintShop integration authentication is required.', request_id: requestId } });
        return;
      }
      try {
        const now = new Date();
        const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const [sales, inventory, jobs] = await Promise.all([deps.gateway.getSalesReport(from.toISOString(), now.toISOString()), deps.gateway.listInventory(), deps.gateway.listProduction()]);
        const lowStock = inventory.filter((item) => Number(item.current_stock) - Number(item.reserved_stock) <= Number(item.reorder_point));
        send(response, 200, { generated_at: now.toISOString(), period: { from: from.toISOString(), to: now.toISOString() }, sales, low_stock_items: lowStock, production_jobs: jobs, to_email: deps.managerEmail ?? null });
      } catch (error) { sendError(response, error, requestId); }
      return;
    }
    if (method === 'GET' && path === '/api/integrations/weekly-report') {
      if (!suppliedIntegrationKey(request, deps.n8nWebhookSecret)) {
        send(response, 401, { error: { code: 'UNAUTHORIZED', message: 'PrintShop integration authentication is required.', request_id: requestId } });
        return;
      }
      try {
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        const [sales, inventory, jobs] = await Promise.all([deps.gateway.getSalesReport(from.toISOString(), to.toISOString()), deps.gateway.listInventory(), deps.gateway.listProduction()]);
        const lowStock = inventory.filter((item) => Number(item.current_stock) - Number(item.reserved_stock) <= Number(item.reorder_point));
        const facts = { period: { from: from.toISOString(), to: to.toISOString() }, sales, low_stock_items: lowStock.map(({ name, current_stock, reserved_stock, reorder_point, unit }) => ({ name, current_stock, reserved_stock, reorder_point, unit })), production: { open_jobs: jobs.filter((job) => !['ready','cancelled'].includes(String((job as Record<string, unknown>).status))).length, total_jobs: jobs.length } };
        let narrative = 'Weekly figures are verified from saved order and inventory records. Review low-stock items and open production jobs below.';
        let model: string | null = null;
        if (deps.hermes) {
          const started = Date.now();
          try {
            const completion = await deps.hermes.complete([
              { role: 'system', content: 'Write a concise manager weekly briefing with two headings: Good news and Needs attention. Use ONLY the supplied verified facts. Do not calculate or invent any number. If a metric is absent, say it is unavailable. Never claim profit or collected cash unless provided. Keep it under 180 words.' },
              { role: 'user', content: JSON.stringify(facts) }
            ]);
            narrative = requiredText(completion.content, 'weekly report narrative', 4000);
            model = completion.model;
            await deps.gateway.recordAiRun({ feature: 'weekly_business_report', model, inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0, latencyMs: Date.now() - started, success: true });
          } catch (error) {
            try { await deps.gateway.recordAiRun({ feature: 'weekly_business_report', model: null, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, success: false }); } catch { /* retain report data if AI usage logging is unavailable */ }
            console.error(JSON.stringify({ level: 'warn', event: 'weekly_report.narrative_failed', request_id: requestId, error: error instanceof Error ? error.message : 'unknown' }));
          }
        }
        send(response, 200, { generated_at: to.toISOString(), ...facts, narrative, narrative_model: model, to_email: deps.managerEmail ?? null });
      } catch (error) { sendError(response, error, requestId); }
      return;
    }
    if (method === 'GET' && path === '/api/integrations/monthly-marketing-plan') {
      if (!suppliedIntegrationKey(request, deps.n8nWebhookSecret)) {
        send(response, 401, { error: { code: 'UNAUTHORIZED', message: 'PrintShop integration authentication is required.', request_id: requestId } });
        return;
      }
      try {
        const products = (await deps.gateway.listProducts()).filter((value) => value && typeof value === 'object').map((value) => {
          const product = value as Record<string, unknown>;
          return { name: product.name, category: product.category, description: product.description };
        }).slice(0, 40);
        const start = new Date();
        start.setUTCDate(1);
        const schedule = [3, 10, 17, 24].map((day, index) => {
          const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day, 10));
          return { date: date.toISOString(), slot: index + 1, approval_required: true };
        });
        if (!deps.hermes) throw new AppError('HERMES_UNAVAILABLE', 503, 'Hermes is not configured; the monthly marketing plan was not generated.');
        let drafts: Array<{ date: string; platform: string; caption: string }>;
        let model: string | null = null;
        {
          const started = Date.now();
          try {
            const completion = await deps.hermes.complete([
              { role: 'system', content: 'Create exactly four short, truthful social media captions for a printing business, one per supplied slot. Use only the supplied product facts. Do not invent discounts, prices, guarantees, customer stories, or services. Return only a JSON array of four objects with keys slot (integer), platform (instagram), caption (string). Each caption needs a CTA and 3 to 5 relevant hashtags. These are approval-required drafts; do not say they are published.' },
              { role: 'user', content: JSON.stringify({ products, schedule: schedule.map(({ slot, date }) => ({ slot, date })) }) }
            ]);
            const raw = requiredText(completion.content, 'marketing plan', 12000).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length !== 4) throw new AppError('AI_INVALID_RESPONSE', 502, 'Hermes did not return four valid monthly post drafts.');
            drafts = parsed.map((item, index) => {
              if (!item || typeof item !== 'object') throw new AppError('AI_INVALID_RESPONSE', 502, 'Hermes returned an invalid post draft.');
              const row = item as Record<string, unknown>;
              return { date: schedule[index].date, platform: 'instagram', caption: requiredText(row.caption, 'caption', 2000) };
            });
            model = completion.model;
            await deps.gateway.recordAiRun({ feature: 'monthly_marketing_plan', model, inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0, latencyMs: Date.now() - started, success: true });
          } catch (error) {
            try { await deps.gateway.recordAiRun({ feature: 'monthly_marketing_plan', model: null, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, success: false }); } catch { /* Preserve the generation error if AI usage logging is unavailable. */ }
            console.error(JSON.stringify({ level: 'warn', event: 'monthly_marketing_plan.draft_failed', request_id: requestId, error: error instanceof Error ? error.message : 'unknown' }));
            if (error instanceof AppError) throw error;
            throw new AppError('HERMES_UNAVAILABLE', 503, 'Hermes could not generate the monthly marketing plan. No plan was sent for approval.');
          }
        }
          const generatePostImage = async (draft: (typeof drafts)[number], index: number) => {
          const post: Record<string, unknown> = { ...draft, approval_required: true, image_status: 'not_generated', asset_id: null, image_url: null };
          if (!deps.marketingImage || !deps.gateway.uploadMarketingImage) return post;
          const imageStarted = Date.now();
          let imageModel: string | null = null;
          try {
            const prompt = `Create a polished, photorealistic square Instagram campaign image for a professional Egyptian print shop. Campaign caption: ${draft.caption}. Make a visual that matches the campaign subject using realistic paper, ink, or print materials. Studio product photography, refined dark background, controlled blue accent, realistic soft lighting. No readable text, logos, watermark, people, customer work, or claims.`;
            const generated = await deps.marketingImage.generate(prompt);
            imageModel = generated.model;
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(generated.mimeType) || generated.data.length > 12_000_000) throw new AppError('INVALID_GENERATED_IMAGE', 502, 'The image provider returned unsupported artwork.');
            const path = await deps.gateway.uploadMarketingImage({ id: randomUUID(), mimeType: generated.mimeType, data: generated.data });
            const assetId = await deps.gateway.createMarketingAsset({ orderId: null, productId: null, campaignBrief: `Monthly ${start.toISOString().slice(0, 7)} marketing plan · slot ${index + 1}`, campaignType: 'product_showcase', createdBy: null, designUrl: path, platform: 'instagram', caption: draft.caption });
            post.asset_id = assetId;
            post.image_status = 'generated';
            post.image_model = generated.model;
            if (deps.gateway.createSignedMarketingImageUrl) {
              try { post.image_url = await deps.gateway.createSignedMarketingImageUrl(path, 604800); }
              catch (error) { console.error(JSON.stringify({ level: 'warn', event: 'monthly_marketing_plan.image_link_failed', request_id: requestId, slot: index + 1, error: error instanceof Error ? error.message : 'unknown' })); }
            }
            try { await deps.gateway.recordAiRun({ feature: 'marketing_image', model: generated.model, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: Date.now() - imageStarted, success: true }); }
            catch (error) { console.error(JSON.stringify({ level: 'warn', event: 'monthly_marketing_plan.image_usage_log_failed', request_id: requestId, slot: index + 1, error: error instanceof Error ? error.message : 'unknown' })); }
          } catch (error) {
            post.image_status = 'failed';
            post.image_error = error instanceof AppError ? error.code : 'IMAGE_GENERATION_FAILED';
            try { await deps.gateway.recordAiRun({ feature: 'marketing_image', model: imageModel, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: Date.now() - imageStarted, success: false }); } catch { /* Preserve the caption plan if image usage logging is unavailable. */ }
            console.error(JSON.stringify({ level: 'warn', event: 'monthly_marketing_plan.image_failed', request_id: requestId, slot: index + 1, error: error instanceof Error ? error.message : 'unknown' }));
          }
          return post;
          };
          // Anonymous AI Horde has a shared low-priority queue. Serialize requests so
          // this workflow does not trip its rate limit by submitting a burst.
          const posts: Record<string, unknown>[] = [];
          for (const [index, draft] of drafts.entries()) {
            posts.push(await generatePostImage(draft, index));
          }
        send(response, 200, { generated_at: new Date().toISOString(), month: start.toISOString().slice(0, 7), posts, image_generation_available: Boolean(deps.marketingImage && deps.gateway.uploadMarketingImage), image_provider: deps.marketingImage ? 'AI Horde (free community queue)' : null, model, to_email: deps.managerEmail ?? null });
      } catch (error) { sendError(response, error, requestId); }
      return;
    }

    try {
      if (method === 'GET' && path === '/api/products') {
        const search = new URL(request.url ?? '/', 'http://localhost').searchParams.get('search')?.trim();
        if (search && search.length > 100) throw new AppError('INVALID_REQUEST', 400, 'search must be at most 100 characters.');
        send(response, 200, { products: await deps.gateway.listProducts(search) });
        return;
      }
      const productId = method === 'GET' ? routeId(path, '/api/products/') : null;
      if (productId) {
        const product = await deps.gateway.getProduct(uuid(productId, 'product_id'));
        if (!product) throw new AppError('NOT_FOUND', 404, 'Product not found.');
        send(response, 200, product);
        return;
      }

      // Quote calculation is deterministic and read-only, so it is also available to
      // trusted local integrations such as the restricted Hermes MCP bridge.
      if (method === 'POST' && path === '/api/quotes/calculate') {
        const body = await readJson(request);
        if (!Array.isArray(body.items)) throw new AppError('INVALID_REQUEST', 400, 'items must be an array.');
        const quote = await calculateQuote(body.items as QuoteLineInput[], deps.pricing);
        send(response, 200, quote);
        return;
      }

      // Hermes uses a separate server key and a strict allowlist. Write actions are
      // bound to the configured manager profile and require a fresh confirmation.
      if (method === 'POST' && path === '/api/hermes/tools') {
        if (!suppliedHermesKey(request, deps.hermesToolKey)) throw new AppError('UNAUTHORIZED', 401, 'Hermes tool authentication is required.');
        const body = await readJson(request);
        const name = requiredText(body.name, 'name', 80);
        const args = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
          ? body.arguments as Record<string, unknown>
          : {};

        const writeTools = ['create_material', 'record_material_receipt', 'update_product_details', 'update_order_status', 'update_production_status'];
        if (writeTools.includes(name)) {
          if (!deps.hermesWriteToolsEnabled) throw new AppError('HERMES_ACTIONS_DISABLED', 503, 'Manager write actions are disabled in server configuration.');
          const reason = requiredText(args.reason, 'reason', 500);
          if (reason.length < 3) throw new AppError('INVALID_REQUEST', 400, 'reason must contain at least three characters.');
          if (!deps.hermesManagerUserId) throw new AppError('HERMES_MANAGER_NOT_CONFIGURED', 503, 'Configure the authorized manager user ID before enabling manager actions through Hermes.');
          const managerId = uuid(deps.hermesManagerUserId, 'hermes_manager_user_id');
          if (!['manager', 'admin'].includes(String(await deps.gateway.getRole(managerId)))) throw new AppError('FORBIDDEN', 403, 'The configured Hermes manager account is not authorized.');
          aiRateLimiter.check(managerId, 'hermes_manager_write', 10);
          const requestedArgs = { ...args };
          delete requestedArgs.action_id;
          const approvalId = typeof args.action_id === 'string' ? uuid(args.action_id, 'action_id') : null;
          if (!approvalId) {
            const now = Date.now();
            for (const [id, pending] of pendingHermesActions) if (now - pending.createdAt > 10 * 60_000) pendingHermesActions.delete(id);
            const actionId = randomUUID();
            pendingHermesActions.set(actionId, { action: name, managerId, args: requestedArgs, createdAt: now, state: 'pending' });
            send(response, 200, { status: 'confirmation_required', action_id: actionId, action: name, details: requestedArgs, expires_in_seconds: 600 });
            return;
          }
          const pending = pendingHermesActions.get(approvalId);
          if (!pending || pending.managerId !== managerId || pending.action !== name || pending.state !== 'pending' || stableJson(pending.args) !== stableJson(requestedArgs)) {
            throw new AppError('MANAGER_CONFIRMATION_INVALID', 409, 'The approval is missing, expired, or does not match the exact proposed change. Ask Hermes to prepare the change again.');
          }
          if (Date.now() - pending.createdAt > 10 * 60_000) {
            pendingHermesActions.delete(approvalId);
            throw new AppError('MANAGER_CONFIRMATION_INVALID', 409, 'The approval expired. Ask Hermes to prepare the change again.');
          }
          if (!activeHermesApprovals.get(managerId)?.has(approvalId)) throw new AppError('MANAGER_CONFIRMATION_REQUIRED', 409, 'The manager must confirm this exact action in the current authenticated chat turn.');
          pending.state = 'executing';
          if (!deps.gateway.recordAuditLog) throw new AppError('AUDIT_LOG_UNAVAILABLE', 503, 'Manager actions are disabled because audit logging is unavailable.');
          await deps.gateway.recordAuditLog({ userId: managerId, action: `hermes.${name}.requested`, entityType: 'hermes_action', entityId: null, metadata: { source: 'hermes', reason, action_id: approvalId, proposed: requestedArgs } });
          let entityType: string;
          let entityId: string;
          let actionResult: Record<string, unknown>;
          if (name === 'create_material') {
            if (!deps.gateway.createMaterial) throw new AppError('MATERIAL_ADMIN_UNAVAILABLE', 503, 'Material administration is unavailable.');
            entityId = await deps.gateway.createMaterial({
              sku: requiredText(args.sku, 'sku', 80), name: requiredText(args.name, 'name', 200),
              category: requiredText(args.category, 'category', 80), unit: requiredText(args.unit, 'unit', 40),
              reorderPoint: args.reorder_point === undefined ? 0 : nonnegativeNumber(args.reorder_point, 'reorder_point'),
              reorderQuantity: args.reorder_quantity === undefined ? 0 : nonnegativeNumber(args.reorder_quantity, 'reorder_quantity')
            });
            entityType = 'material'; actionResult = { material_id: entityId, current_stock: 0 };
          } else if (name === 'record_material_receipt') {
            entityId = uuid(args.material_id, 'material_id');
            await deps.gateway.runInventoryCommand({ action: 'receive', materialId: entityId, quantity: positiveNumber(args.quantity, 'quantity'), unitCost: args.unit_cost === undefined || args.unit_cost === null ? null : nonnegativeNumber(args.unit_cost, 'unit_cost') });
            entityType = 'material'; actionResult = { material_id: entityId, received_quantity: Number(args.quantity) };
          } else if (name === 'update_product_details') {
            if (!deps.gateway.updateProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product administration is unavailable.');
            entityId = uuid(args.product_id, 'product_id');
            const changes: Record<string, unknown> = {};
            for (const field of ['name', 'category', 'base_unit'] as const) if (args[field] !== undefined) changes[field] = requiredText(args[field], field, field === 'name' ? 200 : 80);
            if (args.description !== undefined) {
              if (typeof args.description !== 'string' || args.description.length > 4000) throw new AppError('INVALID_REQUEST', 400, 'description must be a string no longer than 4000 characters.');
              changes.description = args.description.trim();
            }
            if (args.active !== undefined) {
              if (typeof args.active !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'active must be a boolean.');
              changes.active = args.active;
            }
            if (!Object.keys(changes).length) throw new AppError('INVALID_REQUEST', 400, 'Provide at least one supported product field to change.');
            await deps.gateway.updateProduct(entityId, changes);
            entityType = 'product'; actionResult = { product_id: entityId, changes };
          } else if (name === 'update_order_status') {
            entityId = uuid(args.order_id, 'order_id');
            if (args.status !== 'cancelled' && args.status !== 'delivered') throw new AppError('INVALID_REQUEST', 400, 'status must be cancelled or delivered.');
            await deps.gateway.updateOrderStatus(entityId, args.status);
            entityType = 'order'; actionResult = { order_id: entityId, status: args.status };
          } else {
            entityId = uuid(args.production_job_id, 'production_job_id');
            const status = args.status;
            if (!['prepress', 'printing', 'finishing', 'quality_check', 'ready', 'cancelled'].includes(String(status))) throw new AppError('INVALID_REQUEST', 400, 'Invalid production status.');
            await deps.gateway.updateProductionStatus(entityId, status as ProductionStatus);
            entityType = 'production_job'; actionResult = { production_job_id: entityId, status };
          }
          let auditLogged = false;
          try {
            await deps.gateway.recordAuditLog({ userId: managerId, action: `hermes.${name}.completed`, entityType, entityId, metadata: { source: 'hermes', reason, action_id: approvalId, result: actionResult } });
            auditLogged = true;
          } catch (error) {
            console.error(JSON.stringify({ level: 'error', event: 'hermes.action.audit_failed', action: name, entity_type: entityType, entity_id: entityId, error_code: error instanceof AppError ? error.code : 'AUDIT_WRITE_FAILED' }));
          }
          pendingHermesActions.delete(approvalId);
          send(response, 200, { ...actionResult, audit_logged: auditLogged });
          return;
        }

        if (name === 'list_manager_products') {
          const products = await deps.gateway.listProducts('', true);
          send(response, 200, { products: products.map((value) => {
            const product = value as Record<string, unknown>;
            return { id: product.id, sku: product.sku, name: product.name, category: product.category, active: product.active,
              variants: Array.isArray(product.product_variants) ? (product.product_variants as Array<Record<string, unknown>>).map((variant) => ({ id: variant.id, sku: variant.sku, name: variant.name, active: variant.active })) : [] };
          }) });
          return;
        }

        if (name === 'check_inventory' || name === 'get_low_stock_items' || name === 'get_purchase_suggestions') {
          const materials = await deps.gateway.listInventory();
          const inventory = materials.map((material) => {
            const available = Number(material.current_stock) - Number(material.reserved_stock);
            return {
              material_id: material.id, sku: material.sku, name: material.name, category: material.category,
              unit: material.unit, current_stock: Number(material.current_stock), reserved_stock: Number(material.reserved_stock),
              available_stock: available, reorder_point: Number(material.reorder_point),
              reorder_quantity: Number(material.reorder_quantity), low_stock: available <= Number(material.reorder_point)
            };
          });
          if (name === 'check_inventory') { send(response, 200, { materials: inventory }); return; }
          const low = inventory.filter((material) => material.low_stock);
          if (name === 'get_low_stock_items') { send(response, 200, { items: low }); return; }
          send(response, 200, { suggestions: low.map(({ low_stock: _low, ...material }) => ({ ...material, suggested_quantity: material.reorder_quantity })) });
          return;
        }
        if (name === 'get_production_status') {
          send(response, 200, { jobs: await deps.gateway.listProduction() });
          return;
        }
        if (name === 'get_order_status') {
          const order = await deps.gateway.getOrder(uuid(args.order_id, 'order_id'));
          if (!order) throw new AppError('NOT_FOUND', 404, 'Order not found.');
          send(response, 200, {
            id: order.id, status: order.status, payment_status: order.payment_status,
            production_status: order.production_status, due_at: order.due_at, total: order.total,
            production_jobs: order.production_jobs
          });
          return;
        }
        if (name === 'get_sales_report') {
          const now = new Date();
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const from = parseReportDate(args.from, 'from', monthStart);
          const to = parseReportDate(args.to, 'to', now);
          if (from >= to) throw new AppError('INVALID_REQUEST', 400, 'from must be earlier than to.');
          if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new AppError('INVALID_REQUEST', 400, 'Sales report range cannot exceed 366 days.');
          send(response, 200, await deps.gateway.getSalesReport(from.toISOString(), to.toISOString()));
          return;
        }
        throw new AppError('NOT_FOUND', 404, `Unsupported Hermes tool: ${name}.`);
      }

      const actorUser = await deps.gateway.authenticate(bearerToken(request));
      const role = await deps.gateway.getRole(actorUser.id);
      if (!role) throw new AppError('FORBIDDEN', 403, 'This account has no PrintShop AI profile.');
      const actor: Actor = { id: actorUser.id, role };

      if (method === 'GET' && path === '/api/manager/products') {
        requireRole(actor, ['manager', 'admin']);
        send(response, 200, { products: await deps.gateway.listProducts('', true) });
        return;
      }

      if (method === 'POST' && path === '/api/manager/products') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.createProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product administration is not configured on this server.');
        const body = await readJson(request);
        if (body.requires_design !== undefined && typeof body.requires_design !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'requires_design must be a boolean.');
        if (body.requires_size !== undefined && typeof body.requires_size !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'requires_size must be a boolean.');
        if (body.active !== undefined && typeof body.active !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'active must be a boolean.');
        const id = await deps.gateway.createProduct({
          sku: requiredText(body.sku, 'sku', 80), name: requiredText(body.name, 'name', 200),
          category: requiredText(body.category, 'category', 80), base_unit: requiredText(body.base_unit, 'base_unit', 40),
          description: typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '',
          requires_design: body.requires_design ?? false, requires_size: body.requires_size ?? false, active: body.active ?? true
        });
        send(response, 201, { product_id: id });
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/manager/products/')) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.updateProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product administration is not configured on this server.');
        const id = uuid(path.slice('/api/manager/products/'.length), 'product_id');
        const body = await readJson(request);
        const update: Record<string, unknown> = {};
        for (const field of ['name', 'category', 'base_unit', 'description'] as const) {
          if (body[field] === undefined) continue;
          if (field === 'description') {
            if (typeof body.description !== 'string' || body.description.length > 4000) throw new AppError('INVALID_REQUEST', 400, 'description must be a string no longer than 4000 characters.');
            update.description = body.description.trim();
          } else {
            update[field] = requiredText(body[field], field, field === 'name' ? 200 : 80);
          }
        }
        if (body.active !== undefined) {
          if (typeof body.active !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'active must be a boolean.');
          update.active = body.active;
        }
        if (!Object.keys(update).length) throw new AppError('INVALID_REQUEST', 400, 'Provide at least one editable product field.');
        await deps.gateway.updateProduct(id, update);
        send(response, 200, { product_id: id, status: 'updated' });
        return;
      }
      const variantCreateMatch = method === 'POST' ? /^\/api\/manager\/products\/([^/]+)\/variants$/.exec(path) : null;
      if (variantCreateMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.createProductVariant) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product administration is not configured on this server.');
        const productId = uuid(decodePathSegment(variantCreateMatch[1], 'product_id'), 'product_id');
        const body = await readJson(request);
        const id = await deps.gateway.createProductVariant(productId, {
          sku: requiredText(body.sku, 'sku', 80), name: requiredText(body.name, 'name', 200),
          width_cm: optionalDimension(body.width_cm, 'width_cm'), height_cm: optionalDimension(body.height_cm, 'height_cm'),
          material: typeof body.material === 'string' && body.material.trim() ? requiredText(body.material, 'material', 120) : null,
          finishing: typeof body.finishing === 'string' && body.finishing.trim() ? requiredText(body.finishing, 'finishing', 120) : null,
          active: true
        });
        send(response, 201, { variant_id: id });
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/manager/variants/')) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.updateProductVariant) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product administration is not configured on this server.');
        const id = uuid(path.slice('/api/manager/variants/'.length), 'variant_id');
        const body = await readJson(request);
        const update: Record<string, unknown> = {};
        for (const field of ['name', 'material', 'finishing'] as const) {
          if (body[field] !== undefined) update[field] = body[field] === null || body[field] === '' ? null : requiredText(body[field], field, 200);
        }
        if (body.active !== undefined) {
          if (typeof body.active !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'active must be a boolean.');
          update.active = body.active;
        }
        if (body.width_cm !== undefined) update.width_cm = optionalDimension(body.width_cm, 'width_cm');
        if (body.height_cm !== undefined) update.height_cm = optionalDimension(body.height_cm, 'height_cm');
        if (!Object.keys(update).length) throw new AppError('INVALID_REQUEST', 400, 'Provide at least one editable variant field.');
        await deps.gateway.updateProductVariant(id, update);
        send(response, 200, { variant_id: id, status: 'updated' });
        return;
      }
      if (method === 'POST' && path === '/api/manager/price-rules') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.createPriceRule) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Price-rule administration is not configured on this server.');
        const body = await readJson(request);
        const min = positiveNumber(body.quantity_min, 'quantity_min');
        const max = body.quantity_max === undefined || body.quantity_max === null || body.quantity_max === '' ? null : positiveNumber(body.quantity_max, 'quantity_max');
        if (!Number.isSafeInteger(min) || (max !== null && (!Number.isSafeInteger(max) || max < min))) throw new AppError('INVALID_REQUEST', 400, 'Quantity bounds must be whole numbers with max greater than or equal to min.');
        const taxRate = body.tax_rate === undefined ? 0 : nonnegativeNumber(body.tax_rate, 'tax_rate');
        if (taxRate > 1) throw new AppError('INVALID_REQUEST', 400, 'tax_rate must be a decimal between 0 and 1.');
        const activeFrom = body.active_from === undefined ? new Date().toISOString().slice(0, 10) : requiredText(body.active_from, 'active_from', 10);
        if (!isIsoDate(activeFrom)) throw new AppError('INVALID_REQUEST', 400, 'active_from must be a valid YYYY-MM-DD date.');
        const reason = requiredText(body.reason, 'reason', 500);
        const id = await deps.gateway.createPriceRule(actor.id, {
          product_variant_id: uuid(body.product_variant_id, 'product_variant_id'), quantity_min: min, quantity_max: max,
          material: typeof body.material === 'string' && body.material.trim() ? requiredText(body.material, 'material', 120) : null,
          finishing: typeof body.finishing === 'string' && body.finishing.trim() ? requiredText(body.finishing, 'finishing', 120) : null,
          unit_price: optionalPrice(body.unit_price, 'unit_price'), fixed_fee: optionalPrice(body.fixed_fee, 'fixed_fee'),
          setup_fee: optionalPrice(body.setup_fee, 'setup_fee'), design_fee: optionalPrice(body.design_fee, 'design_fee', '50.00'),
          installation_fee: optionalPrice(body.installation_fee, 'installation_fee'), delivery_fee: optionalPrice(body.delivery_fee, 'delivery_fee'),
          tax_rate: taxRate, active_from: activeFrom
        }, reason);
        send(response, 201, { price_rule_id: id });
        return;
      }
      const priceRuleMatch = method === 'PATCH' ? /^\/api\/manager\/price-rules\/([^/]+)$/.exec(path) : null;
      if (priceRuleMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.endPriceRule) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Price-rule administration is not configured on this server.');
        const id = uuid(decodePathSegment(priceRuleMatch[1], 'price_rule_id'), 'price_rule_id');
        const body = await readJson(request);
        const activeTo = requiredText(body.active_to, 'active_to', 10);
        if (!isIsoDate(activeTo)) throw new AppError('INVALID_REQUEST', 400, 'active_to must be a valid YYYY-MM-DD date.');
        const reason = requiredText(body.reason, 'reason', 500);
        await deps.gateway.endPriceRule(actor.id, id, activeTo, reason);
        send(response, 200, { price_rule_id: id, status: 'ended' });
        return;
      }

      if (method === 'POST' && path === '/api/ai/chat') {
        requireRole(actor, ['manager', 'admin']);
        const body = await readJson(request);
        if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 16) {
          throw new AppError('INVALID_REQUEST', 400, 'messages must contain between 1 and 16 user/assistant messages.');
        }
        const messages: HermesChatMessage[] = body.messages.map((message: unknown) => {
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new AppError('INVALID_REQUEST', 400, 'Each message must be an object.');
          const row = message as Record<string, unknown>;
          if (row.role !== 'user' && row.role !== 'assistant') throw new AppError('INVALID_REQUEST', 400, 'Message role must be user or assistant.');
          return { role: row.role, content: requiredText(row.content, 'message content', 4000) };
        });
        if (messages.at(-1)?.role !== 'user') throw new AppError('INVALID_REQUEST', 400, 'The last message must be from the user.');
        if (messages.reduce((total, message) => total + message.content.length, 0) > 16000) throw new AppError('PAYLOAD_TOO_LARGE', 413, 'Combined message content exceeds 16,000 characters.');
        const question = messages.at(-1)!.content;
        const normalizedQuestion = question.toLocaleLowerCase('en');
        const arabic = /[\u0600-\u06ff]/.test(question);
        const language = arabic ? 'ar-EG' : 'en-EG';
        let verifiedReply: string | null = null;

        if (/low stock|out of stock|what should we buy|purchase suggestion|reorder|مخزون منخفض|ماذا نشتري|اقتراحات الشراء/.test(normalizedQuestion)) {
          const inventory = await deps.gateway.listInventory();
          const low = inventory.filter((item) => Number(item.current_stock) - Number(item.reserved_stock) <= Number(item.reorder_point));
          verifiedReply = low.length === 0
            ? (arabic ? 'لا توجد خامات منخفضة المخزون وفق حد إعادة الطلب المسجل.' : 'No materials are at or below their configured reorder points.')
            : low.map((item) => `${String(item.name)}: ${Number(item.current_stock) - Number(item.reserved_stock)} ${String(item.unit)} available; reorder point ${Number(item.reorder_point)}; configured suggestion ${Number(item.reorder_quantity)}.`).join('\n');
        } else if (/\b(stock|inventory)\b|المخزون|الرصيد/.test(normalizedQuestion)) {
          const inventory = await deps.gateway.listInventory();
          verifiedReply = inventory.length === 0
            ? (arabic ? 'لا توجد خامات مسجلة في المخزون.' : 'There are no materials in the inventory ledger.')
            : inventory.map((item) => `${String(item.name)}: ${Number(item.current_stock) - Number(item.reserved_stock)} ${String(item.unit)} available (${Number(item.reserved_stock)} reserved).`).join('\n');
        } else if (
          (/\b(sales|revenue|sold)\b|المبيعات|بعنا|مبيعات/.test(normalizedQuestion)) &&
          !/\b(compare|versus|vs|this year|last year|today|yesterday|this week|last week|from .+ to .+)\b|مقارنة|السنة|اليوم|أمس/.test(normalizedQuestion)
        ) {
          const now = new Date();
          const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const lastMonth = /\b(last|previous|past) month\b|الشهر الماضي|الشهر السابق/.test(normalizedQuestion);
          const from = lastMonth ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)) : thisMonth;
          const to = lastMonth ? thisMonth : now;
          const report = await deps.gateway.getSalesReport(from.toISOString(), to.toISOString());
          const count = Math.max(0, Number(report.order_count ?? 0) - Number(report.cancelled_order_count ?? 0));
          const period = lastMonth ? (arabic ? 'الشهر الماضي' : 'Last month') : (arabic ? 'من بداية الشهر الحالي حتى الآن' : 'UTC month to date');
          verifiedReply = arabic
            ? `${period}: قيمة الطلبات غير الملغاة ${Number(report.order_value_egp ?? 0).toLocaleString(language)} جنيه عبر ${count} طلب. هذه قيمة الطلبات وليست المبالغ المحصلة.`
            : `${period}: EGP ${Number(report.order_value_egp ?? 0).toLocaleString(language)} in non-cancelled order value across ${count} orders. This is order value, not cash collected.`;
        } else if (/\bproduction\b|الإنتاج|حالة الإنتاج/.test(normalizedQuestion)) {
          const jobs = await deps.gateway.listProduction();
          verifiedReply = jobs.length === 0
            ? (arabic ? 'لا توجد مهام إنتاج مسجلة.' : 'There are no production jobs in the queue.')
            : jobs.map((value) => {
                const job = value as Record<string, unknown>;
                return `Order ${String(job.order_id)}: ${String(job.status)}${job.scheduled_at ? ` · scheduled ${String(job.scheduled_at)}` : ''}.`;
              }).join('\n');
        } else {
          const orderId = question.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0];
          if (orderId && /\b(order|status)\b|طلب|حالة/.test(normalizedQuestion)) {
            const order = await deps.gateway.getOrder(orderId);
            verifiedReply = order
              ? `Order ${String(order.id)}: ${String(order.status)}; payment ${String(order.payment_status)}; production ${String(order.production_status ?? 'not started')}; due ${String(order.due_at ?? 'not scheduled')}; total EGP ${Number(order.total ?? 0).toFixed(2)}.`
              : (arabic ? 'لم يتم العثور على الطلب.' : 'I could not find that order.');
          }
        }
        if (verifiedReply !== null) {
          send(response, 200, { reply: verifiedReply, model: 'backend-deterministic', usage: null, latency_ms: 0 });
          return;
        }
        aiRateLimiter.check(actor.id, 'manager_chat', 12);
        if (!deps.hermes) throw new AppError('HERMES_UNAVAILABLE', 503, 'Hermes chat is not configured on this server.');
        let approvedActionId: string | undefined;
        const confirmation = /^I CONFIRM THIS CHANGE ([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(question.trim());
        const precedingAssistant = messages.at(-2);
        if (confirmation && precedingAssistant?.role === 'assistant') {
          const proposedId = confirmation[1].toLowerCase();
          const pending = pendingHermesActions.get(proposedId);
          if (pending && pending.managerId === actor.id && Date.now() - pending.createdAt <= 10 * 60_000 && precedingAssistant.content.toLowerCase().includes(proposedId)) {
            approvedActionId = proposedId;
          }
        }
        const startedAt = Date.now();
        let completion: Awaited<ReturnType<HermesChatClient['complete']>>;
        if (approvedActionId) {
          const active = activeHermesApprovals.get(actor.id) ?? new Set<string>();
          active.add(approvedActionId);
          activeHermesApprovals.set(actor.id, active);
        }
        try {
          completion = await deps.hermes.complete([{ role: 'system', content: hermesInstructions }, ...messages]);
        } catch (error) {
          try { await deps.gateway.recordAiRun({ feature: 'manager_chat', model: null, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, success: false }); }
          catch (logError) { console.error('Could not record failed Hermes run.', logError); }
          throw error;
        } finally {
          if (approvedActionId) {
            const active = activeHermesApprovals.get(actor.id);
            active?.delete(approvedActionId);
            if (active?.size === 0) activeHermesApprovals.delete(actor.id);
          }
        }
        const latencyMs = Date.now() - startedAt;
        try {
          await deps.gateway.recordAiRun({ feature: 'manager_chat', model: completion.model, inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0, latencyMs, success: true });
        } catch (logError) { console.error('Could not record successful Hermes run.', logError); }
        send(response, 200, { reply: completion.content, model: completion.model, usage: completion.usage ?? null, latency_ms: latencyMs });
        return;
      }

      if (method === 'GET' && path === '/api/me') {
        send(response, 200, { user_id: actor.id, role, customer_id: role === 'customer' ? await deps.gateway.getCustomerId(actor.id) : null });
        return;
      }

      if (method === 'GET' && path === '/api/analytics/business') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.getBusinessAnalytics) throw new AppError('ANALYTICS_UNAVAILABLE', 503, 'Business analytics are not configured on this server.');
        const params = new URL(request.url ?? '/', 'http://localhost').searchParams;
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const from = parseReportDate(params.get('from') ?? undefined, 'from', monthStart);
        const to = parseReportDate(params.get('to') ?? undefined, 'to', now);
        if (from >= to) throw new AppError('INVALID_REQUEST', 400, 'from must be earlier than to.');
        if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new AppError('INVALID_REQUEST', 400, 'Analytics range cannot exceed 366 days.');
        send(response, 200, await deps.gateway.getBusinessAnalytics(from.toISOString(), to.toISOString()));
        return;
      }

      if (method === 'GET' && path === '/api/customers') {
        requireRole(actor, ['manager', 'sales', 'admin']);
        send(response, 200, { customers: await deps.gateway.listCustomers() });
        return;
      }
      if (method === 'POST' && path === '/api/customers') {
        requireRole(actor, ['manager', 'sales', 'admin']);
        const body = await readJson(request);
        const email = typeof body.email === 'string' && body.email.trim() ? requiredText(body.email, 'email', 254).toLowerCase() : null;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('INVALID_REQUEST', 400, 'email must be a valid email address.');
        const phone = typeof body.phone === 'string' && body.phone.trim() ? requiredText(body.phone, 'phone', 40) : null;
        if (!email && !phone) throw new AppError('INVALID_REQUEST', 400, 'Provide an email address or phone number for this customer.');
        const id = await deps.gateway.createCustomer({
          name: requiredText(body.name, 'name', 200),
          companyName: typeof body.company_name === 'string' && body.company_name.trim() ? requiredText(body.company_name, 'company_name', 200) : null,
          email, phone
        });
        send(response, 201, { customer_id: id });
        return;
      }

      if (method === 'POST' && path === '/api/quotes') {
        requireRole(actor, ['customer', 'manager', 'sales', 'admin']);
        const body = await readJson(request);
        if (!Array.isArray(body.items)) throw new AppError('INVALID_REQUEST', 400, 'items must be an array.');
        const quote = await calculateQuote(body.items as QuoteLineInput[], deps.pricing);

        let customerId: string | null;
        if (role === 'customer') customerId = await deps.gateway.getCustomerId(actor.id);
        else {
          customerId = typeof body.customer_id === 'string' ? body.customer_id : null;
          if (customerId && !await deps.gateway.customerExists(customerId)) customerId = null;
        }
        if (!customerId) throw new AppError('INVALID_CUSTOMER', 422, 'A valid customer_id is required for this quote.');
        const quoteId = await deps.gateway.saveQuote({
          customerId, subtotal: quote.subtotal, discount: quote.discount, tax: quote.tax, total: quote.total,
          items: quote.breakdown.map((line) => ({
            product_variant_id: line.variant_id, quantity: line.quantity, unit_price: line.unit_price,
            options: { ...line.options, pricing_basis: line.pricing_basis, ...(line.market_reference_id ? { market_reference_id: line.market_reference_id } : {}) },
            design_required: line.design_required, notes: line.notes
          }))
        });
        send(response, 201, { quote_id: quoteId, ...quote });
        return;
      }

      if (method === 'GET' && path === '/api/quotes') {
        requireRole(actor, ['customer', 'manager', 'sales', 'admin']);
        const customerId = role === 'customer' ? await deps.gateway.getCustomerId(actor.id) : undefined;
        if (role === 'customer' && !customerId) throw new AppError('FORBIDDEN', 403, 'Customer profile not found.');
        send(response, 200, { quotes: await deps.gateway.listQuotes(customerId ?? undefined) });
        return;
      }

      const quoteId = method === 'GET' ? routeId(path, '/api/quotes/') : null;
      if (quoteId) {
        requireRole(actor, ['customer', 'manager', 'sales', 'admin']);
        const quote = await deps.gateway.getQuote(uuid(quoteId, 'quote_id'));
        if (!quote) throw new AppError('NOT_FOUND', 404, 'Quote not found.');
        if (role === 'customer' && await deps.gateway.getCustomerId(actor.id) !== quote.customer_id) throw new AppError('NOT_FOUND', 404, 'Quote not found.');
        send(response, 200, quote);
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/quotes/') && path.endsWith('/status')) {
        requireRole(actor, ['customer', 'manager', 'sales', 'admin']);
        if (!path.endsWith('/status')) throw new AppError('NOT_FOUND', 404, 'Route not found.');
        const id = uuid(path.slice('/api/quotes/'.length, -'/status'.length), 'quote_id');
        const body = await readJson(request);
        const status = body.status;
        if (!['sent', 'accepted', 'rejected', 'expired'].includes(String(status))) throw new AppError('INVALID_REQUEST', 400, 'status must be sent, accepted, rejected, or expired.');
        const quote = await deps.gateway.getQuote(id);
        if (!quote) throw new AppError('NOT_FOUND', 404, 'Quote not found.');
        if (role === 'customer') {
          if (!['accepted', 'rejected'].includes(String(status))) throw new AppError('FORBIDDEN', 403, 'Customers can only accept or reject a quote.');
          if (await deps.gateway.getCustomerId(actor.id) !== quote.customer_id) throw new AppError('NOT_FOUND', 404, 'Quote not found.');
        } else if (!['sent', 'expired'].includes(String(status))) {
          throw new AppError('FORBIDDEN', 403, 'Staff can send or expire a quote; customers accept or reject it.');
        }
        // Customer quotes are shown with their calculated price as soon as they are saved.
        // If such a quote is still a draft, acceptance itself confirms it was presented
        // to the customer; persist the required transition before recording acceptance.
        if (role === 'customer' && status === 'accepted' && quote.status === 'draft') {
          await deps.gateway.updateQuoteStatus(id, 'sent');
        }
        await deps.gateway.updateQuoteStatus(id, status as QuoteStatus);
        send(response, 200, { quote_id: id, status });
        return;
      }

      if (method === 'POST' && path === '/api/orders') {
        requireRole(actor, ['customer', 'manager', 'sales', 'admin']);
        const body = await readJson(request);
        const id = uuid(body.quote_id, 'quote_id');
        const deliveryMethod = body.delivery_method === 'pickup' ? 'pickup' : body.delivery_method === 'delivery' ? 'delivery' : null;
        if (!deliveryMethod) throw new AppError('INVALID_REQUEST', 400, 'delivery_method must be delivery or pickup.');
        const deliveryAddress = requiredText(body.delivery_address, 'delivery_address', 500);
        if (deliveryMethod === 'delivery' && !/mansoura|منصورة/i.test(deliveryAddress)) throw new AppError('INVALID_REQUEST', 400, 'Delivery is currently limited to Mansoura.');
        const deliveryPhone = deliveryMethod === 'delivery' ? requiredText(body.delivery_phone, 'delivery_phone', 30) : null;
        if (deliveryPhone && deliveryPhone.replace(/\D/g, '').length < 7) throw new AppError('INVALID_REQUEST', 400, 'delivery_phone must contain at least seven digits.');
        const quote = await deps.gateway.getQuote(id);
        if (!quote) throw new AppError('NOT_FOUND', 404, 'Quote not found.');
        if (role === 'customer' && await deps.gateway.getCustomerId(actor.id) !== quote.customer_id) throw new AppError('NOT_FOUND', 404, 'Quote not found.');
        const orderId = await deps.gateway.createOrderFromQuote(id, deliveryMethod, deliveryAddress, deliveryPhone);
        send(response, 201, { order_id: orderId, status: 'confirmed' });
        return;
      }
      if (method === 'GET' && path === '/api/orders') {
        requireRole(actor, ['customer', 'manager', 'sales', 'production', 'marketing', 'admin']);
        const customerId = role === 'customer' ? await deps.gateway.getCustomerId(actor.id) : undefined;
        if (role === 'customer' && !customerId) throw new AppError('FORBIDDEN', 403, 'Customer profile not found.');
        const orders = await deps.gateway.listOrders(customerId ?? undefined);
        send(response, 200, { orders: role === 'marketing' ? orders.filter((order) => Boolean(order) && typeof order === 'object' && (order as Record<string, unknown>).status === 'delivered').map((order) => {
          const row = order as Record<string, unknown>;
          return { id: row.id, status: row.status, created_at: row.created_at };
        }) : orders });
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/orders/') && path.endsWith('/status')) {
        requireRole(actor, ['manager', 'admin']);
        const id = uuid(path.slice('/api/orders/'.length, -'/status'.length), 'order_id');
        const body = await readJson(request);
        if (!['delivered', 'cancelled'].includes(String(body.status))) throw new AppError('INVALID_REQUEST', 400, 'status must be delivered or cancelled.');
        const status = body.status as OrderStatus;
        await deps.gateway.updateOrderStatus(id, status);
        send(response, 200, { order_id: id, status });
        return;
      }
      const orderId = method === 'GET' ? routeId(path, '/api/orders/') : null;
      if (orderId) {
        requireRole(actor, ['customer', 'manager', 'sales', 'production', 'admin']);
        const order = await deps.gateway.getOrder(uuid(orderId, 'order_id'));
        if (!order) throw new AppError('NOT_FOUND', 404, 'Order not found.');
        if (role === 'customer' && await deps.gateway.getCustomerId(actor.id) !== order.customer_id) throw new AppError('NOT_FOUND', 404, 'Order not found.');
        send(response, 200, order);
        return;
      }

      if (method === 'GET' && (path === '/api/inventory' || path === '/api/inventory/low-stock' || path === '/api/inventory/purchase-suggestions')) {
        requireRole(actor, ['manager', 'production', 'admin']);
        const materials = await deps.gateway.listInventory();
        const low = materials.filter((material) => Number(material.current_stock) - Number(material.reserved_stock) <= Number(material.reorder_point));
        if (path === '/api/inventory/low-stock') { send(response, 200, { items: low }); return; }
        if (path === '/api/inventory/purchase-suggestions') {
          send(response, 200, { suggestions: low.map((material) => ({ material_id: material.id, sku: material.sku, name: material.name, unit: material.unit, available_stock: Number(material.current_stock) - Number(material.reserved_stock), suggested_quantity: Number(material.reorder_quantity) })) });
          return;
        }
        send(response, 200, { materials });
        return;
      }
      if (method === 'POST' && ['/api/inventory/receive', '/api/inventory/adjust', '/api/inventory/reserve', '/api/inventory/release', '/api/inventory/consume'].includes(path)) {
        requireRole(actor, ['manager', 'admin']);
        const body = await readJson(request);
        const materialId = uuid(body.material_id, 'material_id');
        let command: InventoryCommand;
        if (path.endsWith('/receive')) {
          command = { action: 'receive', materialId, quantity: positiveNumber(body.quantity, 'quantity'), unitCost: body.unit_cost === undefined || body.unit_cost === null ? null : nonnegativeNumber(body.unit_cost, 'unit_cost') };
        } else if (path.endsWith('/adjust')) {
          const delta = typeof body.delta === 'number' ? body.delta : Number(body.delta);
          if (!Number.isFinite(delta) || delta === 0) throw new AppError('INVALID_REQUEST', 400, 'delta must be a non-zero number.');
          command = { action: 'adjust', materialId, delta };
        } else {
          command = { action: path.endsWith('/reserve') ? 'reserve' : path.endsWith('/release') ? 'release' : 'consume', materialId, quantity: positiveNumber(body.quantity, 'quantity'), orderId: uuid(body.order_id, 'order_id') };
        }
        await deps.gateway.runInventoryCommand(command);
        if (command.action === 'receive' || command.action === 'adjust' || command.action === 'consume' || command.action === 'reserve') {
          const material = (await deps.gateway.listInventory()).find((item) => item.id === command.materialId);
          if (material) {
            const available = Number(material.current_stock) - Number(material.reserved_stock);
            if (available <= Number(material.reorder_point)) await dispatchN8n(deps, { type: 'inventory.low_stock', to_email: deps.managerEmail, material_id: material.id, sku: material.sku, name: material.name, available_stock: available, unit: material.unit, reorder_point: material.reorder_point, suggested_quantity: material.reorder_quantity });
          }
        }
        send(response, 200, { status: 'ok' });
        return;
      }
      if (method === 'POST' && path === '/api/inventory/materials') {
        requireRole(actor, ['manager', 'admin']);
        const body = await readJson(request);
        const id = await deps.gateway.createMaterial({
          sku: requiredText(body.sku, 'sku', 80), name: requiredText(body.name, 'name', 200),
          category: requiredText(body.category, 'category', 80), unit: requiredText(body.unit, 'unit', 40),
          reorderPoint: body.reorder_point === undefined ? 0 : nonnegativeNumber(body.reorder_point, 'reorder_point'),
          reorderQuantity: body.reorder_quantity === undefined ? 0 : nonnegativeNumber(body.reorder_quantity, 'reorder_quantity')
        });
        send(response, 201, { material_id: id, current_stock: 0 });
        return;
      }
      const requirementPath = method === 'POST' && path.startsWith('/api/products/') && path.endsWith('/material-requirements');
      if (requirementPath) {
        requireRole(actor, ['manager', 'admin']);
        const productId = uuid(path.slice('/api/products/'.length, -'/material-requirements'.length), 'product_id');
        const body = await readJson(request);
        const quantityPerUnit = positiveNumber(body.quantity_per_unit, 'quantity_per_unit');
        const wasteFactor = body.waste_factor === undefined ? 0 : nonnegativeNumber(body.waste_factor, 'waste_factor');
        if (!Number.isFinite(wasteFactor) || wasteFactor < 0 || wasteFactor > 10) throw new AppError('INVALID_REQUEST', 400, 'waste_factor must be between 0 and 10.');
        const id = await deps.gateway.createMaterialRequirement({ productId, variantId: uuid(body.variant_id, 'variant_id'), materialId: uuid(body.material_id, 'material_id'), quantityPerUnit, wasteFactor });
        send(response, 201, { requirement_id: id });
        return;
      }

      if (method === 'GET' && path === '/api/production') {
        requireRole(actor, ['manager', 'production', 'admin']);
        send(response, 200, { jobs: await deps.gateway.listProduction() });
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/production/') && path.endsWith('/status')) {
        requireRole(actor, ['manager', 'production', 'admin']);
        if (!path.endsWith('/status')) throw new AppError('NOT_FOUND', 404, 'Route not found.');
        const id = uuid(path.slice('/api/production/'.length, -'/status'.length), 'production_job_id');
        const body = await readJson(request);
        const status = body.status;
        if (!['prepress', 'printing', 'finishing', 'quality_check', 'ready', 'cancelled'].includes(String(status))) throw new AppError('INVALID_REQUEST', 400, 'Invalid production status.');
        await deps.gateway.updateProductionStatus(id, status as ProductionStatus);
        if (status === 'ready') {
          const job = (await deps.gateway.listProduction()).find((item) => Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
          if (job) {
            const order = await deps.gateway.getOrder(String(job.order_id));
            const customer = order?.customers && typeof order.customers === 'object' ? order.customers as Record<string, unknown> : {};
            await dispatchN8n(deps, { type: 'order.ready', to_email: customer.email, customer_name: customer.name, order_id: job.order_id, production_job_id: id });
          }
        }
        send(response, 200, { production_job_id: id, status });
        return;
      }

      if (method === 'GET' && path === '/api/design-requests') {
        requireRole(actor, ['customer', 'manager', 'sales', 'production', 'marketing', 'admin']);
        const customerId = role === 'customer' ? await deps.gateway.getCustomerId(actor.id) : undefined;
        if (role === 'customer' && !customerId) throw new AppError('FORBIDDEN', 403, 'Customer profile not found.');
        send(response, 200, { design_requests: await deps.gateway.listDesignRequests(customerId ?? undefined) });
        return;
      }
      if (method === 'GET' && path === '/api/marketing/assets') {
        requireRole(actor, ['manager', 'marketing', 'admin']);
        send(response, 200, { assets: await deps.gateway.listMarketingAssets() });
        return;
      }
      if (method === 'POST' && path === '/api/marketing/draft') {
        requireRole(actor, ['manager', 'marketing', 'admin']);
        aiRateLimiter.check(actor.id, 'marketing_draft', 6);
        if (!deps.hermes) throw new AppError('HERMES_UNAVAILABLE', 503, 'Hermes is not configured; marketing draft generation is unavailable.');
        const body = await readJson(request);
        if ('order_id' in body) throw new AppError('INVALID_REQUEST', 400, 'Marketing campaigns are independent from customer orders. Submit a campaign brief and optional catalog product instead.');
        const campaignBrief = requiredText(body.campaign_brief, 'campaign_brief', 1500);
        const campaignType = requiredText(body.campaign_type ?? 'product_showcase', 'campaign_type', 40).toLowerCase();
        if (!['product_showcase', 'promotion', 'educational', 'seasonal', 'brand', 'engagement', 'new_product'].includes(campaignType)) throw new AppError('INVALID_REQUEST', 400, 'Choose a supported campaign type.');
        const productId = body.product_id === undefined || body.product_id === null || body.product_id === '' ? null : uuid(body.product_id, 'product_id');
        const product = productId ? await deps.gateway.getProduct(productId) : null;
        if (productId && !product) throw new AppError('NOT_FOUND', 404, 'Active catalog product not found.');
        const platform = requiredText(body.platform, 'platform', 40).toLowerCase();
        if (!['instagram', 'facebook', 'linkedin', 'x', 'general'].includes(platform)) throw new AppError('INVALID_REQUEST', 400, 'Choose instagram, facebook, linkedin, x, or general.');
        const facts = product ? { name: product.name, category: product.category, description: product.description } : null;
        const generateImage = body.generate_image === true;
        if (generateImage && (!deps.marketingImage || !deps.gateway.uploadMarketingImage)) throw new AppError('IMAGE_GENERATION_UNAVAILABLE', 503, 'Marketing image generation is disabled or private image storage is unavailable.');
        aiRateLimiter.check(actor.id, 'manager_chat', 12);
        const startedAt = Date.now();
        let completion: Awaited<ReturnType<HermesChatClient['complete']>>;
        try {
          completion = await deps.hermes.complete([
            { role: 'system', content: 'You are the print shop marketing copywriter. Create a campaign caption from the marketing brief and optional public catalog product only. Do not use or infer customer orders, private data, prices, stock, performance claims, or unsupported product features. Include a suitable call to action and 3 to 5 relevant hashtags. Return only the caption. Manager approval is required before publication.' },
            { role: 'user', content: JSON.stringify({ platform, campaign_type: campaignType, campaign_brief: campaignBrief, catalog_product: facts }) }
          ]);
        } catch (error) {
          try { await deps.gateway.recordAiRun({ feature: 'marketing_draft', model: null, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, success: false }); } catch { /* Preserve the model error. */ }
          throw error;
        }
        const caption = requiredText(completion.content, 'generated caption', 4000);
        let designUrl: string | null = null;
        if (generateImage && deps.marketingImage && deps.gateway.uploadMarketingImage) {
          const prompt = `Create an original social media campaign artwork for an Egyptian print shop. Campaign type: ${campaignType}. Brief: ${campaignBrief}. ${facts ? `Optional product reference: ${JSON.stringify(facts)}.` : ''} Make a polished, premium, print-inspired graphic composition suitable for ${platform}. No order mockup, no customer content, no logos unless specified in the brief, and avoid rendered text so copy can be added in the post caption. Square 1:1 composition, strong visual hierarchy, high contrast.`;
          const imageStartedAt = Date.now();
          try {
            const generated = await deps.marketingImage.generate(prompt);
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(generated.mimeType) || generated.data.length > 12_000_000) throw new AppError('INVALID_GENERATED_IMAGE', 502, 'Image provider returned an unsupported or oversized marketing image.');
            designUrl = await deps.gateway.uploadMarketingImage({ id: randomUUID(), mimeType: generated.mimeType, data: generated.data });
            try { await deps.gateway.recordAiRun({ feature: 'marketing_image', model: generated.model, inputTokens: 0, outputTokens: 0, estimatedCostUsd: generated.estimatedCostUsd, latencyMs: Date.now() - imageStartedAt, success: true }); } catch (error) { console.error('Could not record marketing image AI run.', error); }
          } catch (error) {
            try { await deps.gateway.recordAiRun({ feature: 'marketing_image', model: process.env.MARKETING_IMAGE_PROVIDER ?? 'AI Horde', inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: Date.now() - imageStartedAt, success: false }); } catch (recordError) { console.error('Could not record failed marketing image AI run.', recordError); }
            throw error;
          }
        }
        const id = await deps.gateway.createMarketingAsset({ orderId: null, productId, campaignBrief, campaignType, createdBy: actor.id, designUrl, platform, caption });
        try { await deps.gateway.recordAiRun({ feature: 'marketing_draft', model: completion.model, inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0, latencyMs: Date.now() - startedAt, success: true }); } catch (error) { console.error('Could not record marketing AI run.', error); }
        send(response, 201, { asset_id: id, status: 'pending_approval', caption, design_url: designUrl, model: completion.model });
        return;
      }
      if (method === 'GET' && path.startsWith('/api/marketing/assets/')) {
        requireRole(actor, ['manager', 'marketing', 'admin']);
        const id = uuid(path.slice('/api/marketing/assets/'.length), 'marketing_asset_id');
        const assets = await deps.gateway.listMarketingAssets();
        const asset = assets.find((item) => Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).id === id);
        if (!asset) throw new AppError('NOT_FOUND', 404, 'Marketing asset not found.');
        send(response, 200, asset);
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/marketing/assets/') && path.endsWith('/status')) {
        requireRole(actor, ['manager', 'admin']);
        const id = uuid(path.slice('/api/marketing/assets/'.length, -'/status'.length), 'marketing_asset_id');
        const body = await readJson(request);
        if (body.status !== 'approved' && body.status !== 'rejected') throw new AppError('INVALID_REQUEST', 400, 'status must be approved or rejected.');
        await deps.gateway.updateMarketingAssetStatus(id, body.status);
        if (body.status === 'approved') {
          const asset = (await deps.gateway.listMarketingAssets()).find((item) => Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
          if (asset) await dispatchN8n(deps, { type: 'marketing.approved', to_email: deps.managerEmail, asset_id: id, platform: asset.platform, caption: asset.caption });
        }
        send(response, 200, { asset_id: id, status: body.status });
        return;
      }
      if (method === 'POST' && path === '/api/design-requests') {
        requireRole(actor, ['customer', 'manager', 'sales', 'admin']);
        const body = await readJson(request);
        let customerId: string | null = role === 'customer' ? await deps.gateway.getCustomerId(actor.id) : typeof body.customer_id === 'string' ? body.customer_id : null;
        if (customerId && role !== 'customer' && !await deps.gateway.customerExists(customerId)) customerId = null;
        if (!customerId) throw new AppError('INVALID_CUSTOMER', 422, 'A valid customer profile is required.');
        const orderId = body.order_id === undefined || body.order_id === null ? null : uuid(body.order_id, 'order_id');
        if (orderId && !await deps.gateway.orderBelongsToCustomer(orderId, customerId)) throw new AppError('INVALID_ORDER', 422, 'The order does not belong to this customer.');
        const files = body.reference_files ?? [];
        if (!Array.isArray(files) || files.length > 10 || files.some((file) => typeof file !== 'string' || file.length > 2048)) throw new AppError('INVALID_REQUEST', 400, 'reference_files must contain up to 10 file URLs.');
        if ((files as string[]).some((file) => !file.startsWith(`${actor.id}/`))) throw new AppError('FORBIDDEN', 403, 'Reference files must be uploaded to your private design folder.');
        let designFee = 0;
        if (body.shop_design === true) {
          if (role !== 'customer' || !orderId) throw new AppError('INVALID_ORDER', 422, 'Shop design must be requested on the signed-in customer order.');
          const order = await deps.gateway.getOrder(orderId);
          if (!order || order.customer_id !== customerId || !order.quote_id) throw new AppError('INVALID_ORDER', 422, 'The order does not belong to this customer.');
          const quote = await deps.gateway.getQuote(String(order.quote_id));
          if (!quote || quote.customer_id !== customerId) throw new AppError('INVALID_ORDER', 422, 'The design fee quote does not belong to this customer.');
          const quoteItems = Array.isArray(quote?.quote_items) ? quote.quote_items as Array<Record<string, unknown>> : [];
          const approvedDesignFeeIncluded = quoteItems.some((item) => {
            if (item.design_required !== true || !item.options || typeof item.options !== 'object') return false;
            return (item.options as Record<string, unknown>).design_fee === '50.00';
          });
          if (!approvedDesignFeeIncluded) throw new AppError('DESIGN_FEE_NOT_INCLUDED', 422, 'This order does not include the manager-approved EGP 50 design service. Recalculate the quote with shop design selected.');
          designFee = 50;
        }
        const id = await deps.gateway.createDesignRequest({ customerId, orderId, brief: requiredText(body.brief, 'brief'), referenceFiles: files as string[], customerNotes: typeof body.customer_notes === 'string' ? body.customer_notes.slice(0, 2000) : null, designFee });
        send(response, 201, { design_request_id: id, status: 'requested' });
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/design-requests/') && path.endsWith('/status')) {
        requireRole(actor, ['customer', 'manager', 'sales', 'admin']);
        const id = uuid(path.slice('/api/design-requests/'.length, -'/status'.length), 'design_request_id');
        const body = await readJson(request);
        const status = body.status;
        if (!['reviewing', 'designing', 'customer_review', 'approved', 'rejected', 'completed'].includes(String(status))) throw new AppError('INVALID_REQUEST', 400, 'Invalid design request status.');
        const requestRow = await deps.gateway.getDesignRequest(id);
        if (!requestRow) throw new AppError('NOT_FOUND', 404, 'Design request not found.');
        if (role === 'customer') {
          if (requestRow.status !== 'customer_review' || !['approved', 'rejected'].includes(String(status))) throw new AppError('FORBIDDEN', 403, 'Customers can only approve or reject a design under review.');
          if (await deps.gateway.getCustomerId(actor.id) !== requestRow.customer_id) throw new AppError('NOT_FOUND', 404, 'Design request not found.');
        } else if (!(['reviewing', 'designing', 'customer_review', 'completed'].includes(String(status)))) {
          throw new AppError('FORBIDDEN', 403, 'Staff can review, design, submit for customer review, or complete requests.');
        }
        await deps.gateway.updateDesignRequestStatus(id, status as DesignRequestStatus);
        send(response, 200, { design_request_id: id, status });
        return;
      }

      if (method === 'PATCH' && path.startsWith('/api/design-requests/') && path.endsWith('/file')) {
        requireRole(actor, ['manager', 'sales', 'admin']);
        const id = uuid(path.slice('/api/design-requests/'.length, -'/file'.length), 'design_request_id');
        const body = await readJson(request);
        const storagePath = requiredText(body.final_design_path, 'final_design_path', 512);
        if (!storagePath.startsWith(`${actor.id}/`)) throw new AppError('FORBIDDEN', 403, 'Design files must be stored in the signed-in staff member’s private folder.');
        const requestRow = await deps.gateway.getDesignRequest(id);
        if (!requestRow) throw new AppError('NOT_FOUND', 404, 'Design request not found.');
        if (!['designing', 'rejected'].includes(String(requestRow.status))) throw new AppError('INVALID_TRANSITION', 409, 'A final design can only be attached while the request is being designed or revised.');
        await deps.gateway.updateDesignRequestFile(id, storagePath);
        send(response, 200, { design_request_id: id, final_design_path: storagePath });
        return;
      }

      throw new AppError('NOT_FOUND', 404, 'Route not found.');
    } catch (error) {
      sendError(response, error, requestId);
    }
  });
}
