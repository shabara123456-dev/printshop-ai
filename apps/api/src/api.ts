import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.ts';
import { calculateQuote, type PricingRepository, type ProductOptionGroup, type QuoteLineInput } from './pricing.ts';
import type { N8nOperationsOverview } from './n8n-management-client.ts';

export type Role = 'customer' | 'manager' | 'sales' | 'production' | 'marketing' | 'admin';
export type QuoteStatus = 'sent' | 'accepted' | 'rejected' | 'expired';
export type OrderStatus = 'delivered' | 'cancelled';
export type ProductionStatus = 'prepress' | 'printing' | 'finishing' | 'quality_check' | 'ready' | 'cancelled';
export type DesignRequestStatus = 'reviewing' | 'designing' | 'customer_review' | 'approved' | 'rejected' | 'completed';
export type InventoryCommand =
  | { action: 'receive'; materialId: string; quantity: number; unitCost?: number | null }
  | { action: 'adjust'; materialId: string; delta: number }
  | { action: 'reserve' | 'release' | 'consume'; materialId: string; quantity: number; orderId: string };

export type StorefrontConfig = {
  store_name: string; tagline: string; hero_eyebrow: string;
  hero_title_en: string; hero_title_ar: string;
  hero_description_en: string; hero_description_ar: string;
  announcement_en: string; announcement_ar: string;
  accent_color: string; featured_product_ids: string[];
  theme: 'midnight' | 'paper' | 'studio'; background_color: string; surface_color: string; text_color: string; button_color: string;
  font_family: 'sans' | 'serif'; layout: 'wide' | 'editorial'; hero_image_path: string; logo_path: string; logo_placement: 'left' | 'center' | 'right';
  cta_label_en: string; cta_label_ar: string; featured_categories: string[];
};

export type MarketingPlanSettings = {
  goals: string; target_audience: string; product_ids: string[]; platforms: string[];
  campaign_themes: string[]; posts_per_month: number; important_dates: Array<{ date: string; label: string }>;
  brand_voice: string; visual_preferences: string;
};

const defaultMarketingPlanSettings: MarketingPlanSettings = {
  goals: 'Build local brand awareness and generate qualified print enquiries.',
  target_audience: 'Small businesses, cafes, and local organizations in Mansoura.', product_ids: [],
  platforms: ['instagram'], campaign_themes: ['product_showcase','educational','brand','engagement'], posts_per_month: 4,
  important_dates: [], brand_voice: 'Warm, confident, clear, and locally relevant.',
  visual_preferences: 'Professional product photography with realistic print materials and restrained brand colors.'
};

const defaultStorefrontConfig: StorefrontConfig = {
  store_name: 'INKORA', tagline: 'Create. Print. Grow.',
  hero_eyebrow: 'MANSOURA PRINT STUDIO · INKORA',
  hero_title_en: 'Make your next idea tangible.', hero_title_ar: 'أفكارك، مطبوعة بعناية.',
  hero_description_en: 'Thoughtful print for ambitious brands. Configure a product and follow every production step from our Mansoura shop.',
  hero_description_ar: 'طباعة مخصصة، تصميم مدروس، ومتابعة واضحة من أول طلب حتى التسليم.',
  announcement_en: '', announcement_ar: '', accent_color: '#6f9fee', featured_product_ids: [],
  theme: 'midnight', background_color: '#101114', surface_color: '#191b20', text_color: '#f5f5f5', button_color: '#6f9fee',
  font_family: 'sans', layout: 'wide', hero_image_path: '', logo_path: '', logo_placement: 'left', cta_label_en: 'Explore the store', cta_label_ar: 'اكتشف المتجر', featured_categories: []
};

export type AuthGateway = {
  checkDatabaseReady?(): Promise<void>;
  authenticate(token: string): Promise<{ id: string }>;
  getRole(userId: string): Promise<Role | null>;
  getCustomerId(userId: string): Promise<string | null>;
  customerExists(customerId: string): Promise<boolean>;
  saveQuote(input: { customerId: string; subtotal: string; discount: string; tax: string; total: string; items: Array<Record<string, unknown>> }): Promise<string>;
  listProducts(search?: string, includeInactive?: boolean): Promise<unknown[]>;
  listVerticals?(): Promise<CommerceVertical[]>;
  getProduct(id: string): Promise<Record<string, unknown> | null>;
  replaceProductOptions?(actorId: string, productId: string, options: ProductOptionGroup[], reason: string): Promise<void>;
  getQuote(id: string): Promise<Record<string, unknown> | null>;
  listQuotes(customerId?: string): Promise<unknown[]>;
  listCustomers(): Promise<unknown[]>;
  createCustomer(input: { name: string; companyName: string | null; email: string | null; phone: string | null }): Promise<string>;
  getSalesReport(from: string, to: string): Promise<Record<string, unknown>>;
  getBusinessAnalytics?(from: string, to: string): Promise<Record<string, unknown>>;
  createProduct?(input: Record<string, unknown>): Promise<string>;
  quickCreateProduct?(actorId: string, input: { product: Record<string, unknown>; variant: Record<string, unknown>; unitPrice: string; designFee: string; showInStore: boolean }): Promise<string>;
  configureProductOffer?(actorId: string, productId: string, unitPrice: string, availableQuantity: number | null, reason: string): Promise<void>;
  deleteUnreferencedProduct?(actorId: string, productId: string): Promise<void>;
  updateProductShopPrice?(actorId: string, variantId: string, unitPrice: string, designFee: string, reason: string): Promise<void>;
  updateProduct?(id: string, input: Record<string, unknown>): Promise<void>;
  promoteDemoProduct?(actorId: string, id: string): Promise<void>;
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
  customerDesignUploadAllowed?(orderId: string, customerId: string): Promise<boolean>;
  createMaterial(input: { sku: string; name: string; category: string; unit: string; reorderPoint: number; reorderQuantity: number }): Promise<string>;
  createMaterialRequirement(input: { productId: string; variantId: string; materialId: string; quantityPerUnit: number; wasteFactor: number }): Promise<string>;
  listMarketingAssets(): Promise<unknown[]>;
  listMarketingCampaigns?(): Promise<unknown[]>;
  createMarketingCampaign?(input: { name: string; month: string; objective: string; audience: string; language: 'en' | 'ar'; tone: string; frequency: string; preferredTimes: string[]; platforms: string[]; productIds: string[]; requestedPosts: number; createdBy: string }): Promise<string>;
  createMarketingCampaignWithPosts?(input: { campaign: Record<string, unknown>; posts: Array<Record<string, unknown>>; createdBy: string | null }): Promise<{ campaignId: string; assetIds: string[] }>;
  updateMarketingCampaign?(id: string, input: { status?: 'draft' | 'active' | 'paused' | 'completed'; name?: string; objective?: string; audience?: string; tone?: string }): Promise<boolean>;
  createMarketingAsset(input: { orderId: null; productId: string | null; campaignBrief: string; campaignType: string; createdBy: string | null; designUrl: string | null; platform: string; caption: string; scheduledAt?: string | null; campaignId?: string | null; imageStatus?: 'not_generated' | 'processing' | 'generated' | 'failed'; imageError?: string | null }): Promise<string>;
  uploadMarketingImage?(input: { id: string; mimeType: string; data: Buffer }): Promise<string>;
  updateMarketingAssetImage?(id: string, path: string | null, status: 'generated' | 'failed', error?: string | null): Promise<boolean>;
  createSignedMarketingImageUrl?(path: string, expiresInSeconds?: number): Promise<string>;
  getProductImageAllowance?(): Promise<{ included: number; used: number; remaining: number }>;
  setProductImageAllowance?(actorId: string, included: number): Promise<void>;
  reserveProductImageGeneration?(input: { id: string; productId: string; requestedBy: string }): Promise<void>;
  finishProductImageGeneration?(input: { id: string; status: 'completed' | 'failed'; imagePath?: string | null; model?: string | null }): Promise<void>;
  listProductImageGenerations?(productId: string): Promise<unknown[]>;
  selectProductImage?(actorId: string, productId: string, generationId: string): Promise<void>;
  uploadProductImage?(input: { id: string; productId: string; mimeType: string; data: Buffer }): Promise<string>;
  updateMarketingAssetStatus(id: string, status: 'approved' | 'rejected'): Promise<void>;
  updatePendingMarketingDraft?(id: string, caption: string, scheduledAt: string | null, options?: { productId?: string | null; platform?: string }): Promise<boolean>;
  deletePendingMarketingDraft?(id: string): Promise<boolean>;
  deletePendingMarketingDrafts?(actorId: string): Promise<number>;
  getMarketingPlanSettings?(): Promise<MarketingPlanSettings | null>;
  saveMarketingPlanSettings?(actorId: string, settings: MarketingPlanSettings): Promise<void>;
  recordAuditLog?(input: { userId: string; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown> }): Promise<void>;
  createHermesActionProposal?(input: { id: string; managerId: string; action: string; arguments: Record<string, unknown> }): Promise<string>;
  approveHermesActionProposal?(id: string, managerId: string): Promise<boolean>;
  claimHermesActionProposal?(input: { id: string; managerId: string; action: string; arguments: Record<string, unknown> }): Promise<boolean>;
  finishHermesActionProposal?(input: { id: string; status: 'completed' | 'failed'; result: Record<string, unknown> | null; errorCode?: string }): Promise<void>;
  getStorefrontConfig?(): Promise<{ id: string; version: number; config: StorefrontConfig } | null>;
  listStorefrontRevisions?(): Promise<unknown[]>;
  createStorefrontConfigDraft?(actorId: string, config: StorefrontConfig): Promise<{ id: string; version: number; status: string }>;
  publishStorefrontConfig?(actorId: string, revisionId: string): Promise<{ id: string; version: number; status: string }>;
  listAutomationEvents?(): Promise<Array<Record<string, unknown>>>;
  retryDeadAutomationEvent?(actorId: string, eventId: string): Promise<boolean>;
  deleteAutomationEvent?(actorId: string, eventId: string): Promise<boolean>;
};

export type CommerceVertical = { vertical_key: string; label_en: string; label_ar: string; capabilities: Record<string, unknown>; active: boolean };

