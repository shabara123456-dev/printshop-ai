import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { calculateQuote, type PriceRule, type PricingRepository, type ProductOptionGroup, type Variant } from '../src/pricing.ts';
import { AppError } from '../src/errors.ts';
import { createApiServer, type AuthGateway } from '../src/api.ts';

const variant: Variant = { id: 'variant-1', sku: 'STICKER-10X8', name: 'Sticker 10x8', material: 'Waterproof Vinyl' };
const rule: PriceRule = {
  id: 'rule-1', product_variant_id: variant.id, quantity_min: 1, quantity_max: null,
  material: null, finishing: null, unit_price: '1.50', fixed_fee: '10.00', setup_fee: '20.00',
  design_fee: '50.00', installation_fee: '15.00', delivery_fee: '30.00', tax_rate: '0.14000',
  active_from: '2026-01-01', active_to: null
};

function repository(rules: PriceRule[] = [rule]): PricingRepository {
  return {
    async getVariantBySku(sku) { return sku === variant.sku ? variant : null; },
    async getPriceRules() { return rules; }
  };
}

test('calculates base, fixed/setup, selected service fees, and tax in cents', async () => {
  const quote = await calculateQuote([{
    variant_sku: variant.sku, quantity: 1000, design_required: true,
    delivery_required: true, installation_required: false
  }], repository(), new Date('2026-10-02T00:00:00Z'));

  assert.deepEqual({ subtotal: quote.subtotal, discount: quote.discount, tax: quote.tax, total: quote.total }, {
    subtotal: '1610.00', discount: '0.00', tax: '225.40', total: '1835.40'
  });
  assert.equal(quote.breakdown[0].breakdown.installation_fee, '0.00');
  assert.equal(quote.breakdown[0].breakdown.design_fee, '50.00');
  assert.equal(quote.breakdown[0].options.design_fee, '50.00');
});

test('generic product options require valid configured values and add server-priced per-unit and one-time surcharges', async () => {
  const optionVariant: Variant = { ...variant, product_id: 'product-1' };
  const options: ProductOptionGroup[] = [
    { key: 'finish', label_en: 'Finish', label_ar: 'التشطيب', required: true, values: [
      { key: 'matte', label_en: 'Matte', label_ar: 'مطفي', adjustment_type: 'per_unit', price_adjustment: '0.00' },
      { key: 'gloss', label_en: 'Gloss', label_ar: 'لامع', adjustment_type: 'per_unit', price_adjustment: '2.00' }
    ] },
    { key: 'packaging', label_en: 'Packaging', label_ar: 'التغليف', required: false, values: [
      { key: 'gift_box', label_en: 'Gift box', label_ar: 'علبة هدايا', adjustment_type: 'one_time', price_adjustment: '5.00' }
    ] }
  ];
  const optionRepository: PricingRepository = {
    async getVariantBySku(sku) { return sku === optionVariant.sku ? optionVariant : null; },
    async getPriceRules() { return [{ ...rule, unit_price: '100.00', fixed_fee: '0', setup_fee: '0', design_fee: '0', installation_fee: '0', delivery_fee: '0', tax_rate: '0.10000' }]; },
    async getProductOptionGroups(productId) { assert.equal(productId, optionVariant.product_id); return options; }
  };
  const quote = await calculateQuote([{ variant_sku: optionVariant.sku, quantity: 3, custom_options: { finish: 'gloss', packaging: 'gift_box' } }], optionRepository, new Date('2026-10-02T00:00:00Z'));
  assert.equal(quote.subtotal, '311.00');
  assert.equal(quote.tax, '31.10');
  assert.equal(quote.total, '342.10');
  assert.equal(quote.breakdown[0].breakdown.option_surcharge, '11.00');
  assert.deepEqual((quote.breakdown[0].options.custom_options as Record<string, { value: string }>), { finish: { value: 'gloss', label_en: 'Gloss', label_ar: 'لامع', adjustment_type: 'per_unit', price_adjustment: '2.00' }, packaging: { value: 'gift_box', label_en: 'Gift box', label_ar: 'علبة هدايا', adjustment_type: 'one_time', price_adjustment: '5.00' } });
  await assert.rejects(calculateQuote([{ variant_sku: optionVariant.sku, quantity: 1 }], optionRepository), (error: unknown) => error instanceof AppError && error.code === 'OPTION_REQUIRED');
  await assert.rejects(calculateQuote([{ variant_sku: optionVariant.sku, quantity: 1, custom_options: { finish: 'customer_invented', packaging: 'gift_box' } }], optionRepository), (error: unknown) => error instanceof AppError && error.code === 'INVALID_OPTION');
});

test('selects the most specific active material and finishing rule', async () => {
  const specific: PriceRule = {
    ...rule, id: 'rule-specific', material: 'waterproof vinyl', finishing: 'gloss', unit_price: '2.25'
  };
  const quote = await calculateQuote([{
    variant_sku: variant.sku, quantity: 50, material: 'Waterproof Vinyl', finishing: 'gloss'
  }], repository([rule, specific]), new Date('2026-10-02T00:00:00Z'));
  assert.equal(quote.breakdown[0].unit_price, '2.25');
  assert.equal(quote.subtotal, '142.50');
});

test('rejects missing pricing instead of using market references', async () => {
  await assert.rejects(
    calculateQuote([{ variant_sku: variant.sku, quantity: 20 }], repository([]), new Date('2026-10-02T00:00:00Z')),
    (error: unknown) => error instanceof AppError && error.code === 'PRICE_RULE_NOT_FOUND' && error.status === 422
  );
});

test('rejects manager demo catalog prices before consulting quote rules', async () => {
  const sample = { ...variant, demo_only: true };
  const sampleRepository: PricingRepository = {
    async getVariantBySku(sku) { return sku === sample.sku ? sample : null; },
    async getPriceRules() { return [rule]; }
  };
  await assert.rejects(
    calculateQuote([{ variant_sku: sample.sku, quantity: 10 }], sampleRepository),
    (error: unknown) => error instanceof AppError && error.code === 'DEMO_ONLY_PRODUCT' && error.status === 409
  );
});

test('rejects quotes for variants whose configured production availability is zero', async () => {
  const unavailable = { ...variant, available_quantity: 0 };
  const noCapacity: PricingRepository = {
    async getVariantBySku(sku) { return sku === unavailable.sku ? unavailable : null; },
    async getPriceRules() { return [rule]; }
  };
  await assert.rejects(
    calculateQuote([{ variant_sku: variant.sku, quantity: 1 }], noCapacity, new Date('2026-10-02T00:00:00Z')),
    (error: unknown) => error instanceof AppError && error.code === 'PRODUCTION_CAPACITY_INSUFFICIENT' && error.status === 409
  );
});

