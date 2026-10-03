type Language = 'en' | 'ar';
type Row = Record<string, unknown>;
type AnalyticsRange = { from: string; through: string };
type Props = {
  lang: Language;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  data: Row | null;
};

const copy = {
  en: {
    from: 'From', to: 'To', previous: 'Previous period', revenue: 'Order revenue', orders: 'Orders',
    average: 'Average order', paid: 'Fully paid orders', daily: 'Daily order value', products: 'Top products',
    categories: 'Categories', noActivity: 'No order activity in this period.', paidNote: 'Order status only; not cash reconciliation',
    cancelled: 'cancelled', vsPrevious: 'vs prior period', units: 'pcs', disclaimer: 'Figures are based on saved orders and line items. Revenue excludes cancelled orders. Product/category amounts are line-item values. Profit and collected cash are not calculated.'
  },
  ar: {
    from: 'من', to: 'إلى', previous: 'الفترة السابقة', revenue: 'قيمة الطلبات', orders: 'الطلبات',
    average: 'متوسط الطلب', paid: 'طلبات مدفوعة بالكامل', daily: 'قيمة الطلبات يومياً', products: 'أفضل المنتجات',
    categories: 'الفئات', noActivity: 'لا توجد حركة طلبات في هذه الفترة.', paidNote: 'حسب حالة الطلب فقط، دون مطابقة التحصيل',
    cancelled: 'ملغي', vsPrevious: 'مقارنة بالفترة السابقة', units: 'قطعة', disclaimer: 'تعتمد الأرقام على الطلبات وبنودها المحفوظة. لا تشمل قيمة المبيعات الطلبات الملغاة. قيمة المنتج والفئة محسوبة من بنود الطلب. لا يتم احتساب الربح أو النقد المحصل.'
  }
} as const;

function money(value: unknown, lang: Language) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

function change(current: unknown, previous: unknown) {
  const now = Number(current ?? 0);
  const before = Number(previous ?? 0);
  if (before === 0) return now === 0 ? '0%' : '—';
  const value = ((now - before) / Math.abs(before)) * 100;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function BusinessAnalyticsPage({ lang, range, onRangeChange, data }: Props) {
  const text = copy[lang];
  const current = data?.current && typeof data.current === 'object' ? data.current as Row : {};
  const previous = data?.previous && typeof data.previous === 'object' ? data.previous as Row : {};
  const daily = Array.isArray(data?.daily) ? data.daily as Row[] : [];
  const products = Array.isArray(data?.top_products) ? data.top_products as Row[] : [];
  const categories = Array.isArray(data?.categories) ? data.categories as Row[] : [];
  const max = Math.max(1, ...daily.map((row) => Number(row.revenue_egp ?? 0)));
  const locale = lang === 'ar' ? 'ar-EG' : 'en-EG';

  return <section className="analytics-page">
    <div className="card analytics-filters">
      <label>{text.from}<input type="date" value={range.from} max={range.through} onChange={(event) => event.target.value && onRangeChange({ ...range, from: event.target.value })} /></label>
      <label>{text.to}<input type="date" value={range.through} min={range.from} max={new Date().toISOString().slice(0, 10)} onChange={(event) => event.target.value && onRangeChange({ ...range, through: event.target.value })} /></label>
      <span className="analytics-period-note">{text.previous}: {data?.previous_from ? new Date(String(data.previous_from)).toLocaleDateString(locale) : '—'} – {data?.previous_to ? new Date(String(data.previous_to)).toLocaleDateString(locale) : '—'}</span>
    </div>
    <div className="analytics-kpis">
      <article className="card analytics-kpi"><small>{text.revenue}</small><strong>{money(current.revenue_egp, lang)}</strong><span>{change(current.revenue_egp, previous.revenue_egp)} {text.vsPrevious}</span></article>
      <article className="card analytics-kpi"><small>{text.orders}</small><strong>{Number(current.order_count ?? 0).toLocaleString(locale)}</strong><span>{change(current.order_count, previous.order_count)} {text.vsPrevious}</span></article>
      <article className="card analytics-kpi"><small>{text.average}</small><strong>{money(current.average_order_value_egp, lang)}</strong><span>{Number(current.cancelled_order_count ?? 0)} {text.cancelled}</span></article>
      <article className="card analytics-kpi"><small>{text.paid}</small><strong>{Number(current.paid_order_count ?? 0).toLocaleString(locale)}</strong><span>{text.paidNote}</span></article>
    </div>
    <div className="analytics-grid">
      <section className="card analytics-panel"><div className="panel-heading"><div><span className="eyebrow">EGP · {daily.length} DAYS WITH ORDERS</span><h2>{text.daily}</h2></div></div>
        {daily.length === 0 ? <div className="dashboard-empty"><p>{text.noActivity}</p></div> : <div className="daily-chart">{daily.map((row) => <div className="daily-bar" key={String(row.date)} title={`${row.date}: ${money(row.revenue_egp, lang)}`}><div className="daily-bar-track"><i style={{ height: `${Math.max(3, Number(row.revenue_egp ?? 0) / max * 100)}%` }} /></div><small>{new Date(`${String(row.date)}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</small></div>)}</div>}
      </section>
      <RankingCard title={text.products} eyebrow="SOLD UNITS · EGP" rows={products} nameKey="product" lang={lang} empty={text.noActivity} />
      <RankingCard title={text.categories} eyebrow="REVENUE BY CATEGORY" rows={categories} nameKey="category" lang={lang} empty={text.noActivity} />
    </div>
    <p className="analytics-disclaimer">{text.disclaimer}</p>
  </section>;
}

function RankingCard({ title, eyebrow, rows, nameKey, lang, empty }: { title: string; eyebrow: string; rows: Row[]; nameKey: 'product' | 'category'; lang: Language; empty: string }) {
  const locale = lang === 'ar' ? 'ar-EG' : 'en-EG';
  return <section className={`card analytics-panel ${nameKey === 'category' ? 'category-panel' : ''}`}>
    <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>
    {rows.length ? <div className="analytics-rankings">{rows.map((row, index) => <div className="analytics-rank-row" key={`${String(row[nameKey])}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{String(row[nameKey])}</strong><small>{nameKey === 'product' ? `${String(row.category)} · ` : ''}{Number(row.units ?? 0).toLocaleString(locale)} {copy[lang].units}</small></div><b>{money(row.revenue_egp, lang)}</b></div>)}</div> : <div className="dashboard-empty"><p>{empty}</p></div>}
  </section>;
}
