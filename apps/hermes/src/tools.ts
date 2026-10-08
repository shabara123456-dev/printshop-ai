import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function currentApiBase(): string {
  return (process.env.PRINTSHOP_API_URL ?? 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
}

type InternalFetch = (request: Request) => Promise<Response>;

async function api<T>(path: string, init?: RequestInit, apiBase = currentApiBase(), internalFetch?: InternalFetch): Promise<T> {
  const request = new Request(`${apiBase}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    signal: AbortSignal.timeout(15_000)
  });
  const response = await (internalFetch ? internalFetch(request) : fetch(request));
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `PrintShop API returned ${response.status}.`);
  return body as T;
}

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function failed(error: unknown) {
  const message = error instanceof Error ? error.message : 'The PrintShop API request failed.';
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

async function managerTool<T>(name: string, args: Record<string, unknown> = {}, apiBase = currentApiBase(), managerToolKey = process.env.PRINTSHOP_HERMES_TOOL_KEY ?? process.env.HERMES_TOOL_API_KEY, internalFetch?: InternalFetch): Promise<T> {
  if (!managerToolKey) throw new Error('Set PRINTSHOP_HERMES_TOOL_KEY in the Hermes MCP server environment.');
  return await api<T>('/api/hermes/tools', {
    method: 'POST',
    headers: { 'x-printshop-hermes-key': managerToolKey },
    body: JSON.stringify({ name, arguments: args })
  }, apiBase, internalFetch);
}

export function createPrintshopMcpServer(options: { apiBase?: string; managerToolKey?: string; internalFetch?: InternalFetch } = {}): McpServer {
const apiBase = options.apiBase ?? currentApiBase();
const toolKey = options.managerToolKey ?? process.env.PRINTSHOP_HERMES_TOOL_KEY ?? process.env.HERMES_TOOL_API_KEY;
const publicApi = <T>(path: string, init?: RequestInit) => api<T>(path, init, apiBase, options.internalFetch);
const managerApi = <T>(name: string, args: Record<string, unknown> = {}) => managerTool<T>(name, args, apiBase, toolKey, options.internalFetch);
const server = new McpServer({ name: 'printshop-ai', version: '1.0.0' });

server.registerTool('search_products', {
  title: 'Search print products',
  description: 'Search the active PrintShop catalog. Returns product variants and clearly labeled market references; it does not return or invent a shop quote.',
  inputSchema: { query: z.string().trim().max(100).optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ query }) => {
  try {
    const search = query ? `?search=${encodeURIComponent(query)}` : '';
    return result(await publicApi(`/api/products${search}`));
  } catch (error) { return failed(error); }
});

server.registerTool('get_product_details', {
  title: 'Get print product details',
  description: 'Get one active catalog product and its variants by product UUID.',
  inputSchema: { product_id: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ product_id }) => {
  try { return result(await publicApi(`/api/products/${encodeURIComponent(product_id)}`)); }
  catch (error) { return failed(error); }
});

server.registerTool('list_manager_products', {
  title: 'Find a product in the manager catalog',
  description: 'Manager-only list of active and inactive product names, SKUs, and variants for safe identification before a requested catalog change. Does not return prices or costs.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  try { return result(await managerApi('list_manager_products')); }
  catch (error) { return failed(error); }
});

const quoteLine = z.object({
  variant_sku: z.string().trim().min(1).max(80),
  quantity: z.number().int().positive().max(1_000_000),
  material: z.string().trim().max(100).optional(),
  finishing: z.string().trim().max(100).optional(),
  design_required: z.boolean().optional(),
  delivery_required: z.boolean().optional(),
  installation_required: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional()
});

server.registerTool('calculate_quote', {
  title: 'Calculate a print quote',
  description: 'Calculate an indicative quote from the shop-approved pricing rules. The backend is authoritative; this tool does not save a quote or place an order.',
  inputSchema: { items: z.array(quoteLine).min(1).max(20) },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ items }) => {
  try {
    return result(await publicApi('/api/quotes/calculate', { method: 'POST', body: JSON.stringify({ items }) }));
  } catch (error) { return failed(error); }
});

server.registerTool('check_inventory', {
  title: 'Check shop inventory',
  description: 'Manager-only read-only inventory lookup. Returns stock on hand, reserved, available, reorder point, and configured reorder quantity. Never invent quantities.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  try { return result(await managerApi('check_inventory')); }
  catch (error) { return failed(error); }
});

server.registerTool('get_low_stock_items', {
  title: 'List low-stock materials',
  description: 'Manager-only read-only list of materials where available stock is at or below the configured reorder point.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  try { return result(await managerApi('get_low_stock_items')); }
  catch (error) { return failed(error); }
});

server.registerTool('get_purchase_suggestions', {
  title: 'Get purchase suggestions',
  description: 'Manager-only read-only purchase suggestions based on configured reorder quantities. Does not create or send a purchase order.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  try { return result(await managerApi('get_purchase_suggestions')); }
  catch (error) { return failed(error); }
});

server.registerTool('get_production_status', {
  title: 'Get production status',
  description: 'Manager-only read-only production queue and job statuses from the backend.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  try { return result(await managerApi('get_production_status')); }
  catch (error) { return failed(error); }
});

server.registerTool('get_order_status', {
  title: 'Get order status',
  description: 'Manager-only read-only status and total for one order UUID.',
  inputSchema: { order_id: z.string().uuid() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ order_id }) => {
  try { return result(await managerApi('get_order_status', { order_id })); }
  catch (error) { return failed(error); }
});

server.registerTool('get_sales_report', {
  title: 'Get sales report',
  description: 'Manager-only aggregate order sales report for a date range (default: current UTC month). Reports booked order value and delivered order value, not cash collected.',
  inputSchema: { from: z.string().optional(), to: z.string().optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ from, to }) => {
  try { return result(await managerApi('get_sales_report', { ...(from ? { from } : {}), ...(to ? { to } : {}) })); }
  catch (error) { return failed(error); }
});

const reason = z.string().trim().min(3).max(500);

server.registerTool('list_store_verticals', {
  title: 'List supported store verticals',
  description: 'Read the active INKORA store vertical registry and capabilities. Use the exact vertical_key from this list when preparing a product change.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  try { return result(await managerApi('list_store_verticals')); }
  catch (error) { return failed(error); }
});

server.registerTool('get_storefront_config', {
  title: 'Read the current storefront configuration',
  description: 'Read the manager-approved published storefront settings. Use this before preparing a storefront change so unchanged fields are preserved. This does not edit or publish the store.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  try { return result(await managerApi('get_storefront_config')); }
  catch (error) { return failed(error); }
});

const storefrontConfigInput = z.object({
  store_name: z.string().trim().min(1).max(80), tagline: z.string().trim().min(1).max(120),
  hero_eyebrow: z.string().trim().min(1).max(120),
  hero_title_en: z.string().trim().min(1).max(180), hero_title_ar: z.string().trim().min(1).max(180),
  hero_description_en: z.string().trim().min(1).max(600), hero_description_ar: z.string().trim().min(1).max(600),
  announcement_en: z.string().max(240), announcement_ar: z.string().max(240),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  featured_product_ids: z.array(z.string().uuid()).max(12)
});

server.registerTool('prepare_storefront_update', {
  title: 'Prepare a storefront change for review',
  description: 'Prepare a versioned storefront configuration draft for manager review. First read the current configuration and preserve fields the manager did not ask to change. This action never publishes; after the manager confirms the exact draft, direct them to preview and publish it in Storefront settings. Never add unverified product IDs.',
  inputSchema: { config: storefrontConfigInput, reason },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (args) => {
  try { return result(await managerApi('prepare_storefront_update', args)); }
  catch (error) { return failed(error); }
});

server.registerTool('create_material', {
  title: 'Add a shop material',
  description: 'Prepare a proposal to create a new raw material with zero opening stock. Read the tool response action_id, explain the exact SKU, name, category, unit and reorder settings, then ask the manager to reply exactly: I CONFIRM THIS CHANGE <action_id>. Only in the next authenticated manager dashboard chat, retry this tool with the same arguments and action_id. The standalone Hermes CLI is read-only for writes. Never invent opening stock or cost.',
  inputSchema: {
    sku: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(80), unit: z.string().trim().min(1).max(40),
    reorder_point: z.number().nonnegative().optional(), reorder_quantity: z.number().nonnegative().optional(), reason,
    action_id: z.string().uuid().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (args) => {
  try { return result(await managerApi('create_material', args)); }
  catch (error) { return failed(error); }
});

server.registerTool('record_material_receipt', {
  title: 'Record received material stock',
  description: 'Prepare a proposal to record stock the shop physically received. State the exact material, quantity and optional unit cost; ask the manager to reply exactly: I CONFIRM THIS CHANGE <action_id>. Only in the next authenticated manager dashboard chat, retry this tool with the same arguments and action_id. The standalone Hermes CLI is read-only for writes.',
  inputSchema: { material_id: z.string().uuid(), quantity: z.number().positive(), unit_cost: z.number().nonnegative().optional(), reason, action_id: z.string().uuid().optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (args) => {
  try { return result(await managerApi('record_material_receipt', args)); }
  catch (error) { return failed(error); }
});

server.registerTool('update_product_details', {
  title: 'Update product listing details',
  description: 'Prepare a proposal to change product name, category, unit, description, active visibility, store vertical, or public product specifications. This tool cannot set prices, costs, variants, stock or payment. Use an active vertical returned by list_store_verticals. Show the exact changes and ask the manager to reply exactly: I CONFIRM THIS CHANGE <action_id>. Only in the next authenticated manager dashboard chat, retry this tool with the same arguments and action_id. The standalone Hermes CLI is read-only for writes.',
  inputSchema: {
    product_id: z.string().uuid(), name: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(80).optional(), base_unit: z.string().trim().min(1).max(40).optional(),
    description: z.string().max(4000).optional(), vertical_key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
    attributes: z.record(z.string(), z.unknown()).optional(), active: z.boolean().optional(), reason,
    action_id: z.string().uuid().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
}, async (args) => {
  try { return result(await managerApi('update_product_details', args)); }
  catch (error) { return failed(error); }
});

server.registerTool('create_product_draft', {
  title: 'Prepare a product draft',
  description: 'Prepare an approval-gated product draft for any active INKORA store vertical. The created item is always inactive and cannot be purchased. After creation, a manager must separately configure its variants, approved prices, and stock in Products before publishing. Use list_store_verticals first. Show all exact values and ask for the exact manager confirmation phrase. The standalone Hermes CLI is read-only for writes.',
  inputSchema: {
    sku: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(80), base_unit: z.string().trim().min(1).max(40),
    vertical_key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), description: z.string().max(4000).optional(),
    attributes: z.record(z.string(), z.unknown()).optional(), requires_design: z.boolean(), requires_size: z.boolean(), reason
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (args) => {
  try { return result(await managerApi('create_product_draft', args)); }
  catch (error) { return failed(error); }
});

server.registerTool('update_order_status', {
  title: 'Cancel or deliver a shop order',
  description: 'Prepare a proposal to cancel an order or mark a ready order delivered. Show the order ID and requested status, then ask the manager to reply exactly: I CONFIRM THIS CHANGE <action_id>. Only in the next authenticated manager dashboard chat, retry this tool with the same arguments and action_id. Cancellation releases unconsumed material reservations. Never change payment status. The standalone Hermes CLI is read-only for writes.',
  inputSchema: { order_id: z.string().uuid(), status: z.enum(['cancelled', 'delivered']), reason, action_id: z.string().uuid().optional() },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
}, async (args) => {
  try { return result(await managerApi('update_order_status', args)); }
  catch (error) { return failed(error); }
});

server.registerTool('update_production_status', {
  title: 'Advance or cancel a production job',
  description: 'Prepare a proposal for a validated production transition. Show the job ID and exact target status, then ask the manager to reply exactly: I CONFIRM THIS CHANGE <action_id>. Only in the next authenticated manager dashboard chat, retry this tool with the same arguments and action_id. The database rejects skipped or invalid stages. The standalone Hermes CLI is read-only for writes.',
  inputSchema: { production_job_id: z.string().uuid(), status: z.enum(['prepress', 'printing', 'finishing', 'quality_check', 'ready', 'cancelled']), reason, action_id: z.string().uuid().optional() },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
}, async (args) => {
  try { return result(await managerApi('update_production_status', args)); }
  catch (error) { return failed(error); }
});

return server;
}