test('returns the provenance for a user-approved market midpoint rule', async () => {
  const midpointRule: PriceRule = {
    ...rule, pricing_basis: 'user_approved_market_midpoint', market_reference_id: 'market-ref-1',
    quantity_min: 1000, quantity_max: 1000, unit_price: '2.10', fixed_fee: '0', setup_fee: '0', tax_rate: '0'
  };
  const quote = await calculateQuote([{
    variant_sku: variant.sku, quantity: 1000, material: 'Waterproof Vinyl'
  }], repository([midpointRule]), new Date('2026-10-02T00:00:00Z'));
  assert.equal(quote.total, '2100.00');
  assert.equal(quote.breakdown[0].pricing_basis, 'user_approved_market_midpoint');
  assert.equal(quote.breakdown[0].market_reference_id, 'market-ref-1');

  const withDesign = await calculateQuote([{
    variant_sku: variant.sku, quantity: 1000, material: 'Waterproof Vinyl', design_required: true
  }], repository([midpointRule]), new Date('2026-10-02T00:00:00Z'));
  assert.equal(withDesign.total, '2150.00');
  assert.equal(withDesign.breakdown[0].breakdown.design_fee, '50.00');
});

test('rejects ambiguous matches and invalid quantity', async () => {
  await assert.rejects(
    calculateQuote([{ variant_sku: variant.sku, quantity: 20 }], repository([rule, { ...rule, id: 'rule-duplicate' }]), new Date('2026-10-02T00:00:00Z')),
    (error: unknown) => error instanceof AppError && error.code === 'PRICE_RULE_AMBIGUOUS'
  );
  await assert.rejects(
    calculateQuote([{ variant_sku: variant.sku, quantity: 0 }], repository()),
    (error: unknown) => error instanceof AppError && error.code === 'INVALID_REQUEST'
  );
});

test('quote API authenticates and persists only backend-calculated amounts', async (context) => {
  let saved: Record<string, unknown> | undefined;
  const gateway = {
    async authenticate(token: string) { if (token !== 'valid-token') throw new AppError('UNAUTHORIZED', 401, 'Unauthorized'); return { id: 'user-1' }; },
    async getRole() { return 'customer' as const; },
    async getCustomerId() { return 'customer-1'; },
    async customerExists() { return true; },
    async saveQuote(input: Record<string, unknown>) { saved = input; return 'quote-1'; },
    async listProducts() { return []; },
    async getProduct() { return null; },
    async getQuote() { return null; },
    async listQuotes() { return []; },
    async listCustomers() { return []; },
    async createCustomer() { return 'customer-new'; },
    async getSalesReport() { return { currency: 'EGP' }; },
    async recordAiRun() {},
    async updateQuoteStatus() {},
    async createOrderFromQuote() { return 'order-1'; },
    async getOrder() { return null; },
    async listOrders() { return []; },
    async listInventory() { return []; },
    async runInventoryCommand() {},
    async listProduction() { return []; },
    async updateProductionStatus() {},
    async listDesignRequests() { return []; },
    async createDesignRequest() { return 'design-1'; },
    async orderBelongsToCustomer() { return true; },
    async createMaterial() { return 'material-1'; },
    async createMaterialRequirement() { return 'requirement-1'; }
  };
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const url = `http://127.0.0.1:${address.port}/api/quotes`;
  const calculated = await fetch(`${url}/calculate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ variant_sku: variant.sku, quantity: 2 }] })
  });
  assert.equal(calculated.status, 200);
  assert.equal((await calculated.json() as { total: string }).total, '37.62');
  const response = await fetch(url, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ customer_id: 'someone-else', items: [{ variant_sku: variant.sku, quantity: 2 }] })
  });
  const body = await response.json() as { quote_id: string; total: string };
  assert.equal(response.status, 201);
  assert.equal(body.quote_id, 'quote-1');
  assert.equal(body.total, '37.62');
  assert.equal(saved?.customerId, 'customer-1');
  assert.equal(saved?.total, '37.62');
});

test('manager AI chat is proxied to Hermes with server instructions', async (context) => {
  let received: Array<{ role: string; content: string }> = [];
  const recordedRuns: Array<Record<string, unknown>> = [];
  const gateway = {
    async authenticate(token: string) { if (token !== 'manager-token') throw new AppError('UNAUTHORIZED', 401, 'Unauthorized'); return { id: 'manager-1' }; },
    async getRole() { return 'manager' as const; },
    async recordAiRun(input: Record<string, unknown>) { recordedRuns.push(input); }
  } as unknown as AuthGateway;
  const server = createApiServer({
    gateway, pricing: repository(),
    hermes: { async complete(messages) { received = messages; return { content: 'There are no low-stock materials configured.', model: 'hermes-agent', usage: { prompt_tokens: 18, completion_tokens: 9 } }; } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/chat`, {
    method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Explain the quote workflow in simple terms.' }] })
  });
  assert.equal(response.status, 200);
  const result = await response.json() as { reply: string; model: string; usage: unknown; latency_ms: number };
  assert.deepEqual({ reply: result.reply, model: result.model, usage: result.usage }, {
    reply: 'There are no low-stock materials configured.', model: 'hermes-agent',
    usage: { prompt_tokens: 18, completion_tokens: 9 }
  });
  assert.ok(result.latency_ms >= 0);
  assert.equal(received[0].role, 'system');
  assert.match(received[0].content, /never invent business facts or prices/);
  assert.deepEqual(received.at(-1), { role: 'user', content: 'Explain the quote workflow in simple terms.' });
  assert.equal(recordedRuns.length, 1);
  assert.equal(recordedRuns[0].feature, 'manager_chat');
  assert.equal(recordedRuns[0].inputTokens, 18);
});

test('routine low-stock chat queries use database data without calling Hermes or consuming AI budget', async (context) => {
  let modelCalls = 0;
  let inventoryCalls = 0;
  const gateway = {
    async authenticate() { return { id: 'manager-routine-user' }; },
    async getRole() { return 'manager' as const; },
    async listInventory() { inventoryCalls++; return [{ id: 'material-1', name: 'Waterproof vinyl', unit: 'meter', current_stock: 8, reserved_stock: 2, reorder_point: 10, reorder_quantity: 25 }]; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository(), hermes: { async complete() { modelCalls++; return { content: 'Should not run', model: 'test' }; } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/ai/chat', {
    method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'What should we buy?' }] })
  });
  const result = await response.json() as { reply: string; model: string; usage: unknown };
  assert.equal(response.status, 200);
  assert.equal(result.model, 'backend-deterministic');
  assert.match(result.reply, /Waterproof vinyl: 6 meter available; reorder point 10; configured suggestion 25/);
  assert.equal(result.usage, null);
  assert.equal(inventoryCalls, 1);
  assert.equal(modelCalls, 0);
});

