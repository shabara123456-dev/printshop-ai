import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

type Workflow = {
  active: boolean;
  nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }>;
};

const workflows = JSON.parse(await readFile(new URL('../../../n8n/workflows/printshop-event-notifications.json', import.meta.url), 'utf8')) as Workflow[];
const workflow = workflows[0];
const code = String(workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code')?.parameters.jsCode ?? '');
const routeEvent = new Function('$json', code) as (payload: Record<string, unknown>) => Array<{ json: Record<string, unknown> }>;

test('n8n event workflow retains its protected inactive state until credentials are configured', () => {
  assert.equal(workflow.active, false);
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.webhook'));
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.emailSend'));
});

test('n8n router ignores routine inventory events and alerts manager on low stock', () => {
  const routine = routeEvent({ body: { type: 'inventory.updated', event_id: 'evt-1' } })[0].json;
  assert.equal(routine.should_send, false);
  const low = routeEvent({ body: {
    type: 'inventory.low_stock', event_id: 'evt-2', to_email: 'manager@example.test',
    name: 'Vinyl <roll>', available_stock: 2, unit: 'meter', reorder_point: 4, reorder_quantity: 20
  } })[0].json;
  assert.equal(low.should_send, true);
  assert.equal(low.to_email, 'manager@example.test');
  assert.match(String(low.html), /Vinyl &lt;roll&gt;/);
  assert.doesNotMatch(String(low.html), /<roll>/);
});

test('n8n router sends order-status updates to the saved customer address', () => {
  const result = routeEvent({ body: {
    type: 'order.status_changed', event_id: 'evt-3', to_email: 'customer@example.test',
    order_id: 'order-1', previous_status: 'confirmed', status: 'cancelled', total: 250
  } })[0].json;
  assert.equal(result.should_send, true);
  assert.equal(result.to_email, 'customer@example.test');
  assert.match(String(result.subject), /Order status updated/);
});

test('n8n router alerts the manager when a product variant sells out or is restocked', () => {
  const soldOut = routeEvent({ body: { type: 'product.out_of_stock', event_id: 'evt-4', to_email: 'manager@example.test', product_name: 'T-shirt', variant_sku: 'TS-BLK-M', available_quantity: 0 } })[0].json;
  assert.equal(soldOut.should_send, true);
  assert.equal(soldOut.to_email, 'manager@example.test');
  assert.match(String(soldOut.subject), /Out of stock/);
  const restocked = routeEvent({ body: { type: 'product.restocked', event_id: 'evt-5', to_email: 'manager@example.test', product_name: 'T-shirt', variant_sku: 'TS-BLK-M', available_quantity: 12 } })[0].json;
  assert.equal(restocked.should_send, true);
  assert.match(String(restocked.html), /Available 12/);
});
