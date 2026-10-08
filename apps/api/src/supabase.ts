import type { PricingRepository, PriceRule, ProductOptionGroup, Variant } from './pricing.ts';
import { AppError } from './errors.ts';
import type { AuthGateway, CommerceVertical, DesignRequestStatus, InventoryCommand, OrderStatus, ProductionStatus, QuoteStatus, Role, StorefrontConfig } from './api.ts';
import type { AutomationEvent } from './automation-outbox.ts';

type SupabaseUser = { id: string };
const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;

const PRODUCT_OPTIONS_SELECT = 'product_option_groups(id,option_key,label_en,label_ar,required,active,display_order,product_option_values(id,value_key,label_en,label_ar,adjustment_type,price_adjustment,active,display_order))';
const PUBLIC_PRODUCT_SELECT = `id,sku,name,category,description,base_unit,vertical_key,attributes,requires_design,requires_size,demo_only,${PRODUCT_OPTIONS_SELECT},product_variants!inner(id,sku,name,width_cm,height_cm,material,finishing,available_quantity,attributes,public_price,price_type,market_references(quantity,min_price,max_price,currency,source_name,source_url,source_date),price_rules!inner(id,active_from,active_to))`;

function shopDate(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function filterPublicProducts(rows: Array<Record<string, unknown>>, today: string): Array<Record<string, unknown>> {
  return rows.map((product) => ({
    ...product,
    product_option_groups: Array.isArray(product.product_option_groups)
      ? (product.product_option_groups as Array<Record<string, unknown>>).filter((group) => group.active !== false).map((group) => ({
          ...group,
          values: Array.isArray(group.values) ? (group.values as Array<Record<string, unknown>>).filter((option) => option.active !== false) : []
        }))
      : [],
    product_variants: Array.isArray(product.product_variants)
      ? (product.product_variants as Array<Record<string, unknown>>).flatMap((variant) => {
          const rules = Array.isArray(variant.price_rules)
            ? (variant.price_rules as Array<{ active_from?: unknown; active_to?: unknown }>).filter((rule) =>
                typeof rule.active_from === 'string' && rule.active_from <= today
                && (rule.active_to === null || (typeof rule.active_to === 'string' && rule.active_to >= today)))
            : [];
          // Never advertise a variant for which the deterministic quote engine
          // cannot find at least one currently effective internal price rule.
          if (!rules.length) return [];
          const { price_rules: _internalRules, ...publicVariant } = variant;
          return [publicVariant];
        })
      : []
  })).filter((product) => (product.product_variants as unknown[]).length > 0);
}

function normalizeProductOptionGroups(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((product) => ({
    ...product,
    product_option_groups: Array.isArray(product.product_option_groups)
      ? (product.product_option_groups as Array<Record<string, unknown>>).map((group) => ({
          id: group.id, key: group.option_key, label_en: group.label_en, label_ar: group.label_ar,
          required: group.required, active: group.active, display_order: group.display_order,
          values: Array.isArray(group.product_option_values) ? (group.product_option_values as Array<Record<string, unknown>>).map((value) => ({
            id: value.id, key: value.value_key, label_en: value.label_en, label_ar: value.label_ar,
            adjustment_type: value.adjustment_type, price_adjustment: value.price_adjustment,
            active: value.active, display_order: value.display_order
          })) : []
        }))
      : []
  }));
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function firstConfigured(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Set one of these environment variables: ${names.join(', ')}`);
}

export class SupabaseGateway implements PricingRepository, AuthGateway {
  private readonly url = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  private readonly publishableKey = firstConfigured('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  private readonly secretKey = firstConfigured('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

  async checkDatabaseReady(): Promise<void> {
    const query = new URLSearchParams({ select: 'id', limit: '1' });
    await this.rest<Array<{ id: string }>>(`products?${query}`);
  }

  async claimIntegrationEvents(limit: number): Promise<AutomationEvent[]> {
    return await this.rpc<AutomationEvent[]>('claim_integration_events', { p_limit: limit });
  }

  async completeIntegrationEvent(id: string): Promise<void> {
    await this.rpc('complete_integration_event', { p_id: id });
  }

  async retryIntegrationEvent(id: string, delaySeconds: number, error: string): Promise<void> {
    await this.rpc('retry_integration_event', { p_id: id, p_delay_seconds: delaySeconds, p_error: error });
  }

  async listAutomationEvents(): Promise<Array<Record<string, unknown>>> {
    const query = new URLSearchParams({ select: 'id,event_type,status,attempt_count,available_at,delivered_at,created_at,last_error', order: 'created_at.desc', limit: '100' });
    return await this.rest<Array<Record<string, unknown>>>(`integration_outbox?${query}`);
  }

  async retryDeadAutomationEvent(actorId: string, eventId: string): Promise<boolean> {
    return await this.rpc<boolean>('retry_dead_integration_event', { p_actor_id: actorId, p_event_id: eventId });
  }

  async authenticate(accessToken: string): Promise<SupabaseUser> {
    let response: Response;
    try {
      response = await fetch(`${this.url}/auth/v1/user`, {
        headers: { apikey: this.publishableKey, authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new AppError('AUTH_SERVICE_UNAVAILABLE', 503, 'Authentication is temporarily unavailable. Please try again.');
    }
    if (!response.ok) throw new AppError('UNAUTHORIZED', 401, 'A valid Supabase access token is required.');
    return await response.json() as SupabaseUser;
  }

  private async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const apiKeyHeaders: Record<string, string> = { apikey: this.secretKey };
    // Legacy JWT keys may also be sent as Bearer tokens. New sb_secret_* keys are
    // API keys, not JWTs, and must stay out of the Authorization header.
    if (this.secretKey.startsWith('eyJ')) apiKeyHeaders.authorization = `Bearer ${this.secretKey}`;
    let response: Response;
    try {
      response = await fetch(`${this.url}/rest/v1/${path}`, {
        ...init,
        headers: {
          ...apiKeyHeaders,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...init.headers
        },
        signal: init.signal ?? AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new AppError('DATABASE_UNAVAILABLE', 503, 'The database is temporarily unavailable. Please try again.');
    }
    const text = await response.text();
    if (!response.ok) {
      let upstreamCode: string | undefined;
      let upstreamMessage = '';
      try {
        const payload = JSON.parse(text) as { code?: unknown; message?: unknown };
        if (typeof payload.code === 'string' && /^[A-Z0-9]{2,10}$/.test(payload.code)) upstreamCode = payload.code;
        if (typeof payload.message === 'string') upstreamMessage = payload.message;
      } catch { /* The response body is intentionally not reflected to clients or logs. */ }
      console.error(JSON.stringify({
        level: 'error', event: 'supabase.request.failed', status: response.status,
        path: path.split('?')[0], upstream_code: upstreamCode
      }));
      if (path === 'rpc/create_order_from_accepted_quote'
        && upstreamCode === '22023'
        && upstreamMessage === 'material requirements are not configured for every quote item') {
        throw new AppError(
          'MATERIAL_REQUIREMENTS_NOT_CONFIGURED',
          409,
          'The shop has not configured production materials for every item in this quote yet. Please ask the manager to finish product setup, then retry creating the order.'
        );
      }
      if (path === 'rpc/create_order_from_accepted_quote'
        && upstreamCode === '23514'
        && upstreamMessage === 'insufficient available stock') {
        throw new AppError(
          'INVENTORY_INSUFFICIENT',
          409,
          'There is not enough available material to start this order. The manager must restock or update the shop inventory before retrying.'
        );
      }
      if (path === 'rpc/create_order_from_accepted_quote'
        && upstreamCode === '22023'
        && upstreamMessage.startsWith('PRODUCTION_CAPACITY_INSUFFICIENT:')) {
        throw new AppError(
          'PRODUCTION_CAPACITY_INSUFFICIENT',
          409,
          'The shop no longer has enough production capacity for this quantity. Please refresh the product options or contact the shop.'
        );
      }
      if (path === 'rpc/create_order_from_accepted_quote' && upstreamCode === '22023' && upstreamMessage.startsWith('DEMO_ONLY_PRODUCTS:')) {
        throw new AppError('DEMO_ONLY_PRODUCT', 409, 'This sample catalog item is not available for sale. A manager must approve its shop prices first.');
      }
      if (path === 'rpc/promote_demo_product' && upstreamCode === '22023') {
        throw new AppError('DEMO_PRODUCT_NOT_READY', 409, upstreamMessage);
      }
      throw new AppError('DATABASE_ERROR', 502, 'The database request could not be completed.');
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async getRole(userId: string): Promise<Role | null> {
    const query = new URLSearchParams({ select: 'role', id: `eq.${userId}`, limit: '1' });
    const rows = await this.rest<Array<{ role: Role }>>(`users?${query}`);
    return rows[0]?.role ?? null;
  }

  async getCustomerId(userId: string): Promise<string | null> {
    const query = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, limit: '1' });
    const rows = await this.rest<Array<{ id: string }>>(`customers?${query}`);
    return rows[0]?.id ?? null;
  }

  async customerExists(customerId: string): Promise<boolean> {
    const query = new URLSearchParams({ select: 'id', id: `eq.${customerId}`, limit: '1' });
    const rows = await this.rest<Array<{ id: string }>>(`customers?${query}`);
    return rows.length === 1;
  }

  async getVariantBySku(sku: string): Promise<Variant | null> {
    const query = new URLSearchParams({
      select: 'id,sku,name,material,available_quantity,product_id,products!inner(active,demo_only)', sku: `eq.${sku}`,
      active: 'eq.true', 'products.active': 'eq.true', limit: '1'
    });
    const rows = await this.rest<Array<Variant & { products: { active: boolean; demo_only: boolean } }>>(`product_variants?${query}`);
    return rows[0] ? { ...rows[0], demo_only: rows[0].products.demo_only } : null;
  }

  async getProductOptionGroups(productId: string): Promise<ProductOptionGroup[]> {
    const query = new URLSearchParams({
      select: 'option_key,label_en,label_ar,required,product_option_values!inner(value_key,label_en,label_ar,adjustment_type,price_adjustment)',
      product_id: `eq.${productId}`, active: 'eq.true', order: 'display_order.asc'
    });
    query.set('product_option_values.active', 'eq.true');
    const rows = await this.rest<Array<{ option_key: string; label_en: string; label_ar: string; required: boolean; product_option_values: Array<{ value_key: string; label_en: string; label_ar: string; adjustment_type: 'per_unit'|'one_time'; price_adjustment: string|number }> }>>(`product_option_groups?${query}`);
    return rows.map((group) => ({ key: group.option_key, label_en: group.label_en, label_ar: group.label_ar, required: group.required, values: group.product_option_values.map((value) => ({ key: value.value_key, label_en: value.label_en, label_ar: value.label_ar, adjustment_type: value.adjustment_type, price_adjustment: value.price_adjustment })) }));
  }

  async replaceProductOptions(actorId: string, productId: string, options: ProductOptionGroup[], reason: string): Promise<void> {
    await this.rpc('replace_product_options', { p_actor_id: actorId, p_product_id: productId, p_options: options.map((group) => ({ key: group.key, label_en: group.label_en, label_ar: group.label_ar, required: group.required, values: group.values.map((value) => ({ key: value.key, label_en: value.label_en, label_ar: value.label_ar, adjustment_type: value.adjustment_type, price_adjustment: value.price_adjustment })) })), p_reason: reason });
  }

  async getPriceRules(variantId: string): Promise<PriceRule[]> {
    const query = new URLSearchParams({ select: '*', product_variant_id: `eq.${variantId}` });
    return await this.rest<PriceRule[]>(`price_rules?${query}`);
  }

  async saveQuote(input: {
    customerId: string;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    items: Array<Record<string, unknown>>;
  }): Promise<string> {
    const result = await this.rest<string | string[]>('rpc/create_quote_with_items', {
      method: 'POST',
      body: JSON.stringify({
        p_customer_id: input.customerId, p_currency: 'EGP', p_subtotal: input.subtotal,
        p_discount: input.discount, p_tax: input.tax, p_total: input.total, p_items: input.items
      })
    });
    return Array.isArray(result) ? result[0] : result;
  }

  async listProducts(search = '', includeInactive = false): Promise<unknown[]> {
    const query = new URLSearchParams({
      select: includeInactive
        ? `id,sku,name,category,description,base_unit,vertical_key,attributes,active,requires_design,requires_size,demo_only,${PRODUCT_OPTIONS_SELECT},product_variants(id,sku,name,width_cm,height_cm,material,finishing,available_quantity,attributes,active,price_rules(id,quantity_min,quantity_max,material,finishing,unit_price,fixed_fee,setup_fee,design_fee,installation_fee,delivery_fee,tax_rate,active_from,active_to))`
        : PUBLIC_PRODUCT_SELECT,
      order: 'name.asc', limit: '500'
    });
    if (!includeInactive) {
      query.set('active', 'eq.true');
      query.set('product_variants.active', 'eq.true');
      query.set('product_variants.price_rules.active_from', `lte.${shopDate()}`);
      query.set('product_option_groups.active', 'eq.true');
      query.set('product_option_groups.product_option_values.active', 'eq.true');
    }
    let rows = await this.rest<Array<Record<string, unknown>>>(`products?${query}`);
    rows = normalizeProductOptionGroups(rows);
    if (!includeInactive) {
      // A public catalog must not advertise variants that fail the deterministic
      // quote engine with PRICE_RULE_NOT_FOUND. Strip even rule metadata from the
      // customer response; internal prices remain server-side.
      rows = filterPublicProducts(rows, shopDate());
    }
    const term = search.trim().toLocaleLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.name, row.sku, row.category, row.description].some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(term)));
  }

  async listVerticals(): Promise<CommerceVertical[]> {
    const query = new URLSearchParams({
      select: 'vertical_key,label_en,label_ar,capabilities,active', active: 'eq.true', order: 'label_en.asc', limit: '100'
    });
    return await this.rest<CommerceVertical[]>(`commerce_verticals?${query}`);
  }

  async getProduct(id: string): Promise<Record<string, unknown> | null> {
    const query = new URLSearchParams({
      select: PUBLIC_PRODUCT_SELECT,
      id: `eq.${id}`, active: 'eq.true', limit: '1'
    });
    query.set('product_variants.active', 'eq.true');
    query.set('product_variants.price_rules.active_from', `lte.${shopDate()}`);
    query.set('product_option_groups.active', 'eq.true');
    query.set('product_option_groups.product_option_values.active', 'eq.true');
    const rows = await this.rest<Array<Record<string, unknown>>>(`products?${query}`);
    return filterPublicProducts(normalizeProductOptionGroups(rows), shopDate())[0] ?? null;
  }

  async getStorefrontConfig(): Promise<{ id: string; version: number; config: StorefrontConfig } | null> {
    const query = new URLSearchParams({ select: 'id,version,config', status: 'eq.published', order: 'version.desc', limit: '1' });
    const rows = await this.rest<Array<{ id: string; version: number; config: StorefrontConfig }>>(`storefront_config_revisions?${query}`);
    return rows[0] ?? null;
  }

  async listStorefrontRevisions(): Promise<unknown[]> {
    const query = new URLSearchParams({ select: 'id,version,config,status,created_by,created_at,published_at', order: 'version.desc', limit: '30' });
    return await this.rest<unknown[]>(`storefront_config_revisions?${query}`);
  }

  async createStorefrontConfigDraft(actorId: string, config: StorefrontConfig): Promise<{ id: string; version: number; status: string }> {
    return await this.rpc('create_storefront_config_draft', { p_actor_id: actorId, p_config: config });
  }

  async publishStorefrontConfig(actorId: string, revisionId: string): Promise<{ id: string; version: number; status: string }> {
    return await this.rpc('publish_storefront_config', { p_actor_id: actorId, p_revision_id: revisionId });
  }

  async createProduct(input: Record<string, unknown>): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>('products', {
      method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(input)
    });
    if (!rows[0]?.id) throw new AppError('DATABASE_ERROR', 502, 'The product could not be saved.');
    return rows[0].id;
  }

  async updateProduct(id: string, input: Record<string, unknown>): Promise<void> {
    const rows = await this.rest<Array<{ id: string }>>(`products?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(input)
    });
    if (!rows.length) throw new AppError('NOT_FOUND', 404, 'Product not found.');
  }

  async promoteDemoProduct(actorId: string, id: string): Promise<void> {
    await this.rpc('promote_demo_product', { p_actor_id: actorId, p_product_id: id });
  }

  async createProductVariant(productId: string, input: Record<string, unknown>): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>('product_variants', {
      method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ ...input, product_id: productId })
    });
    if (!rows[0]?.id) throw new AppError('DATABASE_ERROR', 502, 'The product variant could not be saved.');
    return rows[0].id;
  }

  async updateProductVariant(id: string, input: Record<string, unknown>): Promise<void> {
    const rows = await this.rest<Array<{ id: string }>>(`product_variants?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(input)
    });
    if (!rows.length) throw new AppError('NOT_FOUND', 404, 'Product variant not found.');
  }

  async createPriceRule(actorId: string, input: Record<string, unknown>, reason: string): Promise<string> {
    return await this.rpc<string>('create_approved_price_rule', { p_actor_id: actorId, p_rule: input, p_reason: reason });
  }

  async endPriceRule(actorId: string, id: string, activeTo: string, reason: string): Promise<void> {
    await this.rpc('end_approved_price_rule', { p_actor_id: actorId, p_rule_id: id, p_active_to: activeTo, p_reason: reason });
  }

  async getQuote(id: string): Promise<Record<string, unknown> | null> {
    const query = new URLSearchParams({
      select: 'id,customer_id,status,currency,subtotal,discount,tax,total,valid_until,created_at,customers(name,company_name),quote_items(id,product_variant_id,quantity,unit_price,options,design_required,notes,product_variants(sku,name,products(name,category)))',
      id: `eq.${id}`, limit: '1'
    });
    const rows = await this.rest<Array<Record<string, unknown>>>(`quotes?${query}`);
    return rows[0] ?? null;
  }

  async listQuotes(customerId?: string): Promise<unknown[]> {
    const query = new URLSearchParams({
      select: 'id,customer_id,status,currency,subtotal,discount,tax,total,valid_until,created_at,customers(name,company_name),quote_items(id,product_variant_id,quantity,unit_price,options,design_required,notes,product_variants(sku,name,products(name,category)))',
      order: 'created_at.desc', limit: '200'
    });
    if (customerId) query.set('customer_id', `eq.${customerId}`);
    return await this.rest<unknown[]>(`quotes?${query}`);
  }

  async listCustomers(): Promise<unknown[]> {
    const query = new URLSearchParams({ select: 'id,name,company_name,email,phone,created_at', order: 'name.asc', limit: '500' });
    return await this.rest<unknown[]>(`customers?${query}`);
  }

  async createCustomer(input: { name: string; companyName: string | null; email: string | null; phone: string | null }): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>('customers', {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ name: input.name, company_name: input.companyName, email: input.email, phone: input.phone })
    });
    if (!rows[0]?.id) throw new AppError('DATABASE_ERROR', 502, 'Supabase did not return the created customer.');
    return rows[0].id;
  }

  async getSalesReport(from: string, to: string): Promise<Record<string, unknown>> {
    return await this.rpc<Record<string, unknown>>('get_sales_report', { p_from: from, p_to: to });
  }

  async getBusinessAnalytics(from: string, to: string): Promise<Record<string, unknown>> {
    return await this.rpc<Record<string, unknown>>('get_business_analytics', { p_from: from, p_to: to });
  }

  async recordAiRun(input: { feature: string; model: string | null; inputTokens: number; outputTokens: number; estimatedCostUsd?: number | null; latencyMs: number; success: boolean }): Promise<void> {
    await this.rest('ai_runs', {
      method: 'POST', headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ feature: input.feature, model: input.model, input_tokens: input.inputTokens, output_tokens: input.outputTokens, estimated_cost: input.estimatedCostUsd ?? null, latency_ms: input.latencyMs, success: input.success })
    });
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return await this.rest<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  }

  async updateQuoteStatus(id: string, status: QuoteStatus): Promise<void> {
    await this.rpc('transition_quote_status', { p_quote_id: id, p_new_status: status });
  }

  async createOrderFromQuote(quoteId: string, deliveryMethod: 'delivery' | 'pickup', deliveryAddress: string, deliveryPhone: string | null): Promise<string> {
    return await this.rpc<string>('create_order_from_accepted_quote', { p_quote_id: quoteId, p_delivery_method: deliveryMethod, p_delivery_address: deliveryAddress, p_delivery_phone: deliveryPhone });
  }

  async getOrder(id: string): Promise<Record<string, unknown> | null> {
    const query = new URLSearchParams({
      select: 'id,customer_id,quote_id,status,payment_status,production_status,delivery_method,delivery_address,delivery_phone,due_at,subtotal,discount,tax,total,created_at,customers(name,email),order_items(id,product_variant_id,quantity,unit_price,options,notes,design_request_id,product_variants(sku,name)),production_jobs(id,status,priority,scheduled_at,started_at,completed_at,machine_id)',
      id: `eq.${id}`, limit: '1'
    });
    const rows = await this.rest<Array<Record<string, unknown>>>(`orders?${query}`);
    return rows[0] ?? null;
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
    await this.rpc('transition_order_status', { p_order_id: id, p_new_status: status });
  }

  async listOrders(customerId?: string): Promise<unknown[]> {
    const query = new URLSearchParams({
      select: 'id,customer_id,quote_id,status,payment_status,production_status,delivery_method,delivery_address,delivery_phone,due_at,subtotal,total,created_at,order_items(id,product_variant_id,quantity,unit_price,options,product_variants(sku,name)),production_jobs(id,status,priority,scheduled_at,started_at,completed_at),design_requests(id,status,design_fee,brief)',
      order: 'created_at.desc', limit: '200'
    });
    if (customerId) query.set('customer_id', `eq.${customerId}`);
    return await this.rest<unknown[]>(`orders?${query}`);
  }

  async listInventory(): Promise<Array<Record<string, unknown>>> {
    const query = new URLSearchParams({
      select: 'id,sku,name,category,unit,current_stock,reserved_stock,reorder_point,reorder_quantity,cost_per_unit,supplier_id,updated_at',
      active: 'eq.true', order: 'name.asc', limit: '500'
    });
    return await this.rest<Array<Record<string, unknown>>>(`materials?${query}`);
  }

  async runInventoryCommand(command: InventoryCommand): Promise<void> {
    if (command.action === 'receive') {
      await this.rpc('receive_inventory', { p_material_id: command.materialId, p_quantity: command.quantity, p_unit_cost: command.unitCost ?? null, p_reference_type: 'manual_receipt', p_reference_id: null });
    } else if (command.action === 'adjust') {
      await this.rpc('adjust_inventory', { p_material_id: command.materialId, p_delta: command.delta, p_reference_id: null });
    } else {
      const rpcName = command.action === 'reserve' ? 'reserve_inventory' : command.action === 'release' ? 'release_inventory' : 'consume_reserved_inventory';
      await this.rpc(rpcName, { p_material_id: command.materialId, p_quantity: command.quantity, p_order_id: command.orderId });
    }
  }

  async listProduction(): Promise<unknown[]> {
    const query = new URLSearchParams({
      select: 'id,order_id,machine_id,status,priority,scheduled_at,started_at,completed_at,waste_quantity,operator_id,notes,orders(id,status,due_at,customer_id),machines(id,name,machine_type)',
      order: 'priority.desc,scheduled_at.asc.nullsfirst', limit: '500'
    });
    return await this.rest<unknown[]>(`production_jobs?${query}`);
  }

  async updateProductionStatus(id: string, status: ProductionStatus): Promise<void> {
    await this.rpc('transition_production_job', { p_job_id: id, p_new_status: status });
  }

  async listDesignRequests(customerId?: string): Promise<unknown[]> {
    const query = new URLSearchParams({
      select: 'id,customer_id,order_id,brief,reference_files,design_fee,status,assigned_to,ai_draft_url,final_design_url,customer_notes,approved_at,created_at,updated_at',
      order: 'created_at.desc', limit: '200'
    });
    if (customerId) query.set('customer_id', `eq.${customerId}`);
    return await this.rest<unknown[]>(`design_requests?${query}`);
  }

  async getDesignRequest(id: string): Promise<Record<string, unknown> | null> {
    const query = new URLSearchParams({
      select: 'id,customer_id,order_id,status,created_at', id: `eq.${id}`, limit: '1'
    });
    const rows = await this.rest<Array<Record<string, unknown>>>(`design_requests?${query}`);
    return rows[0] ?? null;
  }

  async updateDesignRequestStatus(id: string, status: DesignRequestStatus): Promise<void> {
    await this.rpc('transition_design_request_status', { p_request_id: id, p_new_status: status });
  }

  async updateDesignRequestFile(id: string, path: string): Promise<void> {
    const query = new URLSearchParams({ id: `eq.${id}`, status: 'in.(designing,rejected)' });
    const rows = await this.rest<Array<{ id: string }>>(`design_requests?${query}`, {
      method: 'PATCH', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ final_design_url: path })
    });
    if (!rows.length) throw new AppError('INVALID_TRANSITION', 409, 'The design request is no longer in a state that accepts a final design.');
  }

  async createDesignRequest(input: { customerId: string; orderId: string | null; brief: string; referenceFiles: string[]; customerNotes: string | null; designFee: number }): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>('design_requests', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        customer_id: input.customerId, order_id: input.orderId, brief: input.brief,
        reference_files: input.referenceFiles, customer_notes: input.customerNotes, design_fee: input.designFee
      })
    });
    if (!rows[0]?.id) throw new AppError('DATABASE_ERROR', 502, 'Supabase did not return the created design request.');
    return rows[0].id;
  }

  async orderBelongsToCustomer(orderId: string, customerId: string): Promise<boolean> {
    const query = new URLSearchParams({ select: 'id', id: `eq.${orderId}`, customer_id: `eq.${customerId}`, limit: '1' });
    const rows = await this.rest<Array<{ id: string }>>(`orders?${query}`);
    return rows.length === 1;
  }

  async createMaterial(input: { sku: string; name: string; category: string; unit: string; reorderPoint: number; reorderQuantity: number }): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>('materials', {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ sku: input.sku, name: input.name, category: input.category, unit: input.unit, reorder_point: input.reorderPoint, reorder_quantity: input.reorderQuantity })
    });
    if (!rows[0]?.id) throw new AppError('DATABASE_ERROR', 502, 'Supabase did not return the created material.');
    return rows[0].id;
  }

  async createMaterialRequirement(input: { productId: string; variantId: string; materialId: string; quantityPerUnit: number; wasteFactor: number }): Promise<string> {
    const variantQuery = new URLSearchParams({ select: 'id', id: `eq.${input.variantId}`, product_id: `eq.${input.productId}`, active: 'eq.true', limit: '1' });
    const variants = await this.rest<Array<{ id: string }>>(`product_variants?${variantQuery}`);
    if (!variants.length) throw new AppError('INVALID_VARIANT', 422, 'The active product variant was not found for this product.');
    const rows = await this.rest<Array<{ id: string }>>('product_material_requirements', {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ product_variant_id: input.variantId, material_id: input.materialId, quantity_per_unit: input.quantityPerUnit, waste_factor: input.wasteFactor })
    });
    if (!rows[0]?.id) throw new AppError('DATABASE_ERROR', 502, 'Supabase did not return the created material requirement.');
    return rows[0].id;
  }

  async listMarketingAssets(): Promise<unknown[]> {
    const query = new URLSearchParams({
      select: 'id,order_id,product_id,campaign_brief,campaign_type,created_by,design_url,caption,platform,status,created_at,products(name)',
      order: 'created_at.desc', limit: '200'
    });
    return await this.rest<unknown[]>(`marketing_assets?${query}`);
  }

  async recordAuditLog(input: { userId: string; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown> }): Promise<void> {
    await this.rest('audit_logs', {
      method: 'POST', headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: input.userId, action: input.action, entity_type: input.entityType, entity_id: input.entityId, metadata: input.metadata })
    });
  }

  async createHermesActionProposal(input: { id: string; managerId: string; action: string; arguments: Record<string, unknown> }): Promise<string> {
    return await this.rpc<string>('create_hermes_action_proposal', {
      p_id: input.id, p_manager_id: input.managerId, p_action_name: input.action, p_arguments: input.arguments
    });
  }

  async approveHermesActionProposal(id: string, managerId: string): Promise<boolean> {
    return await this.rpc<boolean>('approve_hermes_action_proposal', { p_id: id, p_manager_id: managerId });
  }

  async claimHermesActionProposal(input: { id: string; managerId: string; action: string; arguments: Record<string, unknown> }): Promise<boolean> {
    return await this.rpc<boolean>('claim_hermes_action_proposal', {
      p_id: input.id, p_manager_id: input.managerId, p_action_name: input.action, p_arguments: input.arguments
    });
  }

  async finishHermesActionProposal(input: { id: string; status: 'completed' | 'failed'; result: Record<string, unknown> | null; errorCode?: string }): Promise<void> {
    await this.rpc('finish_hermes_action_proposal', {
      p_id: input.id, p_status: input.status, p_result: input.result, p_error_code: input.errorCode ?? null
    });
  }

  async uploadMarketingImage(input: { id: string; mimeType: string; data: Buffer }): Promise<string> {
    const extension = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType === 'image/webp' ? 'webp' : 'png';
    const path = `${input.id}.${extension}`;
    let response: Response;
    try {
      const headers: Record<string, string> = { apikey: this.secretKey, 'content-type': input.mimeType, 'x-upsert': 'false' };
      if (this.secretKey.startsWith('eyJ')) headers.authorization = `Bearer ${this.secretKey}`;
      response = await fetch(`${this.url}/storage/v1/object/marketing-assets/${path}`, { method: 'POST', headers, body: Uint8Array.from(input.data), signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new AppError('STORAGE_UNAVAILABLE', 503, 'Marketing image storage is temporarily unavailable.');
    }
    if (!response.ok) throw new AppError('STORAGE_UPLOAD_FAILED', 502, 'The generated marketing image could not be stored. Run the marketing storage migration and retry.');
    return path;
  }

  async createSignedMarketingImageUrl(path: string, expiresInSeconds = 604800): Promise<string> {
    let response: Response;
    try {
      const headers: Record<string, string> = { apikey: this.secretKey, 'content-type': 'application/json' };
      if (this.secretKey.startsWith('eyJ')) headers.authorization = `Bearer ${this.secretKey}`;
      response = await fetch(`${this.url}/storage/v1/object/sign/marketing-assets/${encodeURIComponent(path)}`, {
        method: 'POST', headers, body: JSON.stringify({ expiresIn: expiresInSeconds }), signal: AbortSignal.timeout(15_000)
      });
    } catch {
      throw new AppError('STORAGE_UNAVAILABLE', 503, 'Marketing image storage is temporarily unavailable.');
    }
    if (!response.ok) throw new AppError('STORAGE_SIGNING_FAILED', 502, 'Supabase could not create a temporary marketing image link.');
    const result = await response.json() as { signedURL?: string; signedUrl?: string };
    const signed = result.signedURL ?? result.signedUrl;
    if (!signed) throw new AppError('STORAGE_SIGNING_FAILED', 502, 'Supabase did not return a signed marketing image link.');
    if (/^https:\/\//i.test(signed)) return signed;
    const pathPart = signed.startsWith('/storage/v1/') ? signed : `/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
    return `${this.url.replace(/\/$/, '')}${pathPart}`;
  }

  async createMarketingAsset(input: { orderId: null; productId: string | null; campaignBrief: string; campaignType: string; createdBy: string | null; designUrl: string | null; platform: string; caption: string }): Promise<string> {
    const rows = await this.rest<Array<{ id: string }>>('marketing_assets', {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ order_id: null, product_id: input.productId, campaign_brief: input.campaignBrief, campaign_type: input.campaignType, created_by: input.createdBy, design_url: input.designUrl, platform: input.platform, caption: input.caption, status: 'pending_approval' })
    });
    if (!rows[0]?.id) throw new AppError('DATABASE_ERROR', 502, 'Supabase did not return the created marketing asset.');
    return rows[0].id;
  }

  async updateMarketingAssetStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    await this.rpc('set_marketing_asset_status', { p_asset_id: id, p_new_status: status });
  }
}
