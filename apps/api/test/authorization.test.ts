import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApiServer, type AuthGateway, type Role } from '../src/api.ts';
import { AppError } from '../src/errors.ts';

const orderId = '30000000-0000-4000-8000-000000000001';
const quoteId = '40000000-0000-4000-8000-000000000001';

test('API authentication, role boundaries, and customer ownership are enforced', async (context) => {
  const tokenUsers: Record<string, { id: string; role: Role }> = {
    customerA: { id: '10000000-0000-4000-8000-000000000001', role: 'customer' },
    customerB: { id: '10000000-0000-4000-8000-000000000002', role: 'customer' },
    manager: { id: '20000000-0000-4000-8000-000000000001', role: 'manager' },
    production: { id: '20000000-0000-4000-8000-000000000002', role: 'production' },
    marketing: { id: '20000000-0000-4000-8000-000000000003', role: 'marketing' }
  };
  const customerIds: Record<string, string> = {
    [tokenUsers.customerA.id]: 'customer-a',
    [tokenUsers.customerB.id]: 'customer-b'
  };
  let databaseReady = true;
  const requestedOrderCustomers: Array<string | undefined> = [];
  const promotedProducts: Array<{ actorId: string; productId: string }> = [];
  const gateway = {
    checkDatabaseReady: async () => { if (!databaseReady) throw new Error('internal database details'); },
    authenticate: async (token: string) => {
      const user = tokenUsers[token];
      if (!user) throw new AppError('UNAUTHORIZED', 401, 'Invalid access token.');
      return { id: user.id };
    },
    getRole: async (id: string) => Object.values(tokenUsers).find((user) => user.id === id)?.role ?? null,
    getCustomerId: async (id: string) => customerIds[id] ?? null,
    listOrders: async (customerId?: string) => {
      requestedOrderCustomers.push(customerId);
      return [];
    },
    getOrder: async () => ({ id: orderId, customer_id: 'customer-b', status: 'confirmed' }),
    getQuote: async () => ({ id: quoteId, customer_id: 'customer-b', status: 'sent' }),
    listCustomers: async () => [],
    listDesignRequests: async () => [],
    promoteDemoProduct: async (actorId: string, productId: string) => { promotedProducts.push({ actorId, productId }); }
  } as unknown as AuthGateway;
  const server = createApiServer({ gateway, pricing: gateway });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    server.close();
    await once(server, 'close');
  });
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, token?: string) => fetch(`${base}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });

  assert.equal((await request('/api/me')).status, 401, 'protected routes reject requests without a bearer token');
  assert.equal((await request('/api/customers', 'customerA')).status, 403, 'customers cannot read the manager customer directory');
  assert.equal((await request('/api/inventory', 'marketing')).status, 403, 'marketing cannot read inventory');
  assert.equal((await request('/api/design-requests', 'marketing')).status, 403, 'marketing cannot read private design briefs');

  assert.equal((await request(`/api/orders/${orderId}`, 'customerA')).status, 404, 'foreign customer orders are hidden');
  assert.equal((await request(`/api/quotes/${quoteId}`, 'customerA')).status, 404, 'foreign customer quotes are hidden');
  assert.equal((await request('/api/orders', 'customerA')).status, 200);
  assert.equal(requestedOrderCustomers.at(-1), 'customer-a', 'customer order listings are scoped to their own customer record');

  assert.equal((await request('/api/customers', 'manager')).status, 200, 'managers retain customer-directory access');

  const readyResponse = await request('/ready');
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), {
    status: 'ready', checks: { database: 'ok', hermes: 'not_configured', n8n: 'not_configured' }
  });
  databaseReady = false;
  const unavailableResponse = await request('/ready');
  assert.equal(unavailableResponse.status, 503);
  const unavailableBody = await unavailableResponse.json() as { status: string; checks: Record<string, string> };
  assert.equal(unavailableBody.checks.database, 'unavailable');
  assert.doesNotMatch(JSON.stringify(unavailableBody), /internal database details/);

  const demoProductId = '50000000-0000-4000-8000-000000000001';
  const promote = (token: string) => fetch(`${base}/api/manager/products/${demoProductId}/promote`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }
  });
  assert.equal((await promote('customerA')).status, 403, 'customers cannot enable a demo product for sale');
  assert.equal(promotedProducts.length, 0, 'unauthorized request never reaches the database promotion function');
  assert.equal((await promote('manager')).status, 200, 'managers can request the guarded promotion workflow');
  assert.deepEqual(promotedProducts, [{ actorId: tokenUsers.manager.id, productId: demoProductId }]);
});

test('readiness probes configured Hermes and n8n endpoints without exposing probe errors', async (context) => {
  let integrationStatus = 200;
  const integrationServer = createServer((_request, response) => {
    response.writeHead(integrationStatus, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: integrationStatus === 200 ? 'ok' : 'unavailable' }));
  });
  integrationServer.listen(0, '127.0.0.1');
  await once(integrationServer, 'listening');
  const integrationAddress = integrationServer.address() as AddressInfo;
  const gateway = {
    checkDatabaseReady: async () => undefined
  } as unknown as AuthGateway;
  const server = createApiServer({
    gateway, pricing: gateway,
    hermes: { async complete() { return { content: 'ok', model: 'test' }; } },
    hermesProbeUrl: `http://127.0.0.1:${integrationAddress.port}/healthz`,
    n8nWebhookBaseUrl: 'https://n8n.example.invalid/n8n', n8nWebhookSecret: 'test-only',
    n8nProbeUrl: `http://127.0.0.1:${integrationAddress.port}/healthz`
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  context.after(async () => {
    server.close(); integrationServer.close();
    await Promise.all([once(server, 'close'), once(integrationServer, 'close')]);
  });

  const ready = await fetch(`http://127.0.0.1:${address.port}/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), {
    status: 'ready', checks: { database: 'ok', hermes: 'reachable', n8n: 'reachable' }
  });

  integrationStatus = 503;
  const degraded = await fetch(`http://127.0.0.1:${address.port}/ready`);
  assert.equal(degraded.status, 503);
  const result = await degraded.json() as { status: string; checks: Record<string, string> };
  assert.equal(result.status, 'degraded');
  assert.equal(result.checks.hermes, 'unavailable');
  assert.equal(result.checks.n8n, 'unavailable');
});