test('manager AI chat is capped per user to protect provider spend', async (context) => {
  let calls = 0;
  const gateway = {
    async authenticate() { return { id: 'manager-budget-user' }; },
    async getRole() { return 'manager' as const; },
    async recordAiRun() {}
  } as unknown as AuthGateway;
  const server = createApiServer({
    gateway, pricing: repository(),
    hermes: { async complete() { calls++; return { content: 'Live answer.', model: 'test-model' }; } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const endpoint = `http://127.0.0.1:${address.port}/api/ai/chat`;
  let last: Response | undefined;
  for (let index = 0; index < 13; index++) {
    last = await fetch(endpoint, {
      method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Summarize current order status.' }] })
    });
  }
  assert.equal(calls, 12);
  assert.equal(last?.status, 429);
  assert.equal((await last?.json() as { error: { code: string } }).error.code, 'AI_RATE_LIMITED');
});

test('API responses carry a request ID and errors include it for support', async (context) => {
  const gateway = {
    async authenticate() { throw new AppError('UNAUTHORIZED', 401, 'A valid Supabase access token is required.'); }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/me`, { headers: { authorization: 'Bearer invalid-token' } });
  const requestId = response.headers.get('x-request-id');
  const body = await response.json() as { error: { request_id: string; code: string } };
  assert.equal(response.status, 401);
  assert.match(requestId ?? '', /^[0-9a-f-]{36}$/i);
  assert.equal(body.error.request_id, requestId);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('business analytics requires manager access and passes a bounded date range to the database', async (context) => {
  let received: [string, string] | undefined;
  const gateway = {
    async authenticate(token: string) { return { id: token }; },
    async getRole(userId: string) { return userId === 'manager-token' ? 'manager' as const : 'customer' as const; },
    async getBusinessAnalytics(from: string, to: string) { received = [from, to]; return { current: { order_count: 2 }, previous: { order_count: 1 }, daily: [], top_products: [], categories: [] }; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const endpoint = `http://127.0.0.1:${address.port}/api/analytics/business?from=2026-09-01T00%3A00%3A00.000Z&to=2026-10-01T00%3A00%3A00.000Z`;
  const denied = await fetch(endpoint, { headers: { authorization: 'Bearer customer-token' } });
  assert.equal(denied.status, 403);
  assert.equal(received, undefined);
  const response = await fetch(endpoint, { headers: { authorization: 'Bearer manager-token' } });
  assert.equal(response.status, 200);
  assert.deepEqual(received, ['2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z']);
  assert.equal((await response.json() as { current: { order_count: number } }).current.order_count, 2);
});

test('product creation is manager-only and preserves price-rule separation', async (context) => {
  let savedProduct: Record<string, unknown> | undefined;
  let createCalls = 0;
  const gateway = {
    async authenticate(token: string) { return { id: token }; },
    async getRole(userId: string) { return userId === 'manager-token' ? 'manager' as const : 'customer' as const; },
    async listVerticals() { return [{ vertical_key: 'printing', active: true }, { vertical_key: 'electronics', active: true }]; },
    async createProduct(input: Record<string, unknown>) { createCalls++; savedProduct = input; return 'product-id'; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const endpoint = `http://127.0.0.1:${address.port}/api/manager/products`;
  const product = { sku: 'REAL-SHOP-FLYER', name: 'Flyer', category: 'flyers', base_unit: 'piece', description: 'Shop product', vertical_key: 'electronics', attributes: '{"warranty_months":12,"specifications":{"storage_gb":256}}' };
  const denied = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer customer-token', 'content-type': 'application/json' }, body: JSON.stringify(product) });
  assert.equal(denied.status, 403);
  assert.equal(createCalls, 0);
  const created = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify(product) });
  assert.equal(created.status, 201);
  assert.equal(createCalls, 1);
  assert.equal(savedProduct?.sku, 'REAL-SHOP-FLYER');
  assert.equal(savedProduct?.active, true);
  assert.equal(savedProduct?.vertical_key, 'electronics');
  assert.deepEqual(savedProduct?.attributes, { warranty_months: 12, specifications: { storage_gb: 256 } });
  assert.equal(savedProduct?.unit_price, undefined);
  const invalidVertical = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ ...product, sku: 'BAD-VERTICAL', vertical_key: 'unknown' }) });
  assert.equal(invalidVertical.status, 422);
  const invalidAttributes = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ ...product, sku: 'BAD-ATTRIBUTES', attributes: '{not json' }) });
  assert.equal(invalidAttributes.status, 400);
  assert.equal(createCalls, 1);
});

test('active store verticals are publicly readable from the database registry', async (context) => {
  const gateway = {
    async listVerticals() { return [{ vertical_key: 'printing', label_en: 'Printing', label_ar: 'الطباعة', active: true, capabilities: { requires_production: true } }]; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/verticals`);
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { verticals: Array<{ vertical_key: string }> }).verticals[0].vertical_key, 'printing');
});

test('Hermes can read the active vertical registry only through its server key', async (context) => {
  const gateway = {
    async listVerticals() { return [{ vertical_key: 'printing', active: true }, { vertical_key: 'clothing', active: true }]; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository(), hermesToolKey: 'private-tool-key' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const endpoint = `http://127.0.0.1:${address.port}/api/hermes/tools`;
  const body = JSON.stringify({ name: 'list_store_verticals', arguments: {} });
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 401);
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'private-tool-key' }, body });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { verticals: Array<{ vertical_key: string }> }).verticals.map((vertical) => vertical.vertical_key), ['printing', 'clothing']);
});

test('manager product catalog includes inactive records and rejects customer access', async (context) => {
  let includeInactive: boolean | undefined;
  const gateway = {
    async authenticate(token: string) { return { id: token }; },
    async getRole(userId: string) { return userId === 'manager-token' ? 'manager' as const : 'customer' as const; },
    async listProducts(_search: string, include: boolean) { includeInactive = include; return [{ id: 'product', active: false }]; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const endpoint = 'http://127.0.0.1:' + address.port + '/api/manager/products';
  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal((await fetch(endpoint, { headers: { authorization: 'Bearer customer-token' } })).status, 403);
  const response = await fetch(endpoint, { headers: { authorization: 'Bearer manager-token' } });
  assert.equal(response.status, 200);
  assert.equal(includeInactive, true);
  assert.equal((await response.json() as { products: Array<{ active: boolean }> }).products[0].active, false);
});

test('public product detail is available to the unauthenticated read-only Hermes catalog tool', async (context) => {
  const productId = '30000000-0000-4000-8000-000000000003';
  const gateway = {
    async getProduct(id: string) { return id === productId ? { id, name: 'Waterproof sticker', product_variants: [] } : null; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/products/' + productId);
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { name: string }).name, 'Waterproof sticker');
});

test('price rule create and end operations require manager role, a reason, and valid calendar dates', async (context) => {
  const calls: unknown[][] = [];
  const gateway = {
    async authenticate(token: string) { return { id: token }; },
    async getRole(userId: string) { return userId === 'manager-token' ? 'manager' as const : 'customer' as const; },
    async createPriceRule(...args: unknown[]) { calls.push(args); return 'rule-id'; },
    async endPriceRule(...args: unknown[]) { calls.push(args); }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const base = 'http://127.0.0.1:' + address.port + '/api/manager/price-rules';
  const createBody = { product_variant_id: '30000000-0000-4000-8000-000000000003', quantity_min: 1000, unit_price: '2.10', active_from: '2026-10-03', reason: 'Owner approved selling price' };
  assert.equal((await fetch(base, { method: 'POST', headers: { authorization: 'Bearer customer-token', 'content-type': 'application/json' }, body: JSON.stringify(createBody) })).status, 403);
  const invalidDate = await fetch(base, { method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ ...createBody, active_from: '2026-02-31' }) });
  assert.equal(invalidDate.status, 400);
  assert.equal(calls.length, 0);
  const created = await fetch(base, { method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify(createBody) });
  assert.equal(created.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'manager-token');
  assert.equal(calls[0][2], 'Owner approved selling price');
  assert.equal((calls[0][1] as Record<string, unknown>).design_fee, '50.00', 'new manager price rules default to the approved EGP 50 design service');
  const ruleId = '30000000-0000-4000-8000-000000000004';
  const ended = await fetch(base + '/' + ruleId, { method: 'PATCH', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ active_to: '2026-12-31', reason: 'Replacing with a revised shop price' }) });
  assert.equal(ended.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1], ruleId);
});

