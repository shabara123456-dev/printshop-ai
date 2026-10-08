import test from 'node:test';
import assert from 'node:assert/strict';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createPrintshopMcpServer } from '../../hermes/src/tools.ts';

const endpoint = 'https://inkora.example.test/mcp';

test('PrintShop MCP server supports stateless Web-standard HTTP discovery', async () => {
  const handle = async (request: Request) => {
    const server = createPrintshopMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 262_144 });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    await server.close();
    return response;
  };

  const initialized = await handle(new Request(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'inkora-test', version: '1.0.0' } } })
  }));
  assert.equal(initialized.status, 200);
  const initBody = await initialized.json() as { result?: { serverInfo?: { name?: string } } };
  assert.equal(initBody.result?.serverInfo?.name, 'printshop-ai');

  const toolsResponse = await handle(new Request(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-03-26' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  }));
  assert.equal(toolsResponse.status, 200);
  const toolBody = await toolsResponse.json() as { result?: { tools?: Array<{ name: string }> } };
  const names = toolBody.result?.tools?.map((tool) => tool.name) ?? [];
  assert.equal(names.length, 19);
  assert.ok(names.includes('calculate_quote'));
  assert.ok(names.includes('prepare_storefront_update'));
  assert.ok(names.includes('create_product_draft'));
  assert.ok(!names.includes('terminal') && !names.includes('browser'));
});

test('MCP manager reads dispatch into the configured API handler with server-only authentication', async () => {
  const requests: Array<{ url: string; key: string | null; body: unknown }> = [];
  const server = createPrintshopMcpServer({
    apiBase: 'https://inkora.example.test',
    managerToolKey: 'test-only-server-key',
    internalFetch: async (request) => {
      requests.push({
        url: request.url,
        key: request.headers.get('x-printshop-hermes-key'),
        body: await request.json()
      });
      return Response.json({ verticals: [{ vertical_key: 'printing', active: true }] });
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 262_144 });
  await server.connect(transport);
  const response = await transport.handleRequest(new Request(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_store_verticals', arguments: {} } })
  }));
  await server.close();

  assert.equal(response.status, 200);
  assert.deepEqual(requests, [{
    url: 'https://inkora.example.test/api/hermes/tools',
    key: 'test-only-server-key',
    body: { name: 'list_store_verticals', arguments: {} }
  }]);
  const body = await response.json() as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
  assert.equal(body.result?.isError, undefined);
  assert.match(body.result?.content?.[0]?.text ?? '', /printing/);
});
