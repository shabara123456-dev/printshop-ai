import { useState, type FormEvent } from 'react';

type Language = 'en' | 'ar';
type CatalogProduct = { id: string; name: string; category: string };
export type CampaignRequest = {
  name: string; month: string; post_count: number; platforms: string[]; product_ids: string[];
  objective: string; audience: string; frequency: string; preferred_times: string[]; language: 'en' | 'ar'; tone: string;
};

const platformOptions = ['instagram', 'facebook', 'linkedin', 'x'];

export function MarketingCampaignBuilder({ lang, products, busy, onGenerate }: { lang: Language; products: CatalogProduct[]; busy: boolean; onGenerate: (request: CampaignRequest) => Promise<void> }) {
  const ar = lang === 'ar';
  const today = new Date();
  const [name, setName] = useState('');
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [count, setCount] = useState(4);
  const [platforms, setPlatforms] = useState<string[]>(['instagram']);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [objective, setObjective] = useState('Build brand awareness and generate product enquiries.');
  const [audience, setAudience] = useState('Small businesses and local organizations in Mansoura.');
  const [frequency, setFrequency] = useState('weekly');
  const [times, setTimes] = useState('10:00');
  const [language, setLanguage] = useState<'en' | 'ar'>(ar ? 'ar' : 'en');
  const [tone, setTone] = useState('Warm, clear, professional, locally relevant.');
  const togglePlatform = (platform: string) => setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const preferredTimes = times.split(',').map((item) => item.trim()).filter(Boolean);
    void onGenerate({ name: name.trim(), month, post_count: count, platforms, product_ids: productIds, objective: objective.trim(), audience: audience.trim(), frequency, preferred_times: preferredTimes, language, tone: tone.trim() });
  };
  return <form className="card form-card marketing-plan-settings" onSubmit={submit}>
    <div className="eyebrow">MARKETING / CAMPAIGN BUILDER</div>
    <h2>{ar ? 'إنشاء حملة تسويقية' : 'Generate a campaign'}</h2>
    <p className="subtext">{ar ? 'أنشئ منشورات فردية قابلة للتعديل. اعتماد المنشور لا ينشره على منصة اجتماعية.' : 'Create individual editable post drafts. Approval does not publish to social platforms.'}</p>
    <div className="form-row"><label>{ar ? 'اسم الحملة' : 'Campaign name'}<input maxLength={160} value={name} onChange={(event) => setName(event.target.value)} required /></label><label>{ar ? 'الشهر' : 'Month'}<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} required /></label></div>
    <div className="form-row"><label>{ar ? 'عدد المنشورات' : 'Number of posts'}<input type="number" min="1" max="20" value={count} onChange={(event) => setCount(Number(event.target.value))} required /></label><label>{ar ? 'تكرار النشر' : 'Posting frequency'}<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="daily">{ar ? 'يومي' : 'Daily'}</option><option value="weekly">{ar ? 'أسبوعي' : 'Weekly'}</option><option value="monthly">{ar ? 'توزيع شهري' : 'Spread across month'}</option><option value="custom">{ar ? 'مخصص' : 'Custom / spread evenly'}</option></select></label></div>
    <fieldset className="marketing-platforms"><legend>{ar ? 'المنصات' : 'Platforms'}</legend>{platformOptions.map((platform) => <label className="check-row" key={platform}><input type="checkbox" checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} />{platform}</label>)}</fieldset>
    <label>{ar ? 'منتجات للترويج (اختياري)' : 'Products to promote (optional)'}<select multiple value={productIds} onChange={(event) => setProductIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{products.map((product) => <option value={product.id} key={product.id}>{product.name} · {product.category}</option>)}</select><small className="subtext">{ar ? 'اتركه فارغاً ليختار النظام من المنتجات المتاحة.' : 'Leave empty to rotate across active products.'}</small></label>
    <label>{ar ? 'هدف الحملة' : 'Campaign objective'}<textarea rows={2} maxLength={1000} value={objective} onChange={(event) => setObjective(event.target.value)} required /></label>
    <div className="form-row"><label>{ar ? 'الجمهور المستهدف' : 'Target audience'}<input maxLength={500} value={audience} onChange={(event) => setAudience(event.target.value)} required /></label><label>{ar ? 'اللغة' : 'Language'}<select value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'ar')}><option value="en">English</option><option value="ar">العربية</option></select></label></div>
    <div className="form-row"><label>{ar ? 'مواعيد مفضلة بتوقيت القاهرة' : 'Preferred posting times · Cairo time'}<input value={times} onChange={(event) => setTimes(event.target.value)} placeholder="10:00, 18:30" required /><small className="subtext">{ar ? 'استخدم HH:mm وافصل المواعيد بفاصلة.' : 'Use HH:mm; separate multiple times with commas.'}</small></label><label>{ar ? 'نبرة المحتوى' : 'Content tone'}<input maxLength={300} value={tone} onChange={(event) => setTone(event.target.value)} required /></label></div>
    <button className="primary" disabled={busy || !name.trim() || !objective.trim() || !audience.trim() || platforms.length === 0 || !times.trim()}>{busy ? (ar ? `جارٍ إنشاء ${count} منشورات…` : `Generating ${count} posts…`) : (ar ? 'إنشاء الحملة' : 'Generate campaign')}</button>
  </form>;
}
