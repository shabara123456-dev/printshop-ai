import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationHealthUrl } from '../src/integration-probes.ts';

test('integration health URLs stay under the configured service path', () => {
  assert.equal(integrationHealthUrl('https://example.test/hermes/', 'health'), 'https://example.test/hermes/health');
  assert.equal(integrationHealthUrl('http://127.0.0.1:8642', '/health'), 'http://127.0.0.1:8642/health');
  assert.equal(integrationHealthUrl('http://localhost:5678', 'healthz'), 'http://localhost:5678/healthz');
});

test('integration health URL construction rejects absent and unsafe URLs', () => {
  assert.equal(integrationHealthUrl(undefined, 'health'), undefined);
  assert.equal(integrationHealthUrl('ftp://example.test', 'health'), undefined);
  assert.equal(integrationHealthUrl('http://example.test', '  '), undefined);
});