test('product listing is public but an authenticated customer cannot read another customer order', async (context) => {
  let designStatus = 'customer_review';
  let createdDesignFee = -1;
  let includeApprovedDesignFee = true;
  let quoteOwner = 'customer-1';
  let orderCreation: unknown[] = [];
  let quoteStatus = 'draft';
  const quoteTransitions: string[] = [];
  let salesReportCalls = 0;
  const gateway = {
    async authenticate() { return { id: 'user-1' }; },
    async getRole() { return 'customer' as const; },
    async getCustomerId() { return 'customer-1'; },
    async customerExists() { return true; },
    async saveQuote() { return 'quote-1'; },
    async listProducts() { return [{ id: 'product-1', name: 'Flyer' }]; },
    async getProduct() { return null; },
    async getQuote() { return { id: 'quote-1', customer_id: quoteOwner, status: quoteStatus, quote_items: [{ design_required: true, options: { design_fee: includeApprovedDesignFee ? '50.00' : '0.00' } }] }; },
    async listQuotes() { return []; },
    async listCustomers() { return []; },
    async createCustomer() { return 'customer-new'; },
    async getSalesReport() { salesReportCalls += 1; return { currency: 'EGP', order_count: 0 }; },
    async recordAiRun() {},
    async updateQuoteStatus(_id: string, status: string) {
      if (status === 'sent' && quoteStatus === 'draft') quoteStatus = 'sent';
      else if (status === 'accepted' && quoteStatus === 'sent') quoteStatus = 'accepted';
      else throw new Error(`invalid quote status transition: ${quoteStatus} -> ${status}`);
      quoteTransitions.push(status);
    },
    async createOrderFromQuote(...args: unknown[]) { orderCreation = args; return 'order-1'; },
    async getOrder(id: string) { return id === '30000000-0000-4000-8000-000000000014' ? { id, customer_id: 'customer-1', quote_id: 'quote-1' } : { id: 'order-1', customer_id: 'customer-2' }; },
    async updateOrderStatus() {},
    async listOrders() { return []; },
    async listInventory() { return []; },
    async runInventoryCommand() {},
    async listProduction() { return []; },
    async updateProductionStatus() {},
    async listDesignRequests() { return []; },
    async getDesignRequest() { return { id: 'design-1', customer_id: 'customer-1', status: designStatus }; },
    async updateDesignRequestStatus(_id: string, status: string) { designStatus = status; },
    async createDesignRequest(input: { designFee: number }) { createdDesignFee = input.designFee; return 'design-1'; },
    async orderBelongsToCustomer() { return true; },
    async createMaterial() { return 'material-1'; },
    async createMaterialRequirement() { return 'requirement-1'; }
  };
  const server = createApiServer({ gateway, pricing: repository(), hermesToolKey: 'test-tool-key', hermes: { async complete() { throw new Error('Customers must not invoke Hermes.'); } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const base = `http://127.0.0.1:${address.port}`;
  const products = await fetch(`${base}/api/products`);
  assert.equal(products.status, 200);
  assert.deepEqual(await products.json(), { products: [{ id: 'product-1', name: 'Flyer' }] });
  const customerQuoteList = await fetch(`${base}/api/quotes`, { headers: { authorization: 'Bearer valid-token' } });
  assert.equal(customerQuoteList.status, 200);
  assert.deepEqual(await customerQuoteList.json(), { quotes: [] });
  const customerDirectory = await fetch(`${base}/api/customers`, { headers: { authorization: 'Bearer valid-token' } });
  assert.equal(customerDirectory.status, 403);
  const customerCreate = await fetch(`${base}/api/customers`, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Not allowed', email: 'customer@example.com' })
  });
  assert.equal(customerCreate.status, 403);
  const order = await fetch(`${base}/api/orders/30000000-0000-4000-8000-000000000001`, { headers: { authorization: 'Bearer valid-token' } });
  assert.equal(order.status, 404);
  const unauthorizedDelivery = await fetch(`${base}/api/orders/30000000-0000-4000-8000-000000000001/status`, {
    method: 'PATCH', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'delivered' })
  });
  assert.equal(unauthorizedDelivery.status, 403);
  const acceptedQuote = await fetch(`${base}/api/quotes/30000000-0000-4000-8000-000000000003/status`, {
    method: 'PATCH', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'accepted' })
  });
  assert.equal(acceptedQuote.status, 200);
  assert.deepEqual(quoteTransitions, ['sent', 'accepted']);
  assert.equal(quoteStatus, 'accepted');
  const customerOrder = await fetch(`${base}/api/orders`, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ quote_id: '30000000-0000-4000-8000-000000000015', delivery_method: 'delivery', delivery_address: 'Samia El-Gamal, Mansoura, Dakahlia; 12 Test Street, building 4', delivery_phone: '01012345678' })
  });
  assert.equal(customerOrder.status, 201);
  assert.deepEqual(orderCreation, ['30000000-0000-4000-8000-000000000015', 'delivery', 'Samia El-Gamal, Mansoura, Dakahlia; 12 Test Street, building 4', '01012345678']);
  const outsideDelivery = await fetch(`${base}/api/orders`, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ quote_id: '30000000-0000-4000-8000-000000000015', delivery_method: 'delivery', delivery_address: 'Cairo; 12 Test Street, building 4', delivery_phone: '01012345678' })
  });
  assert.equal(outsideDelivery.status, 400);
  quoteOwner = 'customer-2';
  const anotherCustomerQuote = await fetch(`${base}/api/orders`, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ quote_id: '30000000-0000-4000-8000-000000000015', delivery_method: 'pickup', delivery_address: 'Store pickup: Samia El-Gamal, Mansoura, Dakahlia' })
  });
  assert.equal(anotherCustomerQuote.status, 404);
  assert.equal(orderCreation.length, 4);
  const customerHermes = await fetch(`${base}/api/ai/chat`, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'What is low stock?' }] })
  });
  assert.equal(customerHermes.status, 403);
  const blockedHermesTool = await fetch(`${base}/api/hermes/tools`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'wrong-key' },
    body: JSON.stringify({ name: 'get_sales_report' })
  });
  assert.equal(blockedHermesTool.status, 401);
  const authorizedHermesTool = await fetch(`${base}/api/hermes/tools`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'test-tool-key' },
    body: JSON.stringify({ name: 'get_sales_report', arguments: {} })
  });
  assert.equal(authorizedHermesTool.status, 200);
  assert.equal(salesReportCalls, 1);
  const customerApproval = await fetch(`${base}/api/design-requests/30000000-0000-4000-8000-000000000002/status`, {
    method: 'PATCH', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' })
  });
  assert.equal(customerApproval.status, 200);
  assert.equal(designStatus, 'approved');
  quoteOwner = 'customer-1';
  const shopDesign = await fetch(`${base}/api/design-requests`, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ order_id: '30000000-0000-4000-8000-000000000014', brief: 'Create a cafe sticker design', reference_files: [], shop_design: true })
  });
  assert.equal(shopDesign.status, 201);
  assert.equal(createdDesignFee, 50);
  includeApprovedDesignFee = false;
  const unpricedShopDesign = await fetch(`${base}/api/design-requests`, {
    method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ order_id: '30000000-0000-4000-8000-000000000014', brief: 'Create a cafe sticker design', reference_files: [], shop_design: true })
  });
  assert.equal(unpricedShopDesign.status, 422);
  assert.equal((await unpricedShopDesign.json() as { error: { code: string } }).error.code, 'DESIGN_FEE_NOT_INCLUDED');
});

