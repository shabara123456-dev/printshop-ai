import test from 'node:test';
import assert from 'node:assert/strict';
import { tunnelRouteFor, tunnelUpstreamHeaders } from '../src/tunnel-proxy-routes.ts';

test('tunnel proxy exposes only approved n8n read endpoints and bounded queries', () => {
  assert.deepEqual(tunnelRouteFor('GET', '/n8n/api/v1/workflows?limit=100'), {
    port: 5678, path: '/api/v1/workflows?limit=100', kind: 'n8n-management'
  });
  assert.deepEqual(tunnelRouteFor('GET', '/n8n/api/v1/executions?limit=25&includeData=false'), {
    port: 5678, path: '/api/v1/executions?limit=25&includeData=false', kind: 'n8n-management'
  });
  assert.equal(tunnelRouteFor('GET', '/n8n/api/v1/workflows?limit=500'), undefined);
  assert.equal(tunnelRouteFor('GET', '/n8n/api/v1/executions?limit=25&includeData=true'), undefined);
  assert.equal(tunnelRouteFor('POST', '/n8n/api/v1/workflows'), undefined);
  assert.equal(tunnelRouteFor('GET', '/n8n/api/v1/credentials'), undefined);
});

test('tunnel proxy forwards only route-specific headers and strips browser cookies', () => {
  const route = tunnelRouteFor('GET', '/n8n/api/v1/workflows?limit=100')!;
  assert.deepEqual(tunnelUpstreamHeaders(route, {
    accept: 'application/json',
    'x-n8n-api-key': 'read-only-key',
    cookie: 'browser-session',
    authorization: 'Bearer browser-token',
    origin: 'https://example.test'
  }), { accept: 'application/json', 'x-n8n-api-key': 'read-only-key' });
});