export type HermesChatMessage = { role: 'user' | 'assistant'; content: string };
export type HermesChatClient = { complete(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{ content: string; model: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }> };
export type MarketingImageClient = { generate(prompt: string): Promise<{ data: Buffer; mimeType: string; model: string; estimatedCostUsd: number | null }> };
type Dependencies = { gateway: AuthGateway; pricing: PricingRepository; allowedOrigins?: string[]; allowSameOrigin?: boolean; hermes?: HermesChatClient; hermesProbeUrl?: string; hermesProbeHeaders?: Record<string, string>; n8nProbeUrl?: string; n8nManagement?: { overview(): Promise<N8nOperationsOverview> }; marketingImage?: MarketingImageClient; hermesToolKey?: string; hermesWriteToolsEnabled?: boolean; hermesManagerUserId?: string; n8nWebhookBaseUrl?: string; n8nWebhookSecret?: string; managerEmail?: string };
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

function productAttributes(value: unknown, name = 'attributes'): Record<string, unknown> {
  let parsed = value;
  if (typeof value === 'string') {
    if (value.length > 8000) throw new AppError('INVALID_REQUEST', 400, `${name} must be at most 8000 characters.`);
    try { parsed = value.trim() ? JSON.parse(value) : {}; }
    catch { throw new AppError('INVALID_REQUEST', 400, `${name} must be a valid JSON object.`); }
  }
  if (parsed === undefined || parsed === null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new AppError('INVALID_REQUEST', 400, `${name} must be a JSON object.`);
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 40) throw new AppError('INVALID_REQUEST', 400, `${name} can contain at most 40 fields.`);
  const result: Record<string, unknown> = {};
  const validValue = (field: unknown, depth = 0): boolean => {
    if (depth > 4) return false;
    if (field === null || typeof field === 'boolean') return true;
    if (typeof field === 'string') return field.length <= 500;
    if (typeof field === 'number') return Number.isFinite(field);
    if (Array.isArray(field)) return field.length <= 100 && field.every((entry) => validValue(entry, depth + 1));
    if (typeof field === 'object') return Object.entries(field as Record<string, unknown>).length <= 40 && Object.entries(field as Record<string, unknown>).every(([nestedKey, nestedValue]) => /^[a-z][a-z0-9_]{0,39}$/.test(nestedKey) && !['constructor','prototype','__proto__'].includes(nestedKey) && validValue(nestedValue, depth + 1));
    return false;
  };
  for (const [key, field] of entries) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw new AppError('INVALID_REQUEST', 400, `${name} keys must use lowercase letters, numbers, and underscores.`);
    if (!validValue(field)) throw new AppError('INVALID_REQUEST', 400, `${name}.${key} must contain bounded JSON values (maximum nesting depth 4).`);
    result[key] = field;
  }
  return result;
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

function nonnegativeWholeNumber(value: unknown, name: string): number {
  const parsed = nonnegativeNumber(value, name);
  if (!Number.isSafeInteger(parsed)) throw new AppError('INVALID_REQUEST', 400, `${name} must be a whole number.`);
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

function storefrontConfig(value: unknown): StorefrontConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('INVALID_REQUEST', 400, 'config must be an object.');
  const row = value as Record<string, unknown>;
  const allowed = new Set(['store_name','tagline','hero_eyebrow','hero_title_en','hero_title_ar','hero_description_en','hero_description_ar','announcement_en','announcement_ar','accent_color','featured_product_ids','theme','background_color','surface_color','text_color','button_color','font_family','layout','hero_image_path','logo_path','logo_placement','cta_label_en','cta_label_ar','featured_categories']);
  if (Object.keys(row).some((key) => !allowed.has(key))) throw new AppError('INVALID_REQUEST', 400, 'config contains unsupported storefront fields.');
  const color = requiredText(row.accent_color, 'accent_color', 7);
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new AppError('INVALID_REQUEST', 400, 'accent_color must be a six-digit hex color.');
  const productIds = row.featured_product_ids ?? [];
  if (!Array.isArray(productIds) || productIds.length > 12) throw new AppError('INVALID_REQUEST', 400, 'featured_product_ids must contain no more than 12 product IDs.');
  const ids = productIds.map((id, index) => uuid(id, `featured_product_ids[${index}]`));
  if (new Set(ids).size !== ids.length) throw new AppError('INVALID_REQUEST', 400, 'featured_product_ids cannot contain duplicates.');
  const optionalText = (field: string, max: number) => {
    const text = row[field] ?? '';
    if (typeof text !== 'string' || text.length > max) throw new AppError('INVALID_REQUEST', 400, `${field} must be a string no longer than ${max} characters.`);
    return text.trim();
  };
  const colorField = (field: string, fallback: string) => {
    const candidate = row[field] ?? fallback;
    if (typeof candidate !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate)) throw new AppError('INVALID_REQUEST', 400, `${field} must be a six-digit hex color.`);
    return candidate.toLowerCase();
  };
  const choice = <T extends string>(field: string, values: readonly T[], fallback: T): T => {
    const candidate = row[field] ?? fallback;
    if (typeof candidate !== 'string' || !values.includes(candidate as T)) throw new AppError('INVALID_REQUEST', 400, `${field} has an unsupported value.`);
    return candidate as T;
  };
  const assetPath = (field: string) => {
    const candidate = row[field] ?? '';
    if (typeof candidate !== 'string' || candidate.length > 512 || (candidate && !candidate.startsWith('storefront/'))) throw new AppError('INVALID_REQUEST', 400, `${field} must be a storefront asset path.`);
    return candidate;
  };
  const categories = row.featured_categories ?? [];
  if (!Array.isArray(categories) || categories.length > 20 || categories.some((item) => typeof item !== 'string' || item.trim().length < 1 || item.trim().length > 80)) throw new AppError('INVALID_REQUEST', 400, 'featured_categories must contain up to 20 category names.');
  return {
    store_name: requiredText(row.store_name, 'store_name', 80),
    tagline: requiredText(row.tagline, 'tagline', 120),
    hero_eyebrow: requiredText(row.hero_eyebrow, 'hero_eyebrow', 120),
    hero_title_en: requiredText(row.hero_title_en, 'hero_title_en', 180),
    hero_title_ar: requiredText(row.hero_title_ar, 'hero_title_ar', 180),
    hero_description_en: requiredText(row.hero_description_en, 'hero_description_en', 600),
    hero_description_ar: requiredText(row.hero_description_ar, 'hero_description_ar', 600),
    announcement_en: optionalText('announcement_en', 240),
    announcement_ar: optionalText('announcement_ar', 240),
    accent_color: color.toLowerCase(),
    featured_product_ids: ids,
    theme: choice('theme', ['midnight','paper','studio'] as const, 'midnight'),
    background_color: colorField('background_color', '#101114'), surface_color: colorField('surface_color', '#191b20'),
    text_color: colorField('text_color', '#f5f5f5'), button_color: colorField('button_color', color.toLowerCase()),
    font_family: choice('font_family', ['sans','serif'] as const, 'sans'), layout: choice('layout', ['wide','editorial'] as const, 'wide'),
    hero_image_path: assetPath('hero_image_path'), logo_path: assetPath('logo_path'), logo_placement: choice('logo_placement', ['left','center','right'] as const, 'left'),
    cta_label_en: optionalText('cta_label_en', 80) || 'Explore the store', cta_label_ar: optionalText('cta_label_ar', 80) || 'اكتشف المتجر',
    featured_categories: [...new Set((categories as string[]).map((item) => item.trim()))]
  };
}

function marketingPlanSettings(value: unknown): MarketingPlanSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('INVALID_REQUEST', 400, 'settings must be an object.');
  const row = value as Record<string, unknown>;
  const text = (field: string, max: number) => {
    const candidate = row[field];
    if (typeof candidate !== 'string' || candidate.trim().length > max) throw new AppError('INVALID_REQUEST', 400, `${field} must be a string of at most ${max} characters.`);
    return candidate.trim();
  };
  const stringList = (field: 'platforms' | 'campaign_themes', allowed: string[], max: number, pattern?: RegExp) => {
    const candidate = row[field];
    if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > max || candidate.some((item) => typeof item !== 'string' || item.length > 80 || (pattern && !pattern.test(item)) || !allowed.includes(item))) throw new AppError('INVALID_REQUEST', 400, `${field} contains unsupported or too many values.`);
    return [...new Set(candidate as string[])];
  };
  const ids = row.product_ids ?? [];
  if (!Array.isArray(ids) || ids.length > 20) throw new AppError('INVALID_REQUEST', 400, 'product_ids must contain up to 20 products.');
  const productIds = ids.map((id, index) => uuid(id, `product_ids[${index}]`));
  if (new Set(productIds).size !== productIds.length) throw new AppError('INVALID_REQUEST', 400, 'product_ids cannot contain duplicates.');
  const frequency = Number(row.posts_per_month ?? defaultMarketingPlanSettings.posts_per_month);
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 12) throw new AppError('INVALID_REQUEST', 400, 'posts_per_month must be a whole number from 1 to 12.');
  const dates = row.important_dates ?? [];
  if (!Array.isArray(dates) || dates.length > 20 || dates.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as Record<string, unknown>).date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String((item as Record<string, unknown>).date)) || typeof (item as Record<string, unknown>).label !== 'string' || String((item as Record<string, unknown>).label).trim().length > 100)) throw new AppError('INVALID_REQUEST', 400, 'important_dates must contain at most 20 date/label entries.');
  return {
    goals: text('goals', 1000), target_audience: text('target_audience', 500), product_ids: productIds,
    platforms: stringList('platforms', ['instagram','facebook','linkedin','x','general'], 5),
    campaign_themes: stringList('campaign_themes', ['product_showcase','promotion','educational','seasonal','brand','engagement','new_product'], 10, /^[a-z_]+$/),
    posts_per_month: frequency,
    important_dates: (dates as Array<{ date: string; label: string }>).map((item) => ({ date: item.date, label: item.label.trim() })),
    brand_voice: text('brand_voice', 500), visual_preferences: text('visual_preferences', 500)
  };
}

function productOptionGroups(value: unknown): ProductOptionGroup[] {
  if (!Array.isArray(value) || value.length > 30) throw new AppError('INVALID_REQUEST', 400, 'options must be an array with no more than 30 groups.');
  const keys = new Set<string>();
  return value.map((rawGroup, groupIndex) => {
    if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) throw new AppError('INVALID_REQUEST', 400, `options[${groupIndex}] must be an object.`);
    const group = rawGroup as Record<string, unknown>;
    const key = requiredText(group.key, `options[${groupIndex}].key`, 40);
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || keys.has(key)) throw new AppError('INVALID_REQUEST', 400, `options[${groupIndex}].key must be unique and use lowercase letters, numbers, or underscores.`);
    keys.add(key);
    if (typeof group.required !== 'boolean') throw new AppError('INVALID_REQUEST', 400, `options[${groupIndex}].required must be boolean.`);
    if (!Array.isArray(group.values) || group.values.length < 1 || group.values.length > 50) throw new AppError('INVALID_REQUEST', 400, `options[${groupIndex}].values must contain between 1 and 50 values.`);
    const valueKeys = new Set<string>();
    return {
      key, label_en: requiredText(group.label_en, `options[${groupIndex}].label_en`, 80),
      label_ar: requiredText(group.label_ar, `options[${groupIndex}].label_ar`, 80), required: group.required,
      values: group.values.map((rawValue, valueIndex) => {
        if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) throw new AppError('INVALID_REQUEST', 400, `options[${groupIndex}].values[${valueIndex}] must be an object.`);
        const option = rawValue as Record<string, unknown>;
        const valueKey = requiredText(option.key, `options[${groupIndex}].values[${valueIndex}].key`, 40);
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(valueKey) || valueKeys.has(valueKey)) throw new AppError('INVALID_REQUEST', 400, `Option value keys must be unique and use lowercase letters, numbers, or underscores.`);
        valueKeys.add(valueKey);
        if (option.adjustment_type !== 'per_unit' && option.adjustment_type !== 'one_time') throw new AppError('INVALID_REQUEST', 400, `options[${groupIndex}].values[${valueIndex}].adjustment_type must be per_unit or one_time.`);
        return { key: valueKey, label_en: requiredText(option.label_en, 'option label_en', 80), label_ar: requiredText(option.label_ar, 'option label_ar', 80), adjustment_type: option.adjustment_type, price_adjustment: optionalPrice(option.price_adjustment, 'price_adjustment') };
      })
    };
  });
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

