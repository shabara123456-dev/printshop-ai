import test from 'node:test';
import assert from 'node:assert/strict';
import { drainAutomationOutbox, type AutomationEvent, type AutomationOutboxGateway } from '../src/automation-outbox.ts';

function gateway(events: AutomationEvent[]) {
  const completed: string[] = [];
  const retried: Array<{ id: string; delay: number; error: string }> = [];
  const implementation: AutomationOutboxGateway = {
    async claimIntegrationEvents(limit) { assert.equal(limit, 10); return events; },
    async completeIntegrationEvent(id) { completed.push(id); },
    async retryIntegrationEvent(id, delay, error) { retried.push({ id, delay, error }); }
  };
  return { implementation, completed, retried };
}

test('outbox sends events with stable idempotency headers and acknowledges accepted deliveries', async () => {
  const queue = gateway([{ id: 'evt-1', event_type: 'marketing.approved', payload: { type: 'marketing.approved', asset_id: 'asset-1' }, attempt_count: 1 }]);
  let request: RequestInit | undefined;
  const count = await drainAutomationOutbox({
    gateway: queue.implementation,
    webhookBaseUrl: 'https://automation.example/',
    secret: 'test-secret',
    managerEmail: 'owner@example.test',
    fetcher: async (_input, init) => { request = init; return new Response('', { status: 200 }); }
  });
  assert.equal(count, 1);
  assert.equal(queue.completed[0], 'evt-1');
  assert.deepEqual(queue.retried, []);
  assert.equal(new Headers(request?.headers).get('x-inkora-event-id'), 'evt-1');
  assert.deepEqual(JSON.parse(String(request?.body)), {
    type: 'marketing.approved', asset_id: 'asset-1', to_email: 'owner@example.test',
    event_id: 'evt-1', event_type: 'marketing.approved'
  });
});

test('outbox retries failed n8n deliveries with bounded exponential delay', async () => {
  const queue = gateway([{ id: 'evt-2', event_type: 'order.created', payload: { type: 'order.created' }, attempt_count: 4 }]);
  await drainAutomationOutbox({
    gateway: queue.implementation,
    webhookBaseUrl: 'https://automation.example',
    secret: 'test-secret',
    fetcher: async () => new Response('', { status: 503 })
  });
  assert.deepEqual(queue.completed, []);
  assert.deepEqual(queue.retried, [{ id: 'evt-2', delay: 40, error: 'n8n returned HTTP 503' }]);
});

test('outbox does not claim events when n8n credentials are absent', async () => {
  let claimed = false;
  const queue = gateway([]);
  const result = await drainAutomationOutbox({ gateway: { ...queue.implementation, async claimIntegrationEvents() { claimed = true; return []; } } });
  assert.equal(result, 0);
  assert.equal(claimed, false);
});
