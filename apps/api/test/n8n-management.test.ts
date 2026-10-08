import test from 'node:test';
import assert from 'node:assert/strict';
import { N8nManagementClient } from '../src/n8n-management-client.ts';

test('n8n management view reports unconfigured without making a request', async () => {
  let called = false;
  const client = new N8nManagementClient({ fetcher: async () => { called = true; throw new Error('unexpected'); } });
  assert.deepEqual(await client.overview(), { status: 'not_configured', workflows: [], executions: [] });
  assert.equal(called, false);
});

test('n8n management accepts the configured n8n host and adds its public API path', async () => {
  const requests: string[] = [];
  const client = new N8nManagementClient({
    baseUrl: 'https://n8n.example.test/', apiKey: 'test-key',
    fetcher: async (input) => { requests.push(String(input)); return new Response(JSON.stringify({ data: [] }), { status: 200 }); }
  });
  assert.equal((await client.overview()).status, 'connected');
  assert.deepEqual(requests, [
    'https://n8n.example.test/api/v1/workflows?limit=100',
    'https://n8n.example.test/api/v1/executions?limit=25&includeData=false'
  ]);
});

test('n8n management view lists workflow state and sanitized execution metadata', async () => {
  const requests: Array<{ url: string; apiKey: string | null }> = [];
  const client = new N8nManagementClient({
    baseUrl: 'https://n8n.example.test/api/v1/',
    apiKey: 'n8n-test-secret',
    fetcher: async (input, init) => {
      requests.push({ url: String(input), apiKey: new Headers(init?.headers).get('X-N8N-API-KEY') });
      const response = requests.length === 1
        ? { data: [{ id: 'wf-1', name: 'Daily Ops', active: true, updatedAt: '2026-10-08T08:00:00Z', tags: [{ name: 'ops' }], nodes: [{ credentials: { smtp: 'private' } }] }] }
        : { data: [{ id: 'exec-1', workflowId: 'wf-1', status: 'success', finished: true, startedAt: '2026-10-08T08:00:00Z', stoppedAt: '2026-10-08T08:00:03Z', mode: 'trigger', data: { secret: 'private' } }] };
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const overview = await client.overview();
  assert.equal(overview.status, 'connected');
  assert.deepEqual(requests.map((request) => request.url), [
    'https://n8n.example.test/api/v1/workflows?limit=100',
    'https://n8n.example.test/api/v1/executions?limit=25&includeData=false'
  ]);
  assert.ok(requests.every((request) => request.apiKey === 'n8n-test-secret'));
  assert.deepEqual(overview.workflows, [{ id: 'wf-1', name: 'Daily Ops', active: true, updated_at: '2026-10-08T08:00:00Z', tags: ['ops'] }]);
  assert.deepEqual(overview.executions, [{ id: 'exec-1', workflow_id: 'wf-1', workflow_name: 'Daily Ops', status: 'success', started_at: '2026-10-08T08:00:00Z', stopped_at: '2026-10-08T08:00:03Z', mode: 'trigger' }]);
  assert.doesNotMatch(JSON.stringify(overview), /private|n8n-test-secret/);
});

test('n8n API errors fail closed with no upstream details', async () => {
  const client = new N8nManagementClient({
    baseUrl: 'https://n8n.example.test/api/v1', apiKey: 'private-key',
    fetcher: async () => new Response('authorization secret', { status: 401 })
  });
  assert.deepEqual(await client.overview(), { status: 'unavailable', workflows: [], executions: [] });
});
