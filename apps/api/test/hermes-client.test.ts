import test from 'node:test';
import assert from 'node:assert/strict';
import { HermesRemoteHttpClient } from '../src/hermes-http-client.ts';

test('Hermes HTTP client uses the authenticated remote chat completions API', async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.HERMES_BASE_URL;
  const originalApiKey = process.env.HERMES_API_KEY;
  const originalModel = process.env.HERMES_MODEL;
  let requestUrl = '';
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;
  process.env.HERMES_BASE_URL = 'https://hermes.example.test/';
  process.env.HERMES_API_KEY = 'test-secret';
  process.env.HERMES_MODEL = 'hermes-agent';
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      model: 'hermes-agent',
      choices: [{ message: { role: 'assistant', content: 'Verified answer.' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
    });
  };

  try {
    const result = await new HermesRemoteHttpClient().complete([
      { role: 'system', content: 'Keep business facts verified.' },
      { role: 'user', content: 'Check stock.' }
    ]);
    assert.equal(requestUrl, 'https://hermes.example.test/v1/chat/completions');
    assert.equal(requestHeaders?.get('authorization'), 'Bearer test-secret');
    assert.equal(requestBody?.model, 'hermes-agent');
    assert.equal(requestBody?.stream, false);
    assert.equal(result.content, 'Verified answer.');
    assert.deepEqual(result.usage, { prompt_tokens: 12, completion_tokens: 4 });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.HERMES_BASE_URL;
    else process.env.HERMES_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.HERMES_API_KEY;
    else process.env.HERMES_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.HERMES_MODEL;
    else process.env.HERMES_MODEL = originalModel;
  }
});

test('Hermes HTTP client fails closed when the remote API key is missing', async () => {
  const originalBaseUrl = process.env.HERMES_BASE_URL;
  const originalApiKey = process.env.HERMES_API_KEY;
  process.env.HERMES_BASE_URL = 'https://hermes.example.test';
  delete process.env.HERMES_API_KEY;
  try {
    await assert.rejects(
      new HermesRemoteHttpClient().complete([{ role: 'user', content: 'Hello' }]),
      /HERMES_API_KEY is not configured/
    );
  } finally {
    if (originalBaseUrl === undefined) delete process.env.HERMES_BASE_URL;
    else process.env.HERMES_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.HERMES_API_KEY;
    else process.env.HERMES_API_KEY = originalApiKey;
  }
});