test('manager can cancel an order through the guarded order state transition', async (context) => {
  const transitions: Array<[string, string]> = [];
  const gateway = {
    async authenticate(token: string) { if (token !== 'manager-token') throw new AppError('UNAUTHORIZED', 401, 'Unauthorized'); return { id: 'manager-1' }; },
    async getRole() { return 'manager' as const; },
    async updateOrderStatus(id: string, status: string) { transitions.push([id, status]); }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/orders/30000000-0000-4000-8000-000000000001/status`, {
    method: 'PATCH', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { order_id: '30000000-0000-4000-8000-000000000001', status: 'cancelled' });
  assert.deepEqual(transitions, [['30000000-0000-4000-8000-000000000001', 'cancelled']]);
});

test('Hermes manager approvals persist across API instances and execute the exact proposal once', async (context) => {
  const changes: Array<Record<string, unknown>> = [];
  const proposals = new Map<string, { managerId: string; action: string; args: Record<string, unknown>; status: string }>();
  const managerId = '30000000-0000-4000-8000-000000000099';
  const productId = '30000000-0000-4000-8000-000000000012';
  let toolUrl = '';
  let approvedResult: Record<string, unknown> | undefined;
  const gateway = {
    async authenticate(token: string) { if (token !== 'manager-token') throw new AppError('UNAUTHORIZED', 401, 'Unauthorized'); return { id: managerId }; },
    async getRole(id: string) { assert.equal(id, managerId); return 'manager' as const; },
    async listVerticals() { return [{ vertical_key: 'printing', active: true }, { vertical_key: 'electronics', active: true }]; },
    async recordAiRun() {},
    async createHermesActionProposal(input: { id: string; managerId: string; action: string; arguments: Record<string, unknown> }) {
      proposals.set(input.id, { managerId: input.managerId, action: input.action, args: input.arguments, status: 'pending' });
      return new Date(Date.now() + 600_000).toISOString();
    },
    async approveHermesActionProposal(id: string, userId: string) {
      const proposal = proposals.get(id);
      if (!proposal || proposal.managerId !== userId || proposal.status !== 'pending') return false;
      proposal.status = 'approved'; return true;
    },
    async claimHermesActionProposal(input: { id: string; managerId: string; action: string; arguments: Record<string, unknown> }) {
      const proposal = proposals.get(input.id);
      if (!proposal || proposal.managerId !== input.managerId || proposal.action !== input.action || JSON.stringify(proposal.args) !== JSON.stringify(input.arguments) || proposal.status !== 'approved') return false;
      proposal.status = 'executing'; return true;
    },
    async finishHermesActionProposal(input: { id: string; status: 'completed' | 'failed'; result: Record<string, unknown> | null }) {
      const proposal = proposals.get(input.id);
      assert.equal(proposal?.status, 'executing');
      if (proposal) proposal.status = input.status;
      changes.push({ type: 'proposal_result', ...input });
    },
    async updateProduct(id: string, fields: Record<string, unknown>) { changes.push({ type: 'product', id, fields }); },
    async recordAuditLog(input: Record<string, unknown>) { changes.push({ type: 'audit', ...input }); }
  } as unknown as AuthGateway;
  const serverOptions = {
    gateway, pricing: repository(), hermesToolKey: 'tool-secret', hermesWriteToolsEnabled: true, hermesManagerUserId: managerId,
    hermes: { async complete(messages) {
      const lastMessage = messages.at(-1)?.content ?? '';
      const confirmation = /I CONFIRM THIS CHANGE ([0-9a-f-]{36})/i.exec(lastMessage);
      const args = { product_id: productId, active: false, vertical_key: 'electronics', attributes: { warranty_months: 12 }, reason: 'Manager asked to update this listing',
        ...(confirmation ? { action_id: confirmation[1] } : {}) };
      const response = await fetch(toolUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'tool-secret' }, body: JSON.stringify({ name: 'update_product_details', arguments: args }) });
      approvedResult = await response.json() as Record<string, unknown>;
      return { content: response.ok ? `Tool result: ${JSON.stringify(approvedResult)}` : 'The update was blocked by approval checks.', model: 'test-hermes' };
    } }
  };
  const startServer = async () => {
    const server = createApiServer(serverOptions);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
    context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    return `http://127.0.0.1:${address.port}`;
  };
  const baseOne = await startServer();
  toolUrl = `${baseOne}/api/hermes/tools`;
  const chat = (base: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => fetch(`${base}/api/ai/chat`, {
    method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ messages })
  });
  const first = await chat(baseOne, [{ role: 'user', content: 'Hide this product from the store.' }]);
  assert.equal(first.status, 200);
  assert.equal(approvedResult?.status, 'confirmation_required');
  const actionId = String(approvedResult?.action_id);
  assert.match(actionId, /^[0-9a-f-]{36}$/i);
  assert.equal(changes.length, 0, 'proposal must not change the product');

  const directToolAttempt = await fetch(toolUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'tool-secret' },
    body: JSON.stringify({ name: 'update_product_details', arguments: { product_id: productId, active: false, vertical_key: 'electronics', attributes: { warranty_months: 12 }, reason: 'Manager asked to update this listing', action_id: actionId } }) });
  assert.equal(directToolAttempt.status, 409, 'an MCP call outside the authenticated confirmed chat must not execute');
  assert.equal(changes.length, 0);

  const baseTwo = await startServer();
  toolUrl = `${baseTwo}/api/hermes/tools`;
  const confirmed = await chat(baseTwo, [
    { role: 'user', content: 'Hide this product from the store.' },
    { role: 'assistant', content: `Proposed to hide ${productId}. Reply exactly: I CONFIRM THIS CHANGE ${actionId}` },
    { role: 'user', content: `I CONFIRM THIS CHANGE ${actionId}` }
  ]);
  assert.equal(confirmed.status, 200);
  assert.deepEqual(approvedResult, { product_id: productId, changes: { vertical_key: 'electronics', attributes: { warranty_months: 12 }, active: false }, audit_logged: true });
  assert.equal(changes.length, 2);
  assert.deepEqual(changes[0], { type: 'product', id: productId, fields: { vertical_key: 'electronics', attributes: { warranty_months: 12 }, active: false } });
  assert.equal((changes[1] as Record<string, unknown>).status, 'completed');
  assert.equal(proposals.get(actionId)?.status, 'completed');
});

