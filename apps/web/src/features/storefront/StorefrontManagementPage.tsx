import { useEffect, useState } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent } from 'react';

export type StorefrontConfig = {
  store_name: string; tagline: string; hero_eyebrow: string; hero_title_en: string; hero_title_ar: string;
  hero_description_en: string; hero_description_ar: string; announcement_en: string; announcement_ar: string;
  accent_color: string; featured_product_ids: string[]; theme: 'midnight' | 'paper' | 'studio';
  background_color: string; surface_color: string; text_color: string; button_color: string;
  font_family: 'sans' | 'serif'; layout: 'wide' | 'editorial'; hero_image_path: string; logo_path: string;
  logo_placement: 'left' | 'center' | 'right'; cta_label_en: string; cta_label_ar: string; featured_categories: string[];
};

export type StorefrontRevision = { id: string; version: number; config: StorefrontConfig; status: 'draft' | 'published' | 'archived'; created_at: string; published_at?: string | null };

const emptyConfig: StorefrontConfig = {
  store_name: 'INKORA', tagline: 'Create. Print. Grow.', hero_eyebrow: 'MANSOURA PRINT STUDIO · INKORA',
  hero_title_en: 'Make your next idea tangible.', hero_title_ar: 'أفكارك، مطبوعة بعناية.',
  hero_description_en: 'Thoughtful print for ambitious brands. Configure a product and follow every production step from our Mansoura shop.',
  hero_description_ar: 'طباعة مخصصة، تصميم مدروس، ومتابعة واضحة من أول طلب حتى التسليم.',
  announcement_en: '', announcement_ar: '', accent_color: '#6f9fee', featured_product_ids: [], theme: 'midnight',
  background_color: '#101114', surface_color: '#191b20', text_color: '#f5f5f5', button_color: '#6f9fee',
  font_family: 'sans', layout: 'wide', hero_image_path: '', logo_path: '', logo_placement: 'left',
  cta_label_en: 'Explore the store', cta_label_ar: 'اكتشف المتجر', featured_categories: []
};

const themes: Record<StorefrontConfig['theme'], Pick<StorefrontConfig, 'background_color' | 'surface_color' | 'text_color' | 'accent_color' | 'button_color'>> = {
  midnight: { background_color: '#101114', surface_color: '#191b20', text_color: '#f5f5f5', accent_color: '#6f9fee', button_color: '#6f9fee' },
  paper: { background_color: '#f3f0e8', surface_color: '#fffdf8', text_color: '#21211f', accent_color: '#9a6549', button_color: '#252522' },
  studio: { background_color: '#171c1a', surface_color: '#222a26', text_color: '#f2f0e8', accent_color: '#9ab991', button_color: '#9ab991' }
};

function publicAsset(path: string): string {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  return path && base ? `${base}/storage/v1/object/public/storefront-assets/${path.split('/').map(encodeURIComponent).join('/')}` : '';
}

