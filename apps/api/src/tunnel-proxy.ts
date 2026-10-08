import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createConnection } from 'node:net';
import { tunnelRouteFor, tunnelUpstreamHeaders } from './tunnel-proxy-routes.ts';

const port = Number(process.env.TUNNEL_PROXY_PORT ?? 3099);

function probeLocalPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (reachable: boolean) => { socket.destroy(); resolve(reachable); };
    socket.setTimeout(1_000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function sendError(response: ServerResponse, status: number, message: string) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error: message }));
}

const server = createServer((incoming, outgoing) => {
  const path = new URL(incoming.url ?? '/', 'http://127.0.0.1').pathname;
  if (incoming.method === 'GET' && (path === '/hermes/health' || path === '/hermes/healthz' || path === '/n8n/healthz')) {
    const servicePort = path.startsWith('/hermes/') ? 8642 : 5678;
    void probeLocalPort(servicePort).then((reachable) => {
      outgoing.writeHead(reachable ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      outgoing.end(JSON.stringify({ status: reachable ? 'ok' : 'unavailable' }));
    });
    return;
  }
  const route = tunnelRouteFor(incoming.method, incoming.url);
  if (!route) return sendError(outgoing, 404, 'Not found.');

  const headers = tunnelUpstreamHeaders(route, incoming.headers);

  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: route.port,
    path: route.path,
    method: incoming.method,
    headers: { ...headers, host: `127.0.0.1:${route.port}` },
    timeout: 55_000
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, {
      'content-type': response.headers['content-type'] ?? 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.pipe(outgoing);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => sendError(outgoing, 502, 'The local integration service is unavailable.'));
  incoming.on('aborted', () => upstream.destroy());
  if (incoming.method === 'POST') incoming.pipe(upstream);
  else upstream.end();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Restricted integration tunnel proxy listening on 127.0.0.1:${port}`);
});