test('Hermes product creation creates only a manager-approved inactive product draft', async (context) => {
  const managerId = '30000000-0000-4000-8000-000000000099';
  const proposals = new Map<string, { action: string; arguments: Record<string, unknown>; status: string }>();
  let productCreations = 0;
  let createdProduct: Record<string, unknown> | undefined;
  let toolUrl = '';
  const gateway = {
    async authenticate(token: string) { assert.equal(token, 'manager-token'); return { id: managerId }; },
    async getRole(id: string) { assert.equal(id, managerId); return 'manager' as const; },
    async recordAiRun() {},
    async listVerticals() { return [{ vertical_key: 'printing', active: true }, { vertical_key: 'clothing', active: true }]; },
    async createHermesActionProposal(input: { id: string; action: string; arguments: Record<string, unknown> }) { proposals.set(input.id, { action: input.action, arguments: input.arguments, status: 'pending' }); return new Date(Date.now() + 600_000).toISOString(); },
    async approveHermesActionProposal(id: string) { const proposal = proposals.get(id); if (!proposal || proposal.status !== 'pending') return false; proposal.status = 'approved'; return true; },
    async claimHermesActionProposal(input: { id: string; action: string; arguments: Record<string, unknown> }) { const proposal = proposals.get(input.id); if (!proposal || proposal.status !== 'approved' || proposal.action !== input.action || JSON.stringify(proposal.arguments) !== JSON.stringify(input.arguments)) return false; proposal.status = 'executing'; return true; },
    async finishHermesActionProposal(input: { id: string; status: string }) { const proposal = proposals.get(input.id); if (proposal) proposal.status = input.status; },
    async createProduct(input: Record<string, unknown>) { productCreations++; createdProduct = input; return 'new-product-id'; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository(), hermesToolKey: 'tool-secret', hermesWriteToolsEnabled: true, hermesManagerUserId: managerId,
    hermes: { async complete(messages) {
      const last = messages.at(-1)?.content ?? '';
      const id = /I CONFIRM THIS CHANGE ([0-9a-f-]{36})/i.exec(last)?.[1];
      const response = await fetch(toolUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'tool-secret' },
        body: JSON.stringify({ name: 'create_product_draft', arguments: {
          sku: 'INK-TSHIRT-01', name: 'Printed T-shirt', category: 'Apparel', base_unit: 'piece', vertical_key: 'clothing',
          description: 'Cotton shirt with custom print', attributes: {}, requires_design: false, requires_size: true,
          reason: 'Manager asked to prepare a clothing item', ...(id ? { action_id: id } : {})
        } }) });
      return { content: response.ok ? JSON.stringify(await response.json()) : 'The product draft action was blocked.', model: 'test-hermes' };
    } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const base = `http://127.0.0.1:${address.port}`;
  toolUrl = `${base}/api/hermes/tools`;
  const invoke = (verticalKey: string) => fetch(`http://127.0.0.1:${address.port}/api/hermes/tools`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'tool-secret' },
    body: JSON.stringify({ name: 'create_product_draft', arguments: {
      sku: 'INK-TSHIRT-01', name: 'Printed T-shirt', category: 'Apparel', base_unit: 'piece', vertical_key: verticalKey,
      description: 'Cotton shirt with custom print', requires_design: false, requires_size: true, reason: 'Manager asked to prepare a clothing item'
    } })
  });
  const invalid = await invoke('unknown');
  assert.equal(invalid.status, 422);
  assert.equal(proposals.size, 0);
  const proposal = await invoke('clothing');
  assert.equal(proposal.status, 200);
  const proposalBody = await proposal.json() as { status: string; details: Record<string, unknown>; action_id: string };
  assert.equal(proposalBody.status, 'confirmation_required');
  assert.equal(proposalBody.details.active, undefined);
  assert.equal(proposalBody.details.vertical_key, 'clothing');
  assert.equal(productCreations, 0, 'a proposal must not create the product before approval');
  assert.equal(proposals.size, 1);
  const actionId = proposalBody.action_id;
  assert.deepEqual(proposals.get(actionId)?.arguments, {
    sku: 'INK-TSHIRT-01', name: 'Printed T-shirt', category: 'Apparel', base_unit: 'piece', vertical_key: 'clothing',
    description: 'Cotton shirt with custom print', attributes: {}, requires_design: false, requires_size: true, reason: 'Manager asked to prepare a clothing item'
  });
  const confirmation = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ messages: [
    { role: 'user', content: 'Prepare this clothing product.' },
    { role: 'assistant', content: `I prepared the inactive product draft. Reply exactly: I CONFIRM THIS CHANGE ${actionId}` },
    { role: 'user', content: `I CONFIRM THIS CHANGE ${actionId}` }
  ] }) });
  assert.equal(confirmation.status, 200);
  assert.equal(productCreations, 1);
  assert.equal(createdProduct?.active, false, 'approved Hermes creation must never publish the product');
  assert.equal(proposals.get(actionId)?.status, 'completed');
});

