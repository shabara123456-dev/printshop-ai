import { useEffect, useState } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent } from 'react';

export type StorefrontConfig = {
  store_name: string;
  tagline: string;
  hero_eyebrow: string;
  hero_title_en: string;
  hero_title_ar: string;
  hero_description_en: string;
  hero_description_ar: string;
  announcement_en: string;
  announcement_ar: string;
  accent_color: string;
  featured_product_ids: string[];
};

export type StorefrontRevision = {
  id: string;
  version: number;
  config: StorefrontConfig;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  published_at?: string | null;
};

const emptyConfig: StorefrontConfig = {
  store_name: 'INKORA', tagline: 'Create. Print. Grow.', hero_eyebrow: 'MANSOURA PRINT STUDIO · INKORA',
  hero_title_en: 'Make your next idea tangible.', hero_title_ar: 'أفكارك، مطبوعة بعناية.',
  hero_description_en: 'Thoughtful print for ambitious brands. Configure a product and follow every production step from our Mansoura shop.',
  hero_description_ar: 'طباعة مخصصة، تصميم مدروس، ومتابعة واضحة من أول طلب حتى التسليم.',
  announcement_en: '', announcement_ar: '', accent_color: '#6f9fee', featured_product_ids: []
};

export function StorefrontManagementPage({
  lang, published, revisions, products, busy, onSaveDraft, onPublish
}: {
  lang: 'en' | 'ar';
  published: StorefrontRevision | null;
  revisions: StorefrontRevision[];
  products: Array<{ id: string; name: string; sku?: string }>;
  busy: boolean;
  onSaveDraft: (config: StorefrontConfig) => Promise<void>;
  onPublish: (revisionId: string) => Promise<void>;
}) {
  const ar = lang === 'ar';
  const [config, setConfig] = useState<StorefrontConfig>(published?.config ?? emptyConfig);
  useEffect(() => { setConfig(published?.config ?? emptyConfig); }, [published?.version]);
  const field = (key: keyof StorefrontConfig) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setConfig((current) => ({ ...current, [key]: event.target.value }));
  const save = (event: FormEvent) => { event.preventDefault(); void onSaveDraft(config); };
  const draftRows = revisions.filter((revision) => revision.status === 'draft');

  return <div className="storefront-manager">
    <section className="card storefront-live-state">
      <div><span className="eyebrow">STOREFRONT / VERSIONED SETTINGS</span><h2>{ar ? 'تخصيص واجهة المتجر' : 'Storefront configuration'}</h2>
        <p className="subtext">{ar ? 'أنشئ معاينة كمسودة ثم انشرها بعد المراجعة. لا يغيّر الذكاء الاصطناعي ملفات الموقع أو قواعد المنتجات والأسعار.' : 'Save a draft, review the preview, then publish it. This edits controlled content only, never source code, product rules, or prices.'}</p></div>
      <div className="storefront-version"><small>{ar ? 'النسخة المنشورة' : 'Published version'}</small><strong>v{published?.version ?? 1}</strong></div>
    </section>

    <div className="storefront-editor-grid">
      <form className="card form-card storefront-form" onSubmit={save}>
        <div className="eyebrow">{ar ? 'محتوى المتجر' : 'STORE CONTENT'}</div>
        <div className="form-row"><label>{ar ? 'اسم المتجر' : 'Store name'}<input maxLength={80} required value={config.store_name} onChange={field('store_name')} /></label><label>{ar ? 'الشعار النصي' : 'Tagline'}<input maxLength={120} required value={config.tagline} onChange={field('tagline')} /></label></div>
        <label>{ar ? 'العنوان الصغير' : 'Hero eyebrow'}<input maxLength={120} required value={config.hero_eyebrow} onChange={field('hero_eyebrow')} /></label>
        <div className="form-row"><label>Hero title · English<input maxLength={180} required value={config.hero_title_en} onChange={field('hero_title_en')} /></label><label>Hero title · العربية<input maxLength={180} required dir="rtl" value={config.hero_title_ar} onChange={field('hero_title_ar')} /></label></div>
        <div className="form-row"><label>Hero description · English<textarea maxLength={600} rows={4} required value={config.hero_description_en} onChange={field('hero_description_en')} /></label><label>Hero description · العربية<textarea maxLength={600} rows={4} required dir="rtl" value={config.hero_description_ar} onChange={field('hero_description_ar')} /></label></div>
        <div className="form-row"><label>{ar ? 'إعلان المتجر · English' : 'Store announcement · English'}<input maxLength={240} value={config.announcement_en} onChange={field('announcement_en')} /></label><label>الإعلان · العربية<input maxLength={240} dir="rtl" value={config.announcement_ar} onChange={field('announcement_ar')} /></label></div>
        <div className="form-row"><label>{ar ? 'لون الواجهة' : 'Accent color'}<span className="color-control"><input type="color" value={config.accent_color} onChange={field('accent_color')} /><input aria-label="Accent color hex" pattern="#[0-9a-fA-F]{6}" maxLength={7} required value={config.accent_color} onChange={field('accent_color')} /></span></label>
          <label>{ar ? 'المنتجات المميزة' : 'Featured products'}<select multiple value={config.featured_product_ids} onChange={(event) => setConfig((current) => ({ ...current, featured_product_ids: Array.from(event.currentTarget.selectedOptions, (option) => option.value) }))}>{products.map((product) => <option value={product.id} key={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}</select><small className="subtext">{ar ? 'اتركها فارغة لعرض جميع المنتجات بالترتيب الحالي.' : 'Choose up to 12. Leave empty to keep the current product order.'}</small></label></div>
        <button className="primary" disabled={busy}>{ar ? 'حفظ مسودة' : 'Save draft'}</button>
      </form>

      <div className="storefront-preview-column">
        <article className="storefront-preview" style={{ '--store-accent': config.accent_color } as CSSProperties & { '--store-accent': string }}>
          <span className="preview-label">{ar ? 'معاينة' : 'PREVIEW'} · {config.store_name}</span>
          {(ar ? config.announcement_ar : config.announcement_en) && <div className="preview-announcement">{ar ? config.announcement_ar : config.announcement_en}</div>}
          <span className="eyebrow">{config.hero_eyebrow}</span><h3>{ar ? config.hero_title_ar : config.hero_title_en}</h3><p>{ar ? config.hero_description_ar : config.hero_description_en}</p>
          <button className="primary" type="button">{ar ? 'اكتشف المتجر' : 'Explore the store'} ↘</button>
        </article>
        <section className="card storefront-drafts"><div className="panel-heading"><div><span className="eyebrow">CHANGE HISTORY</span><h2>{ar ? 'مسودات قابلة للنشر' : 'Drafts awaiting publication'}</h2></div><span className="count">{draftRows.length.toString().padStart(2, '0')}</span></div>
          {draftRows.length === 0 ? <p className="subtext">{ar ? 'احفظ تغييراتك كمسودة لمراجعتها قبل النشر.' : 'Save a draft to preview and publish changes to the public store.'}</p> : draftRows.map((revision) => <article className="storefront-revision" key={revision.id}><div><strong>Version {revision.version}</strong><small>{new Date(revision.created_at).toLocaleString(ar ? 'ar-EG' : 'en-EG')}</small></div><button className="primary compact" disabled={busy} onClick={() => void onPublish(revision.id)}>{ar ? 'نشر' : 'Publish'} ↗</button></article>)}
        </section>
      </div>
    </div>
  </div>;
}
