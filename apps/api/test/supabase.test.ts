import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/errors.ts';
import { SupabaseGateway } from '../src/supabase.ts';

test('Supabase errors are logged with safe metadata and never returned verbatim', async (context) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousPublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SECRET_KEY = 'secret-test-key';
  const logs: string[] = [];
  console.error = (...values: unknown[]) => { logs.push(values.map(String).join(' ')); };
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '22023', message: 'internal schema detail with customer@example.com'
  }), { status: 400, headers: { 'content-type': 'application/json' } });
  context.after(() => {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousPublishable === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousPublishable;
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = previousSecret;
  });

  const gateway = new SupabaseGateway();
  await assert.rejects(gateway.listProducts(), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'DATABASE_ERROR');
    assert.equal(error.status, 502);
    assert.doesNotMatch(error.message, /schema detail|customer@example/);
    return true;
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /supabase\.request\.failed/);
  assert.match(logs[0], /22023/);
  assert.doesNotMatch(logs[0], /schema detail|customer@example/);

  globalThis.fetch = async () => { throw new Error('network-secret-detail'); };
  await assert.rejects(gateway.listProducts(), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'DATABASE_UNAVAILABLE');
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /network-secret-detail/);
    return true;
  });

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '22023', message: 'material requirements are not configured for every quote item'
  }), { status: 400, headers: { 'content-type': 'application/json' } });
  await assert.rejects(gateway.createOrderFromQuote('30000000-0000-4000-8000-000000000001'), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'MATERIAL_REQUIREMENTS_NOT_CONFIGURED');
    assert.equal(error.status, 409);
    assert.match(error.message, /manager to finish product setup/);
    assert.doesNotMatch(error.message, /22023|Supabase|Postgres/);
    return true;
  });

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '23514', message: 'insufficient available stock'
  }), { status: 400, headers: { 'content-type': 'application/json' } });
  await assert.rejects(gateway.createOrderFromQuote('30000000-0000-4000-8000-000000000001'), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INVENTORY_INSUFFICIENT');
    assert.equal(error.status, 409);
    assert.match(error.message, /not enough available material/);
    assert.doesNotMatch(error.message, /23514|Supabase|Postgres/);
    return true;
  });
});

test('public product catalog retains priced sold-out variants so the store can label them unavailable', async (context) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousPublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SECRET_KEY = 'secret-test-key';
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify([{
      id: 'product-1', name: 'Stickers', product_option_groups: [{ id:'group-1', option_key:'color', label_en:'Color', label_ar:'اللون', required:true, active:true, display_order:0, product_option_values:[{id:'value-1', value_key:'black', label_en:'Black', label_ar:'أسود', adjustment_type:'one_time', price_adjustment:'25.00', active:true, display_order:0},{id:'inactive', value_key:'hidden', label_en:'Hidden', label_ar:'مخفي', adjustment_type:'one_time', price_adjustment:'90.00', active:false, display_order:1}] }], product_variants: [
        { id: 'valid', sku: 'VALID', price_rules: [{ active_from: '2020-01-01', active_to: null }] },
        { id: 'sold-out', sku: 'SOLD-OUT', available_quantity: 0, price_rules: [{ active_from: '2020-01-01', active_to: null }] },
        { id: 'expired', sku: 'EXPIRED', price_rules: [{ active_from: '2020-01-01', active_to: '2020-12-31' }] },
        { id: 'future', sku: 'FUTURE', price_rules: [{ active_from: '2099-01-01', active_to: null }] },
        { id: 'unpriced', sku: 'UNPRICED', price_rules: [] }
      ]
    }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  context.after(() => {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousPublishable === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousPublishable;
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = previousSecret;
  });

  const gateway = new SupabaseGateway();
  const catalog = await gateway.listProducts() as Array<{ product_variants: Array<Record<string, unknown>>; product_option_groups: Array<{key:string;values:Array<{key:string;price_adjustment:string}>}> }>;
  assert.deepEqual(catalog[0].product_variants.map((variant) => variant.sku), ['VALID', 'SOLD-OUT']);
  assert.equal(catalog[0].product_option_groups[0].key, 'color');
  assert.deepEqual(catalog[0].product_option_groups[0].values.map((value) => value.key), ['black']);
  assert.equal('price_rules' in catalog[0].product_variants[0], false);
  assert.match(requests[0], /product_variants%21inner/);
  assert.match(requests[0], /price_rules%21inner/);

  const detail = await gateway.getProduct('product-1');
  assert.deepEqual((detail?.product_variants as Array<Record<string, unknown>>).map((variant) => variant.sku), ['VALID', 'SOLD-OUT']);
  assert.equal((detail?.product_option_groups as Array<{key:string}>)[0].key, 'color');
  assert.match(requests[1], /product_variants%21inner/);
});

test('quote gateway carries the demo-only flag into deterministic pricing', async (context) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousPublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SECRET_KEY = 'secret-test-key';
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([{ id: 'variant-1', sku: 'INK-SAMPLE', name: 'Sample', material: 'Paper', available_quantity: null, products: { active: true, demo_only: true } }]), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  context.after(() => {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousPublishable === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousPublishable;
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = previousSecret;
  });

  const gateway = new SupabaseGateway();
  const variant = await gateway.getVariantBySku('INK-SAMPLE');
  assert.equal(variant?.demo_only, true);
  assert.match(requestedUrl, /products%21inner%28active%2Cdemo_only%29/);
});
