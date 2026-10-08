/** Build a health endpoint under an integration's configured base URL. */
export function integrationHealthUrl(baseUrl: string | undefined, healthPath: string): string | undefined {
  const base = baseUrl?.trim().replace(/\/+$/, '');
  const path = healthPath.trim().replace(/^\/+/, '');
  if (!base || !path) return undefined;
  try {
    const url = new URL(`${base}/${path}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
