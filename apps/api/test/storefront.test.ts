import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApiServer, type AuthGateway, type Role, type StorefrontConfig } from '../src/api.ts';
import { AppError } from '../src/errors.ts';

const managerId = '20000000-0000-4000-8000-000000000001';
const config: StorefrontConfig = {
  store_name: 'INKORA', tagline: 'Create. Print. Grow.', hero_eyebrow: 'PRINT STUDIO',
  hero_title_en: 'Make an idea real', hero_title_ar: 'حوّل فكرتك إلى واقع',
  hero_description_en: 'Order print from the shop.', hero_description_ar: 'اطلب مطبوعات من المتجر.',
  announcement_en: '', announcement_ar: '', accent_color: '#6f9fee', featured_product_ids: [], theme: 'midnight',
  background_color: '#101114', surface_color: '#191b20', text_color: '#f5f5f5', button_color: '#6f9fee',
  font_family: 'sans', layout: 'wide', hero_image_path: '', logo_path: '', logo_placement: 'left',
  cta_label_en: 'Explore the store', cta_label_ar: 'اكتشف المتجر', featured_categories: []
};

test('storefront is public to read, manager-only to edit, and publishing is auditable through gateway transitions', async (context) => {
  const users: Record<string, { id: string; role: Role }> = {
    manager: { id: managerId, role: 'manager' }, customer: { id: '10000000-0000-4000-8000-000000000001', role: 'customer' }
  };
  const revisions: Array<{ id: string; version: number; status: string; config: StorefrontConfig }> = [];
  let published = { id: '60000000-0000-4000-8000-000000000001', version: 1, config };
  const gateway = {
    authenticate: async (token: string) => { if (!users[token]) throw new AppError('UNAUTHORIZED', 401, 'Invalid access token.'); return { id: users[token].id }; },
    getRole: async (id: string) => Object.values(users).find((user) => user.id === id)?.role ?? null,
    getStorefrontConfig: async () => published,
    listStorefrontRevisions: async () => revisions,
    createStorefrontConfigDraft: async (_actorId: string, draft: StorefrontConfig) => {
      const row = { id: '70000000-0000-4000-8000-000000000001', version: 2, status: 'draft', config: draft };
      revisions.unshift(row); return { id: row.id, version: row.version, status: row.status };
    },
    publishStorefrontConfig: async (_actorId: string, revisionId: string) => {
      const row = revisions.find((revision) => revision.id === revisionId);
      if (!row || row.status !== 'draft') throw new AppError('NOT_FOUND', 404, 'Storefront draft not found.');
      row.status = 'published'; published = { id: row.id, version: row.version, config: row.config };
      return { id: row.id, version: row.version, status: row.status };
    }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: gateway });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(async () => { server.close(); await once(server, 'close'); });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const request = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const publicConfig = await request('/api/storefront');
  assert.equal(publicConfig.status, 200);
  assert.equal((await publicConfig.json() as { config: StorefrontConfig }).config.store_name, 'INKORA');
  assert.equal((await request('/api/manager/storefront', 'customer')).status, 403);
  assert.equal((await request('/api/manager/storefront/drafts', 'customer', 'POST', { config })).status, 403);
  assert.equal((await request('/api/manager/storefront/drafts', 'manager', 'POST', { config: { ...config, arbitrary_css: 'body{display:none}' } })).status, 400);
  const saved = await request('/api/manager/storefront/drafts', 'manager', 'POST', { config });
  assert.equal(saved.status, 201);
  const draft = (await saved.json() as { draft: { id: string } }).draft;
  assert.equal((await request(`/api/manager/storefront/drafts/${draft.id}/publish`, 'manager', 'POST', {})).status, 200);
  assert.equal((await request('/api/storefront')).status, 200);
  assert.equal((await (await request('/api/storefront')).json() as { version: number }).version, 2);
});
