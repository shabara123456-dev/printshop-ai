import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

const port = Number(process.env.TUNNEL_PROXY_PORT ?? 3099);

function routeFor(request: IncomingMessage) {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (request.method === 'POST' && path === '/hermes/v1/chat/completions') {
    return { port: 8642, path: '/v1/chat/completions' };
  }
  if (request.method === 'POST' && path === '/n8n/webhook/printshop-ai-events') {
    return { port: 5678, path: '/webhook/printshop-ai-events' };
  }
  return undefined;
}

function sendError(response: ServerResponse, status: number, message: string) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error: message }));
}

const server = createServer((incoming, outgoing) => {
  const route = routeFor(incoming);
  if (!route) return sendError(outgoing, 404, 'Not found.');

  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: route.port,
    path: route.path,
    method: 'POST',
    headers: { ...incoming.headers, host: `127.0.0.1:${route.port}` },
    timeout: 55_000
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => sendError(outgoing, 502, 'The local integration service is unavailable.'));
  incoming.on('aborted', () => upstream.destroy());
  incoming.pipe(upstream);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Restricted integration tunnel proxy listening on 127.0.0.1:${port}`);
});
