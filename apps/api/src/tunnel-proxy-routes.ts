import type { IncomingHttpHeaders } from 'node:http';

export type TunnelRoute = { port: number; path: string; kind: 'hermes' | 'n8n-webhook' | 'n8n-management' };

/** Keep the public quick tunnel limited to explicit app integrations. */
export function tunnelRouteFor(method: string | undefined, requestUrl: string | undefined): TunnelRoute | undefined {
  const url = new URL(requestUrl ?? '/', 'http://127.0.0.1');
  if (method === 'POST' && url.pathname === '/hermes/v1/chat/completions') {
    return { port: 8642, path: '/v1/chat/completions', kind: 'hermes' };
  }
  if (method === 'POST' && url.pathname === '/n8n/webhook/printshop-ai-events') {
    return { port: 5678, path: '/webhook/printshop-ai-events', kind: 'n8n-webhook' };
  }
  if (method !== 'GET' || !['/n8n/api/v1/workflows', '/n8n/api/v1/executions'].includes(url.pathname)) return undefined;

  const parameters = [...url.searchParams.entries()];
  if (url.pathname.endsWith('/workflows')) {
    if (parameters.length !== 1 || url.searchParams.get('limit') !== '100') return undefined;
    return { port: 5678, path: '/api/v1/workflows?limit=100', kind: 'n8n-management' };
  }
  if (parameters.length !== 2 || url.searchParams.get('limit') !== '25' || url.searchParams.get('includeData') !== 'false') return undefined;
  return { port: 5678, path: '/api/v1/executions?limit=25&includeData=false', kind: 'n8n-management' };
}

export function tunnelUpstreamHeaders(route: TunnelRoute, incoming: IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  const allow = route.kind === 'hermes'
    ? ['authorization', 'content-type', 'accept']
    : route.kind === 'n8n-webhook'
      ? ['content-type', 'x-printshop-integration-key', 'x-inkora-event-id']
      : ['accept', 'x-n8n-api-key'];
  for (const name of allow) {
    const value = incoming[name];
    if (typeof value === 'string') headers[name] = value;
  }
  return headers;
}
