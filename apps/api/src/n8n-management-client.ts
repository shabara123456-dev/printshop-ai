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
  issue?: 'unauthorized' | 'forbidden' | 'upstream_error' | 'network_error' | 'invalid_response';
  executionsIssue?: 'unauthorized' | 'forbidden' | 'upstream_error' | 'network_error' | 'invalid_response';
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

type N8nIssue = NonNullable<N8nOperationsOverview['issue']>;

class N8nManagementError extends Error {
  readonly issue: N8nIssue;
  constructor(issue: N8nIssue) { super(issue); this.issue = issue; }
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
  private readonly timeoutMs: number;

  constructor(options: { baseUrl?: string; apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number } = {}) {
    const configuredBase = options.baseUrl?.trim().replace(/\/+$/, '') ?? '';
    this.baseUrl = configuredBase && !/\/api\/v\d+$/.test(configuredBase) ? `${configuredBase}/api/v1` : configuredBase;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetcher = options.fetcher ?? fetch;
    // n8n on Render's free tier can take a while to wake from idle. Keep the
    // manager console from declaring a healthy cold start unavailable too soon.
    this.timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 55_000, 60_000));
  }

  async overview(): Promise<N8nOperationsOverview> {
    if (!this.baseUrl || !this.apiKey) return { status: 'not_configured', workflows: [], executions: [] };

    const [workflowResult, executionResult] = await Promise.allSettled([
      this.get('/workflows?limit=100'),
      this.get('/executions?limit=25&includeData=false')
    ]);
    if (workflowResult.status === 'rejected') {
      return { status: 'unavailable', workflows: [], executions: [], issue: this.issueFrom(workflowResult.reason) };
    }

    const workflowPage = object(workflowResult.value) as N8nPage<N8nWorkflow>;
    const workflowRows = list<unknown>(workflowPage.data).map(workflowRow).filter((row): row is N8nWorkflow => row !== null);
    const names = new Map(workflowRows.map((workflow) => [workflow.id, workflow.name]));

    if (executionResult.status === 'rejected') {
      // Workflow visibility remains useful when the API key is intentionally
      // limited to workflow:list and does not include execution:list.
      return { status: 'connected', workflows: workflowRows, executions: [], executionsIssue: this.issueFrom(executionResult.reason) };
    }
    const executionPage = object(executionResult.value) as N8nPage<N8nExecution>;
    const executions = list<unknown>(executionPage.data).map((row) => executionRow(row, names)).filter((row): row is N8nExecution => row !== null);
    return { status: 'connected', workflows: workflowRows, executions };
  }

  private async get(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { accept: 'application/json', 'X-N8N-API-KEY': this.apiKey! },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new N8nManagementError('network_error');
    }
    if (!response.ok) {
      const issue: N8nIssue = response.status === 401 ? 'unauthorized'
        : response.status === 403 ? 'forbidden'
          : 'upstream_error';
      throw new N8nManagementError(issue);
    }
    try { return await response.json(); }
    catch { throw new N8nManagementError('invalid_response'); }
  }

  private issueFrom(error: unknown): N8nIssue {
    return error instanceof N8nManagementError ? error.issue : 'upstream_error';
  }
}
