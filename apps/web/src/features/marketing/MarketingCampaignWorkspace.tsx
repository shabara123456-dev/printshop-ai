import { useRef, useState, type FormEvent } from 'react';

type Row = Record<string, unknown>;
type Product = { id: string; name: string; category: string };
type Edit = { caption: string; scheduledAt: string; platform: string; productId: string };
const platforms = ['instagram', 'facebook', 'linkedin', 'x', 'general'];
const localDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function MarketingCampaignWorkspace({ lang, campaigns, assets, products, busy, imageLinks, imageGeneratingId, onViewImage, onCampaign, onSavePost, onStatus, onImage, onUpload, onDuplicate, onDelete, onDeleteAll, onAddPost }: {
  lang: 'en' | 'ar'; campaigns: Row[]; assets: Row[]; products: Product[]; busy: boolean; imageLinks: Record<string, string>; imageGeneratingId: string | null;
  onViewImage: (path: string) => void; onCampaign: (id: string, update: Row) => Promise<void>;
  onSavePost: (asset: Row, edit: Edit) => Promise<void>; onStatus: (id: string, status: 'approved' | 'rejected') => Promise<void>;
  onImage: (id: string) => Promise<void>; onUpload: (id: string, file: File) => Promise<void>; onDuplicate: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void>; onDeleteAll: () => Promise<void>;
  onAddPost: (campaignId: string) => Promise<void>;
}) {
  const ar = lang === 'ar';
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [campaignEdits, setCampaignEdits] = useState<Record<string, { name: string; objective: string; audience: string; tone: string }>>({});
  const [campaignBusy, setCampaignBusy] = useState<string | null>(null);
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const patchEdit = (asset: Row, patch: Partial<Edit>) => {
    const id = String(asset.id);
    setEdits((current) => {
      const previous = current[id] ?? { caption: String(asset.caption ?? ''), scheduledAt: localDate(asset.scheduled_at), platform: String(asset.platform ?? 'general'), productId: typeof asset.product_id === 'string' ? asset.product_id : '' };
      return { ...current, [id]: { ...previous, ...patch } };
    });
  };
  const submitCampaign = (event: FormEvent, id: string) => {
    event.preventDefault();
    const value = campaignEdits[id];
    if (!value) return;
    setCampaignBusy(id);
    void onCampaign(id, value).finally(() => setCampaignBusy(null));
  };
  const countFor = (campaignId: string) => assets.filter((asset) => asset.campaign_id === campaignId);
  const countByPostStatus = (campaignAssets: Row[], statuses: string[]) => campaignAssets.filter((asset) => Array.isArray(asset.marketing_posts) && (asset.marketing_posts as Row[]).some((post) => statuses.includes(String(post.status)))).length;
  const scheduledCount = (campaignAssets: Row[]) => campaignAssets.filter((asset) => Boolean(asset.scheduled_at) && Array.isArray(asset.marketing_posts) && (asset.marketing_posts as Row[]).some((post) => ['approved','scheduled'].includes(String(post.status)))).length;
  const renderPost = (asset: Row) => {
    const id = String(asset.id);
    const editable = asset.order_id == null && ['pending_approval','approved'].includes(String(asset.status));
    const edit = edits[id] ?? { caption: String(asset.caption ?? ''), scheduledAt: localDate(asset.scheduled_at), platform: String(asset.platform ?? 'general'), productId: typeof asset.product_id === 'string' ? asset.product_id : '' };
    const imagePath = typeof asset.design_url === 'string' ? asset.design_url : '';
    const linkedProduct = products.find((product) => product.id === String(asset.product_id ?? ''));
    return <article className="card marketing-card" key={id}>
      <div className="marketing-card-top"><span className="eyebrow">{String(asset.platform ?? 'GENERAL').toUpperCase()}</span><span className={`status-pill status-${String(asset.status)}`}>{String(asset.status).replaceAll('_', ' ')}</span></div>
      <small>{linkedProduct?.name ?? (ar ? 'منشور تسويقي مستقل' : 'Independent marketing post')}</small>
      <p className="subtext">{String(asset.campaign_brief ?? '')}</p>
      {imagePath && (imageLinks[imagePath] ? <a href={imageLinks[imagePath]} target="_blank" rel="noreferrer"><img className="marketing-artwork" src={imageLinks[imagePath]} alt={ar ? 'صورة الحملة' : 'Campaign image'} /></a> : <button className="text-button" onClick={() => onViewImage(imagePath)}>{ar ? 'عرض الصورة' : 'View image'}</button>)}
      {editable ? <>
        <label>{ar ? 'النص والوسوم' : 'Caption and hashtags'}<textarea rows={5} maxLength={4000} value={edit.caption} onChange={(event) => patchEdit(asset, { caption: event.target.value })} /></label>
        <div className="form-row"><label>{ar ? 'المنصة' : 'Platform'}<select value={edit.platform} onChange={(event) => patchEdit(asset, { platform: event.target.value })}>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>{ar ? 'المنتج' : 'Promoted product'}<select value={edit.productId} onChange={(event) => patchEdit(asset, { productId: event.target.value })}><option value="">{ar ? 'بدون منتج' : 'No product'}</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label></div>
        <label>{ar ? 'موعد النشر بتوقيت القاهرة' : 'Scheduled date and time · Cairo'}<input type="datetime-local" value={edit.scheduledAt} onChange={(event) => patchEdit(asset, { scheduledAt: event.target.value })} /></label>
        <div className="marketing-actions"><button className="primary" disabled={busy || !edit.caption.trim()} onClick={() => void onSavePost(asset, edit)}>{ar ? 'حفظ التعديلات والموعد' : 'Save edits & schedule'}</button>{asset.status === 'pending_approval' && <button className="secondary compact" disabled={busy} onClick={() => void onStatus(id, 'approved')}>{ar ? 'اعتماد وجدولة' : 'Approve & schedule'}</button>}<button className="text-button" disabled={busy} onClick={() => void onStatus(id, 'rejected')}>{ar ? 'رفض المنشور' : 'Reject post'}</button></div>
      </> : <><p>{String(asset.caption ?? '')}</p>{asset.scheduled_at && <small>{ar ? 'الموعد: ' : 'Scheduled: '}{new Date(String(asset.scheduled_at)).toLocaleString(ar ? 'ar-EG' : 'en-EG', { timeZone: 'Africa/Cairo' })}</small>}</>}
      <div className="marketing-actions post-tools">
        <button className="secondary compact" disabled={busy || asset.status !== 'pending_approval'} onClick={() => void onImage(id)}>{imageGeneratingId === id ? (ar ? 'جارٍ إنشاء الصورة…' : 'Generating image…') : asset.image_status === 'generated' ? (ar ? 'تغيير الصورة' : 'Regenerate image') : asset.image_status === 'failed' ? (ar ? 'إعادة المحاولة للصورة' : 'Retry image') : (ar ? 'إنشاء صورة' : 'Generate image')}</button>
        <input ref={(element) => { uploadRefs.current[id] = element; }} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void onUpload(id, file); }} />
        <button className="secondary compact" disabled={busy || asset.status !== 'pending_approval'} onClick={() => uploadRefs.current[id]?.click()}>{ar ? 'رفع صورة' : 'Upload photo'}</button>
        <button className="secondary compact" disabled={busy} onClick={() => void onDuplicate(id)}>{ar ? 'نسخ المنشور' : 'Duplicate post'}</button>
        {asset.order_id == null && ['draft','pending_approval','rejected'].includes(String(asset.status)) && <button className="text-button" disabled={busy} onClick={() => void onDelete(id)}>{ar ? 'حذف المنشور' : 'Delete post'}</button>}
      </div>
      {imageGeneratingId === id && <small className="subtext">{ar ? 'التوليد المجاني يستخدم قائمة انتظار مشتركة. اترك هذه الصفحة مفتوحة حتى تظهر النتيجة أو رسالة الخطأ.' : 'Free generation uses a shared queue. Keep this page open until the image or an error appears.'}</small>}
      {asset.image_status === 'failed' && <small className="alert error">{ar ? 'تعذر إنشاء الصورة: ' : 'Image generation failed: '}{String(asset.image_error ?? 'unknown')}</small>}
      {Array.isArray(asset.marketing_posts) && <small>{ar ? 'حالة النشر' : 'Publishing'}: {String((asset.marketing_posts[0] as Row | undefined)?.status ?? 'draft').replaceAll('_', ' ')}</small>}
    </article>;
  };
  const publishedState = (campaignAssets: Row[], status: string) => campaignAssets.filter((asset) => Array.isArray(asset.marketing_posts) && (asset.marketing_posts as Row[]).some((post) => post.status === status)).length;
  return <div className="campaign-workspace-stack">
    <section className="card campaign-posts-panel">
      <div className="panel-heading"><div><span className="eyebrow">MARKETING / CAMPAIGNS</span><h2>{ar ? 'الحملات والمنشورات' : 'Campaigns and posts'}</h2><p className="subtext">{ar ? 'كل حملة تحتوي منشورات مستقلة قابلة للتعديل. النشر الفعلي يحتاج ربط الحسابات الاجتماعية.' : 'Each campaign contains independently editable posts. Actual publishing requires connected social accounts.'}</p></div><div className="campaign-posts-actions"><span className="count">{campaigns.length}</span>{assets.some((asset) => asset.order_id == null && ['draft','pending_approval'].includes(String(asset.status))) && <button className="secondary compact" disabled={busy} onClick={() => void onDeleteAll()}>{ar ? 'حذف المسودات القديمة' : 'Clear old drafts'}</button>}</div></div>
      {!campaigns.length && !assets.length && <div className="empty">{ar ? 'لا توجد حملات بعد.' : 'No campaigns yet.'}</div>}
      {campaigns.map((campaign) => {
        const id = String(campaign.id); const rows = countFor(id); const draft = campaignEdits[id] ?? { name: String(campaign.name ?? ''), objective: String(campaign.objective ?? ''), audience: String(campaign.target_audience ?? ''), tone: String(campaign.tone ?? '') };
        return <section className="campaign-group" key={id}>
          <div className="campaign-group-head"><div><span className="eyebrow">{String(campaign.month ?? '').slice(0, 7)} · {String(campaign.status ?? 'draft').toUpperCase()}</span><h3>{String(campaign.name ?? '')}</h3><small>{rows.length} {ar ? 'إجمالي' : 'total'} · {rows.filter((row) => row.status === 'pending_approval').length} {ar ? 'مسودات' : 'drafts'} · {scheduledCount(rows)} {ar ? 'مجدول' : 'scheduled'} · {publishedState(rows, 'published')} {ar ? 'منشور' : 'published'} · {countByPostStatus(rows, ['failed'])} {ar ? 'فشل' : 'failed'}</small></div><div className="marketing-actions"><button className="secondary compact" disabled={busy || Number(campaign.requested_posts ?? rows.length) >= 20} onClick={() => void onAddPost(id)}>{ar ? 'إضافة منشور' : 'Add post'}</button><button className="secondary compact" disabled={busy} onClick={() => void onCampaign(id, { status: campaign.status === 'paused' ? 'active' : 'paused' })}>{campaign.status === 'paused' ? (ar ? 'استئناف' : 'Resume') : (ar ? 'إيقاف مؤقت' : 'Pause')}</button></div></div>
          <details className="campaign-details"><summary>{ar ? 'تعديل بيانات الحملة' : 'Edit campaign details'}</summary><form className="form-card" onSubmit={(event) => submitCampaign(event, id)}><label>{ar ? 'الاسم' : 'Campaign name'}<input maxLength={160} value={draft.name} onChange={(event) => setCampaignEdits((current) => ({ ...current, [id]: { ...draft, name: event.target.value } }))} required /></label><label>{ar ? 'الهدف' : 'Objective'}<textarea value={draft.objective} onChange={(event) => setCampaignEdits((current) => ({ ...current, [id]: { ...draft, objective: event.target.value } }))} /></label><label>{ar ? 'الجمهور' : 'Audience'}<input value={draft.audience} onChange={(event) => setCampaignEdits((current) => ({ ...current, [id]: { ...draft, audience: event.target.value } }))} /></label><label>{ar ? 'النبرة' : 'Tone'}<input value={draft.tone} onChange={(event) => setCampaignEdits((current) => ({ ...current, [id]: { ...draft, tone: event.target.value } }))} /></label><button className="secondary compact" disabled={busy || campaignBusy === id}>{ar ? 'حفظ تفاصيل الحملة' : 'Save campaign details'}</button></form></details>
          <div className="marketing-assets">{rows.length ? rows.map(renderPost) : <div className="empty">{ar ? 'لا توجد منشورات في هذه الحملة.' : 'No posts in this campaign.'}</div>}</div>
        </section>;
      })}
      {assets.some((asset) => !asset.campaign_id) && <section className="campaign-group"><h3>{ar ? 'منشورات أخرى' : 'Other posts'}</h3><div className="marketing-assets">{assets.filter((asset) => !asset.campaign_id).map(renderPost)}</div></section>}
    </section>
  </div>;
}