test('Hermes storefront action creates a review draft but does not publish it', async (context) => {
  const managerId = '30000000-0000-4000-8000-000000000099';
  const config = {
    store_name: 'INKORA', tagline: 'Create. Print. Grow.', hero_eyebrow: 'MANSOURA PRINT STUDIO · INKORA',
    hero_title_en: 'Make your next idea tangible.', hero_title_ar: 'أفكارك، مطبوعة بعناية.',
    hero_description_en: 'Thoughtful print for ambitious brands.', hero_description_ar: 'طباعة مخصصة بعناية.',
    announcement_en: 'Summer print, ready to order.', announcement_ar: 'طباعة الصيف جاهزة للطلب.',
    accent_color: '#2b6de0', featured_product_ids: []
  };
  const proposals = new Map<string, { arguments: Record<string, unknown>; status: string }>();
  let toolUrl = '';
  let savedDraft: Record<string, unknown> | undefined;
  let published = false;
  const gateway = {
    async authenticate(token: string) { assert.equal(token, 'manager-token'); return { id: managerId }; },
    async getRole(id: string) { assert.equal(id, managerId); return 'manager' as const; },
    async recordAiRun() {},
    async createHermesActionProposal(input: { id: string; arguments: Record<string, unknown> }) { proposals.set(input.id, { arguments: input.arguments, status: 'pending' }); return new Date(Date.now() + 600_000).toISOString(); },
    async approveHermesActionProposal(id: string) { const proposal = proposals.get(id); if (!proposal || proposal.status !== 'pending') return false; proposal.status = 'approved'; return true; },
    async claimHermesActionProposal(input: { id: string; arguments: Record<string, unknown> }) { const proposal = proposals.get(input.id); if (!proposal || proposal.status !== 'approved' || JSON.stringify(proposal.arguments) !== JSON.stringify(input.arguments)) return false; proposal.status = 'executing'; return true; },
    async finishHermesActionProposal(input: { id: string; status: string }) { const proposal = proposals.get(input.id); if (proposal) proposal.status = input.status; },
    async createStorefrontConfigDraft(_actorId: string, draft: Record<string, unknown>) { savedDraft = draft; return { id: 'storefront-revision-2', version: 2, status: 'draft' }; },
    async publishStorefrontConfig() { published = true; return { id: 'storefront-revision-2', version: 2, status: 'published' }; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository(), hermesToolKey: 'tool-secret', hermesWriteToolsEnabled: true, hermesManagerUserId: managerId,
    hermes: { async complete(messages) {
      const last = messages.at(-1)?.content ?? '';
      const id = /I CONFIRM THIS CHANGE ([0-9a-f-]{36})/i.exec(last)?.[1];
      const response = await fetch(toolUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'tool-secret' },
        body: JSON.stringify({ name: 'prepare_storefront_update', arguments: { config, reason: 'Manager requested the updated blue brand campaign', ...(id ? { action_id: id } : {}) } }) });
      return { content: response.ok ? JSON.stringify(await response.json()) : 'The storefront change was blocked.', model: 'test-hermes' };
    } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const base = `http://127.0.0.1:${address.port}`;
  toolUrl = `${base}/api/hermes/tools`;
  const invalid = await fetch(toolUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'tool-secret' }, body: JSON.stringify({ name: 'prepare_storefront_update', arguments: { config: { ...config, featured_product_ids: ['not-a-uuid'] }, reason: 'Use an invalid product ID' } }) });
  assert.equal(invalid.status, 400);
  assert.equal(proposals.size, 0);
  const first = await fetch(toolUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printshop-hermes-key': 'tool-secret' }, body: JSON.stringify({ name: 'prepare_storefront_update', arguments: { config, reason: 'Manager requested the updated blue brand campaign' } }) });
  assert.equal(first.status, 200);
  const firstBody = await first.json() as { action_id: string };
  assert.equal(savedDraft, undefined);
  const confirmed = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ messages: [
    { role: 'user', content: 'Prepare an updated storefront.' },
    { role: 'assistant', content: `Proposed the reviewed draft. Reply exactly: I CONFIRM THIS CHANGE ${firstBody.action_id}` },
    { role: 'user', content: `I CONFIRM THIS CHANGE ${firstBody.action_id}` }
  ] }) });
  assert.equal(confirmed.status, 200);
  assert.deepEqual(savedDraft, config);
  assert.equal(published, false, 'Hermes must not publish the storefront configuration');
  assert.equal(proposals.get(firstBody.action_id)?.status, 'completed');
});

