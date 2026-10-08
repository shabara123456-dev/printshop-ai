export type N8nWorkflow = {
  id: string;
  name: string;
  active: boolean;
  updated_at: string | null;
  tags: string[];
};

export type N8nExecution = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: 'success' | 'error' | 'running' | 'waiting' | 'unknown';
  started_at: string | null;
  stopped_at: string | null;
  mode: string | null;
};

export type N8nOperationsOverview = {
  status: 'connected' | 'not_configured' | 'unavailable';
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
};

type N8nPage<T> = { data?: unknown; nextCursor?: string | null };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 500 ? value : null;
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function workflowRow(value: unknown): N8nWorkflow | null {
  const row = object(value);
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.active !== 'boolean') return null;
  const tags = list<unknown>(row.tags).map((tag) => object(tag).name).filter((tag): tag is string => typeof tag === 'string').slice(0, 20);
  return { id: row.id.slice(0, 100), name: row.name.slice(0, 200), active: row.active, updated_at: nullableText(row.updatedAt), tags };
}

function executionRow(value: unknown, workflowNames: Map<string, string>): N8nExecution | null {
  const row = object(value);
  if (typeof row.id !== 'string') return null;
  const workflow = object(row.workflow);
  const workflowId = typeof row.workflowId === 'string' ? row.workflowId : typeof workflow.id === 'string' ? workflow.id : '';
  const rawStatus = typeof row.status === 'string' ? row.status.toLowerCase() : '';
  const status: N8nExecution['status'] = rawStatus === 'success' || rawStatus === 'error' || rawStatus === 'waiting' || rawStatus === 'running'
    ? rawStatus
    : row.finished === true
      ? rawStatus === 'canceled' || rawStatus === 'cancelled' ? 'error' : 'success'
      : row.waitTill ? 'waiting' : row.stoppedAt ? 'error' : 'running';
  return {
    id: row.id.slice(0, 100),
    workflow_id: workflowId.slice(0, 100),
    workflow_name: (typeof workflow.name === 'string' ? workflow.name : workflowNames.get(workflowId) ?? 'Workflow').slice(0, 200),
    status,
    started_at: nullableText(row.startedAt),
    stopped_at: nullableText(row.stoppedAt),
    mode: typeof row.mode === 'string' ? row.mode.slice(0, 80) : null
  };
}

/** Read-only, server-side view into n8n's Public API. Never returns node data or credentials. */
export class N8nManagementClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { baseUrl?: string; apiKey?: string; fetcher?: typeof fetch } = {}) {
    const configuredBase = options.baseUrl?.trim().replace(/\/+$/, '') ?? '';
    this.baseUrl = configuredBase && !/\/api\/v\d+$/.test(configuredBase) ? `${configuredBase}/api/v1` : configuredBase;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetcher = options.fetcher ?? fetch;
  }

  async overview(): Promise<N8nOperationsOverview> {
    if (!this.baseUrl || !this.apiKey) return { status: 'not_configured', workflows: [], executions: [] };

    let workflows: N8nWorkflow[];
    let executions: N8nExecution[];
    try {
      const [workflowResponse, executionResponse] = await Promise.all([
        this.get('/workflows?limit=100'),
        this.get('/executions?limit=25&includeData=false')
      ]);
      const workflowPage = object(workflowResponse) as N8nPage<N8nWorkflow>;
      const workflowRows = list<unknown>(workflowPage.data).map(workflowRow).filter((row): row is N8nWorkflow => row !== null);
      const names = new Map(workflowRows.map((workflow) => [workflow.id, workflow.name]));
      const executionPage = object(executionResponse) as N8nPage<N8nExecution>;
      workflows = workflowRows;
      executions = list<unknown>(executionPage.data).map((row) => executionRow(row, names)).filter((row): row is N8nExecution => row !== null);
    } catch {
      return { status: 'unavailable', workflows: [], executions: [] };
    }
    return { status: 'connected', workflows, executions };
  }

  private async get(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { accept: 'application/json', 'X-N8N-API-KEY': this.apiKey! },
        signal: AbortSignal.timeout(8_000)
      });
    } catch {
      throw new Error('n8n API request failed');
    }
    if (!response.ok) throw new Error(`n8n API returned HTTP ${response.status}`);
    try { return await response.json(); }
    catch { throw new Error('n8n API returned invalid JSON'); }
  }
}
