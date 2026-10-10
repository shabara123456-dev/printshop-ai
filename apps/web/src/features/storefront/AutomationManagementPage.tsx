export type AutomationEvent = {
  id: string; event_type: string; status: 'pending'|'processing'|'delivered'|'dead';
  attempt_count: number; available_at: string; delivered_at?: string | null;
  created_at: string; last_error?: string | null;
};

export type N8nOverview = {
  status: 'connected' | 'not_configured' | 'unavailable';
  workflows: Array<{ id: string; name: string; active: boolean; updated_at: string | null; tags: string[] }>;
  executions: Array<{ id: string; workflow_id: string; workflow_name: string; status: 'success'|'error'|'running'|'waiting'|'unknown'; started_at: string | null; stopped_at: string | null; mode: string | null }>;
  issue?: 'unauthorized' | 'forbidden' | 'upstream_error' | 'network_error' | 'invalid_response';
  executionsIssue?: 'unauthorized' | 'forbidden' | 'upstream_error' | 'network_error' | 'invalid_response';
};

const emptyOverview: N8nOverview = { status: 'not_configured', workflows: [], executions: [] };

export function AutomationManagementPage({ lang, events, overview = emptyOverview, busy, onRetry, onDelete }: {
  lang: 'en'|'ar'; events: AutomationEvent[]; overview?: N8nOverview; busy: boolean; onRetry: (id: string) => void; onDelete: (id: string) => void;
}) {
  const ar = lang === 'ar';
  const issueMessages = {
    unauthorized: ar ? 'رفض n8n المفتاح المحفوظ (401). المفتاح لا يطابق مفتاحاً نشطاً لهذا الحساب.' : 'n8n rejected the saved API key (401). It does not match an active key for this instance.',
    forbidden: ar ? 'المفتاح مقبول، لكن صلاحياته لا تسمح بهذا الطلب (403). راجع نطاقات قراءة واجهة n8n API.' : 'The key was accepted, but its scopes do not allow this request (403). Check the n8n API read scopes.',
    upstream_error: ar ? 'استجاب n8n بخطأ. تحقق من الخدمة ومسارات واجهة API.' : 'n8n returned an upstream error. Check the service and API endpoint.',
    network_error: ar ? 'تعذر الاتصال بخدمة n8n.' : 'Could not reach the n8n service.',
    invalid_response: ar ? 'أعاد n8n استجابة غير صالحة.' : 'n8n returned an invalid response.'
  } as const;
  const runtimeMessage = overview.status === 'connected'
    ? ar ? 'حالة مباشرة من واجهة n8n؛ البيانات المعروضة لا تتضمن محتوى التنفيذ أو بيانات الاعتماد.' : 'Live n8n status. Execution payloads and credentials are excluded.'
    : overview.status === 'unavailable'
      ? overview.issue ? issueMessages[overview.issue] : ar ? 'تعذر الوصول إلى واجهة n8n. تحقق من عنوان API والمفتاح واتصال الخادم.' : 'The n8n API is unavailable. Check its API URL, key, and server connectivity.'
      : ar ? 'حالة سير العمل المباشرة غير مهيأة. أضف N8N_API_BASE_URL و N8N_API_KEY إلى أسرار الخادم.' : 'Live workflow status is not configured. Add N8N_API_BASE_URL and N8N_API_KEY as server secrets.';
  return <section className="automation-console">
    <div className="card automation-intro"><div><span className="eyebrow">INKORA / N8N</span><h2>{ar ? 'عمليات الأتمتة' : 'Automation operations'}</h2><p>{ar ? 'تُظهر هذه المساحة حالة n8n الحية وتسليمات أحداث INKORA. تظل قاعدة بيانات INKORA المصدر المعتمد لحالة العمل.' : 'This workspace shows live n8n status and INKORA event delivery. INKORA remains the source of truth for business state.'}</p></div><div className="automation-count"><strong>{events.length}</strong><small>{ar ? 'أحداث حديثة' : 'recent events'}</small></div></div>

    <section className="card automation-events automation-runtime">
      <div className="panel-heading"><div><span className="eyebrow">N8N / RUNTIME</span><h2>{ar ? 'سير العمل والتنفيذات' : 'Workflows and executions'}</h2></div><span className={`status-pill status-${overview.status}`}>{overview.status.replace('_', ' ')}</span></div>
      <p className="subtext automation-runtime-message">{runtimeMessage}</p>
      {overview.status === 'connected' && <>
        <div className="automation-runtime-counts"><span>{ar ? 'نشط' : 'Active'} <strong>{overview.workflows.filter((workflow) => workflow.active).length}</strong></span><span>{ar ? 'متوقف' : 'Inactive'} <strong>{overview.workflows.filter((workflow) => !workflow.active).length}</strong></span><span>{ar ? 'عمليات حديثة' : 'Recent runs'} <strong>{overview.executions.length}</strong></span></div>
        {overview.executionsIssue && <p className="subtext automation-runtime-message">{ar ? `تعذر تحميل التنفيذات: ${issueMessages[overview.executionsIssue]}` : `Executions could not be loaded: ${issueMessages[overview.executionsIssue]}`}</p>}
        <h3>{ar ? 'سير العمل' : 'Workflows'}</h3>
        {overview.workflows.length === 0 ? <p className="subtext">{ar ? 'لم يُرجع n8n أي سير عمل.' : 'n8n returned no workflows.'}</p> : <div className="table-wrap"><table className="automation-runtime-table"><thead><tr><th>{ar?'سير العمل':'Workflow'}</th><th>{ar?'الحالة':'Status'}</th><th>{ar?'آخر تحديث':'Updated'}</th></tr></thead><tbody>{overview.workflows.map((workflow) => <tr key={workflow.id}><td><strong>{workflow.name}</strong><small className="automation-event-id">{workflow.tags.join(' · ') || workflow.id}</small></td><td><span className={`status-pill ${workflow.active ? 'status-delivered' : 'status-pending'}`}>{workflow.active ? (ar?'نشط':'Active') : (ar?'متوقف':'Inactive')}</span></td><td>{workflow.updated_at ? new Date(workflow.updated_at).toLocaleString(ar?'ar-EG':'en-EG') : '—'}</td></tr>)}</tbody></table></div>}
        <h3>{ar ? 'آخر التنفيذات' : 'Recent executions'}</h3>
        {overview.executions.length === 0 ? <p className="subtext">{ar ? 'لا توجد تنفيذات حديثة.' : 'No recent executions.'}</p> : <div className="table-wrap"><table className="automation-runtime-table"><thead><tr><th>{ar?'سير العمل':'Workflow'}</th><th>{ar?'النتيجة':'Result'}</th><th>{ar?'بدأ في':'Started'}</th><th>{ar?'المدة':'Duration'}</th></tr></thead><tbody>{overview.executions.map((execution) => <tr key={execution.id}><td><strong>{execution.workflow_name}</strong><small className="automation-event-id">#{execution.id} · {execution.mode || '—'}</small></td><td><span className={`status-pill status-${execution.status}`}>{execution.status}</span></td><td>{execution.started_at ? new Date(execution.started_at).toLocaleString(ar?'ar-EG':'en-EG') : '—'}</td><td>{execution.started_at && execution.stopped_at ? `${Math.max(0, Math.round((Date.parse(execution.stopped_at)-Date.parse(execution.started_at))/1000))}s` : execution.status === 'running' ? (ar?'قيد التشغيل':'Running') : '—'}</td></tr>)}</tbody></table></div>}
      </>}
    </section>

    <div className="automation-status-grid">{(['pending','processing','delivered','dead'] as const).map((status) => <article className="card automation-status-card" key={status}><small>{status.replace('_',' ').toUpperCase()}</small><strong>{events.filter((event) => event.status === status).length.toString().padStart(2,'0')}</strong></article>)}</div>
    <section className="card automation-events"><div className="panel-heading"><div><span className="eyebrow">INKORA OUTBOX / LAST 100</span><h2>{ar ? 'تسليمات الأحداث' : 'Event deliveries'}</h2></div></div>
      {events.length === 0 ? <p className="subtext">{ar ? 'لا توجد أحداث مسجلة حتى الآن.' : 'No automation events have been recorded yet.'}</p> : <div className="table-wrap"><table><thead><tr><th>{ar?'الحدث':'Event'}</th><th>{ar?'الحالة':'Status'}</th><th>{ar?'المحاولات':'Attempts'}</th><th>{ar?'أُنشئ':'Created'}</th><th>{ar?'الخطأ':'Failure'}</th><th>{ar?'إجراء':'Action'}</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><strong>{event.event_type}</strong><small className="automation-event-id">{event.id}</small></td><td><span className={`status-pill status-${event.status}`}>{event.status}</span></td><td>{event.attempt_count}</td><td>{new Date(event.created_at).toLocaleString(ar?'ar-EG':'en-EG')}</td><td className="automation-error">{event.last_error || '—'}</td><td className="marketing-actions">{event.status === 'dead' && <button className="secondary compact" disabled={busy} onClick={() => onRetry(event.id)}>{ar?'إعادة المحاولة':'Retry'}</button>}{['dead','pending'].includes(event.status) ? <button className="text-button" disabled={busy} onClick={() => onDelete(event.id)}>{ar?'حذف':'Delete'}</button> : '—'}</td></tr>)}</tbody></table></div>}
    </section>
    <p className="subtext automation-footnote">{ar ? 'إعادة المحاولة تعيد الحدث إلى قائمة الانتظار؛ النتيجة تعتمد على جاهزية n8n والخدمة الخارجية المرتبطة به.' : 'Retry puts the event back in the queue. Delivery still depends on n8n and its configured downstream services.'}</p>
  </section>;
}