export function StorefrontManagementPage({ lang, published, revisions, products, categories, busy, onSaveDraft, onPublish, onUploadAsset }: {
  lang: 'en' | 'ar'; published: StorefrontRevision | null; revisions: StorefrontRevision[];
  products: Array<{ id: string; name: string; sku?: string; category?: string }>;
  categories: string[]; busy: boolean;
  onSaveDraft: (config: StorefrontConfig) => Promise<void>; onPublish: (revisionId: string) => Promise<void>;
  onUploadAsset: (file: File, area: 'storefront' | 'products') => Promise<string>;
}) {
  const ar = lang === 'ar';
  const [config, setConfig] = useState<StorefrontConfig>({ ...emptyConfig, ...(published?.config ?? {}) });
  const [uploading, setUploading] = useState(false);
  useEffect(() => { setConfig({ ...emptyConfig, ...(published?.config ?? {}) }); }, [published?.version]);
  const update = (key: keyof StorefrontConfig) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setConfig((current) => ({ ...current, [key]: event.target.value }));
  const save = (event: FormEvent) => { event.preventDefault(); void onSaveDraft(config); };
  const upload = async (key: 'hero_image_path' | 'logo_path', file?: File) => {
    if (!file) return;
    setUploading(true);
    try { const path = await onUploadAsset(file, 'storefront'); setConfig((current) => ({ ...current, [key]: path })); }
    finally { setUploading(false); }
  };
  const restore = (revision: StorefrontRevision) => { setConfig({ ...emptyConfig, ...revision.config }); void onSaveDraft({ ...emptyConfig, ...revision.config }); };
  const draftRows = revisions.filter((revision) => revision.status === 'draft');
  const previewStyle = {
    '--store-accent': config.accent_color, '--store-bg': config.background_color, '--store-surface': config.surface_color,
    '--store-text': config.text_color, '--store-button': config.button_color
  } as CSSProperties;

  return <div className="storefront-manager">
    <section className="card storefront-live-state"><div><span className="eyebrow">STOREFRONT / VERSIONED SETTINGS</span><h2>{ar ? 'تخصيص واجهة المتجر' : 'Storefront configuration'}</h2><p className="subtext">{ar ? 'احفظ التغييرات كمسودة، عاينها، ثم انشرها. يمكنك استعادة أي نسخة محفوظة.' : 'Save changes as a draft, preview them, then publish. Previous saved versions can be restored as a new draft.'}</p></div><div className="storefront-version"><small>{ar ? 'النسخة المنشورة' : 'Published version'}</small><strong>v{published?.version ?? 1}</strong></div></section>
    <div className="storefront-editor-grid">
      <form className="card form-card storefront-form" onSubmit={save}>
        <div className="eyebrow">STORE IDENTITY</div>
        <div className="form-row"><label>{ar ? 'اسم المتجر' : 'Store name'}<input maxLength={80} required value={config.store_name} onChange={update('store_name')} /></label><label>{ar ? 'الشعار النصي' : 'Tagline'}<input maxLength={120} required value={config.tagline} onChange={update('tagline')} /></label></div>
        <div className="form-row"><label>{ar ? 'صورة الشعار' : 'Logo image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={(event) => void upload('logo_path', event.currentTarget.files?.[0])} />{config.logo_path && <small>{config.logo_path}</small>}</label><label>{ar ? 'مكان الشعار' : 'Logo placement'}<select value={config.logo_placement} onChange={update('logo_placement')}><option value="left">{ar ? 'يسار' : 'Left'}</option><option value="center">{ar ? 'وسط' : 'Center'}</option><option value="right">{ar ? 'يمين' : 'Right'}</option></select></label></div>
        <div className="eyebrow">HERO / MAIN CONTENT</div>
        <label>{ar ? 'عنوان صغير' : 'Eyebrow'}<input maxLength={120} required value={config.hero_eyebrow} onChange={update('hero_eyebrow')} /></label>
        <div className="form-row"><label>Hero title · English<input maxLength={180} required value={config.hero_title_en} onChange={update('hero_title_en')} /></label><label>Hero title · العربية<input maxLength={180} required dir="rtl" value={config.hero_title_ar} onChange={update('hero_title_ar')} /></label></div>
        <div className="form-row"><label>Hero text · English<textarea maxLength={600} rows={4} required value={config.hero_description_en} onChange={update('hero_description_en')} /></label><label>Hero text · العربية<textarea maxLength={600} rows={4} required dir="rtl" value={config.hero_description_ar} onChange={update('hero_description_ar')} /></label></div>
        <div className="form-row"><label>{ar ? 'زر الدعوة' : 'Call to action · English'}<input maxLength={80} value={config.cta_label_en} onChange={update('cta_label_en')} /></label><label>Call to action · العربية<input maxLength={80} dir="rtl" value={config.cta_label_ar} onChange={update('cta_label_ar')} /></label></div>
        <label>{ar ? 'صورة الواجهة الرئيسية' : 'Hero image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={(event) => void upload('hero_image_path', event.currentTarget.files?.[0])} />{config.hero_image_path && <small>{config.hero_image_path}</small>}</label>
        <div className="form-row"><label>{ar ? 'إعلان المتجر · EN' : 'Announcement · English'}<input maxLength={240} value={config.announcement_en} onChange={update('announcement_en')} /></label><label>الإعلان · العربية<input maxLength={240} dir="rtl" value={config.announcement_ar} onChange={update('announcement_ar')} /></label></div>
        <div className="eyebrow">THEME / LAYOUT</div>
        <div className="form-row"><label>{ar ? 'القالب' : 'Theme'}<select value={config.theme} onChange={(event) => { const theme = event.target.value as StorefrontConfig['theme']; setConfig((current) => ({ ...current, theme, ...themes[theme] })); }}><option value="midnight">Midnight · Premium dark</option><option value="paper">Paper · Editorial light</option><option value="studio">Studio · Natural green</option></select></label><label>{ar ? 'التخطيط' : 'Layout'}<select value={config.layout} onChange={update('layout')}><option value="wide">{ar ? 'عريض' : 'Wide'}</option><option value="editorial">{ar ? 'تحريري' : 'Editorial'}</option></select></label></div>
        <div className="form-row"><label>{ar ? 'الخط' : 'Typography'}<select value={config.font_family} onChange={update('font_family')}><option value="sans">Sans</option><option value="serif">Serif</option></select></label><label>{ar ? 'لون الواجهة' : 'Accent'}<input type="color" value={config.accent_color} onChange={update('accent_color')} /></label></div>
        <div className="form-row storefront-color-row">{([['background_color', ar ? 'الخلفية' : 'Background'],['surface_color', ar ? 'البطاقات' : 'Cards'],['text_color', ar ? 'النص' : 'Text'],['button_color', ar ? 'الزر' : 'Button']] as const).map(([key,label]) => <label key={key}>{label}<input type="color" value={config[key]} onChange={update(key)} /></label>)}</div>
        <div className="form-row"><label>{ar ? 'المنتجات المميزة' : 'Featured products'}<select multiple value={config.featured_product_ids} onChange={(event) => setConfig((current) => ({ ...current, featured_product_ids: Array.from(event.currentTarget.selectedOptions, (option) => option.value) }))}>{products.map((product) => <option value={product.id} key={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}</select><small className="subtext">{ar ? 'حدد حتى 12 منتجاً.' : 'Choose up to 12 products.'}</small></label><label>{ar ? 'الفئات المميزة' : 'Featured categories'}<select multiple value={config.featured_categories} onChange={(event) => setConfig((current) => ({ ...current, featured_categories: Array.from(event.currentTarget.selectedOptions, (option) => option.value) }))}>{categories.map((category) => <option value={category} key={category}>{category.replaceAll('_',' ')}</option>)}</select></label></div>
        <button className="primary" disabled={busy || uploading}>{busy || uploading ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ المسودة' : 'Save draft')}</button>
      </form>
      <div className="storefront-preview-column">
        <article className={`storefront-preview theme-${config.theme} layout-${config.layout}`} style={previewStyle}>
          <span className="preview-label">{ar ? 'معاينة مباشرة' : 'LIVE PREVIEW'} · {config.store_name}</span>
          {config.logo_path && <img className={`storefront-preview-logo logo-${config.logo_placement}`} src={publicAsset(config.logo_path)} alt={config.store_name} />}
          {(ar ? config.announcement_ar : config.announcement_en) && <div className="preview-announcement">{ar ? config.announcement_ar : config.announcement_en}</div>}
          <div className="storefront-preview-hero">{config.hero_image_path && <img src={publicAsset(config.hero_image_path)} alt="Store hero preview" />}<div><span className="eyebrow">{config.hero_eyebrow}</span><h3>{ar ? config.hero_title_ar : config.hero_title_en}</h3><p>{ar ? config.hero_description_ar : config.hero_description_en}</p><button className="primary" type="button">{ar ? config.cta_label_ar : config.cta_label_en} ↘</button></div></div>
          <small>{ar ? 'المنتجات المميزة' : 'FEATURED'} · {config.featured_product_ids.length} · {config.featured_categories.length} {ar ? 'فئات' : 'categories'}</small>
        </article>
        <section className="card storefront-drafts"><div className="panel-heading"><div><span className="eyebrow">CHANGE HISTORY</span><h2>{ar ? 'مسودات قابلة للنشر' : 'Drafts awaiting publication'}</h2></div><span className="count">{draftRows.length.toString().padStart(2, '0')}</span></div>
          {draftRows.length === 0 ? <p className="subtext">{ar ? 'احفظ تغييراتك كمسودة لمراجعتها قبل النشر.' : 'Save a draft to review and publish changes to the public store.'}</p> : draftRows.map((revision) => <article className="storefront-revision" key={revision.id}><div><strong>Version {revision.version}</strong><small>{new Date(revision.created_at).toLocaleString(ar ? 'ar-EG' : 'en-EG')}</small></div><button className="primary compact" disabled={busy} onClick={() => void onPublish(revision.id)}>{ar ? 'نشر' : 'Publish'} ↗</button></article>)}
          {revisions.filter((revision) => revision.status === 'archived').slice(0, 5).map((revision) => <article className="storefront-revision" key={revision.id}><div><strong>{ar ? 'نسخة سابقة' : 'Archived'} · v{revision.version}</strong><small>{new Date(revision.created_at).toLocaleDateString(ar ? 'ar-EG' : 'en-EG')}</small></div><button className="secondary compact" disabled={busy} onClick={() => restore(revision)}>{ar ? 'استعادة كمسودة' : 'Restore as draft'}</button></article>)}
        </section>
      </div>
    </div>
  </div>;
}