const hermesInstructions = `You are Hermes, the INKORA store operations assistant. Use INKORA tools for live business facts and supported manager actions across printing, clothing, electronics, cosmetics, furniture, and generic stores. The backend is authoritative for products, prices, stock, orders, and production; never invent business facts or prices. Use read tools before proposing a change when needed. A write tool first creates a pending proposal and returns an action ID. Explain the exact item and values and ask the manager to reply exactly "I CONFIRM THIS CHANGE <action_id>". Do not repeat the write tool until the manager's next message contains that exact phrase and the same ID. Never infer approval from earlier, vague, or unrelated messages. Never delete, archive, retry, or otherwise alter n8n workflows, event history, or scheduled automations. Only explain automation status; automation edits must be made in the Automations workspace after an explicit manager action. Storefront updates create an unpublished versioned draft; tell the manager to preview and publish it in Storefront settings. Never claim it is live until the manager publishes it. Product drafts remain inactive until configured with a variant, approved price, and stock. Never use a write tool to set or estimate prices, mark payment as paid, publish social posts, or claim an unavailable integration worked. The sales report measures order value, not cash collected. If a tool fails, report the failure and do not claim success.`;

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

async function probeIntegration(url: string, headers?: Record<string, string>): Promise<'reachable' | 'unavailable'> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_500), headers: { accept: 'application/json', ...headers } });
    if (!response.ok) return 'unavailable';
    const result = await response.json() as { status?: unknown; object?: unknown; data?: unknown };
    const healthy = result.status === 'ok' || (result.object === 'list' && Array.isArray(result.data));
    return healthy ? 'reachable' : 'unavailable';
  } catch { return 'unavailable'; }
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
    const host = request.headers.host;
    const forwardedProto = request.headers['x-forwarded-proto'];
    const localHost = typeof host === 'string' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : localHost ? 'http' : 'https';
    let sameOrigin = false;
    if (deps.allowSameOrigin && origin && host) {
      try {
        const parsedOrigin = new URL(origin);
        sameOrigin = parsedOrigin.host === host && parsedOrigin.protocol === `${protocol}:`;
      } catch { sameOrigin = false; }
    }
    if (origin && !allowed.has(origin) && !sameOrigin) {
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
    if (method === 'GET' && path === '/ready') {
      const [hermes, n8n] = await Promise.all([
        deps.hermes ? (deps.hermesProbeUrl ? probeIntegration(deps.hermesProbeUrl, deps.hermesProbeHeaders) : Promise.resolve('configured' as const)) : Promise.resolve('not_configured' as const),
        deps.n8nWebhookBaseUrl && deps.n8nWebhookSecret ? (deps.n8nProbeUrl ? probeIntegration(deps.n8nProbeUrl) : Promise.resolve('configured' as const)) : Promise.resolve('not_configured' as const)
      ]);
      const checks = { database: 'not_checked', hermes, n8n };
      if (!deps.gateway.checkDatabaseReady) {
        send(response, 503, { status: 'not_ready', checks });
        return;
      }
      try {
        await deps.gateway.checkDatabaseReady();
        const readyChecks = { ...checks, database: 'ok' };
        const ready = [hermes, n8n].every((status) => status === 'not_configured' || status === 'reachable');
        send(response, ready ? 200 : 503, { status: ready ? 'ready' : 'degraded', checks: readyChecks });
      } catch {
        send(response, 503, { status: 'not_ready', checks: { ...checks, database: 'unavailable' } });
      }
      return;
    }
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
        const settings = await deps.gateway.getMarketingPlanSettings?.() ?? defaultMarketingPlanSettings;
        const allProducts = (await deps.gateway.listProducts()).filter((value) => value && typeof value === 'object').map((value) => {
          const product = value as Record<string, unknown>;
          return { id: product.id, name: product.name, category: product.category, description: product.description };
        }).slice(0, 40);
        const products = settings.product_ids.length ? allProducts.filter((product) => settings.product_ids.includes(String(product.id))) : allProducts;
        const start = new Date();
        start.setUTCDate(1);
        const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
        const schedule = Array.from({ length: settings.posts_per_month }, (_, index) => {
          const day = Math.max(1, Math.floor(((index + 1) * daysInMonth) / (settings.posts_per_month + 1)));
          const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day, 10));
          return { date: date.toISOString(), slot: index + 1, approval_required: true,
            important_date: settings.important_dates.find((item) => item.date === date.toISOString().slice(0, 10))?.label ?? null,
            platform: settings.platforms[index % settings.platforms.length], theme: settings.campaign_themes[index % settings.campaign_themes.length] };
        });
        if (!deps.hermes) throw new AppError('HERMES_UNAVAILABLE', 503, 'Hermes is not configured; the monthly marketing plan was not generated.');
        let drafts: Array<{ date: string; platform: string; theme: string; caption: string; productId: string | null }>;
        let model: string | null = null;
        {
          const started = Date.now();
          try {
            const completion = await deps.hermes.complete([
              { role: 'system', content: `Create exactly ${schedule.length} truthful social posts for the supplied campaign plan. Use only supplied product facts. Do not invent discounts, prices, guarantees, customer stories, or services. Write in the supplied brand voice for the target audience and goal. Use each slot's requested theme, platform, date, and important-date context. Return only a JSON array of ${schedule.length} objects with keys slot (integer), caption (string). Each caption needs a clear CTA and 3 to 5 relevant hashtags. These are approval-required drafts; do not say they are published.` },
              { role: 'user', content: JSON.stringify({ goal: settings.goals, target_audience: settings.target_audience, brand_voice: settings.brand_voice, visual_preferences: settings.visual_preferences, products: products.map(({ name, category, description }) => ({ name, category, description })), schedule }) }
            ]);
            const raw = requiredText(completion.content, 'marketing plan', 12000).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length !== schedule.length) throw new AppError('AI_INVALID_RESPONSE', 502, 'Hermes did not return the configured number of monthly post drafts.');
            drafts = parsed.map((item, index) => {
              if (!item || typeof item !== 'object') throw new AppError('AI_INVALID_RESPONSE', 502, 'Hermes returned an invalid post draft.');
              const row = item as Record<string, unknown>;
              return {
                date: schedule[index].date, platform: schedule[index].platform, theme: schedule[index].theme,
                caption: requiredText(row.caption, 'caption', 2000),
                productId: products.length ? String(products[index % products.length].id) : null
              };
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
            const product = products.find((item) => String(item.id) === draft.productId);
            const prompt = `Create a polished, photorealistic square campaign image for a professional Egyptian print shop. Visual direction: ${settings.visual_preferences}. Campaign theme: ${draft.theme}. Product: ${product ? `${product.name} (${product.category})${product.description ? ` — ${product.description}` : ''}` : 'brand awareness for a print shop'}. Caption context: ${draft.caption}. Use realistic print materials and studio product photography. No readable text, logos, watermark, people, customer work, or unverified claims.`;
            const generated = await deps.marketingImage.generate(prompt);
            imageModel = generated.model;
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(generated.mimeType) || generated.data.length > 12_000_000) throw new AppError('INVALID_GENERATED_IMAGE', 502, 'The image provider returned unsupported artwork.');
            const path = await deps.gateway.uploadMarketingImage({ id: randomUUID(), mimeType: generated.mimeType, data: generated.data });
            post.design_path = path;
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
        if (deps.gateway.createMarketingCampaignWithPosts) {
          const result = await deps.gateway.createMarketingCampaignWithPosts({
            createdBy: null,
            campaign: {
              name: `Monthly ${start.toISOString().slice(0, 7)} marketing plan`, month: start.toISOString().slice(0, 7),
              objective: settings.goals, target_audience: settings.target_audience, language: 'en', tone: settings.brand_voice,
              posting_frequency: 'monthly', preferred_times: ['10:00'], platforms: settings.platforms,
              product_ids: settings.product_ids, requested_posts: posts.length
            },
            posts: posts.map((post, index) => ({
              product_id: drafts[index]?.productId ?? null, theme: String(post.theme ?? 'product_showcase'),
              caption: String(post.caption), platform: String(post.platform), scheduled_at: String(post.date),
              design_path: typeof post.design_path === 'string' ? post.design_path : null,
              image_status: post.image_status === 'generated' ? 'generated' : post.image_status === 'failed' ? 'failed' : 'not_generated',
              image_error: typeof post.image_error === 'string' ? post.image_error : null
            }))
          });
          posts.forEach((post, index) => { post.asset_id = result.assetIds[index]; delete post.design_path; });
        } else {
          for (const [index, post] of posts.entries()) {
            const assetId = await deps.gateway.createMarketingAsset({
              orderId: null, productId: drafts[index]?.productId ?? null,
              campaignBrief: `Monthly ${start.toISOString().slice(0, 7)} marketing plan · slot ${index + 1}`,
              campaignType: String(post.theme ?? 'product_showcase'), createdBy: null,
              designUrl: typeof post.design_path === 'string' ? post.design_path : null,
              platform: String(post.platform), caption: String(post.caption), scheduledAt: String(post.date)
            });
            post.asset_id = assetId;
            delete post.design_path;
          }
        }
        send(response, 200, { generated_at: new Date().toISOString(), month: start.toISOString().slice(0, 7), goal: settings.goals, posts, image_generation_available: Boolean(deps.marketingImage && deps.gateway.uploadMarketingImage), image_provider: deps.marketingImage ? 'AI Horde (free community queue)' : null, model, to_email: deps.managerEmail ?? null });
      } catch (error) { sendError(response, error, requestId); }
      return;
    }

    try {
      if (method === 'GET' && path === '/api/verticals') {
        if (!deps.gateway.listVerticals) throw new AppError('VERTICALS_UNAVAILABLE', 503, 'Commerce vertical configuration is not available on this server.');
        send(response, 200, { verticals: await deps.gateway.listVerticals() });
        return;
      }
      if (method === 'GET' && path === '/api/products') {
        const search = new URL(request.url ?? '/', 'http://localhost').searchParams.get('search')?.trim();
        if (search && search.length > 100) throw new AppError('INVALID_REQUEST', 400, 'search must be at most 100 characters.');
        send(response, 200, { products: await deps.gateway.listProducts(search) });
        return;
      }

      if (method === 'GET' && path === '/api/storefront') {
        if (!deps.gateway.getStorefrontConfig) throw new AppError('STOREFRONT_UNAVAILABLE', 503, 'Storefront configuration is not available on this server.');
        const published = await deps.gateway.getStorefrontConfig();
        send(response, 200, { version: published?.version ?? 1, config: published?.config ?? defaultStorefrontConfig });
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

        const writeTools = ['create_material', 'record_material_receipt', 'create_product_draft', 'prepare_storefront_update', 'update_product_details', 'update_order_status', 'update_production_status'];
        if (writeTools.includes(name)) {
          if (!deps.hermesWriteToolsEnabled) throw new AppError('HERMES_ACTIONS_DISABLED', 503, 'Manager write actions are disabled in server configuration.');
          const reason = requiredText(args.reason, 'reason', 500);
          if (reason.length < 3) throw new AppError('INVALID_REQUEST', 400, 'reason must contain at least three characters.');
          if (!deps.hermesManagerUserId) throw new AppError('HERMES_MANAGER_NOT_CONFIGURED', 503, 'Configure the authorized manager user ID before enabling manager actions through Hermes.');
          const managerId = uuid(deps.hermesManagerUserId, 'hermes_manager_user_id');
          if (!['manager', 'admin'].includes(String(await deps.gateway.getRole(managerId)))) throw new AppError('FORBIDDEN', 403, 'The configured Hermes manager account is not authorized.');
          aiRateLimiter.check(managerId, 'hermes_manager_write', 10);
          let requestedArgs = { ...args };
          delete requestedArgs.action_id;
          if (name === 'create_product_draft') {
            const sku = requiredText(args.sku, 'sku', 80);
            const productName = requiredText(args.name, 'name', 200);
            const category = requiredText(args.category, 'category', 80);
            const baseUnit = requiredText(args.base_unit, 'base_unit', 40);
            const verticalKey = requiredText(args.vertical_key, 'vertical_key', 40);
            if (!/^[a-z][a-z0-9_]{0,39}$/.test(verticalKey)) throw new AppError('INVALID_REQUEST', 400, 'vertical_key has an invalid format.');
            const verticals = await deps.gateway.listVerticals?.();
            if (!verticals?.some((vertical) => vertical.active && vertical.vertical_key === verticalKey)) throw new AppError('INVALID_VERTICAL', 422, 'Select an active commerce vertical.');
            const description = args.description === undefined ? '' : typeof args.description === 'string' && args.description.length <= 4000 ? args.description.trim() : (() => { throw new AppError('INVALID_REQUEST', 400, 'description must be a string no longer than 4000 characters.'); })();
            const attributes = args.attributes === undefined ? {} : productAttributes(args.attributes);
            if (typeof args.requires_design !== 'boolean' || typeof args.requires_size !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'requires_design and requires_size must be booleans.');
            requestedArgs = { sku, name: productName, category, base_unit: baseUnit, vertical_key: verticalKey, description, attributes, requires_design: args.requires_design, requires_size: args.requires_size, reason };
          } else if (name === 'prepare_storefront_update') {
            requestedArgs = { config: storefrontConfig(args.config), reason };
          }
          const approvalId = typeof args.action_id === 'string' ? uuid(args.action_id, 'action_id') : null;
          if (!approvalId) {
            if (!deps.gateway.createHermesActionProposal) throw new AppError('HERMES_APPROVALS_UNAVAILABLE', 503, 'Persistent manager approvals are not configured on this server.');
            const actionId = randomUUID();
            const expiresAt = await deps.gateway.createHermesActionProposal({ id: actionId, managerId, action: name, arguments: requestedArgs });
            send(response, 200, { status: 'confirmation_required', action_id: actionId, action: name, details: requestedArgs, expires_at: expiresAt, expires_in_seconds: 600 });
            return;
          }
          if (!deps.gateway.claimHermesActionProposal || !deps.gateway.finishHermesActionProposal) throw new AppError('HERMES_APPROVALS_UNAVAILABLE', 503, 'Persistent manager approvals are not configured on this server.');
          if (!await deps.gateway.claimHermesActionProposal({ id: approvalId, managerId, action: name, arguments: requestedArgs })) {
            throw new AppError('MANAGER_CONFIRMATION_INVALID', 409, 'The proposal is missing, expired, already used, or does not match the exact approved change. Ask Hermes to prepare it again.');
          }
          let entityType: string;
          let entityId: string;
          let actionResult: Record<string, unknown>;
          try {
          if (name === 'prepare_storefront_update') {
            if (!deps.gateway.createStorefrontConfigDraft) throw new AppError('STOREFRONT_UNAVAILABLE', 503, 'Storefront draft management is unavailable.');
            const revision = await deps.gateway.createStorefrontConfigDraft(managerId, storefrontConfig(args.config));
            entityId = revision.id;
            entityType = 'storefront_config_revision';
            actionResult = { revision_id: revision.id, version: revision.version, status: revision.status, published: false, next_step: 'Review and publish this draft from Storefront settings.' };
          } else if (name === 'create_product_draft') {
            if (!deps.gateway.createProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product administration is unavailable.');
            const sku = requiredText(args.sku, 'sku', 80);
            const name = requiredText(args.name, 'name', 200);
            const category = requiredText(args.category, 'category', 80);
            const baseUnit = requiredText(args.base_unit, 'base_unit', 40);
            const verticalKey = requiredText(args.vertical_key, 'vertical_key', 40);
            if (!/^[a-z][a-z0-9_]{0,39}$/.test(verticalKey)) throw new AppError('INVALID_REQUEST', 400, 'vertical_key has an invalid format.');
            const verticals = await deps.gateway.listVerticals?.();
            if (!verticals?.some((vertical) => vertical.active && vertical.vertical_key === verticalKey)) throw new AppError('INVALID_VERTICAL', 422, 'Select an active commerce vertical.');
            const description = args.description === undefined ? '' : typeof args.description === 'string' && args.description.length <= 4000 ? args.description.trim() : (() => { throw new AppError('INVALID_REQUEST', 400, 'description must be a string no longer than 4000 characters.'); })();
            const attributes = args.attributes === undefined ? {} : productAttributes(args.attributes);
            if (typeof args.requires_design !== 'boolean' || typeof args.requires_size !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'requires_design and requires_size must be booleans.');
            entityId = await deps.gateway.createProduct({ sku, name, category, base_unit: baseUnit, description, vertical_key: verticalKey, attributes, requires_design: args.requires_design, requires_size: args.requires_size, active: false });
            entityType = 'product';
            actionResult = { product_id: entityId, sku, name, vertical_key: verticalKey, active: false, next_step: 'Manager must add a variant, approved price rule, and stock before publishing.' };
          } else if (name === 'create_material') {
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
            if (args.vertical_key !== undefined) {
              const verticalKey = requiredText(args.vertical_key, 'vertical_key', 40);
              if (!/^[a-z][a-z0-9_]{0,39}$/.test(verticalKey)) throw new AppError('INVALID_REQUEST', 400, 'vertical_key has an invalid format.');
              const verticals = await deps.gateway.listVerticals?.();
              if (!verticals?.some((vertical) => vertical.active && vertical.vertical_key === verticalKey)) throw new AppError('INVALID_VERTICAL', 422, 'Select an active commerce vertical.');
              changes.vertical_key = verticalKey;
            }
            if (args.attributes !== undefined) changes.attributes = productAttributes(args.attributes);
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
          await deps.gateway.finishHermesActionProposal({ id: approvalId, status: 'completed', result: actionResult });
          } catch (error) {
            try {
              await deps.gateway.finishHermesActionProposal({ id: approvalId, status: 'failed', result: null, errorCode: error instanceof AppError ? error.code : 'ACTION_FAILED' });
            } catch (auditError) {
              console.error(JSON.stringify({ level: 'error', event: 'hermes.action.finalize_failed', action: name, action_id: approvalId, error_code: auditError instanceof AppError ? auditError.code : 'FINALIZE_FAILED' }));
            }
            throw error;
          }
          send(response, 200, { ...actionResult, audit_logged: true });
          return;
        }

        if (name === 'list_store_verticals') {
          if (!deps.gateway.listVerticals) throw new AppError('VERTICALS_UNAVAILABLE', 503, 'Commerce vertical configuration is not available on this server.');
          send(response, 200, { verticals: await deps.gateway.listVerticals() });
          return;
        }
        if (name === 'get_storefront_config') {
          if (!deps.hermesManagerUserId || !['manager', 'admin'].includes(String(await deps.gateway.getRole(uuid(deps.hermesManagerUserId, 'hermes_manager_user_id'))))) {
            throw new AppError('FORBIDDEN', 403, 'Storefront configuration is available only to the configured manager.');
          }
          const current = await deps.gateway.getStorefrontConfig?.();
          send(response, 200, { config: current?.config ?? defaultStorefrontConfig, version: current?.version ?? 0 });
          return;
        }
        if (name === 'list_manager_products') {
          const products = await deps.gateway.listProducts('', true);
          send(response, 200, { products: products.map((value) => {
            const product = value as Record<string, unknown>;
            return { id: product.id, sku: product.sku, name: product.name, category: product.category, vertical_key: product.vertical_key, attributes: product.attributes, active: product.active,
              variants: Array.isArray(product.product_variants) ? (product.product_variants as Array<Record<string, unknown>>).map((variant) => ({ id: variant.id, sku: variant.sku, name: variant.name, attributes: variant.attributes, active: variant.active })) : [] };
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

      if (method === 'GET' && path === '/api/manager/automations/events') {
        requireRole(actor, ['manager','admin']);
        if (!deps.gateway.listAutomationEvents) throw new AppError('AUTOMATION_UNAVAILABLE', 503, 'Automation delivery history is not available on this server.');
        const events = await deps.gateway.listAutomationEvents();
        send(response, 200, { events: events.map((row) => ({
          id: row.id, event_type: row.event_type, status: row.status, attempt_count: row.attempt_count,
          available_at: row.available_at, delivered_at: row.delivered_at, created_at: row.created_at,
          last_error: typeof row.last_error === 'string' ? row.last_error.replace(/(?:sb_secret_|eyJ[a-zA-Z0-9._-]{12,}|Bearer\s+\S+)/gi, '[redacted]').slice(0, 200) : null
        })) });
        return;
      }

      if (method === 'GET' && path === '/api/manager/automations/overview') {
        requireRole(actor, ['manager','admin']);
        const overview = deps.n8nManagement
          ? await deps.n8nManagement.overview()
          : { status: 'not_configured' as const, workflows: [], executions: [] };
        send(response, 200, overview);
        return;
      }
      const automationRetryMatch = method === 'POST' ? /^\/api\/manager\/automations\/events\/([^/]+)\/retry$/.exec(path) : null;
      if (automationRetryMatch) {
        requireRole(actor, ['manager','admin']);
        if (!deps.gateway.retryDeadAutomationEvent) throw new AppError('AUTOMATION_UNAVAILABLE', 503, 'Automation retry is not available on this server.');
        const eventId = uuid(decodePathSegment(automationRetryMatch[1], 'event_id'), 'event_id');
        if (!await deps.gateway.retryDeadAutomationEvent(actor.id, eventId)) throw new AppError('AUTOMATION_EVENT_NOT_RETRYABLE', 409, 'Only dead automation events can be retried.');
        send(response, 200, { retried: true, event_id: eventId });
        return;
      }
      const automationDeleteMatch = method === 'DELETE' ? /^\/api\/manager\/automations\/events\/([^/]+)$/.exec(path) : null;
      if (automationDeleteMatch) {
        requireRole(actor, ['manager','admin']);
        if (!deps.gateway.deleteAutomationEvent) throw new AppError('AUTOMATION_UNAVAILABLE', 503, 'Automation event deletion is not available on this server.');
        const eventId = uuid(decodePathSegment(automationDeleteMatch[1], 'event_id'), 'event_id');
        if (!await deps.gateway.deleteAutomationEvent(actor.id, eventId)) throw new AppError('AUTOMATION_EVENT_NOT_DELETABLE', 409, 'Only pending or dead automation events can be deleted.');
        send(response, 200, { deleted: true, event_id: eventId });
        return;
      }

      if (method === 'GET' && path === '/api/manager/storefront') {
        requireRole(actor, ['manager','admin']);
        if (!deps.gateway.getStorefrontConfig || !deps.gateway.listStorefrontRevisions) throw new AppError('STOREFRONT_UNAVAILABLE', 503, 'Storefront configuration is not available on this server.');
        const [published, revisions] = await Promise.all([deps.gateway.getStorefrontConfig(), deps.gateway.listStorefrontRevisions()]);
        send(response, 200, { published: published ?? { id: null, version: 1, config: defaultStorefrontConfig }, revisions });
        return;
      }
      if (method === 'POST' && path === '/api/manager/storefront/drafts') {
        requireRole(actor, ['manager','admin']);
        if (!deps.gateway.createStorefrontConfigDraft) throw new AppError('STOREFRONT_UNAVAILABLE', 503, 'Storefront draft publishing is not available on this server.');
        const body = await readJson(request);
        const config = storefrontConfig(body.config);
        const draft = await deps.gateway.createStorefrontConfigDraft(actor.id, config);
        send(response, 201, { draft });
        return;
      }
      const storefrontPublishMatch = method === 'POST' ? /^\/api\/manager\/storefront\/drafts\/([^/]+)\/publish$/.exec(path) : null;
      if (storefrontPublishMatch) {
        requireRole(actor, ['manager','admin']);
        if (!deps.gateway.publishStorefrontConfig) throw new AppError('STOREFRONT_UNAVAILABLE', 503, 'Storefront publishing is not available on this server.');
        const revisionId = uuid(decodePathSegment(storefrontPublishMatch[1], 'revision_id'), 'revision_id');
        send(response, 200, { revision: await deps.gateway.publishStorefrontConfig(actor.id, revisionId) });
        return;
      }

      const productOptionsMatch = method === 'PUT' ? /^\/api\/manager\/products\/([^/]+)\/options$/.exec(path) : null;
      if (productOptionsMatch) {
        requireRole(actor, ['manager','admin']);
        if (!deps.gateway.replaceProductOptions) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product option management is not available on this server.');
        const productId = uuid(decodePathSegment(productOptionsMatch[1], 'product_id'), 'product_id');
        const body = await readJson(request);
        const options = productOptionGroups(body.options);
        const reason = requiredText(body.reason, 'reason', 500);
        if (reason.length < 3) throw new AppError('INVALID_REQUEST', 400, 'reason must contain at least three characters.');
        await deps.gateway.replaceProductOptions(actor.id, productId, options, reason);
        send(response, 200, { product_id: productId, option_groups: options.length, status: 'updated' });
        return;
      }
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
        if (body.allow_customer_design_upload !== undefined && typeof body.allow_customer_design_upload !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'allow_customer_design_upload must be a boolean.');
        if (body.active !== undefined && typeof body.active !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'active must be a boolean.');
        const verticalKey = body.vertical_key === undefined ? 'printing' : requiredText(body.vertical_key, 'vertical_key', 40);
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(verticalKey)) throw new AppError('INVALID_REQUEST', 400, 'vertical_key has an invalid format.');
        if (deps.gateway.listVerticals) {
          const verticals = await deps.gateway.listVerticals();
          if (!verticals.some((vertical) => vertical.active && vertical.vertical_key === verticalKey)) throw new AppError('INVALID_VERTICAL', 422, 'Select an active commerce vertical.');
        } else if (verticalKey !== 'printing') throw new AppError('VERTICALS_UNAVAILABLE', 503, 'Commerce vertical configuration is not available on this server.');
        const id = await deps.gateway.createProduct({
          sku: requiredText(body.sku, 'sku', 80), name: requiredText(body.name, 'name', 200),
          category: requiredText(body.category, 'category', 80), base_unit: requiredText(body.base_unit, 'base_unit', 40),
          description: typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '',
          material_description: typeof body.material_description === 'string' ? body.material_description.trim().slice(0, 240) : '',
          vertical_key: verticalKey, attributes: productAttributes(body.attributes),
          requires_design: body.requires_design ?? false, requires_size: body.requires_size ?? false,
          allow_customer_design_upload: body.allow_customer_design_upload ?? false, active: body.active ?? true
        });
        send(response, 201, { product_id: id });
        return;
      }
      if (method === 'POST' && path === '/api/manager/products/quick-create') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.quickCreateProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Quick product setup is not available on this server.');
        const body = await readJson(request);
        const verticalKey = body.vertical_key === undefined ? 'printing' : requiredText(body.vertical_key, 'vertical_key', 40);
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(verticalKey)) throw new AppError('INVALID_REQUEST', 400, 'vertical_key has an invalid format.');
        if (deps.gateway.listVerticals) {
          const verticals = await deps.gateway.listVerticals();
          if (!verticals.some((vertical) => vertical.active && vertical.vertical_key === verticalKey)) throw new AppError('INVALID_VERTICAL', 422, 'Select an active commerce vertical.');
        }
        for (const field of ['requires_size', 'allow_customer_design_upload', 'show_in_store'] as const) {
          if (body[field] !== undefined && typeof body[field] !== 'boolean') throw new AppError('INVALID_REQUEST', 400, `${field} must be a boolean.`);
        }
        const sku = requiredText(body.sku, 'sku', 80);
        const name = requiredText(body.name, 'name', 200);
        const unitPrice = optionalPrice(body.unit_price, 'unit_price');
        if (unitPrice === null) throw new AppError('INVALID_REQUEST', 400, 'unit_price is required.');
        const stock = body.available_quantity === undefined || body.available_quantity === null || body.available_quantity === ''
          ? null : nonnegativeWholeNumber(body.available_quantity, 'available_quantity');
        if ((body.width_cm === undefined || body.width_cm === null || body.width_cm === '') !== (body.height_cm === undefined || body.height_cm === null || body.height_cm === '')) {
          throw new AppError('INVALID_REQUEST', 400, 'Enter both width and height, or leave both empty.');
        }
        const id = await deps.gateway.quickCreateProduct(actor.id, {
          product: {
            sku, name, category: requiredText(body.category, 'category', 80), base_unit: requiredText(body.base_unit, 'base_unit', 40),
            description: typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '',
            material_description: typeof body.material_description === 'string' ? body.material_description.trim().slice(0, 240) : '',
            vertical_key: verticalKey, attributes: {}, requires_design: false, requires_size: body.requires_size === true,
            allow_customer_design_upload: body.allow_customer_design_upload === true
          },
          variant: {
            sku: `${sku}-1`, name, width_cm: optionalDimension(body.width_cm, 'width_cm'), height_cm: optionalDimension(body.height_cm, 'height_cm'),
            material: typeof body.material === 'string' && body.material.trim() ? requiredText(body.material, 'material', 120) : null,
            finishing: null, attributes: {}, available_quantity: stock
          },
          unitPrice, designFee: optionalPrice(body.design_fee, 'design_fee'),
          showInStore: body.show_in_store !== false
        });
        send(response, 201, { product_id: id, status: body.show_in_store === false ? 'hidden' : 'active' });
        return;
      }
      const productOfferMatch = method === 'POST' ? path.match(/^\/api\/manager\/products\/([0-9a-f-]{36})\/offer$/i) : null;
      if (productOfferMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.configureProductOffer) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product setup is not available on this server.');
        const body = await readJson(request);
        const unitPrice = optionalPrice(body.unit_price, 'unit_price');
        if (unitPrice === null) throw new AppError('INVALID_REQUEST', 400, 'Enter a valid non-negative selling price.');
        const quantity = body.available_quantity === undefined || body.available_quantity === null || body.available_quantity === ''
          ? null : nonnegativeWholeNumber(body.available_quantity, 'available_quantity');
        const reason = requiredText(body.reason ?? 'Manager set initial product price and quantity', 'reason', 500);
        await deps.gateway.configureProductOffer(actor.id, uuid(decodePathSegment(productOfferMatch[1], 'product_id'), 'product_id'), unitPrice, quantity, reason);
        send(response, 200, { status: 'configured' });
        return;
      }
      if (method === 'DELETE' && path.startsWith('/api/manager/products/')) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.deleteUnreferencedProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Permanent product deletion is not available on this server.');
        const id = uuid(path.slice('/api/manager/products/'.length), 'product_id');
        await deps.gateway.deleteUnreferencedProduct(actor.id, id);
        send(response, 200, { product_id: id, status: 'deleted' });
        return;
      }
      const simplePriceMatch = method === 'POST' ? path.match(/^\/api\/manager\/products\/([0-9a-f-]{36})\/price$/i) : null;
      if (simplePriceMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.updateProductShopPrice) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product price editing is not available on this server.');
        const body = await readJson(request);
        const unitPrice = optionalPrice(body.unit_price, 'unit_price');
        const designFee = optionalPrice(body.design_fee ?? 0, 'design_fee');
        if (unitPrice === null || designFee === null) throw new AppError('INVALID_REQUEST', 400, 'Enter valid non-negative prices.');
        const reason = requiredText(body.reason, 'reason', 500);
        if (reason.length < 3) throw new AppError('INVALID_REQUEST', 400, 'Explain the price change in at least 3 characters.');
        await deps.gateway.updateProductShopPrice(actor.id, uuid(simplePriceMatch[1], 'variant_id'), unitPrice, designFee, reason);
        send(response, 200, { status: 'scheduled', effective_from: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) });
        return;
      }
      if (method === 'PATCH' && path.startsWith('/api/manager/products/')) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.updateProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product administration is not configured on this server.');
        const id = uuid(path.slice('/api/manager/products/'.length), 'product_id');
        const body = await readJson(request);
        const update: Record<string, unknown> = {};
        for (const field of ['name', 'category', 'base_unit', 'description', 'material_description'] as const) {
          if (body[field] === undefined) continue;
          if (field === 'description') {
            const maxLength = field === 'description' ? 4000 : 240;
            if (typeof body[field] !== 'string' || String(body[field]).length > maxLength) throw new AppError('INVALID_REQUEST', 400, `${field} must be a string no longer than ${maxLength} characters.`);
            update[field] = String(body[field]).trim();
          } else {
            update[field] = requiredText(body[field], field, field === 'name' ? 200 : 80);
          }
        }
        if (body.vertical_key !== undefined) {
          const verticalKey = requiredText(body.vertical_key, 'vertical_key', 40);
          if (!/^[a-z][a-z0-9_]{0,39}$/.test(verticalKey)) throw new AppError('INVALID_REQUEST', 400, 'vertical_key has an invalid format.');
          if (!deps.gateway.listVerticals) throw new AppError('VERTICALS_UNAVAILABLE', 503, 'Commerce vertical configuration is not available on this server.');
          const verticals = await deps.gateway.listVerticals();
          if (!verticals.some((vertical) => vertical.active && vertical.vertical_key === verticalKey)) throw new AppError('INVALID_VERTICAL', 422, 'Select an active commerce vertical.');
          update.vertical_key = verticalKey;
        }
        if (body.attributes !== undefined) update.attributes = productAttributes(body.attributes);
        if (body.allow_customer_design_upload !== undefined) {
          if (typeof body.allow_customer_design_upload !== 'boolean') throw new AppError('INVALID_REQUEST', 400, 'allow_customer_design_upload must be a boolean.');
          update.allow_customer_design_upload = body.allow_customer_design_upload;
        }
        if (body.image_path !== undefined) {
          if (typeof body.image_path !== 'string' || body.image_path.length > 512 || (body.image_path !== '' && !body.image_path.startsWith(`products/${id}/`))) throw new AppError('INVALID_REQUEST', 400, 'image_path must reference this product’s storefront storage folder.');
          update.image_path = body.image_path;
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
      const promoteProductMatch = method === 'POST' ? /^\/api\/manager\/products\/([^/]+)\/promote$/.exec(path) : null;
      if (promoteProductMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.promoteDemoProduct) throw new AppError('PRODUCT_ADMIN_UNAVAILABLE', 503, 'Product sales approval is not configured on this server.');
        const id = uuid(decodePathSegment(promoteProductMatch[1], 'product_id'), 'product_id');
        await deps.gateway.promoteDemoProduct(actor.id, id);
        send(response, 200, { product_id: id, demo_only: false, status: 'approved_for_sales' });
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
          attributes: productAttributes(body.attributes),
          available_quantity: body.available_quantity === undefined || body.available_quantity === null || body.available_quantity === '' ? null : nonnegativeWholeNumber(body.available_quantity, 'available_quantity'),
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
        if (body.available_quantity !== undefined) update.available_quantity = body.available_quantity === null || body.available_quantity === '' ? null : nonnegativeWholeNumber(body.available_quantity, 'available_quantity');
        if (body.attributes !== undefined) update.attributes = productAttributes(body.attributes);
        if (!Object.keys(update).length) throw new AppError('INVALID_REQUEST', 400, 'Provide at least one editable variant field.');
        await deps.gateway.updateProductVariant(id, update);
        if (update.available_quantity !== undefined && deps.gateway.recordAuditLog) {
          try { await deps.gateway.recordAuditLog({ userId: actor.id, action: 'product_variant.production_capacity_updated', entityType: 'product_variant', entityId: id, metadata: { available_quantity: update.available_quantity } }); }
          catch (cause) { console.error(JSON.stringify({ level: 'error', event: 'production_capacity.audit_failed', variant_id: id, error: cause instanceof AppError ? cause.code : 'AUDIT_WRITE_FAILED' })); }
        }
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
          setup_fee: optionalPrice(body.setup_fee, 'setup_fee'), design_fee: optionalPrice(body.design_fee, 'design_fee'),
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
        if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 8) {
          throw new AppError('INVALID_REQUEST', 400, 'messages must contain between 1 and 8 user/assistant messages.');
        }
        const messages: HermesChatMessage[] = body.messages.map((message: unknown) => {
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new AppError('INVALID_REQUEST', 400, 'Each message must be an object.');
          const row = message as Record<string, unknown>;
          if (row.role !== 'user' && row.role !== 'assistant') throw new AppError('INVALID_REQUEST', 400, 'Message role must be user or assistant.');
          return { role: row.role, content: requiredText(row.content, 'message content', 4000) };
        });
        if (messages.at(-1)?.role !== 'user') throw new AppError('INVALID_REQUEST', 400, 'The last message must be from the user.');
        if (messages.reduce((total, message) => total + message.content.length, 0) > 10000) throw new AppError('PAYLOAD_TOO_LARGE', 413, 'Combined message content exceeds 10,000 characters.');
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
        const confirmation = /^I CONFIRM THIS CHANGE ([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(question.trim());
        const precedingAssistant = messages.at(-2);
        if (confirmation && precedingAssistant?.role === 'assistant' && deps.gateway.approveHermesActionProposal) {
          const proposedId = confirmation[1].toLowerCase();
          if (precedingAssistant.content.toLowerCase().includes(proposedId)
            && await deps.gateway.approveHermesActionProposal(proposedId, actor.id)) {
            console.log(JSON.stringify({ level: 'info', event: 'hermes.action.confirmed', request_id: requestId, action_id: proposedId }));
          }
        }
        const startedAt = Date.now();
        let completion: Awaited<ReturnType<HermesChatClient['complete']>>;
        try {
          completion = await deps.hermes.complete([{ role: 'system', content: hermesInstructions }, ...messages]);
        } catch (error) {
          try { await deps.gateway.recordAiRun({ feature: 'manager_chat', model: null, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, success: false }); }
          catch (logError) { console.error('Could not record failed Hermes run.', logError); }
          throw error;
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
        send(response, 200, { production_job_id: id, status });
        return;
      }

      if (method === 'GET' && path === '/api/design-requests') {
        // Marketing operates on campaign assets, not customers' private design briefs/files.
        requireRole(actor, ['customer', 'manager', 'sales', 'production', 'admin']);
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
      if (method === 'GET' && path === '/api/manager/marketing/campaigns') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.listMarketingCampaigns) throw new AppError('MARKETING_UNAVAILABLE', 503, 'Campaign management is not available on this server.');
        send(response, 200, { campaigns: await deps.gateway.listMarketingCampaigns() });
        return;
      }
      if (method === 'POST' && path === '/api/manager/marketing/campaigns/generate') {
        requireRole(actor, ['manager', 'admin']);
        aiRateLimiter.check(actor.id, 'marketing_campaign', 3);
        if (!deps.hermes || !deps.gateway.createMarketingCampaignWithPosts) throw new AppError('MARKETING_UNAVAILABLE', 503, 'Campaign generation requires the configured Hermes service and current database migration.');
        const body = await readJson(request);
        const name = requiredText(body.name, 'name', 160);
        const month = requiredText(body.month, 'month', 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError('INVALID_REQUEST', 400, 'month must use YYYY-MM format.');
        const cairoDateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
        const currentCairoMonth = `${cairoDateParts.find((part) => part.type === 'year')?.value}-${cairoDateParts.find((part) => part.type === 'month')?.value}`;
        if (month < currentCairoMonth) throw new AppError('INVALID_REQUEST', 400, 'Choose the current Cairo month or a future month so every post can be scheduled.');
        const objective = requiredText(body.objective, 'objective', 1000);
        const audience = requiredText(body.audience, 'audience', 500);
        const tone = requiredText(body.tone, 'tone', 300);
        const language = body.language === 'ar' ? 'ar' : body.language === 'en' ? 'en' : null;
        if (!language) throw new AppError('INVALID_REQUEST', 400, 'language must be en or ar.');
        const requested = Number(body.post_count);
        if (!Number.isInteger(requested) || requested < 1 || requested > 20) throw new AppError('INVALID_REQUEST', 400, 'post_count must be a whole number from 1 to 20.');
        const validPlatforms = ['instagram','facebook','linkedin','x','general'];
        if (!Array.isArray(body.platforms) || body.platforms.length < 1 || body.platforms.length > 5 || body.platforms.some((item) => typeof item !== 'string' || !validPlatforms.includes(item))) throw new AppError('INVALID_REQUEST', 400, 'Choose one or more supported platforms.');
        const platforms = [...new Set(body.platforms as string[])];
        const validFrequencies = ['daily','weekly','monthly','custom'];
        const frequency = typeof body.frequency === 'string' && validFrequencies.includes(body.frequency) ? body.frequency : null;
        if (!frequency) throw new AppError('INVALID_REQUEST', 400, 'frequency must be daily, weekly, monthly, or custom.');
        const times = body.preferred_times;
        if (!Array.isArray(times) || times.length < 1 || times.length > 5 || times.some((item) => typeof item !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item))) throw new AppError('INVALID_REQUEST', 400, 'preferred_times must contain one to five valid HH:mm times.');
        if (!Array.isArray(body.product_ids) || body.product_ids.length > 20) throw new AppError('INVALID_REQUEST', 400, 'product_ids must contain up to 20 catalog products.');
        const productIds = [...new Set(body.product_ids.map((id, index) => uuid(id, `product_ids[${index}]`)))];
        const catalog = (await deps.gateway.listProducts('', true)).filter((value) => value && typeof value === 'object') as Array<Record<string, unknown>>;
        const activeProducts = catalog.filter((product) => product.active !== false && typeof product.id === 'string');
        if (productIds.some((id) => !activeProducts.some((product) => product.id === id))) throw new AppError('INVALID_PRODUCT', 422, 'Selected campaign products must exist and be active.');
        const products = (productIds.length ? activeProducts.filter((product) => productIds.includes(String(product.id))) : activeProducts.slice(0, 20)).map((product) => ({ id: product.id, name: product.name, category: product.category, description: product.description }));
        const [year, monthNumber] = month.split('-').map(Number);
        const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
        const schedule = Array.from({ length: requested }, (_, index) => {
          let day: number;
          if (frequency === 'daily') day = Math.min(index + 1, daysInMonth);
          else if (frequency === 'weekly' && requested <= 4) day = Math.min(1 + index * 7, daysInMonth);
          else day = Math.max(1, Math.floor(((index + 1) * daysInMonth) / (requested + 1)));
          const [hour, minute] = times[index % times.length].split(':').map(Number);
          // Interpret manager-entered times in the Cairo timezone, including seasonal UTC offset.
          let timestamp = Date.UTC(year, monthNumber - 1, day, hour, minute);
          const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp));
          const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
          const observed = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
          timestamp += Date.UTC(year, monthNumber - 1, day, hour, minute) - observed;
          return { scheduled_at: new Date(timestamp).toISOString(), platform: platforms[index % platforms.length], product_id: products.length ? String(products[index % products.length].id) : null, slot: index + 1 };
        });
        const startedAt = Date.now();
        let completion: Awaited<ReturnType<HermesChatClient['complete']>>;
        try {
          completion = await deps.hermes.complete([
            { role: 'system', content: `Create exactly ${requested} distinct social-media post drafts in ${language === 'ar' ? 'Egyptian Arabic' : 'English'}. Use only the supplied product facts and do not invent prices, discounts, stock, guarantees, or customer stories. Respect the objective, audience, tone, platform, and product assigned to each slot. Every post must have caption and 3 to 5 relevant hashtags. Return only a JSON array with exactly ${requested} objects: {"caption":"...","hashtags":["#..."]}. Draft only; do not say anything was published.` },
            { role: 'user', content: JSON.stringify({ objective, audience, tone, products, slots: schedule }) }
          ]);
        } catch (error) {
          try { await deps.gateway.recordAiRun({ feature: 'marketing_campaign_generation', model: null, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, success: false }); } catch { /* retain provider error */ }
          throw error;
        }
        const raw = requiredText(completion.content, 'generated campaign', 30000).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        let generated: unknown;
        try { generated = JSON.parse(raw); } catch { throw new AppError('AI_INVALID_RESPONSE', 502, 'Hermes returned an invalid campaign response. No campaign was saved.'); }
        if (!Array.isArray(generated) || generated.length !== requested) throw new AppError('AI_INVALID_RESPONSE', 502, 'Hermes did not return the requested number of posts. No campaign was saved.');
        const posts = generated.map((value, index) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('AI_INVALID_RESPONSE', 502, `Hermes returned an invalid post at position ${index + 1}.`);
          const row = value as Record<string, unknown>;
          const caption = requiredText(row.caption, `posts[${index}].caption`, 3000);
          const tags = Array.isArray(row.hashtags) ? row.hashtags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8).map((tag) => tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`) : [];
          return { caption: `${caption}${tags.length ? `\n\n${tags.join(' ')}` : ''}`, theme: 'campaign', ...schedule[index] };
        });
        const result = await deps.gateway.createMarketingCampaignWithPosts({ campaign: { name, month, objective, target_audience: audience, language, tone, posting_frequency: frequency, preferred_times: times, platforms, product_ids: productIds, requested_posts: requested }, posts, createdBy: actor.id });
        try { await deps.gateway.recordAiRun({ feature: 'marketing_campaign_generation', model: completion.model, inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0, latencyMs: Date.now() - startedAt, success: true }); } catch { /* campaign is already persisted */ }
        if (deps.gateway.recordAuditLog) try { await deps.gateway.recordAuditLog({ userId: actor.id, action: 'marketing.campaign.generated', entityType: 'marketing_campaign', entityId: result.campaignId, metadata: { requested_posts: requested, created_posts: result.assetIds.length, month, platforms } }); } catch { /* keep persisted campaign */ }
        send(response, 201, { campaign_id: result.campaignId, asset_ids: result.assetIds, requested_posts: requested, generated_posts: result.assetIds.length, image_status: 'not_generated', campaign_status: 'draft', publishing_available: false });
        return;
      }
      const campaignMatch = method === 'PATCH' ? /^\/api\/manager\/marketing\/campaigns\/([0-9a-f-]{36})$/.exec(path) : null;
      if (campaignMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.updateMarketingCampaign) throw new AppError('MARKETING_UNAVAILABLE', 503, 'Campaign editing is not available on this server.');
        const body = await readJson(request);
        const id = uuid(campaignMatch[1], 'campaign_id');
        const update: { status?: 'draft' | 'active' | 'paused' | 'completed'; name?: string; objective?: string; audience?: string; tone?: string } = {};
        if (body.status !== undefined) {
          if (!['draft','active','paused','completed'].includes(String(body.status))) throw new AppError('INVALID_REQUEST', 400, 'Unsupported campaign status.');
          update.status = body.status as 'draft' | 'active' | 'paused' | 'completed';
        }
        if (body.name !== undefined) update.name = requiredText(body.name, 'name', 160);
        if (body.objective !== undefined) update.objective = requiredText(body.objective, 'objective', 1000);
        if (body.audience !== undefined) update.audience = requiredText(body.audience, 'audience', 500);
        if (body.tone !== undefined) update.tone = requiredText(body.tone, 'tone', 300);
        if (!Object.keys(update).length) throw new AppError('INVALID_REQUEST', 400, 'Provide campaign fields to update.');
        if (!await deps.gateway.updateMarketingCampaign(id, update)) throw new AppError('NOT_FOUND', 404, 'Marketing campaign not found.');
        send(response, 200, { campaign_id: id, status: update.status ?? 'updated' });
        return;
      }
      const campaignPostMatch = method === 'POST' ? /^\/api\/manager\/marketing\/campaigns\/([0-9a-f-]{36})\/posts$/.exec(path) : null;
      if (campaignPostMatch) {
        requireRole(actor, ['manager', 'admin']);
        const campaignId = uuid(campaignPostMatch[1], 'campaign_id');
        if (!deps.gateway.listMarketingCampaigns) throw new AppError('MARKETING_UNAVAILABLE', 503, 'Campaign management is not available on this server.');
        const campaign = (await deps.gateway.listMarketingCampaigns()).find((value) => value && typeof value === 'object' && (value as Record<string, unknown>).id === campaignId) as Record<string, unknown> | undefined;
        if (!campaign) throw new AppError('NOT_FOUND', 404, 'Marketing campaign not found.');
        const platform = Array.isArray(campaign.platforms) && typeof campaign.platforms[0] === 'string' ? String(campaign.platforms[0]) : 'general';
        const assetId = await deps.gateway.createMarketingAsset({ orderId: null, campaignId, productId: null, campaignBrief: String(campaign.objective ?? ''), campaignType: 'campaign', createdBy: actor.id, designUrl: null, imageStatus: 'not_generated', platform, caption: '', scheduledAt: null });
        if (deps.gateway.recordAuditLog) try { await deps.gateway.recordAuditLog({ userId: actor.id, action: 'marketing.post.added', entityType: 'marketing_asset', entityId: assetId, metadata: { campaign_id: campaignId } }); } catch { /* draft persists */ }
        send(response, 201, { asset_id: assetId, status: 'pending_approval' });
        return;
      }
      if (method === 'DELETE' && path === '/api/manager/marketing/assets/drafts') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.deletePendingMarketingDrafts) throw new AppError('MARKETING_UNAVAILABLE', 503, 'Campaign draft deletion is not available on this server.');
        const count = await deps.gateway.deletePendingMarketingDrafts(actor.id);
        if (deps.gateway.recordAuditLog) {
          try { await deps.gateway.recordAuditLog({ userId: actor.id, action: 'marketing.pending_drafts.deleted', entityType: 'marketing_asset', entityId: null, metadata: { count } }); }
          catch (error) { console.error(JSON.stringify({ level: 'error', event: 'marketing.drafts_delete_audit_failed', request_id: requestId, error_code: error instanceof AppError ? error.code : 'AUDIT_WRITE_FAILED' })); }
        }
        send(response, 200, { deleted: count });
        return;
      }
      const marketingDraftMatch = method === 'PATCH' ? /^\/api\/manager\/marketing\/assets\/([0-9a-f-]{36})$/.exec(path) : null;
      if (marketingDraftMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.updatePendingMarketingDraft) throw new AppError('MARKETING_UNAVAILABLE', 503, 'Campaign editing is not available on this server.');
        const id = uuid(marketingDraftMatch[1], 'marketing_asset_id');
        const body = await readJson(request);
        const existing = (await deps.gateway.listMarketingAssets()).find((value) => value && typeof value === 'object' && (value as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
        if (!existing || existing.order_id !== null || existing.status !== 'pending_approval') throw new AppError('MARKETING_DRAFT_NOT_EDITABLE', 409, 'Only an unpublished pending draft can be edited.');
        const caption = body.caption === undefined ? requiredText(existing.caption, 'caption', 4000) : requiredText(body.caption, 'caption', 4000);
        if (body.scheduled_at !== null && body.scheduled_at !== undefined && (typeof body.scheduled_at !== 'string' || !Number.isFinite(Date.parse(body.scheduled_at)))) {
          throw new AppError('INVALID_REQUEST', 400, 'scheduled_at must be an ISO date/time or null.');
        }
        const scheduledAt = typeof body.scheduled_at === 'string' ? new Date(body.scheduled_at).toISOString() : null;
        const platform = body.platform === undefined ? undefined : requiredText(body.platform, 'platform', 40).toLowerCase();
        if (platform && !['instagram','facebook','linkedin','x','general'].includes(platform)) throw new AppError('INVALID_REQUEST', 400, 'Unsupported publishing platform.');
        const productId = body.product_id === undefined ? undefined : body.product_id === null || body.product_id === '' ? null : uuid(body.product_id, 'product_id');
        if (productId) {
          const product = await deps.gateway.getProduct(productId);
          if (!product || product.active === false) throw new AppError('INVALID_PRODUCT', 422, 'Campaign product must be active.');
        }
        if (!await deps.gateway.updatePendingMarketingDraft(id, caption, scheduledAt, { productId: productId === undefined ? (typeof existing.product_id === 'string' ? existing.product_id : null) : productId, platform: platform ?? String(existing.platform ?? 'general') })) throw new AppError('MARKETING_DRAFT_NOT_EDITABLE', 409, 'Only an unpublished pending or approved post can be changed.');
        send(response, 200, { asset_id: id, status: 'updated' });
        return;
      }

      const marketingImageMatch = method === 'POST' ? /^\/api\/manager\/marketing\/assets\/([0-9a-f-]{36})\/image$/.exec(path) : null;
      if (marketingImageMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.marketingImage || !deps.gateway.uploadMarketingImage || !deps.gateway.updateMarketingAssetImage) throw new AppError('IMAGE_GENERATION_UNAVAILABLE', 503, 'Marketing image generation is unavailable on this server.');
        const id = uuid(marketingImageMatch[1], 'marketing_asset_id');
        const asset = (await deps.gateway.listMarketingAssets()).find((value) => value && typeof value === 'object' && (value as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
        if (!asset || asset.order_id !== null || asset.status !== 'pending_approval') throw new AppError('MARKETING_DRAFT_NOT_EDITABLE', 409, 'Only a pending marketing draft can receive an image.');
        const product = typeof asset.product_id === 'string' ? await deps.gateway.getProduct(asset.product_id) : null;
        const prompt = `Create one premium, photorealistic social campaign image for INKORA, a real print shop in Mansoura, Egypt. Product: ${product ? `${String(product.name)} (${String(product.category)}) ${String(product.description ?? '')}` : 'print shop brand awareness'}. Campaign context: ${String(asset.campaign_brief ?? '').slice(0, 700)}. Caption context: ${String(asset.caption ?? '').slice(0, 700)}. Platform: ${String(asset.platform ?? 'general')}. Show product-specific realistic print photography or a clean print-inspired scene. Do not render readable text, price, discounts, invented logos, watermark, or customer material. Square image.`;
        try {
          const generated = await deps.marketingImage.generate(prompt);
          if (!['image/png','image/jpeg','image/webp'].includes(generated.mimeType) || generated.data.length > 12_000_000) throw new AppError('INVALID_GENERATED_IMAGE', 502, 'The image provider returned unsupported artwork.');
          const imagePath = await deps.gateway.uploadMarketingImage({ id: randomUUID(), mimeType: generated.mimeType, data: generated.data });
          await deps.gateway.updateMarketingAssetImage(id, imagePath, 'generated');
          try { await deps.gateway.recordAiRun({ feature: 'marketing_image', model: generated.model, inputTokens: 0, outputTokens: 0, estimatedCostUsd: generated.estimatedCostUsd, latencyMs: 0, success: true }); } catch { /* preserve the saved artwork */ }
          send(response, 201, { asset_id: id, image_status: 'generated', design_url: imagePath, model: generated.model });
        } catch (error) {
          const code = error instanceof AppError ? error.code : 'IMAGE_GENERATION_FAILED';
          try { await deps.gateway.updateMarketingAssetImage(id, null, 'failed', code); } catch { /* return original generation error */ }
          try { await deps.gateway.recordAiRun({ feature: 'marketing_image', model: process.env.MARKETING_IMAGE_PROVIDER ?? 'configured image provider', inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0, success: false }); } catch { /* preserve original generation error */ }
          throw error;
        }
        return;
      }

      const marketingDuplicateMatch = method === 'POST' ? /^\/api\/manager\/marketing\/assets\/([0-9a-f-]{36})\/duplicate$/.exec(path) : null;
      if (marketingDuplicateMatch) {
        requireRole(actor, ['manager', 'admin']);
        const originalId = uuid(marketingDuplicateMatch[1], 'marketing_asset_id');
        const original = (await deps.gateway.listMarketingAssets()).find((value) => value && typeof value === 'object' && (value as Record<string, unknown>).id === originalId) as Record<string, unknown> | undefined;
        if (!original || original.order_id !== null) throw new AppError('NOT_FOUND', 404, 'Independent marketing draft not found.');
        const newId = await deps.gateway.createMarketingAsset({ orderId: null, campaignId: typeof original.campaign_id === 'string' ? original.campaign_id : null, productId: typeof original.product_id === 'string' ? original.product_id : null, campaignBrief: String(original.campaign_brief ?? ''), campaignType: String(original.campaign_type ?? 'campaign'), createdBy: actor.id, designUrl: typeof original.design_url === 'string' ? original.design_url : null, imageStatus: original.design_url ? 'generated' : 'not_generated', platform: String(original.platform ?? 'general'), caption: String(original.caption ?? ''), scheduledAt: null });
        if (deps.gateway.recordAuditLog) try { await deps.gateway.recordAuditLog({ userId: actor.id, action: 'marketing.post.duplicated', entityType: 'marketing_asset', entityId: newId, metadata: { source_asset_id: originalId } }); } catch { /* duplicate persists */ }
        send(response, 201, { asset_id: newId, status: 'pending_approval' });
        return;
      }

      const marketingDeleteMatch = method === 'DELETE' ? /^\/api\/manager\/marketing\/assets\/([0-9a-f-]{36})$/.exec(path) : null;
      if (marketingDeleteMatch) {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.deletePendingMarketingDraft) throw new AppError('MARKETING_UNAVAILABLE', 503, 'Individual campaign post deletion is not available on this server.');
        const id = uuid(marketingDeleteMatch[1], 'marketing_asset_id');
        if (!await deps.gateway.deletePendingMarketingDraft(id)) throw new AppError('MARKETING_DRAFT_NOT_EDITABLE', 409, 'Only an unpublished draft can be deleted.');
        send(response, 200, { asset_id: id, status: 'deleted' });
        return;
      }

      if (path === '/api/manager/product-images/allowance' && method === 'GET') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.getProductImageAllowance) throw new AppError('IMAGE_ALLOWANCE_UNAVAILABLE', 503, 'Product image generation allowance is not configured.');
        send(response, 200, await deps.gateway.getProductImageAllowance());
        return;
      }
      if (path === '/api/manager/product-images/allowance' && method === 'PUT') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.setProductImageAllowance || !deps.gateway.getProductImageAllowance) throw new AppError('IMAGE_ALLOWANCE_UNAVAILABLE', 503, 'Product image generation allowance is not configured.');
        const body = await readJson(request);
        const included = Number(body.included);
        if (!Number.isInteger(included) || included < 0 || included > 100) throw new AppError('INVALID_REQUEST', 400, 'included must be a whole number from 0 to 100.');
        const current = await deps.gateway.getProductImageAllowance();
        if (included < current.used) throw new AppError('ALLOWANCE_BELOW_USAGE', 409, 'The included allowance cannot be set below already reserved or completed generations.');
        const reason = requiredText(body.reason, 'reason', 500);
        if (reason.length < 3) throw new AppError('INVALID_REQUEST', 400, 'reason must contain at least three characters.');
        await deps.gateway.setProductImageAllowance(actor.id, included);
        if (deps.gateway.recordAuditLog) {
          try { await deps.gateway.recordAuditLog({ userId: actor.id, action: 'product_image_generation.allowance_updated', entityType: 'shop_settings', entityId: null, metadata: { old_included: current.included, new_included: included, reason } }); }
          catch (error) { console.error(JSON.stringify({ level: 'error', event: 'product_image_generation.allowance_audit_failed', request_id: requestId, error_code: error instanceof AppError ? error.code : 'AUDIT_WRITE_FAILED' })); }
        }
        send(response, 200, { allowance: await deps.gateway.getProductImageAllowance() });
        return;
      }
      const productImageMatch = /^\/api\/manager\/products\/([0-9a-f-]{36})\/images(?:\/(generate|select))?$/.exec(path);
      if (productImageMatch) {
        requireRole(actor, ['manager', 'admin']);
        const productId = uuid(productImageMatch[1], 'product_id');
        const action = productImageMatch[2];
        if (method === 'GET' && !action) {
          if (!deps.gateway.listProductImageGenerations) throw new AppError('PRODUCT_IMAGES_UNAVAILABLE', 503, 'Product image gallery is not configured.');
          send(response, 200, { images: await deps.gateway.listProductImageGenerations(productId) });
          return;
        }
        if (method === 'POST' && action === 'select') {
          if (!deps.gateway.selectProductImage) throw new AppError('PRODUCT_IMAGES_UNAVAILABLE', 503, 'Product image selection is not configured.');
          const body = await readJson(request);
          await deps.gateway.selectProductImage(actor.id, productId, uuid(body.generation_id, 'generation_id'));
          send(response, 200, { status: 'selected' });
          return;
        }
        if (method === 'POST' && action === 'generate') {
          if (!deps.marketingImage || !deps.gateway.uploadProductImage || !deps.gateway.reserveProductImageGeneration || !deps.gateway.finishProductImageGeneration || !deps.gateway.getProductImageAllowance) throw new AppError('PRODUCT_IMAGE_GENERATION_UNAVAILABLE', 503, 'AI product image generation is not configured.');
          const product = await deps.gateway.getProduct(productId);
          if (!product) throw new AppError('NOT_FOUND', 404, 'Product not found.');
          const allowance = await deps.gateway.getProductImageAllowance();
          if (allowance.remaining < 1) throw new AppError('IMAGE_ALLOWANCE_EXHAUSTED', 402, 'Included product image generations are used. Paid extra generations are unavailable until billing is configured.');
          const id = randomUUID();
          await deps.gateway.reserveProductImageGeneration({ id, productId, requestedBy: actor.id });
          let model: string | null = null;
          try {
            const prompt = `Create one photorealistic additional catalog image for the supplied real product. Product name: ${requiredText(product.name, 'product.name', 200)}. Category: ${requiredText(product.category, 'product.category', 80)}. Description: ${typeof product.description === 'string' ? product.description.slice(0, 500) : 'No description supplied'}. Material: ${typeof product.material_description === 'string' ? product.material_description.slice(0, 240) : 'unspecified'}. Show a realistic product-display or lifestyle angle consistent with the actual product. Do not alter the product type, invent branding, render readable text, show a watermark, or imply the image is the shop's original photography.`;
            const generated = await deps.marketingImage.generate(prompt);
            model = generated.model;
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(generated.mimeType) || generated.data.length > 12_000_000) throw new AppError('INVALID_GENERATED_IMAGE', 502, 'The image provider returned unsupported artwork.');
            const imagePath = await deps.gateway.uploadProductImage({ id, productId, mimeType: generated.mimeType, data: generated.data });
            await deps.gateway.finishProductImageGeneration({ id, status: 'completed', imagePath, model });
            try { await deps.gateway.recordAiRun({ feature: 'product_image_generation', model, inputTokens: 0, outputTokens: 0, estimatedCostUsd: generated.estimatedCostUsd, latencyMs: 0, success: true }); } catch { /* Do not discard the generated image if usage logging fails. */ }
            send(response, 201, { generation_id: id, image_path: imagePath, model, allowance: await deps.gateway.getProductImageAllowance() });
          } catch (error) {
            try { await deps.gateway.finishProductImageGeneration({ id, status: 'failed', model }); } catch { /* Preserve the provider/storage failure. */ }
            try { await deps.gateway.recordAiRun({ feature: 'product_image_generation', model, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0, success: false }); } catch { /* Preserve the provider/storage failure. */ }
            throw error;
          }
          return;
        }
      }
      if (path === '/api/manager/marketing/plan-settings' && method === 'GET') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.getMarketingPlanSettings) throw new AppError('MARKETING_SETTINGS_UNAVAILABLE', 503, 'Monthly marketing settings are not available on this server.');
        send(response, 200, { settings: await deps.gateway.getMarketingPlanSettings() ?? defaultMarketingPlanSettings });
        return;
      }
      if (path === '/api/manager/marketing/plan-settings' && method === 'PUT') {
        requireRole(actor, ['manager', 'admin']);
        if (!deps.gateway.saveMarketingPlanSettings) throw new AppError('MARKETING_SETTINGS_UNAVAILABLE', 503, 'Monthly marketing settings are not available on this server.');
        const body = await readJson(request);
        const settings = marketingPlanSettings(body.settings);
        const catalog = await deps.gateway.listProducts('', true);
        const activeIds = new Set(catalog.filter((product) => product && typeof product === 'object' && (product as Record<string, unknown>).active !== false).map((product) => String((product as Record<string, unknown>).id)));
        if (settings.product_ids.some((id) => !activeIds.has(id))) throw new AppError('INVALID_PRODUCT', 422, 'Every selected marketing product must exist and be active.');
        await deps.gateway.saveMarketingPlanSettings(actor.id, settings);
        send(response, 200, { settings, status: 'saved' });
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
        if (body.scheduled_at !== null && body.scheduled_at !== undefined && (typeof body.scheduled_at !== 'string' || !Number.isFinite(Date.parse(body.scheduled_at)))) {
          throw new AppError('INVALID_REQUEST', 400, 'scheduled_at must be an ISO date/time or null.');
        }
        const scheduledAt = typeof body.scheduled_at === 'string' ? new Date(body.scheduled_at).toISOString() : null;
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
        const id = await deps.gateway.createMarketingAsset({ orderId: null, productId, campaignBrief, campaignType, createdBy: actor.id, designUrl, platform, caption, scheduledAt });
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
        if (body.shop_design === true) throw new AppError('CUSTOM_DESIGN_REMOVED', 410, 'The paid customer design service is no longer offered. Customers may optionally upload their own artwork when the product allows it.');
        if (role === 'customer') {
          if (!orderId || (files as string[]).length === 0) throw new AppError('DESIGN_UPLOAD_NOT_ALLOWED', 422, 'Customer design requests require an order and an optional artwork file for an enabled product.');
          if (!deps.gateway.customerDesignUploadAllowed || !await deps.gateway.customerDesignUploadAllowed(orderId, customerId)) throw new AppError('DESIGN_UPLOAD_NOT_ALLOWED', 422, 'Customer artwork upload is not enabled for any item in this order.');
        }
        const id = await deps.gateway.createDesignRequest({ customerId, orderId, brief: requiredText(body.brief, 'brief'), referenceFiles: files as string[], customerNotes: typeof body.customer_notes === 'string' ? body.customer_notes.slice(0, 2000) : null, designFee: 0 });
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