test('marketing campaigns use a brief and optional catalog product, never customer orders', async (context) => {
  const productId = '30000000-0000-4000-8000-000000000012';
  let saved: Record<string, unknown> | undefined;
  const aiRuns: Array<Record<string, unknown>> = [];
  let prompt = '';
  let storedImage: Record<string, unknown> | undefined;
  const gateway = {
    async authenticate() { return { id: 'manager-1' }; },
    async getRole() { return 'manager' as const; },
    async getProduct() { return { id: productId, name: 'Waterproof stickers', category: 'Stickers', description: 'Waterproof vinyl' }; },
    async createMarketingAsset(input: Record<string, unknown>) { saved = input; return 'asset-1'; },
    async uploadMarketingImage(input: Record<string, unknown>) { storedImage = input; return 'marketing-artwork.png'; },
    async recordAiRun(input: Record<string, unknown>) { aiRuns.push(input); }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository(), marketingImage: { async generate() { return { data: Buffer.from('test-image'), mimeType: 'image/png', model: 'gemini-3.1-flash-image', estimatedCostUsd: 0.067 }; } }, hermes: { async complete(messages) { prompt = messages.at(-1)?.content ?? ''; return { content: 'Make your brand stick. Order custom labels today! #Print #Labels #SmallBusiness', model: 'test-model', usage: { prompt_tokens: 20, completion_tokens: 14 } }; } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const url = `http://127.0.0.1:${address.port}/api/marketing/draft`;
  const response = await fetch(url, {
    method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' },
    body: JSON.stringify({ campaign_brief: 'Promote durable cafe branding', campaign_type: 'product_showcase', product_id: productId, platform: 'instagram', generate_image: true })
  });
  assert.equal(response.status, 201);
  const result = await response.json() as { asset_id: string; status: string; caption: string; design_url: string | null };
  assert.equal(result.asset_id, 'asset-1');
  assert.equal(result.status, 'pending_approval');
  assert.equal(result.design_url, 'marketing-artwork.png');
  assert.equal(saved?.designUrl, 'marketing-artwork.png');
  assert.equal(storedImage?.mimeType, 'image/png');
  assert.equal(saved?.orderId, null);
  assert.equal(saved?.productId, productId);
  assert.equal(saved?.campaignBrief, 'Promote durable cafe branding');
  assert.equal(saved?.campaignType, 'product_showcase');
  assert.equal(saved?.platform, 'instagram');
  assert.match(prompt, /Waterproof stickers/);
  assert.match(prompt, /Promote durable cafe branding/);
  assert.doesNotMatch(prompt, /order_id|customer/i);
  assert.equal(aiRuns.find((run) => run.feature === 'marketing_draft')?.inputTokens, 20);
  assert.equal(aiRuns.find((run) => run.feature === 'marketing_image')?.estimatedCostUsd, 0.067);

  const legacyOrderRequest = await fetch(url, {
    method: 'POST', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' },
    body: JSON.stringify({ order_id: '30000000-0000-4000-8000-000000000010', platform: 'instagram', campaign_brief: 'An order based post' })
  });
  assert.equal(legacyOrderRequest.status, 400);
});

test('final artwork metadata requires staff-owned private storage path and active design status', async (context) => {
  const designId = '30000000-0000-4000-8000-000000000011';
  let savedPath = '';
  const gateway = {
    async authenticate() { return { id: 'manager-1' }; },
    async getRole() { return 'manager' as const; },
    async getDesignRequest() { return { id: designId, customer_id: 'customer-1', status: 'designing' }; },
    async updateDesignRequestFile(_id: string, path: string) { savedPath = path; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const url = `http://127.0.0.1:${address.port}/api/design-requests/${designId}/file`;
  const forbidden = await fetch(url, { method: 'PATCH', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ final_design_path: 'another-user/private.pdf' }) });
  assert.equal(forbidden.status, 403);
  const accepted = await fetch(url, { method: 'PATCH', headers: { authorization: 'Bearer manager-token', 'content-type': 'application/json' }, body: JSON.stringify({ final_design_path: 'manager-1/final.pdf' }) });
  assert.equal(accepted.status, 200);
  assert.equal(savedPath, 'manager-1/final.pdf');
});

test('daily report integration requires the shared secret and returns live operational data', async (context) => {
  let reports = 0;
  const gateway = {
    async getSalesReport() { reports += 1; return { currency: 'EGP', order_count: 2, order_value: '450.00' }; },
    async listInventory() { return [{ id: 'material-1', current_stock: 1, reserved_stock: 0, reorder_point: 2 }]; },
    async listProduction() { return [{ id: 'job-1', status: 'printing' }]; }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: repository(), n8nWebhookSecret: 'long-test-secret', managerEmail: 'owner@example.test' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const url = `http://127.0.0.1:${address.port}/api/integrations/daily-report`;
  const blocked = await fetch(url);
  assert.equal(blocked.status, 401);
  const response = await fetch(url, { headers: { 'x-printshop-integration-key': 'long-test-secret' } });
  assert.equal(response.status, 200);
  const result = await response.json() as { sales: { order_count: number }; low_stock_items: unknown[]; production_jobs: unknown[]; to_email: string };
  assert.equal(result.sales.order_count, 2);
  assert.equal(result.low_stock_items.length, 1);
  assert.equal(result.production_jobs.length, 1);
  assert.equal(result.to_email, 'owner@example.test');
  assert.equal(reports, 1);
});

test('monthly marketing integration returns only Hermes-generated drafts and fails closed when Hermes is unavailable', async (context) => {
  const draft = JSON.stringify(Array.from({ length: 4 }, (_, index) => ({ slot: index + 1, platform: 'instagram', caption: `Truthful print-shop post ${index + 1} — Contact us today. #Printing #Business #Design` })));
  let recorded: Array<{ success: boolean; feature: string }> = [];
  let hermesCalls = 0;
  const gateway = {
    async listProducts() { return [{ name: 'Business cards', category: 'stationery', description: 'Printed cards' }]; },
    async recordAiRun(run: { success: boolean; feature: string }) { recorded.push(run); }
  } as unknown as AuthGateway;
  const server = createApiServer({
    gateway, pricing: repository(), n8nWebhookSecret: 'long-test-secret',
    hermes: { async complete() { hermesCalls += 1; return { content: draft, model: 'gemini-test', usage: { prompt_tokens: 12, completion_tokens: 45 } }; } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const url = `http://127.0.0.1:${address.port}/api/integrations/monthly-marketing-plan`;
  const response = await fetch(url, { headers: { 'x-printshop-integration-key': 'long-test-secret' } });
  assert.equal(response.status, 200);
  const result = await response.json() as { posts: Array<{ caption: string; approval_required: boolean }>; image_generation_available: boolean; model: string };
  assert.equal(result.posts.length, 4);
  assert.equal(result.posts[0].caption, 'Truthful print-shop post 1 — Contact us today. #Printing #Business #Design');
  assert.ok(result.posts.every((post) => post.approval_required));
  assert.equal(result.image_generation_available, false);
  assert.equal(result.model, 'gemini-test');
  assert.equal(hermesCalls, 1);
  assert.deepEqual(recorded.map(({ success, feature }) => ({ success, feature })), [{ success: true, feature: 'monthly_marketing_plan' }]);

  const unavailableServer = createApiServer({ gateway, pricing: repository(), n8nWebhookSecret: 'long-test-secret' });
  unavailableServer.listen(0, '127.0.0.1');
  await once(unavailableServer, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => unavailableServer.close((error) => error ? reject(error) : resolve())));
  const unavailableAddress = unavailableServer.address();
  if (!unavailableAddress || typeof unavailableAddress === 'string') throw new Error('Test server did not bind a TCP port.');
  const unavailable = await fetch(`http://127.0.0.1:${unavailableAddress.port}/api/integrations/monthly-marketing-plan`, { headers: { 'x-printshop-integration-key': 'long-test-secret' } });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json() as { error: { code: string } }).error.code, 'HERMES_UNAVAILABLE');
});

test('monthly marketing plan stores free generated artwork as approval-required assets', async (context) => {
  const draft = JSON.stringify(Array.from({ length: 4 }, (_, index) => ({ slot: index + 1, platform: 'instagram', caption: `Print campaign ${index + 1}. Contact us today! #Print #Egypt #Business` })));
  const created: Array<Record<string, unknown>> = [];
  const uploaded: Array<Record<string, unknown>> = [];
  const aiRuns: Array<Record<string, unknown>> = [];
  const gateway = {
    async listProducts() { return []; },
    async uploadMarketingImage(input: Record<string, unknown>) { uploaded.push(input); return `generated-${uploaded.length}.webp`; },
    async createMarketingAsset(input: Record<string, unknown>) { created.push(input); return `asset-${created.length}`; },
    async createSignedMarketingImageUrl(path: string) { return `https://supabase.example/storage/${path}?signed`; },
    async recordAiRun(input: Record<string, unknown>) { aiRuns.push(input); }
  } as unknown as AuthGateway;
  const server = createApiServer({
    gateway,
    pricing: repository(),
    n8nWebhookSecret: 'long-test-secret',
    hermes: { async complete() { return { content: draft, model: 'hermes-test', usage: { prompt_tokens: 10, completion_tokens: 20 } }; } },
    marketingImage: { async generate() { return { data: Buffer.alloc(256, 1), mimeType: 'image/webp', model: 'AI Horde · test-model', estimatedCostUsd: 0 }; } }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/integrations/monthly-marketing-plan`, { headers: { 'x-printshop-integration-key': 'long-test-secret' } });
  assert.equal(response.status, 200);
  const result = await response.json() as { posts: Array<{ asset_id: string; image_status: string; image_url: string }>; image_generation_available: boolean; image_provider: string };
  assert.equal(result.image_generation_available, true);
  assert.equal(result.image_provider, 'AI Horde (free community queue)');
  assert.equal(result.posts.length, 4);
  assert.ok(result.posts.every((post) => post.image_status === 'generated' && post.image_url.startsWith('https://')));
  assert.deepEqual(result.posts.map((post) => post.asset_id), ['asset-1', 'asset-2', 'asset-3', 'asset-4']);
  assert.equal(uploaded.length, 4);
  assert.equal(created.length, 4);
  assert.ok(created.every((asset) => asset.createdBy === null && asset.orderId === null));
  assert.equal(aiRuns.filter((run) => run.feature === 'marketing_image' && run.success === true && run.estimatedCostUsd === 0).length, 4);
});
