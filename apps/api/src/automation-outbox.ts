export type AutomationEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
};

export type AutomationOutboxGateway = {
  claimIntegrationEvents(limit: number): Promise<AutomationEvent[]>;
  completeIntegrationEvent(id: string): Promise<void>;
  retryIntegrationEvent(id: string, delaySeconds: number, error: string): Promise<void>;
};

type DrainOptions = {
  gateway: AutomationOutboxGateway;
  webhookBaseUrl?: string;
  secret?: string;
  managerEmail?: string;
  fetcher?: typeof fetch;
  logger?: (message: string) => void;
};

export async function drainAutomationOutbox(options: DrainOptions): Promise<number> {
  if (!options.webhookBaseUrl || !options.secret) return 0;
  const events = await options.gateway.claimIntegrationEvents(10);
  const fetcher = options.fetcher ?? fetch;
  const endpoint = `${options.webhookBaseUrl.replace(/\/$/, '')}/webhook/printshop-ai-events`;
  for (const event of events) {
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-printshop-integration-key': options.secret,
          'x-inkora-event-id': event.id
        },
        body: JSON.stringify({
          ...event.payload,
          ...(!event.payload.to_email && options.managerEmail ? { to_email: options.managerEmail } : {}),
          event_id: event.id,
          event_type: event.event_type
        }),
        // Render Free may take close to a minute to wake after idling. A
        // five-second deadline turns a healthy cold start into a dead event.
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) {
        await options.gateway.retryIntegrationEvent(event.id, retryDelay(event.attempt_count), `n8n returned HTTP ${response.status}`);
        continue;
      }
      await options.gateway.completeIntegrationEvent(event.id);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : 'delivery failed';
      try { await options.gateway.retryIntegrationEvent(event.id, retryDelay(event.attempt_count), message); }
      catch (retryError) {
        options.logger?.(`Could not reschedule automation event ${event.id}: ${safeError(retryError)}`);
        continue;
      }
      options.logger?.(`Automation event ${event.id} delivery failed and was rescheduled.`);
    }
  }
  return events.length;
}

function retryDelay(attempt: number): number {
  return Math.min(6 * 60 * 60, 5 * 2 ** Math.min(Math.max(attempt - 1, 0), 12));
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
}
