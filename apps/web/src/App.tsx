import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { BusinessAnalyticsPage } from './features/analytics/BusinessAnalyticsPage.tsx';
import { ProductManagementPage } from './features/products/ProductManagementPage.tsx';
import type { ProductOptionGroupDraft } from './features/products/ProductOptionsEditor.tsx';
import { ProductArtwork, ProductImage } from './features/store/ProductArtwork.tsx';
import { StorefrontManagementPage, type StorefrontConfig, type StorefrontRevision } from './features/storefront/StorefrontManagementPage.tsx';
import { AutomationManagementPage, type AutomationEvent, type N8nOverview } from './features/storefront/AutomationManagementPage.tsx';
import { MarketingCampaignBuilder, type CampaignRequest } from './features/marketing/MarketingCampaignBuilder.tsx';
import { MarketingCampaignWorkspace } from './features/marketing/MarketingCampaignWorkspace.tsx';

const apiBase = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin)).replace(/\/$/, '');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const auth = supabaseUrl && publishableKey ? createClient(supabaseUrl, publishableKey) : null;

type Product = { id: string; sku: string; name: string; category: string; description?: string | null; base_unit?: string; vertical_key?: string; attributes?: Record<string, unknown>; active?: boolean; demo_only?: boolean; requires_design?: boolean; requires_size?: boolean; allow_customer_design_upload?: boolean; material_description?: string; image_path?: string; product_option_groups?: ProductOptionGroup[]; product_variants?: Variant[] };
type ProductImageGeneration = { id: string; image_path: string; model?: string | null; selected: boolean; created_at: string };
type ProductOptionGroup = { key: string; label_en: string; label_ar: string; required: boolean; values: Array<{ key: string; label_en: string; label_ar: string; adjustment_type: 'per_unit'|'one_time'; price_adjustment: string|number }> };
type Variant = { id: string; sku: string; name: string; width_cm?: number | null; height_cm?: number | null; material?: string | null; attributes?: Record<string, unknown>; available_quantity?: number | null; demo_only?: boolean; public_price?: number | null; market_references?: Array<{ quantity: number; min_price: number; max_price: number; source_name: string }> };
type Vertical = { vertical_key: string; label_en: string; label_ar: string; capabilities: Record<string, unknown>; active: boolean };
type Profile = { user_id: string; role: string; customer_id: string | null };
type Customer = { id: string; name: string; company_name?: string | null; email?: string | null; phone?: string | null };
type Row = Record<string, unknown>;
type Language = 'en' | 'ar';
type Tab = 'dashboard' | 'analytics' | 'products' | 'storefront' | 'automations' | 'catalog' | 'buy' | 'quotes' | 'orders' | 'customers' | 'design' | 'inventory' | 'production' | 'marketing' | 'ai';
type AiMessage = { role: 'user' | 'assistant'; content: string };
type MarketingDraftEdit = { caption: string; scheduledAt: string; platform: string; productId: string };
const asLocalDateTime = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const defaultStorefront: StorefrontConfig = {
  store_name: 'INKORA', tagline: 'Create. Print. Grow.', hero_eyebrow: 'MANSOURA PRINT STUDIO · INKORA',
  hero_title_en: 'Make your next idea tangible.', hero_title_ar: 'أفكارك، مطبوعة بعناية.',
  hero_description_en: 'Thoughtful print for ambitious brands. Configure a product and follow every production step from our Mansoura shop.',
  hero_description_ar: 'طباعة مخصصة، تصميم مدروس، ومتابعة واضحة من أول طلب حتى التسليم.',
  announcement_en: '', announcement_ar: '', accent_color: '#6f9fee', featured_product_ids: [],
  theme: 'midnight', background_color: '#101114', surface_color: '#191b20', text_color: '#f5f5f5', button_color: '#6f9fee',
  font_family: 'sans', layout: 'wide', hero_image_path: '', logo_path: '', logo_placement: 'left',
  cta_label_en: 'Explore the store', cta_label_ar: 'اكتشف المتجر', featured_categories: []
};

function storeAssetUrl(path: string | null | undefined): string {
  return path && supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/storefront-assets/${path.split('/').map(encodeURIComponent).join('/')}` : '';
}

function ProductImageFor({ product, label }: { product: Product; label: string }) {
  const url = storeAssetUrl(product.image_path);
  return url ? <div className="product-image-frame"><img className="product-photo manager-product-photo" src={url} alt={label} loading="lazy" /></div> : <ProductImage category={product.category} label={label} />;
}

function featuredProducts(products: Product[], featuredIds: string[]): Product[] {
  if (featuredIds.length === 0) return products;
  const order = new Map(featuredIds.map((id, index) => [id, index]));
  return [...products].sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function storefrontProducts(products: Product[], config: StorefrontConfig): Product[] {
  const sellable = products.filter((product) => product.demo_only !== true);
  const selectedCategories = config.featured_categories ?? [];
  const rows = selectedCategories.length ? sellable.filter((product) => selectedCategories.includes(product.category)) : sellable;
  return featuredProducts(rows, config.featured_product_ids ?? []);
}

function defaultVariantSku(product: Product): string {
  const productVariants = product.demo_only ? [] : (product.product_variants ?? []).filter((variant) => variant.available_quantity == null || variant.available_quantity > 0);
  return productVariants[0]?.sku ?? '';
}

function availableVariants(product: Product): Variant[] {
  return product.demo_only ? [] : (product.product_variants ?? []).filter((variant) => variant.available_quantity == null || variant.available_quantity > 0);
}

function productIsOutOfStock(product: Product): boolean {
  return !product.demo_only && availableVariants(product).length === 0;
}

function StoreProductCards({ products, lang, onSelect, pricingLabel }: { products: Product[]; lang: Language; onSelect: (product: Product) => void; pricingLabel: string }) {
  const ar = lang === 'ar';
  return <div className="store-product-grid">{products.map((product) => {
    const outOfStock = productIsOutOfStock(product);
    const unavailable = product.demo_only === true || outOfStock;
    const count = availableVariants(product).length;
    return <article className={`store-product-card${product.demo_only ? ' demo-only' : outOfStock ? ' out-of-stock' : ''}`} key={product.id}>
      <button className="store-product-image" aria-label={unavailable ? `${product.name} · ${product.demo_only ? 'Demo sample' : ar ? 'نفد' : 'Out of stock'}` : `${ar ? 'اشترِ' : 'Buy'} ${product.name}`} onClick={() => onSelect(product)} disabled={unavailable}>
        <ProductImageFor product={product} label={product.name}/>
        {product.demo_only ? <span className="store-stock-badge">{ar ? 'عينة تجريبية' : 'DEMO SAMPLE'}</span> : outOfStock ? <span className="store-stock-badge">{ar ? 'نفد حالياً' : 'OUT OF STOCK'}</span> : <span className="store-image-arrow">↗</span>}
      </button>
      <div className="store-product-info"><div><span>{product.category.replaceAll('_', ' ')}</span><h3>{product.name}</h3><p>{product.description || (product.vertical_key === 'printing' ? (ar ? 'منتج طباعة حسب الطلب.' : 'Made to order with options from the print studio.') : (ar ? 'منتج متاح للطلب من المتجر.' : 'Available to order from the store.'))}</p></div>
        <button className="store-product-link" onClick={() => onSelect(product)} disabled={unavailable}>{unavailable ? (product.demo_only ? (ar ? 'عينة فقط' : 'Sample only') : (ar ? 'غير متاح' : 'Unavailable')) : <>{ar ? 'اشترِ هذا المنتج' : 'Buy this product'} <b>↗</b></>}</button>
      </div>
      <div className="store-product-foot"><span>{product.demo_only ? (ar ? 'بيانات تجريبية' : 'demo data') : `${count} ${ar ? 'أنواع متاحة' : 'available variants'}`}</span><span>{product.demo_only ? (ar ? 'ليست للبيع' : 'not for sale') : pricingLabel}</span></div>
    </article>;
  })}</div>;
}

const words = {
  en: {
    brand: 'INKORA', tagline: 'Create. Print. Grow.', storefront: 'Storefront', automations: 'Automations', dashboard: 'Overview', analytics: 'Analytics', catalog: 'Store', buy: 'Buy', productsAdmin: 'Products', salesDesk: 'Sales desk', quotes: 'Quotes', orders: 'Orders', customers: 'Customers', design: 'Design studio', inventory: 'Inventory', production: 'Production', marketing: 'Marketing', ai: 'Hermes AI',
    signIn: 'Sign in', createAccount: 'Create account', email: 'Email', password: 'Password', name: 'Your name',
    artworkTitle: 'Artwork for this order', uploadArtwork: 'I have a finished design', shopDesign: 'Have INKORA create a design', artworkHint: 'Upload a print-ready PNG, JPEG, WebP, or PDF. The file is kept private and attached to your order.', shopDesignHint: 'A design request will be linked to this order. The approved design fee appears in your quote.', designFeeLabel: 'Design service', designPriceMissing: 'This product does not have an approved design service fee. Continue without shop design or ask the manager to add the service and its price.', placeOrderFirst: 'Place the print order first; then send its design brief here.', artworkRequired: 'Upload your finished design before placing this order.', artworkOrderBrief: 'Customer supplied print-ready artwork. Please review the file attached to this order.', designPlanTitle: 'Design service plan', designPlanText: 'One first concept includes up to five edit rounds. After those are used, another edit pack costs EGP 25.', designPlanStatus: 'AI generation and paid edit checkout are not connected yet.', paymentPending: 'Payment is not connected yet. This order will be recorded as unpaid.',
    welcome: 'Welcome back', welcomeText: 'Sign in to request quotes and follow your print jobs.',
    products: 'Print products', productsText: 'Choose a print, set the quantity, and get a price from the shop’s approved rules.', search: 'Search products', quantity: 'Quantity', getQuote: 'Continue to order', saveQuote: 'Continue to order',
    dashboardTitle: 'Good to see you.', dashboardText: 'Your INKORA workspace. Orders, inventory, and production are managed here.', openCatalog: 'Create a quote', activeOrders: 'Active orders', inProduction: 'In production', lowMaterials: 'Low stock alerts', designQueue: 'Design queue', recentWork: 'Recent production', attention: 'Needs attention', allClear: 'Everything is running smoothly.', noRecentWork: 'Your production queue is clear.', productionStages: 'Production stages', stageQueued: 'Queued', stagePrint: 'Printing', stageFinish: 'Finishing', stageQuality: 'Quality check', analyticsTitle: 'Business analytics', analyticsText: 'Verified order totals from your database, compared with the previous equal period.', revenue: 'Order revenue', orderCount: 'Orders', averageOrder: 'Average order', paidOrders: 'Fully paid orders', dailyRevenue: 'Daily order value', topProducts: 'Top products', categories: 'Categories', dateFrom: 'From', dateTo: 'To', previousPeriod: 'Previous period', noAnalytics: 'No order activity in this period.',
    designNeeded: 'I need design help', total: 'Estimated total', quoteSaved: 'Order details saved. Review them and place your order.', accept: 'Place order', retryOrder: 'Retry order',
    paymentStatus: 'Payment', unpaid: 'Unpaid · arrange payment with the shop', partial: 'Partially paid', paid: 'Paid', refunded: 'Refunded', cancelOrder: 'Cancel order', cancelOrderConfirm: 'Cancel this order? Any unconsumed reserved materials will be released.',
    quotesTitle: 'Quotes', quotesText: 'Review shop-calculated prices and turn accepted quotes into orders.', emptyQuotes: 'No quotes yet.', sendQuote: 'Mark as sent', acceptQuote: 'Accept quote', rejectQuote: 'Decline', orderFromQuote: 'Create order', customerRequired: 'Choose a customer', customersTitle: 'Customers', customersText: 'Shop relationships and recent activity.', emptyCustomers: 'No customers yet.', newCustomer: 'Add customer', customerName: 'Customer name', companyName: 'Company name', phone: 'Phone', contactRequired: 'Email or phone is required.', createCustomerQuote: 'Create quote', ordersTitle: 'Orders', ordersText: 'Track confirmed orders and production status.', emptyOrders: 'No orders yet.',
    designTitle: 'Request design help', designText: 'Tell the designer what you need. Uploads can be added after private storage is configured.', brief: 'Describe your design', orderDesignBrief: 'What should the designer create?', sendRequest: 'Send request',
    aiTitle: 'Ask Hermes about the shop', aiText: 'Business answers come from your live shop data. Quotes are calculated by the pricing engine.', aiPlaceholder: 'Ask about sales, inventory, orders, or production…', aiSend: 'Ask Hermes', aiWelcome: 'I can look up shop inventory, sales, orders, and production. I will use the approved pricing rules for quotes.',
    inventoryTitle: 'Inventory', inventoryText: 'Stock changes are recorded in the inventory ledger.', materialName: 'Material name', sku: 'SKU', category: 'Category', unit: 'Unit', reorderPoint: 'Reorder point', reorderQty: 'Reorder quantity', createMaterial: 'Add material', receiveQty: 'Quantity received', unitCost: 'Cost per unit (optional)', receive: 'Record receipt', materials: 'Materials',
    mapTitle: 'Configure product material usage', mapText: 'Enter the shop’s real material usage per printed item. Do not estimate.', chooseProduct: 'Choose product', chooseVariant: 'Choose variant', chooseMaterial: 'Choose material', qtyPerUnit: 'Material quantity per product', waste: 'Waste factor (for example 0.1 = 10%)', saveRequirement: 'Save usage rule', lowStock: 'Low stock', suggestion: 'Suggested purchase quantity',
    productionTitle: 'Production queue', productionText: 'Move each job through the shop’s validated production steps.', noJobs: 'No production jobs.', advance: 'Advance to next step', ready: 'Mark ready', delivered: 'Mark delivered', advanceDesign: 'Advance design request', approveDesign: 'Approve design', rejectDesign: 'Request changes', loading: 'Loading…', refresh: 'Refresh', signOut: 'Sign out', language: 'العربية', role: 'Role',
    setupMissing: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to apps/web/.env before signing in.', apiError: 'The request could not be completed.', selectProduct: 'Select a product', chooseQty: 'Enter a quantity', marketNote: 'Public market reference only. Your actual quote comes from the shop pricing rules.', quoteBreakdown: 'Price breakdown', status: 'Status', due: 'Due', noMaterial: 'No material configured', marketingTitle: 'Marketing studio', marketingText: 'Create an independent campaign from a brief and optional catalog product. It never uses customer orders. Review the caption and optional artwork before approval.', generateDraft: 'Generate campaign draft', noMarketingAssets: 'No campaign drafts yet.', approveMarketing: 'Approve draft', rejectMarketing: 'Reject draft', campaignBrief: 'Campaign brief', campaignType: 'Campaign type', campaignProduct: 'Catalog product (optional)', campaignImage: 'Also generate campaign artwork for free through the community queue (wait time varies)', campaignImageUnavailable: 'Hermes writes captions. AI Horde generates images on volunteer-run workers; do not include private customer data in campaign briefs.', viewMarketingImage: 'View campaign artwork', independentCampaign: 'Independent marketing campaign'
  },
  ar: {
    brand: 'INKORA', tagline: 'Create. Print. Grow.', storefront: 'واجهة المتجر', automations: 'الأتمتة', dashboard: 'نظرة عامة', analytics: 'التحليلات', catalog: 'المتجر', buy: 'شراء', productsAdmin: 'المنتجات', salesDesk: 'المبيعات', quotes: 'عروض الأسعار', orders: 'الطلبات', customers: 'العملاء', design: 'استوديو التصميم', inventory: 'المخزون', production: 'الإنتاج', marketing: 'التسويق', ai: 'هيرمس AI',
    signIn: 'تسجيل الدخول', createAccount: 'إنشاء حساب', email: 'البريد الإلكتروني', password: 'كلمة المرور', name: 'الاسم',
    artworkTitle: 'التصميم الخاص بهذا الطلب', uploadArtwork: 'لديّ تصميم جاهز', shopDesign: 'صمّموا لي في INKORA', artworkHint: 'ارفع ملف PNG أو JPEG أو WebP أو PDF جاهزاً للطباعة. سيبقى الملف خاصاً ويرتبط بطلبك.', shopDesignHint: 'سنربط طلب التصميم بهذا الطلب. ستظهر رسوم التصميم المعتمدة في عرض السعر.', designFeeLabel: 'خدمة التصميم', designPriceMissing: 'لا توجد رسوم معتمدة لخدمة التصميم لهذا المنتج. تابع بدون تصميم المتجر، أو اطلب من المدير إضافة الخدمة وسعرها.', placeOrderFirst: 'أرسل طلب الطباعة أولاً، ثم أرسل تفاصيل التصميم هنا.', artworkRequired: 'ارفع التصميم الجاهز قبل إرسال الطلب.', artworkOrderBrief: 'أرسل العميل تصميماً جاهزاً للطباعة. يرجى مراجعة الملف المرفق بالطلب.', designPlanTitle: 'خطة خدمة التصميم', designPlanText: 'يشمل التصميم المبدئي حتى خمسة جولات تعديل. بعد استخدامها، تبلغ تكلفة باقة التعديلات التالية 25 ج.م.', designPlanStatus: 'توليد التصميم بالذكاء الاصطناعي ودفع رسوم التعديلات غير متصلين حالياً.', paymentPending: 'الدفع الإلكتروني غير متصل حالياً. سيتم تسجيل هذا الطلب دون دفع.',
    welcome: 'أهلاً بعودتك', welcomeText: 'سجّل الدخول لطلب عرض سعر ومتابعة الطباعة.',
    products: 'منتجات الطباعة', productsText: 'اختر المنتج والكمية واحصل على سعر وفق قواعد المطبعة المعتمدة.', search: 'ابحث عن منتج', quantity: 'الكمية', getQuote: 'متابعة الطلب', saveQuote: 'متابعة الطلب',
    dashboardTitle: 'أهلاً بعودتك.', dashboardText: 'مساحة عمل INKORA لإدارة الطلبات والمخزون والإنتاج.', openCatalog: 'إنشاء عرض سعر', activeOrders: 'الطلبات النشطة', inProduction: 'قيد الإنتاج', lowMaterials: 'تنبيهات المخزون', designQueue: 'طلبات التصميم', recentWork: 'أحدث مهام الإنتاج', attention: 'يحتاج متابعة', allClear: 'كل شيء يسير بشكل جيد.', noRecentWork: 'جدول الإنتاج فارغ حالياً.', productionStages: 'مراحل الإنتاج', stageQueued: 'في الانتظار', stagePrint: 'الطباعة', stageFinish: 'تشطيب', stageQuality: 'مراجعة الجودة', analyticsTitle: 'تحليلات الأعمال', analyticsText: 'إجماليات الطلبات الموثقة من قاعدة البيانات مقارنة بالفترة السابقة المماثلة.', revenue: 'قيمة الطلبات', orderCount: 'الطلبات', averageOrder: 'متوسط الطلب', paidOrders: 'طلبات مدفوعة بالكامل', dailyRevenue: 'قيمة الطلبات يومياً', topProducts: 'أفضل المنتجات', categories: 'الفئات', dateFrom: 'من', dateTo: 'إلى', previousPeriod: 'الفترة السابقة', noAnalytics: 'لا توجد حركة طلبات في هذه الفترة.',
    designNeeded: 'أحتاج مساعدة في التصميم', total: 'الإجمالي التقديري', quoteSaved: 'تم حفظ تفاصيل الطلب. راجعها ثم أرسل طلبك.', accept: 'إرسال الطلب', retryOrder: 'إعادة المحاولة',
    paymentStatus: 'الدفع', unpaid: 'غير مدفوع · يُرجى التنسيق مع المطبعة للدفع', partial: 'مدفوع جزئياً', paid: 'مدفوع', refunded: 'مسترد', cancelOrder: 'إلغاء الطلب', cancelOrderConfirm: 'هل تريد إلغاء هذا الطلب؟ سيتم تحرير الخامات المحجوزة التي لم تُستهلك.',
    quotesTitle: 'عروض الأسعار', quotesText: 'راجع الأسعار المحسوبة من النظام وحوّل العرض المقبول إلى طلب.', emptyQuotes: 'لا توجد عروض أسعار حتى الآن.', sendQuote: 'تحديد كمرسل', acceptQuote: 'قبول العرض', rejectQuote: 'رفض', orderFromQuote: 'إنشاء طلب', customerRequired: 'اختر عميلاً', customersTitle: 'العملاء', customersText: 'علاقات المطبعة وآخر تعاملاتها.', emptyCustomers: 'لا يوجد عملاء بعد.', newCustomer: 'إضافة عميل', customerName: 'اسم العميل', companyName: 'اسم الشركة', phone: 'الهاتف', contactRequired: 'أدخل البريد الإلكتروني أو رقم الهاتف.', createCustomerQuote: 'إنشاء عرض سعر', ordersTitle: 'الطلبات', ordersText: 'تابع الطلبات وحالة الإنتاج.', emptyOrders: 'لا توجد طلبات حتى الآن.',
    designTitle: 'طلب مساعدة في التصميم', designText: 'اكتب للمصمم ما تحتاجه. رفع الملفات متاح بعد إعداد التخزين الخاص.', brief: 'اشرح التصميم المطلوب', orderDesignBrief: 'ما التصميم الذي تريد من المصمم تنفيذه؟', sendRequest: 'إرسال الطلب',
    aiTitle: 'اسأل هيرمس عن المطبعة', aiText: 'الإجابات التشغيلية تأتي من بيانات المطبعة الفعلية. يتم حساب الأسعار وفق قواعد التسعير المعتمدة.', aiPlaceholder: 'اسأل عن المبيعات أو المخزون أو الطلبات أو الإنتاج…', aiSend: 'اسأل هيرمس', aiWelcome: 'أستطيع مراجعة المخزون والمبيعات والطلبات والإنتاج. سأستخدم قواعد التسعير المعتمدة لحساب الأسعار.',
    inventoryTitle: 'المخزون', inventoryText: 'يتم تسجيل كل حركة مخزون في سجل المعاملات.', materialName: 'اسم الخامة', sku: 'رمز الخامة', category: 'الفئة', unit: 'الوحدة', reorderPoint: 'حد إعادة الطلب', reorderQty: 'كمية إعادة الطلب', createMaterial: 'إضافة خامة', receiveQty: 'الكمية المستلمة', unitCost: 'تكلفة الوحدة (اختياري)', receive: 'تسجيل الاستلام', materials: 'الخامات',
    mapTitle: 'تحديد استهلاك الخامة للمنتج', mapText: 'أدخل الاستهلاك الحقيقي لكل قطعة مطبوعة، ولا تستخدم تقديرات.', chooseProduct: 'اختر المنتج', chooseVariant: 'اختر المقاس/النوع', chooseMaterial: 'اختر الخامة', qtyPerUnit: 'كمية الخامة لكل قطعة', waste: 'نسبة الهالك (مثال 0.1 تعني 10%)', saveRequirement: 'حفظ قاعدة الاستهلاك', lowStock: 'مخزون منخفض', suggestion: 'كمية الشراء المقترحة',
    productionTitle: 'جدول الإنتاج', productionText: 'انقل كل طلب بين مراحل الإنتاج المعتمدة.', noJobs: 'لا توجد مهام إنتاج.', advance: 'الانتقال للمرحلة التالية', ready: 'جاهز', delivered: 'تأكيد التسليم', advanceDesign: 'تحديث طلب التصميم', approveDesign: 'اعتماد التصميم', rejectDesign: 'طلب تعديلات', loading: 'جارٍ التحميل…', refresh: 'تحديث', signOut: 'تسجيل الخروج', language: 'English', role: 'الصلاحية',
    setupMissing: 'أضف VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY إلى apps/web/.env قبل تسجيل الدخول.', apiError: 'تعذر إكمال الطلب.', selectProduct: 'اختر منتجاً', chooseQty: 'أدخل الكمية', marketNote: 'سعر السوق مرجعي فقط. عرض السعر الفعلي يُحسب من قواعد المطبعة.', quoteBreakdown: 'تفاصيل السعر', status: 'الحالة', due: 'موعد التسليم', noMaterial: 'لم تُحدد خامة', marketingTitle: 'استوديو التسويق', marketingText: 'أنشئ حملة مستقلة من موجز تسويقي ومنتج اختياري من المتجر. لا تستخدم طلبات العملاء. راجع النص والتصميم الاختياري قبل الاعتماد.', generateDraft: 'إنشاء مسودة حملة', noMarketingAssets: 'لا توجد مسودات حملات بعد.', approveMarketing: 'اعتماد المسودة', rejectMarketing: 'رفض المسودة', campaignBrief: 'موجز الحملة', campaignType: 'نوع الحملة', campaignProduct: 'منتج من المتجر (اختياري)', campaignImage: 'أنشئ أيضاً صورة للحملة (طابور مجتمعي مجاني وقد يتغير وقت الانتظار)', campaignImageUnavailable: 'هيرمس يكتب النص، وخدمة AI Horde تنشئ الصور عبر أجهزة متطوعين. تجنب وضع بيانات العملاء الخاصة في موجز الحملة.', viewMarketingImage: 'عرض تصميم الحملة', independentCampaign: 'حملة تسويقية مستقلة'
  }
} as const;

function money(value: unknown, lang: Language) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

function currentUtcDates() {
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${today.slice(0, 8)}01`, through: today };
}

function nextUtcDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function labelStatus(value: unknown) {
  return String(value ?? '—').replaceAll('_', ' ');
}

function OrderProgress({ status, lang }: { status: unknown; lang: Language }) {
  const stages = [
    ['queued', 'Queued', 'انتظار'],
    ['prepress', 'Prepress', 'تجهيز'],
    ['printing', 'Printing', 'طباعة'],
    ['finishing', 'Finishing', 'تشطيب'],
    ['quality_check', 'Quality check', 'مراجعة'],
    ['ready', 'Ready', 'جاهز'],
    ['delivered', 'Delivered', 'تسليم'],
  ] as const;
  const current = String(status ?? 'queued');
  const activeIndex = stages.findIndex(([key]) => key === current);
  const cancelled = current === 'cancelled';
  return <div className={`order-progress ${cancelled ? 'is-cancelled' : ''}`} aria-label={`${lang === 'ar' ? 'حالة الإنتاج' : 'Production progress'}: ${labelStatus(current)}`}>
    {cancelled ? <span className="progress-cancelled">{lang === 'ar' ? 'تم إلغاء الطلب' : 'This order was cancelled'}</span> : stages.map(([key, en, ar], index) => <div className={`progress-step ${index <= activeIndex ? 'done' : ''} ${index === activeIndex ? 'current' : ''}`} key={key}><span className="progress-dot">{index < activeIndex ? '✓' : String(index + 1).padStart(2, '0')}</span><small>{lang === 'ar' ? ar : en}</small></div>)}
  </div>;
}

function OrderNextAction({ order, busy, lang, onJob, onOrder }: { order: Row; busy: boolean; lang: Language; onJob: (id: string, status: string) => void; onOrder: (id: string, status: 'ready' | 'delivered') => void }) {
  const jobs = Array.isArray(order.production_jobs) ? order.production_jobs as Row[] : [];
  const job = jobs.find((item) => !['ready','cancelled'].includes(String(item.status)));
  const nextByStatus: Record<string, string> = { queued: 'prepress', prepress: 'printing', printing: 'finishing', finishing: 'quality_check', quality_check: 'ready' };
  if (job && nextByStatus[String(job.status)]) {
    const next = nextByStatus[String(job.status)];
    return <button className="primary compact order-next-action" disabled={busy} onClick={() => onJob(String(job.id), next)}>{lang === 'ar' ? `تقدم إلى ${labelStatus(next)}` : `Advance to ${labelStatus(next)}`} →</button>;
  }
  if (order.status === 'ready') return <button className="primary compact order-next-action" disabled={busy} onClick={() => onOrder(String(order.id), 'delivered')}>{lang === 'ar' ? 'تأكيد التسليم' : 'Mark delivered'} →</button>;
  if (!job && order.status === 'confirmed') return <button className="primary compact order-next-action" disabled={busy} onClick={() => onOrder(String(order.id), 'ready')}>{lang === 'ar' ? 'تجهيز للاستلام' : 'Mark ready'} →</button>;
  return null;
}

export function App() {
  const [lang, setLang] = useState<Language>('en');
  const t = words[lang];
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('catalog');
  const pendingBuyAfterAuth = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [register, setRegister] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customOptions, setCustomOptions] = useState<Record<string, string>>({});
  const [storefront, setStorefront] = useState<StorefrontConfig>(defaultStorefront);
  const [storefrontRevisions, setStorefrontRevisions] = useState<StorefrontRevision[]>([]);
  const [automationEvents, setAutomationEvents] = useState<AutomationEvent[]>([]);
  const [automationOverview, setAutomationOverview] = useState<N8nOverview>({ status: 'not_configured', workflows: [], executions: [] });
  const [publishedStorefront, setPublishedStorefront] = useState<StorefrontRevision | null>(null);
  const [managerProducts, setManagerProducts] = useState<Product[]>([]);
  const [productImageAllowance, setProductImageAllowance] = useState({ included: 3, used: 0, remaining: 3 });
  const [productImageGenerations, setProductImageGenerations] = useState<Record<string, ProductImageGeneration[]>>({});
  const [managerVerticals, setManagerVerticals] = useState<Vertical[]>([]);
  const [search, setSearch] = useState('');
  const [variantSku, setVariantSku] = useState('');
  const [purchaseStarted, setPurchaseStarted] = useState(false);
  const [quantity, setQuantity] = useState('1000');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState({ district: 'Samia El-Gamal', street: '', building: '', phone: '', notes: '' });
  const [designRequired, setDesignRequired] = useState(false);
  const [customerArtwork, setCustomerArtwork] = useState<File | null>(null);
  const [latestCustomerOrderId, setLatestCustomerOrderId] = useState('');
  const [quote, setQuote] = useState<Row | null>(null);
  const [savedQuoteId, setSavedQuoteId] = useState('');
  const [quoteAccepted, setQuoteAccepted] = useState(false);
  const [orders, setOrders] = useState<Row[]>([]);
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerForm, setCustomerForm] = useState({ name: '', company_name: '', email: '', phone: '' });
  const [jobs, setJobs] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [marketingAssets, setMarketingAssets] = useState<Row[]>([]);
  const [marketingCampaigns, setMarketingCampaigns] = useState<Row[]>([]);
  const [imageGeneratingId, setImageGeneratingId] = useState<string | null>(null);
  const [businessAnalytics, setBusinessAnalytics] = useState<Row | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState(currentUtcDates);
  const [brief, setBrief] = useState('');
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [finalDesignFiles, setFinalDesignFiles] = useState<Record<string, File>>({});
  const [privateFileLinks, setPrivateFileLinks] = useState<Record<string, string>>({});
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const profileLoadId = useRef(0);
  const sessionRefresh = useRef<Promise<Session | null> | null>(null);

  const isStaff = ['manager', 'sales', 'production', 'admin'].includes(profile?.role ?? '');
  const isManager = ['manager', 'admin'].includes(profile?.role ?? '');
  const canManageDesign = ['manager', 'sales', 'admin'].includes(profile?.role ?? '');
  const variants = useMemo(() => products.flatMap((product) => (product.product_variants ?? []).map((variant) => ({ ...variant, demo_only: product.demo_only, productId: product.id, productName: product.name }))), [products]);
  const managerStockRows = useMemo(() => managerProducts.flatMap((product) => (product.product_variants ?? []).map((variant) => ({ ...variant, productName: product.name, productActive: product.active !== false }))), [managerProducts]);
  const outOfStockCount = managerStockRows.filter((variant) => variant.available_quantity === 0).length;
  const orderableVariants = useMemo(() => variants.filter((variant) => !variant.demo_only && (variant.available_quantity == null || variant.available_quantity > 0)), [variants]);
  const selectedVariant = variants.find((variant) => variant.sku === variantSku);
  const selectedProduct = selectedVariant ? products.find((product) => product.id === selectedVariant.productId) : undefined;
  const quotedDesignFee = Number((Array.isArray(quote?.breakdown) ? (quote.breakdown as Row[]) : []).reduce((sum, line) => sum + Number((line.breakdown as Row | undefined)?.design_fee ?? 0), 0).toFixed(2));
  const quotedOptionSurcharge = Number((Array.isArray(quote?.breakdown) ? (quote.breakdown as Row[]) : []).reduce((sum, line) => sum + Number((line.breakdown as Row | undefined)?.option_surcharge ?? 0), 0).toFixed(2));
  const approvedDesignPriceReady = !designRequired || quotedDesignFee > 0;

  async function api<T = Row>(path: string, init: RequestInit = {}, tokenOverride?: string): Promise<T> {
    let token = tokenOverride ?? session?.access_token;
    const request = (accessToken?: string) => fetch(`${apiBase}${path}`, {
      ...init,
      headers: { ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }
    });
    let response = await request(token);
    if (response.status === 401 && auth) {
      // Auth events can briefly deliver an expired access token while Supabase
      // is refreshing it. Refresh once and retry after the SDK releases its lock.
      if (!sessionRefresh.current) {
        sessionRefresh.current = auth.auth.refreshSession()
          .then(({ data, error }) => error ? null : data.session)
          .catch(() => null)
          .finally(() => { sessionRefresh.current = null; });
      }
      const freshSession = await sessionRefresh.current;
      const freshToken = freshSession?.access_token;
      if (freshSession && freshToken && freshToken !== token) {
        token = freshToken;
        setSession(freshSession);
        response = await request(token);
      }
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || t.apiError);
    return body as T;
  }

  async function loadProfile(activeSession: Session) {
    const loadId = ++profileLoadId.current;
    setSession(activeSession);
    const nextProfile = await api<Profile>('/api/me', {}, activeSession.access_token);
    // A late response for an older token must not overwrite the refreshed
    // session's profile or resurrect a transient authorization error.
    if (loadId !== profileLoadId.current) return;
    setProfile(nextProfile);
    setTab(['manager', 'admin'].includes(nextProfile.role) ? 'dashboard' : nextProfile.role === 'customer' && pendingBuyAfterAuth.current ? 'buy' : 'catalog');
    pendingBuyAfterAuth.current = false;
  }

  function chooseProductForPurchase(product: Product) {
    const sku = defaultVariantSku(product);
    if (!sku) { setError(product.demo_only ? (lang === 'ar' ? 'هذا منتج تجريبي وليس للبيع.' : 'This is a demo sample and is not available for sale.') : (lang === 'ar' ? 'نفد المنتج حالياً. راجع المتجر لاحقاً.' : 'This product is currently out of stock. Check back later.')); return; }
    setVariantSku(sku);
    setCustomOptions({});
    setPurchaseStarted(true);
    setQuote(null); setSavedQuoteId(''); setQuoteAccepted(false);
    if (product.vertical_key !== 'printing') { setDesignRequired(false); setCustomerArtwork(null); setReferenceFiles([]); }
    if (profile?.role === 'customer') { setTab('buy'); return; }
    if (!session) {
      pendingBuyAfterAuth.current = true;
      setTab('buy');
      document.querySelector('#account')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function exploreCollection() {
    setTab('catalog');
    requestAnimationFrame(() => document.getElementById('store-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function reload() {
    setBusy(true); setError('');
    try {
      const [list] = await Promise.all([api<{ products: Product[] }>(`/api/products${search ? `?search=${encodeURIComponent(search)}` : ''}`), api<{ config: StorefrontConfig }>('/api/storefront').then((value) => { if (value.config) setStorefront({ ...defaultStorefront, ...value.config }); }).catch(() => undefined)]);
      setProducts(list.products ?? []);
      if (!variantSku && list.products?.[0]) setVariantSku(defaultVariantSku(list.products[0]));
      if (session) {
        const role = profile?.role;
        if (role) {
          const requests: Promise<unknown>[] = [];
          const indexes: Record<string, number> = {};
          if (!['manager','admin'].includes(role)) setManagerProducts([]);
          if (['customer','manager','sales','production','marketing','admin'].includes(role)) { indexes.orders=requests.length; requests.push(api<{ orders: Row[] }>('/api/orders')); }
          else setOrders([]);
          if (['customer','manager','sales','admin'].includes(role)) { indexes.quotes=requests.length; requests.push(api<{ quotes: Row[] }>('/api/quotes')); }
          else setQuotes([]);
          if (['manager','sales','admin'].includes(role)) { indexes.customers=requests.length; requests.push(api<{ customers: Customer[] }>('/api/customers')); }
          else setCustomers([]);
          if (['customer','manager','sales','production','admin'].includes(role)) { indexes.design=requests.length; requests.push(api<{ design_requests: Row[] }>('/api/design-requests')); }
          else setRequests([]);
          if (['manager','marketing','admin'].includes(role)) { indexes.marketing=requests.length; requests.push(api<{ assets: Row[] }>('/api/marketing/assets')); }
          else setMarketingAssets([]);
          if (['manager','admin'].includes(role)) { indexes.campaigns=requests.length; requests.push(api<{ campaigns: Row[] }>('/api/manager/marketing/campaigns')); }
          else setMarketingCampaigns([]);
          if (['manager','production','admin'].includes(role)) indexes.production=requests.length, requests.push(api<{ jobs: Row[] }>('/api/production'));
          else setJobs([]);
          const results = await Promise.all(requests);
          if (indexes.orders !== undefined) setOrders((results[indexes.orders] as {orders:Row[]}).orders ?? []);
          if (indexes.quotes !== undefined) setQuotes((results[indexes.quotes] as {quotes:Row[]}).quotes ?? []);
          if (indexes.customers !== undefined) { const rows=(results[indexes.customers] as {customers:Customer[]}).customers ?? []; setCustomers(rows); if (!selectedCustomerId && rows[0]) setSelectedCustomerId(rows[0].id); }
          if (indexes.design !== undefined) setRequests((results[indexes.design] as {design_requests:Row[]}).design_requests ?? []);
          if (indexes.marketing !== undefined) setMarketingAssets((results[indexes.marketing] as {assets:Row[]}).assets ?? []);
          if (indexes.campaigns !== undefined) setMarketingCampaigns((results[indexes.campaigns] as {campaigns:Row[]}).campaigns ?? []);
          if (indexes.production !== undefined) setJobs((results[indexes.production] as {jobs:Row[]}).jobs ?? []);
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    void apiBase;
    if (!auth) return;
    const { data } = auth.auth.onAuthStateChange((event, current) => {
      setSession(current);
      if (!current) { profileLoadId.current += 1; setProfile(null); setManagerProducts([]); setOrders([]); setQuotes([]); setJobs([]); setRequests([]); }
      else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Leave Supabase's synchronous auth callback before making follow-up
        // requests; calling back into the auth client from inside it can race
        // the SDK's session lock.
        window.setTimeout(() => { void loadProfile(current).catch((cause) => { if (cause instanceof Error) setError(cause.message); }); }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => { void reload(); }, [session?.access_token, profile?.role, search]);

  useEffect(() => {
    if (tab !== 'products' || !session || !isManager) return;
    let active = true;
    setBusy(true); setError('');
    Promise.all([api<{ products: Product[] }>('/api/manager/products'), api<{ verticals: Vertical[] }>('/api/verticals'), api<{ included: number; used: number; remaining: number }>('/api/manager/product-images/allowance')]).then(([result, verticalResult, imageResult]) => {
      if (active) { setManagerProducts(result.products ?? []); setManagerVerticals(verticalResult.verticals ?? []); setProductImageAllowance(imageResult); }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : t.apiError);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [tab, session?.access_token, profile?.role]);

  useEffect(() => {
    if (tab !== 'inventory' || !session || !isManager) return;
    let active = true; setBusy(true); setError('');
    api<{ products: Product[] }>('/api/manager/products').then((result) => { if (active) setManagerProducts(result.products ?? []); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t.apiError); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [tab, session?.access_token, profile?.role]);

  useEffect(() => {
    if (tab !== 'marketing' || !session || !isManager) return;
    let active = true;
    setBusy(true); setError('');
    Promise.all([
      api<{ products: Product[] }>('/api/manager/products'),
      api<{ campaigns: Row[] }>('/api/manager/marketing/campaigns'),
      api<{ assets: Row[] }>('/api/marketing/assets')
    ]).then(([productResult, campaignsResult, assetsResult]) => {
      if (!active) return;
      setManagerProducts(productResult.products ?? []);
      setMarketingCampaigns(campaignsResult.campaigns ?? []);
      setMarketingAssets(assetsResult.assets ?? []);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t.apiError); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [tab, session?.access_token, profile?.role]);

  useEffect(() => {
    if (tab !== 'automations' || !session || !['manager', 'admin'].includes(profile?.role ?? '')) return;
    let active = true; setBusy(true); setError('');
    Promise.all([
      api<{ events: AutomationEvent[] }>('/api/manager/automations/events'),
      api<N8nOverview>('/api/manager/automations/overview')
    ]).then(([eventsResult, overviewResult]) => {
      if (active) { setAutomationEvents(eventsResult.events ?? []); setAutomationOverview(overviewResult); }
    })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t.apiError); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [tab, session?.access_token, profile?.role]);

  async function retryAutomationEvent(eventId: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/automations/events/${encodeURIComponent(eventId)}/retry`, { method: 'POST', body: JSON.stringify({}) });
      const [eventsResult, overviewResult] = await Promise.all([
        api<{ events: AutomationEvent[] }>('/api/manager/automations/events'),
        api<N8nOverview>('/api/manager/automations/overview')
      ]);
      setAutomationEvents(eventsResult.events ?? []); setAutomationOverview(overviewResult);
      setNotice(lang === 'ar' ? 'أعيد الحدث إلى قائمة الانتظار.' : 'Event returned to the delivery queue.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function deleteAutomationEvent(eventId: string) {
    if (!window.confirm(lang === 'ar' ? 'حذف حدث الأتمتة نهائياً؟' : 'Permanently delete this pending/dead automation event?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/automations/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      const eventsResult = await api<{ events: AutomationEvent[] }>('/api/manager/automations/events');
      setAutomationEvents(eventsResult.events ?? []);
      setNotice(lang === 'ar' ? 'تم حذف حدث الأتمتة.' : 'Automation event deleted.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (tab !== 'storefront' || !session || !['manager', 'admin'].includes(profile?.role ?? '')) return;
    let active = true;
    setBusy(true); setError('');
    api<{ published: StorefrontRevision; revisions: StorefrontRevision[] }>('/api/manager/storefront').then((result) => {
      if (!active) return;
      setPublishedStorefront(result.published ?? null);
      setStorefrontRevisions(result.revisions ?? []);
      if (result.published?.config) setStorefront({ ...defaultStorefront, ...result.published.config });
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t.apiError); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [tab, session?.access_token, profile?.role]);

  async function saveStorefrontDraft(config: StorefrontConfig) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/manager/storefront/drafts', { method: 'POST', body: JSON.stringify({ config }) });
      const result = await api<{ published: StorefrontRevision; revisions: StorefrontRevision[] }>('/api/manager/storefront');
      setPublishedStorefront(result.published ?? null); setStorefrontRevisions(result.revisions ?? []);
      setNotice(lang === 'ar' ? 'تم حفظ المسودة. راجعها قبل النشر.' : 'Storefront draft saved. Review it before publishing.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function publishStorefrontDraft(revisionId: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/storefront/drafts/${encodeURIComponent(revisionId)}/publish`, { method: 'POST', body: JSON.stringify({}) });
      const [manager, live] = await Promise.all([api<{ published: StorefrontRevision; revisions: StorefrontRevision[] }>('/api/manager/storefront'), api<{ config: StorefrontConfig }>('/api/storefront')]);
      setPublishedStorefront(manager.published ?? null); setStorefrontRevisions(manager.revisions ?? []); setStorefront({ ...defaultStorefront, ...live.config });
      setNotice(lang === 'ar' ? 'تم نشر إعدادات المتجر وتسجيل حدث الأتمتة.' : 'Storefront settings published and automation event queued.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (tab !== 'analytics' || !session || !['manager', 'admin'].includes(profile?.role ?? '')) return;
    let active = true;
    setBusy(true); setError('');
    const query = new URLSearchParams({
      from: new Date(`${analyticsRange.from}T00:00:00.000Z`).toISOString(),
      to: nextUtcDay(analyticsRange.through)
    });
    api<Row>(`/api/analytics/business?${query}`).then((result) => {
      if (active) setBusinessAnalytics(result);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : t.apiError);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [tab, session?.access_token, profile?.role, analyticsRange.from, analyticsRange.through]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); if (!auth) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = register
        ? await auth.auth.signUp({
            email,
            password,
            options: {
              data: { name },
              // Supabase falls back to its project Site URL when this is omitted.
              // Use the current host so confirmation emails return to this deployment
              // (and to localhost during local development).
              emailRedirectTo: window.location.origin
            }
          })
        : await auth.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (register && !result.data.session) setNotice(lang === 'ar' ? 'تحقق من بريدك الإلكتروني لتفعيل الحساب.' : 'Check your email to confirm the account.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t.apiError;
      const emailRateLimited = /rate.?limit|too many email/i.test(message);
      setError(emailRateLimited
        ? (lang === 'ar'
          ? 'تم بلوغ حد إرسال رسائل التأكيد. انتظر قبل المحاولة مرة أخرى، ويجب إعداد SMTP مخصص لإرسال رسائل التسجيل بانتظام.'
          : 'The email confirmation limit has been reached. Wait before retrying; this project needs custom SMTP for regular signup emails.')
        : message);
    }
    finally { setBusy(false); }
  }

  async function signOut() { await auth?.auth.signOut(); setSession(null); setProfile(null); }

  async function calculateOrSave(save: boolean) {
    if (!selectedVariant) { setError(t.selectProduct); return; }
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount <= 0) { setError(t.chooseQty); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (save && ['manager','sales','admin'].includes(profile?.role ?? '') && !selectedCustomerId) throw new Error(t.customerRequired);
      const items = [{ variant_sku: selectedVariant.sku, quantity: amount, ...(selectedVariant.material ? { material: selectedVariant.material } : {}), ...(Object.keys(customOptions).length ? { custom_options: customOptions } : {}), design_required: profile?.role === 'customer' ? false : designRequired }];
      const data = await api<Row>(save ? '/api/quotes' : '/api/quotes/calculate', { method: 'POST', body: JSON.stringify({ items, ...(save && ['manager','sales','admin'].includes(profile?.role ?? '') ? {customer_id:selectedCustomerId} : {}) }) });
      setQuote(data); setSavedQuoteId(String(data.quote_id ?? '')); setQuoteAccepted(false); setLatestCustomerOrderId('');
      if (save) setNotice(t.quoteSaved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function acceptQuote() {
    if (!savedQuoteId) return;
    if (profile?.role === 'customer' && deliveryMethod === 'delivery' && (!deliveryAddress.street.trim() || !deliveryAddress.building.trim() || deliveryAddress.phone.replace(/\D/g, '').length < 7)) { setError(lang === 'ar' ? 'أدخل الشارع والمبنى ورقم هاتف صحيح للتوصيل.' : 'Enter the street, building number, and a valid delivery phone.'); return; }
    setBusy(true); setError('');
    try {
      if (!quoteAccepted) {
        await api(`/api/quotes/${savedQuoteId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) });
        setQuoteAccepted(true);
      }
      const result = latestCustomerOrderId
        ? { order_id: latestCustomerOrderId }
        : await api<{ order_id: string }>('/api/orders', { method: 'POST', body: JSON.stringify({ quote_id: savedQuoteId, delivery_method: profile?.role === 'customer' ? deliveryMethod : 'pickup', delivery_address: profile?.role !== 'customer' || deliveryMethod === 'pickup' ? 'Store pickup: Samia El-Gamal, Mansoura, Dakahlia' : `${deliveryAddress.district}, Mansoura, Dakahlia; ${deliveryAddress.street}, ${deliveryAddress.building}${deliveryAddress.notes ? `; ${deliveryAddress.notes}` : ''}`, delivery_phone: profile?.role === 'customer' && deliveryMethod === 'delivery' ? deliveryAddress.phone.trim() : null }) });
      setLatestCustomerOrderId(result.order_id);
      if (profile?.role === 'customer' && selectedProduct?.allow_customer_design_upload === true && customerArtwork) {
        const path = await uploadDesignFile(customerArtwork);
        await api('/api/design-requests', { method: 'POST', body: JSON.stringify({
          order_id: result.order_id,
          brief: t.artworkOrderBrief,
          reference_files: [path]
        }) });
      }
      setNotice(`${t.ordersTitle}: ${result.order_id}`); setTab('orders'); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function respondToQuote(quoteId: string, status: 'accepted' | 'rejected' | 'sent') {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/quotes/${quoteId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (status === 'accepted') {
        const result = await api<{ order_id: string }>('/api/orders', { method: 'POST', body: JSON.stringify({ quote_id: quoteId, delivery_method: 'pickup', delivery_address: 'Store pickup: Samia El-Gamal, Mansoura, Dakahlia', delivery_phone: null }) });
        setNotice(`${t.ordersTitle}: ${result.order_id}`); setTab('orders');
      } else {
        setNotice(status === 'sent' ? t.sendQuote : t.rejectQuote);
      }
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (!customerForm.email.trim() && !customerForm.phone.trim()) throw new Error(t.contactRequired);
      const result = await api<{customer_id:string}>('/api/customers', {method:'POST',body:JSON.stringify(customerForm)});
      setCustomerForm({name:'',company_name:'',email:'',phone:''});
      setNotice(lang==='ar'?'تمت إضافة العميل.':'Customer added.'); await reload(); setSelectedCustomerId(result.customer_id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function createDesign(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (!auth || !session) throw new Error(t.setupMissing);
      if (profile?.role === 'customer' && !latestCustomerOrderId) throw new Error(t.placeOrderFirst);
      if (referenceFiles.length > 10) throw new Error(lang === 'ar' ? 'الحد الأقصى 10 ملفات.' : 'Choose up to 10 reference files.');
      const referencePaths = await Promise.all(referenceFiles.map(uploadDesignFile));
      await api('/api/design-requests', { method: 'POST', body: JSON.stringify({ brief, reference_files: referencePaths, ...(latestCustomerOrderId ? { order_id: latestCustomerOrderId } : {}), ...(['manager','sales','admin'].includes(profile?.role ?? '') ? { customer_id: selectedCustomerId } : {}) }) });
      setBrief(''); setReferenceFiles([]); setNotice(lang === 'ar' ? 'تم إرسال طلب التصميم.' : 'Design request sent.'); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function uploadDesignFile(file: File): Promise<string> {
    if (!auth || !session) throw new Error(t.setupMissing);
    if (file.size > 20 * 1024 * 1024) throw new Error(lang === 'ar' ? 'حجم الملف يتجاوز 20 ميجابايت.' : 'Each design file must be 20 MB or smaller.');
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error(lang === 'ar' ? 'نوع الملف غير مدعوم.' : 'Use PNG, JPEG, WebP, or PDF artwork.');
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'artwork';
    const path = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await auth.storage.from('design-files').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (uploadError) throw uploadError;
    return path;
  }

  async function submitFinalDesign(requestId: string) {
    const file = finalDesignFiles[requestId];
    if (!file) { setError(lang === 'ar' ? 'اختر ملف التصميم النهائي أولاً.' : 'Choose the final artwork file first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const path = await uploadDesignFile(file);
      await api(`/api/design-requests/${requestId}/file`, { method: 'PATCH', body: JSON.stringify({ final_design_path: path }) });
      await api(`/api/design-requests/${requestId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'customer_review' }) });
      setFinalDesignFiles((files) => { const next = { ...files }; delete next[requestId]; return next; });
      setNotice(lang === 'ar' ? 'تم إرسال التصميم للعميل للمراجعة.' : 'Final artwork sent to the customer for review.'); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function preparePrivateFileLink(path: string) {
    if (!auth) return;
    const { data, error: linkError } = await auth.storage.from('design-files').createSignedUrl(path, 3600);
    if (linkError) { setError(linkError.message); return; }
    setPrivateFileLinks((links) => ({ ...links, [path]: data.signedUrl }));
  }

  async function prepareMarketingImageLink(path: string) {
    if (!auth) return;
    const { data, error: linkError } = await auth.storage.from('marketing-assets').createSignedUrl(path, 3600);
    if (linkError) { setError(linkError.message); return; }
    setPrivateFileLinks((links) => ({ ...links, [path]: data.signedUrl }));
  }

  async function sendAiMessage(event: FormEvent) {
    event.preventDefault();
    const content = aiInput.trim();
    if (!content || busy) return;
    // Keep the manager session lightweight; the live business tools retrieve current facts.
    const messages: AiMessage[] = [...aiMessages, { role: 'user' as const, content }].slice(-8);
    setAiMessages(messages); setAiInput(''); setBusy(true); setError('');
    try {
      const result = await api<{ reply: string }>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages }) });
      setAiMessages([...messages, { role: 'assistant' as const, content: result.reply }].slice(-8));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const showInStore = form.has('show_in_store');
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await api<{ product_id: string }>('/api/manager/products/quick-create', { method: 'POST', body: JSON.stringify({
        sku: form.get('sku'), name: form.get('name'), category: form.get('category'), base_unit: form.get('base_unit'), description: form.get('description'),
        material_description: form.get('material_description'), material: form.get('material'), width_cm: form.get('width_cm'), height_cm: form.get('height_cm'),
        available_quantity: form.get('available_quantity'), unit_price: form.get('unit_price'), design_fee: form.get('design_fee'),
        allow_customer_design_upload: form.has('allow_customer_design_upload'), requires_size: form.has('requires_size'),
        vertical_key: form.get('vertical_key'), show_in_store: showInStore
      }) });
      const image = form.get('image');
      if (image instanceof File && image.size > 0) {
        const path = await uploadStorefrontAsset(image, `products/${created.product_id}`);
        await api(`/api/manager/products/${encodeURIComponent(created.product_id)}`, { method: 'PATCH', body: JSON.stringify({ image_path: path }) });
      }
      formElement.reset(); setNotice(lang === 'ar' ? 'تم إنشاء المنتج مع سعر ومخزون افتراضيين.' : `Product created with its first price and stock record${showInStore ? ' and listed in the customer store' : ''}.`); const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const productId = String(form.get('product_id') ?? '');
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(productId)}/variants`, { method: 'POST', body: JSON.stringify({
        sku: form.get('sku'), name: form.get('name'), width_cm: form.get('width_cm') || null, height_cm: form.get('height_cm') || null,
        material: form.get('material') || null, finishing: form.get('finishing') || null, attributes: form.get('attributes'), available_quantity: form.get('available_quantity') === '' ? null : Number(form.get('available_quantity'))
      }) });
      formElement.reset(); setNotice(lang === 'ar' ? 'تم إنشاء المقاس.' : 'Product variant created.'); const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function createPriceRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountFields = ['unit_price','fixed_fee','setup_fee','design_fee','delivery_fee','installation_fee'] as const;
    const payload: Record<string, unknown> = {
      product_variant_id: form.get('product_variant_id'), quantity_min: Number(form.get('quantity_min')),
      quantity_max: form.get('quantity_max') ? Number(form.get('quantity_max')) : null,
      material: form.get('material') || null, finishing: form.get('finishing') || null,
      tax_rate: Number(form.get('tax_rate')), active_from: form.get('active_from'), reason: form.get('reason')
    };
    for (const field of amountFields) payload[field] = Number(form.get(field) || 0);
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/manager/price-rules', { method: 'POST', body: JSON.stringify(payload) });
      formElement.reset(); setNotice(lang === 'ar' ? 'تم حفظ قاعدة السعر المعتمدة.' : 'Approved shop price rule saved.'); const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function endPriceRule(ruleId: string, activeTo: string, reason: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/price-rules/${encodeURIComponent(ruleId)}`, { method: 'PATCH', body: JSON.stringify({ active_to: activeTo, reason }) });
      setNotice(lang === 'ar' ? 'تم تحديث تاريخ قاعدة السعر وتسجيل التغيير.' : 'Price rule end date updated and audited.'); const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function updateProduct(productId: string, fields: { name: string; category: string; base_unit: string; description: string; material_description?: string; allow_customer_design_upload?: boolean; image_path?: string; vertical_key: string; attributes: string }): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify(fields) });
      const result = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(result.products ?? []);
      setNotice(lang === 'ar' ? 'تم حفظ بيانات المنتج.' : 'Product details saved.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function deleteProduct(product: Product): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      if (product.image_path && auth) {
        const { error: storageError } = await auth.storage.from('storefront-assets').remove([product.image_path]);
        if (storageError) console.warn('Deleted product image cleanup failed.');
      }
      const result = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(result.products ?? []);
      setNotice(lang === 'ar' ? 'تم حذف المنتج نهائياً.' : 'Product permanently deleted.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function updateProductShopPrice(variantId: string, unitPrice: string, designFee: string, reason: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ effective_from: string }>(`/api/manager/products/${encodeURIComponent(variantId)}/price`, {
        method: 'POST', body: JSON.stringify({ unit_price: unitPrice, design_fee: designFee, reason })
      });
      const products = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(products.products ?? []);
      setNotice(lang === 'ar' ? `تم حفظ السعر الجديد ليسري من ${result.effective_from}.` : `New price saved; effective ${result.effective_from}.`);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function uploadStorefrontAsset(file: File, folder: string): Promise<string> {
    if (!auth) throw new Error(t.setupMissing);
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error(lang === 'ar' ? 'استخدم صورة JPG أو PNG أو WebP بحد أقصى 8 ميجابايت.' : 'Choose a JPG, PNG, or WebP image up to 8 MB.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100) || 'image';
    const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await auth.storage.from('storefront-assets').upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    return path;
  }

  async function uploadProductImage(productId: string, file: File): Promise<boolean> {
    setBusy(true); setError('');
    try {
      const previousPath = managerProducts.find((product) => product.id === productId)?.image_path;
      const path = await uploadStorefrontAsset(file, `products/${productId}`);
      await api(`/api/manager/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ image_path: path }) });
      const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
      if (previousPath) { const { error: removeError } = await auth!.storage.from('storefront-assets').remove([previousPath]); if (removeError) console.warn('Old product image cleanup failed.'); }
      setNotice(lang === 'ar' ? 'تم حفظ صورة المنتج.' : 'Product image saved.'); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function uploadStorefrontMedia(file: File, area: 'storefront' | 'products'): Promise<string> {
    return uploadStorefrontAsset(file, area);
  }

  async function loadProductImages(productId: string) {
    try {
      const result = await api<{ images: ProductImageGeneration[] }>(`/api/manager/products/${encodeURIComponent(productId)}/images`);
      setProductImageGenerations((current) => ({ ...current, [productId]: result.images ?? [] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
  }

  async function generateProductImage(productId: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ allowance: typeof productImageAllowance }>(`/api/manager/products/${encodeURIComponent(productId)}/images/generate`, { method: 'POST', body: JSON.stringify({}) });
      setProductImageAllowance(result.allowance);
      await loadProductImages(productId);
      setNotice(lang === 'ar' ? 'تم إنشاء صورة للمراجعة. اخترها إذا أردتها الصورة الأساسية.' : 'A product image candidate is ready. Select it to make it primary.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function selectProductImage(productId: string, generationId: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(productId)}/images/select`, { method: 'POST', body: JSON.stringify({ generation_id: generationId }) });
      await Promise.all([loadProductImages(productId), api<{ products: Product[] }>('/api/manager/products').then((result) => setManagerProducts(result.products ?? []))]);
      setNotice(lang === 'ar' ? 'تم تغيير الصورة الأساسية للمنتج.' : 'The selected image is now the product primary image.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function saveProductImageAllowance(included: number, reason: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ allowance: typeof productImageAllowance }>('/api/manager/product-images/allowance', { method: 'PUT', body: JSON.stringify({ included, reason }) });
      setProductImageAllowance(result.allowance);
      setNotice(lang === 'ar' ? 'تم تحديث حد الصور وتسجيل التغيير.' : 'Image generation allowance updated and audited.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function removeProductImage(productId: string, path: string): Promise<boolean> {
    setBusy(true); setError('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ image_path: '' }) });
      const { error: removeError } = await auth!.storage.from('storefront-assets').remove([path]);
      const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
      if (removeError) setNotice(lang === 'ar' ? 'تم فصل الصورة عن المنتج لكن تعذر حذف الملف القديم.' : 'The product image was unlinked, but the old storage file could not be deleted.');
      else setNotice(lang === 'ar' ? 'تمت إزالة صورة المنتج.' : 'Product image removed.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function saveProductOptions(productId: string, options: ProductOptionGroupDraft[], reason: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(productId)}/options`, { method: 'PUT', body: JSON.stringify({ options, reason }) });
      const result = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(result.products ?? []);
      setNotice(lang === 'ar' ? 'تم حفظ الخيارات ورسومها المعتمدة وتسجيل التغيير.' : 'Product options and approved surcharges saved and audited.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function updateVariantCapacity(variantId: string, availableQuantity: number | null): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/variants/${encodeURIComponent(variantId)}`, { method: 'PATCH', body: JSON.stringify({ available_quantity: availableQuantity }) });
      const result = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(result.products ?? []);
      setNotice(lang === 'ar' ? 'تم تحديث الكمية المتاحة للإنتاج.' : 'Production availability updated.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function configureProductOffer(productId: string, unitPrice: string, availableQuantity: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(productId)}/offer`, { method: 'POST', body: JSON.stringify({
        unit_price: unitPrice, available_quantity: availableQuantity === '' ? null : Number(availableQuantity), reason: 'Manager configured the product selling price and available quantity.'
      }) });
      const result = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(result.products ?? []);
      setNotice(lang === 'ar' ? 'تم حفظ سعر المنتج والكمية المتاحة.' : 'Product price and quantity saved.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function updateVariantAttributes(variantId: string, attributes: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/variants/${encodeURIComponent(variantId)}`, { method: 'PATCH', body: JSON.stringify({ attributes }) });
      const result = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(result.products ?? []);
      setNotice(lang === 'ar' ? 'تم حفظ مواصفات النوع.' : 'Variant specifications saved.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function promoteDemoProduct(productId: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(productId)}/promote`, { method: 'POST', body: '{}' });
      const result = await api<{ products: Product[] }>('/api/manager/products');
      setManagerProducts(result.products ?? []);
      setNotice(lang === 'ar' ? 'تم اعتماد المنتج للبيع.' : 'Product approved for customer sales.');
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); return false; }
    finally { setBusy(false); }
  }

  async function toggleProduct(product: Product) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(product.id)}`, { method: 'PATCH', body: JSON.stringify({ active: product.active === false }) });
      setNotice(lang === 'ar' ? 'تم تحديث حالة المنتج.' : 'Product availability updated.'); const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function changeJob(jobId: string, status: string) {
    setBusy(true); setError('');
    try { await api(`/api/production/${jobId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function changeOrderStatus(orderId: string, status: string) {
    if (status === 'cancelled' && !window.confirm(t.cancelOrderConfirm)) return;
    setBusy(true); setError('');
    try { await api(`/api/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function changeDesignStatus(requestId: string, status: string) {
    setBusy(true); setError('');
    try { await api(`/api/design-requests/${requestId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function generateMarketingCampaign(campaign: CampaignRequest) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ requested_posts: number; generated_posts: number; asset_ids: string[] }>('/api/manager/marketing/campaigns/generate', { method: 'POST', body: JSON.stringify(campaign) });
      let imagesCreated = 0; let imageFailures = 0;
      for (let index = 0; index < result.asset_ids.length; index += 1) {
        setNotice(lang === 'ar' ? `تم إنشاء المنشورات. جارٍ تجهيز الصورة ${index + 1} من ${result.asset_ids.length}…` : `Posts are ready. Generating image ${index + 1} of ${result.asset_ids.length}…`);
        try { await api(`/api/manager/marketing/assets/${encodeURIComponent(result.asset_ids[index])}/image`, { method: 'POST', body: JSON.stringify({}) }); imagesCreated += 1; }
        catch { imageFailures += 1; }
      }
      setNotice(lang === 'ar' ? `تم إنشاء ${result.generated_posts} من ${result.requested_posts} منشوراً، وصور ${imagesCreated}؛ تعذر إنشاء ${imageFailures}.` : `Generated ${result.generated_posts}/${result.requested_posts} posts and ${imagesCreated} images; ${imageFailures} image failures.`);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function setMarketingStatus(assetId: string, status: 'approved' | 'rejected') {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/marketing/assets/${assetId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(status === 'approved' ? (lang === 'ar' ? 'تم اعتماد المسودة. النشر لم يتم؛ يحتاج تكامل n8n.' : 'Draft approved. It is not published; n8n delivery still needs setup.') : t.rejectMarketing); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function saveMarketingDraft(asset: Row, edit: MarketingDraftEdit) {
    const id = String(asset.id);
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/marketing/assets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({
        caption: edit.caption,
        scheduled_at: edit.scheduledAt ? new Date(edit.scheduledAt).toISOString() : null,
        platform: edit.platform,
        product_id: edit.productId || null
      }) });
      setNotice(lang === 'ar' ? 'تم حفظ تعديلات المنشور.' : 'Post edits saved.');
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function deletePreviousCampaignDrafts() {
    if (!window.confirm(lang === 'ar' ? 'سيتم حذف مسودات الحملات غير المنشورة نهائياً. لن تتأثر المنشورات المنشورة.' : 'Permanently delete all unpublished campaign drafts? Published posts will not be changed.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ deleted: number }>('/api/manager/marketing/assets/drafts', { method: 'DELETE' });
      setNotice(lang === 'ar' ? `تم حذف ${result.deleted} مسودة.` : `Deleted ${result.deleted} previous campaign draft${result.deleted === 1 ? '' : 's'}.`);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function changeMarketingCampaign(id: string, update: Row) {
    setBusy(true); setError(''); setNotice('');
    try { await api(`/api/manager/marketing/campaigns/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(update) }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function generatePostImage(id: string) {
    setBusy(true); setError(''); setNotice('');
    setImageGeneratingId(id);
    try { await api(`/api/manager/marketing/assets/${encodeURIComponent(id)}/image`, { method: 'POST', body: JSON.stringify({}) }); setNotice(lang === 'ar' ? 'تم إنشاء صورة المنشور.' : 'Post image generated and saved.'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); await reload(); }
    finally { setBusy(false); setImageGeneratingId(null); }
  }

  async function uploadMarketingPostImage(id: string, file: File) {
    if (file.size > 8 * 1024 * 1024) { setError(lang === 'ar' ? 'يجب ألا يتجاوز حجم الصورة 8 ميجابايت.' : 'Image must be 8 MB or smaller.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError(lang === 'ar' ? 'ارفع صورة JPG أو PNG أو WebP.' : 'Upload a JPG, PNG, or WebP image.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/marketing/assets/${encodeURIComponent(id)}/image/upload`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
      setNotice(lang === 'ar' ? 'تم رفع الصورة وحفظها.' : 'Photo uploaded and saved.');
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); await reload(); }
    finally { setBusy(false); }
  }

  async function duplicateMarketingPost(id: string) {
    setBusy(true); setError('');
    try { await api(`/api/manager/marketing/assets/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: JSON.stringify({}) }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function addMarketingPost(campaignId: string) {
    setBusy(true); setError('');
    try { await api(`/api/manager/marketing/campaigns/${encodeURIComponent(campaignId)}/posts`, { method: 'POST', body: JSON.stringify({}) }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function deleteMarketingPost(id: string) {
    if (!window.confirm(lang === 'ar' ? 'حذف هذه المسودة نهائياً؟' : 'Permanently delete this unpublished post?')) return;
    setBusy(true); setError('');
    try { await api(`/api/manager/marketing/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  const shell = <>
      <header className={`topbar storefront-logo-${storefront.logo_placement ?? 'left'}`}>
      <a className="brand" href="#home"><span className="brand-mark">{storefront.logo_path ? <img src={storeAssetUrl(storefront.logo_path)} alt="" /> : <img src="/inkora-mark.svg" alt="" />}</span><span>{storefront.store_name || t.brand}<small>{storefront.tagline || t.tagline}</small></span></a>
      <div className="top-actions"><button className="language" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{t.language}</button>{session && <><span className="role-chip">{t.role}: {profile?.role ?? '…'}</span><button className="text-button" onClick={signOut}>{t.signOut}</button></>}</div>
    </header>
  </>;

  if (!session) return <main dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`public-store theme-${storefront.theme ?? 'midnight'} layout-${storefront.layout ?? 'wide'} font-${storefront.font_family ?? 'sans'}`} style={{ '--store-accent': storefront.accent_color, '--store-bg': storefront.background_color, '--store-surface': storefront.surface_color, '--store-text': storefront.text_color, '--store-button': storefront.button_color } as CSSProperties}>
    {shell}
    <section className={`store-hero ${storefront.hero_image_path ? 'has-manager-hero' : ''}`} id="home"><div className="store-hero-copy">{(lang === 'ar' ? storefront.announcement_ar : storefront.announcement_en) && <div className="store-announcement">{lang === 'ar' ? storefront.announcement_ar : storefront.announcement_en}</div>}<span className="eyebrow">{storefront.hero_eyebrow}</span><h1>{lang === 'ar' ? storefront.hero_title_ar : storefront.hero_title_en}</h1><p>{lang === 'ar' ? storefront.hero_description_ar : storefront.hero_description_en}</p><div className="store-hero-actions"><button className="primary" onClick={exploreCollection}>{lang === 'ar' ? storefront.cta_label_ar : storefront.cta_label_en} <span>↘</span></button><a className="text-button" href="#account">{lang === 'ar' ? 'دخول العملاء' : 'Customer sign in'} ↗</a></div><div className="store-proof"><span><b>01</b> {lang === 'ar' ? 'تسعير واضح' : 'Verified pricing'}</span><span><b>02</b> {lang === 'ar' ? 'تصميم وطباعة' : 'Design & print'}</span><span><b>03</b> {lang === 'ar' ? 'متابعة الإنتاج' : 'Order tracking'}</span></div></div><div className="store-hero-art">{storefront.hero_image_path ? <img className="manager-hero-image" src={storeAssetUrl(storefront.hero_image_path)} alt={storefront.store_name} /> : <ProductImage category="business_cards" label="INKORA identity cards"/>}<div className="hero-orbit-label">IDEAS, MADE PHYSICAL<br/><span>PRINTED IN MANSOURA</span></div></div></section>
    {tab === 'catalog' && <section className="store-catalog" id="store-catalog"><div className="store-section-heading"><div><span className="eyebrow">THE INKORA COLLECTION</span><h2>{lang === 'ar' ? 'منتجات لكل فكرة.' : 'Print for every kind of idea.'}</h2><p>{lang === 'ar' ? 'اختر منتجاً لعرض خياراته وإعداد طلبك.' : 'Choose a product to open its options and configure your order.'}</p></div><span className="count">{storefrontProducts(products, storefront).length.toString().padStart(2, '0')} ITEMS</span></div>
      <div className="store-search"><input className="search" placeholder={t.search} value={search} onChange={(event) => setSearch(event.target.value)} /><span>{busy ? t.loading : `${products.length} ${lang === 'ar' ? 'منتج متاح' : 'products available'}`}</span></div>
      {storefrontProducts(products, storefront).length === 0 ? <div className="store-empty card">{error || (lang === 'ar' ? 'لا توجد منتجات متاحة للبيع الآن. تواصل مع المتجر لمعرفة المزيد.' : 'There are no products available to order right now. Contact the shop for help.')}</div> : <StoreProductCards products={storefrontProducts(products, storefront)} lang={lang} onSelect={chooseProductForPurchase} pricingLabel={lang === 'ar' ? 'عروض أسعار معتمدة' : 'Approved-rule quotes'} />}
    </section>}
    {tab === 'buy' && <section className="public-buy-gate"><div className="eyebrow">INKORA / BUY</div><h2>{lang === 'ar' ? 'أكمل طلب الطباعة.' : 'Continue with your print order.'}</h2>{purchaseStarted && selectedVariant ? <><div className="public-buy-product"><ProductImage category={products.find((product) => product.id === selectedVariant.productId)?.category ?? ''} label={selectedVariant.productName}/><div><span>{lang === 'ar' ? 'المنتج المختار' : 'Selected product'}</span><h3>{selectedVariant.productName}</h3><p>{selectedVariant.name}</p></div></div><p>{lang === 'ar' ? 'سجّل الدخول للانتقال إلى إعداد المقاس والكمية والحصول على عرض سعر معتمد.' : 'Sign in to configure the size and quantity, get an approved quote, and place your order.'}</p><a className="primary" href="#account">{lang === 'ar' ? 'تسجيل الدخول للمتابعة' : 'Sign in to continue'} ↗</a></> : <><p>{lang === 'ar' ? 'اختر منتجاً من تبويب المتجر أولاً.' : 'Choose a product from the Store tab first.'}</p><button className="primary" onClick={() => setTab('catalog')}>{lang === 'ar' ? 'افتح المتجر' : 'Open Store'} ↗</button></>}</section>}
    <section className="auth-wrap public-auth-wrap" id="account"><div className="auth-copy"><div className="eyebrow">INKORA CUSTOMER ACCOUNT</div><h2>{t.welcome}</h2><p>{t.welcomeText}</p><div className="auth-points"><span>01 / Choose a print</span><span>02 / Review your artwork</span><span>03 / Track your order</span></div></div><form className="card auth-card" onSubmit={submitAuth}><h2>{register ? t.createAccount : t.signIn}</h2>{register && <label>{t.name}<input required value={name} onChange={(e) => setName(e.target.value)} /></label>}<label>{t.email}<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>{t.password}<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>{!auth && <p className="error">{t.setupMissing}</p>}{error && <p className="error">{error}</p>}{notice && <p className="notice">{notice}</p>}<button className="primary" disabled={busy || !auth}>{busy ? t.loading : register ? t.createAccount : t.signIn}</button><button type="button" className="text-button centered" onClick={() => setRegister(!register)}>{register ? t.signIn : t.createAccount}</button></form></section>
    <footer className="store-footer"><span>INKORA — CREATE. PRINT. GROW.</span><span>MANSOURA, EGYPT · MADE FOR REAL BUSINESS</span><a href="#home">BACK TO TOP ↑</a></footer>
  </main>;

  const customerTabs: Tab[] = ['catalog', 'orders'];
  const tabs: Tab[] = isManager ? ['dashboard','analytics','products','storefront','automations','orders','customers','marketing','ai'] : profile?.role === 'production' ? ['orders','inventory','production','design'] : profile?.role === 'marketing' ? ['marketing'] : profile?.role === 'sales' ? ['catalog','orders','customers'] : customerTabs;

  return <main dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    {shell}
    <div className="dashboard">
      <aside className="sidebar"><div className="sidebar-label">{isManager ? 'BUSINESS WORKSPACE' : 'CUSTOMER PORTAL'}</div>{tabs.map((key) => <button key={key} className={`nav-item ${tab === key || (key === 'catalog' && tab === 'buy') || (isManager && key === 'products' && tab === 'inventory') ? 'selected' : ''}`} onClick={() => setTab(key)}><span className="nav-dot" />{t[key]}</button>)}<div className="sidebar-bottom"><div className="mini-label">{profile?.role ?? 'customer'}</div><div className="mini-user">{session.user.email}</div></div></aside>
      <section className="content">
        <div className="content-head"><div><div className="eyebrow">INKORA / {String(tab).toUpperCase()}</div><h1>{tab === 'storefront' ? t.storefront : tab === 'automations' ? t.automations : tab === 'dashboard' ? t.dashboardTitle : tab === 'analytics' ? t.analyticsTitle : tab === 'products' || (tab === 'inventory' && isManager) ? t.productsAdmin : tab === 'catalog' ? t.products : tab === 'buy' ? (lang === 'ar' ? 'شراء' : 'Buy') : tab === 'quotes' ? t.quotesTitle : tab === 'orders' ? t.ordersTitle : tab === 'customers' ? t.customersTitle : tab === 'design' ? t.designTitle : tab === 'inventory' ? t.inventoryTitle : tab === 'ai' ? t.aiTitle : tab === 'marketing' ? t.marketingTitle : t.productionTitle}</h1><p>{tab === 'storefront' ? (lang === 'ar' ? 'عدّل محتوى الواجهة بأمان، ثم راجع المسودة وانشرها.' : 'Safely edit storefront content, review the saved draft, and publish when ready.') : tab === 'automations' ? (lang === 'ar' ? 'تابع تسليم الأحداث إلى n8n وأعد المحاولة للأحداث الفاشلة نهائياً.' : 'Monitor event delivery to n8n and retry permanently failed events.') : tab === 'dashboard' ? t.dashboardText : tab === 'analytics' ? t.analyticsText : tab === 'products' ? (lang === 'ar' ? 'إدارة كتالوج المطبعة وأسعار البيع المعتمدة.' : 'Manage products, approved prices, and stock from the Store workspace.') : tab === 'catalog' ? t.productsText : tab === 'buy' ? (lang === 'ar' ? 'إعداد طلب الطباعة' : 'Configure your print order') : tab === 'quotes' ? t.quotesText : tab === 'orders' ? t.ordersText : tab === 'customers' ? t.customersText : tab === 'design' ? t.designText : tab === 'inventory' ? t.inventoryText : tab === 'ai' ? t.aiText : tab === 'marketing' ? t.marketingText : t.productionText}</p></div><button className="refresh" onClick={() => void reload()}>{t.refresh} ↻</button></div>
        {error && <div className="alert error">{error}</div>}{notice && <div className="alert notice">{notice}</div>}{tab === 'orders' && profile?.role === 'customer' && <div className="payment-note">{t.paymentPending}</div>}{tab === 'orders' && isManager && <div className="order-workspace-note">{lang === 'ar' ? 'قائمة تشغيل المطبعة: طلبات العملاء ومراحل الإنتاج. متابعة العميل الشخصية تظهر لحسابه فقط.' : 'Shop work queue: customer orders and production progress. Personal order tracking is available only in each customer account.'}</div>}
        {tab === 'dashboard' && isManager && <section className="manager-dashboard">
            <div className="dashboard-hero"><div className="hero-copy"><span className="hero-kicker">INKORA / DAILY BRIEFING</span><h2>{lang === 'ar' ? 'كل شغل المطبعة، في مكان واحد.' : 'Your whole shop, in one place.'}</h2><p>{lang === 'ar' ? 'تابع الطلبات والخامات ومراحل الإنتاج من لوحة واحدة.' : 'Orders and production are together. Store and reports are one click away.'}</p><button className="hero-button" onClick={() => setTab('orders')}>{t.orders}<span>↗</span></button></div><div className="hero-art" aria-hidden="true"><div className="hero-sun"/><div className="paper paper-back"/><div className="paper paper-front"><span>PRINTSHOP</span><strong>01</strong><i>STUDIO / MANSOURA</i></div><div className="hero-stamp">P·S</div></div><div className="hero-foot"><span>SHOP STATUS</span><span><i/> {lang === 'ar' ? 'متصل ببيانات المطبعة' : 'Connected to shop data'}</span></div></div>
          <div className="metric-grid"><button className="metric-card" onClick={() => setTab('orders')}><span className="metric-icon">↗</span><small>{t.activeOrders}</small><strong>{orders.filter((order) => !['delivered', 'cancelled'].includes(String(order.status))).length.toString().padStart(2, '0')}</strong><span className="metric-note">{lang === 'ar' ? 'عرض الطلبات والإنتاج' : 'Orders and production'} <b>→</b></span></button><button className="metric-card" onClick={() => setTab('inventory')}><span className="metric-icon amber">⌁</span><small>{lang === 'ar' ? 'منتجات غير متاحة' : 'Out-of-stock products'}</small><strong>{outOfStockCount.toString().padStart(2, '0')}</strong><span className="metric-note">{lang === 'ar' ? 'فتح مخزون المنتجات' : 'Open product inventory'} <b>→</b></span></button></div>
          <div className="dashboard-columns"><section className="card dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">SHOP FLOOR</span><h2>{t.recentWork}</h2></div><button className="panel-link" onClick={() => setTab('orders')}>{lang === 'ar' ? 'الطلبات' : 'View orders'} ↗</button></div>{jobs.length === 0 ? <div className="dashboard-empty"><span>✳</span><p>{t.noRecentWork}</p></div> : <div className="recent-jobs">{jobs.slice(0, 4).map((job) => <div className="recent-job" key={String(job.id)}><span className="job-avatar">{String(job.status).slice(0,1).toUpperCase()}</span><div><strong>#{String(job.order_id).slice(0,8).toUpperCase()}</strong><small>{labelStatus(job.status)} · {job.scheduled_at ? new Date(String(job.scheduled_at)).toLocaleDateString() : t.due + ' —'}</small></div><span className="job-chevron">↗</span></div>)}</div>}</section>
            <section className="card dashboard-panel attention-panel"><div className="panel-heading"><div><span className="eyebrow">{t.attention.toUpperCase()}</span><h2>{lang === 'ar' ? 'منتجات غير متاحة' : 'Out-of-stock products'}</h2></div><span className="attention-count">{outOfStockCount}</span></div><p className="subtext">{lang === 'ar' ? 'تظهر كميات المنتجات في المخزون.' : 'Product quantities are managed in Inventory.'}</p><button className="panel-link" onClick={() => setTab('inventory')}>{lang === 'ar' ? 'فتح مخزون المنتجات' : 'Open product inventory'} ↗</button></section></div>
        </section>}
        {tab === 'automations' && isManager && <AutomationManagementPage lang={lang} events={automationEvents} overview={automationOverview} busy={busy} onRetry={(id) => void retryAutomationEvent(id)} onDelete={(id) => void deleteAutomationEvent(id)} />}
        {tab === 'storefront' && isManager && <StorefrontManagementPage lang={lang} published={publishedStorefront} revisions={storefrontRevisions} products={managerProducts.map(({ id, name, sku, category }) => ({ id, name, sku, category }))} categories={[...new Set(managerProducts.map((product) => product.category).filter(Boolean))]} busy={busy} onSaveDraft={saveStorefrontDraft} onPublish={publishStorefrontDraft} onUploadAsset={uploadStorefrontMedia} />}
        {tab === 'analytics' && isManager && <BusinessAnalyticsPage lang={lang} range={analyticsRange} onRangeChange={setAnalyticsRange} data={businessAnalytics} />}
        {tab === 'products' && isManager && <><div className="store-section-heading"><div><span className="eyebrow">MANAGER STORE</span><h2>{lang === 'ar' ? 'المنتجات والمخزون' : 'Products and stock'}</h2><p>{lang === 'ar' ? 'أضف المنتج والسعر والمخزون مرة واحدة، وتحكم في ظهوره للعملاء.' : 'Add each product, price, and stock in one step; control whether customers can see it.'}</p></div><button className="secondary" onClick={() => setTab('inventory')}>{lang === 'ar' ? 'فتح المخزون' : 'Open inventory'} ↗</button></div><ProductManagementPage lang={lang} products={managerProducts} verticals={managerVerticals} busy={busy} imageAllowance={productImageAllowance} imageGenerations={productImageGenerations} onLoadImages={(id) => void loadProductImages(id)} onGenerateImage={(id) => void generateProductImage(id)} onSelectGeneratedImage={(id, generationId) => void selectProductImage(id, generationId)} onCreateProduct={createProduct} onDeleteProduct={deleteProduct} onToggleProduct={(product) => void toggleProduct(product)} onEndPriceRule={(id, date, reason) => void endPriceRule(id, date, reason)} onUpdateShopPrice={updateProductShopPrice} onUpdateProduct={updateProduct} onUploadProductImage={uploadProductImage} onRemoveProductImage={removeProductImage} onUpdateVariantCapacity={updateVariantCapacity} onConfigureProductOffer={configureProductOffer} /></>}
        {tab === 'catalog' && !isStaff && <>
          <div className="store-section-heading"><div><span className="eyebrow">THE INKORA COLLECTION</span><h2>{lang === 'ar' ? 'اختر منتجاً للشراء.' : 'Choose a product to buy.'}</h2><p>{lang === 'ar' ? 'اضغط على المنتج للانتقال إلى صفحة الشراء وإعداد المقاس والكمية والتصميم.' : 'Select a product to open its separate buying page, choose options, and request its price.'}</p></div><span className="count">{products.length.toString().padStart(2, '0')} ITEMS</span></div>
          <div className="store-search"><input className="search" placeholder={t.search} value={search} onChange={(event) => setSearch(event.target.value)} /><span>{products.length} {lang === 'ar' ? 'منتج' : 'products'}</span></div>
          {products.length === 0 ? <div className="store-empty card">{error || t.emptyOrders}</div> : <StoreProductCards products={products} lang={lang} onSelect={chooseProductForPurchase} pricingLabel={lang === 'ar' ? 'عرض سعر حسب قواعد المطبعة' : 'Shop-rule quote'} />}
        </>}
        {tab === 'buy' && profile?.role === 'customer' && !purchaseStarted && <div className="empty card"><p>{lang === 'ar' ? 'اختر المنتج الذي تريد شراءه من تبويب المتجر.' : 'Choose the product you want to buy from the Store tab.'}</p><button className="primary" onClick={() => setTab('catalog')}>{lang === 'ar' ? 'افتح المتجر' : 'Open Store'} ↗</button></div>}
        {(tab === 'catalog' && isStaff || tab === 'buy' && profile?.role === 'customer' && purchaseStarted) && <>
          <div className={`catalog-layout ${tab === 'buy' ? 'customer-buy-layout' : ''}`}><div className="product-side"><div className="section-heading"><span>{t.products}</span><span className="count">{products.length.toString().padStart(2, '0')}</span></div><input className="search" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} /><div className="product-list">{products.map((product) => { const outOfStock = productIsOutOfStock(product); return <button className="product-card" key={product.id} disabled={outOfStock} onClick={() => { const selectedSku = defaultVariantSku(product); if (selectedSku) setVariantSku(selectedSku); setCustomOptions({}); setCustomerArtwork(null); setQuote(null); setSavedQuoteId(''); }}><ProductImageFor product={product} label={product.name}/><span className="product-card-copy"><strong>{product.name}</strong><small>{product.category} · {availableVariants(product).length} {lang === 'ar' ? 'متاح' : 'available'}{outOfStock ? ` · ${lang === 'ar' ? 'نفد' : 'out of stock'}` : ''}</small></span><span className="arrow">{outOfStock ? '–' : '↗'}</span></button>; })}</div></div>
            <div className="card quote-card"><div className="card-top"><div><div className="eyebrow">{selectedProduct?.vertical_key === 'printing' ? (lang === 'ar' ? 'تجهيز طلب الطباعة' : 'PRINT ORDER BUILDER') : (lang === 'ar' ? 'تجهيز طلب المتجر' : 'STORE ORDER BUILDER')}</div><h2>{selectedVariant?.productName ?? t.selectProduct}</h2></div><span className="live-chip"><i /> LIVE</span></div>{['manager','sales','admin'].includes(profile?.role ?? '') && <label className="customer-picker">{lang==='ar'?'العميل':'Customer'}<select value={selectedCustomerId} onChange={(event)=>setSelectedCustomerId(event.target.value)}><option value="">{t.customerRequired}</option>{customers.map((customer)=><option key={customer.id} value={customer.id}>{customer.company_name || customer.name}{customer.email ? ` · ${customer.email}` : ''}</option>)}</select></label>}<label>{t.chooseVariant}<select value={variantSku} onChange={(e) => { setVariantSku(e.target.value); setCustomOptions({}); setQuote(null); setSavedQuoteId(''); }}>{orderableVariants.map((variant) => <option key={variant.id} value={variant.sku}>{variant.productName} · {variant.name} · {variant.sku}{variant.available_quantity == null ? "" : ` · ${variant.available_quantity} ${lang === "ar" ? "متاح" : "available"}`}</option>)}</select></label>{selectedProduct?.product_option_groups?.map((group) => <label key={group.key}>{lang === 'ar' ? group.label_ar : group.label_en}<select required={group.required} value={customOptions[group.key] ?? ''} onChange={(event) => { setCustomOptions((current) => { const next = { ...current }; if (event.target.value) next[group.key] = event.target.value; else delete next[group.key]; return next; }); setQuote(null); setSavedQuoteId(''); }}><option value="">{group.required ? (lang === 'ar' ? 'اختر' : 'Select') : (lang === 'ar' ? 'اختياري' : 'Optional')}</option>{group.values.map((value) => <option key={value.key} value={value.key}>{lang === 'ar' ? value.label_ar : value.label_en}{Number(value.price_adjustment) ? ` · +EGP ${Number(value.price_adjustment).toFixed(2)}${value.adjustment_type === 'per_unit' ? (lang === 'ar' ? ' لكل وحدة' : ' / unit') : ''}` : ''}</option>)}</select></label>)}<div className="form-row"><label>{t.quantity}<input type="number" min="1" step="1" max={selectedVariant?.available_quantity ?? undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><div className="meta-box">{selectedProduct?.vertical_key === 'printing' ? <><small>{lang === 'ar' ? 'خامة هذا المقاس' : 'Material for this format'}</small><strong>{selectedVariant?.material ?? '—'}</strong><small>{lang === 'ar' ? 'تحدد خامة الطباعة والمخزون المطلوب؛ السعر يحسبه النظام.' : 'Identifies print stock; the system calculates the price.'}</small></> : <><small>{lang === 'ar' ? 'مواصفات المنتج' : 'Product specifications'}</small>{Object.entries({ ...(selectedProduct?.attributes ?? {}), ...(selectedVariant?.attributes ?? {}) }).slice(0, 8).map(([key, value]) => <span key={key}><strong>{key.replaceAll('_', ' ')}: </strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>)}<small>{lang === 'ar' ? 'السعر النهائي يأتي من قواعد المتجر المعتمدة.' : 'Final price comes from the store’s approved rules.'}</small></>}</div></div>
              {profile?.role === 'customer' ? (selectedProduct?.allow_customer_design_upload === true ? <label className="optional-artwork-field"><span><strong>{lang === 'ar' ? 'رفع تصميمك (اختياري)' : 'Upload your design (optional)'}</strong><small>{lang === 'ar' ? 'يمكنك متابعة الطلب بدون رفع ملف.' : 'You can continue without a file.'}</small></span><input aria-label={lang === 'ar' ? 'رفع تصميمك' : 'Upload your design'} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setCustomerArtwork(event.currentTarget.files?.[0] ?? null)} /></label> : null) : selectedProduct?.vertical_key === 'printing' ? <label className="check-row"><input type="checkbox" checked={designRequired} onChange={(event) => setDesignRequired(event.target.checked)} />{t.designNeeded}</label> : null}

              {profile?.role === 'customer' && <fieldset className="artwork-choice delivery-choice"><legend>{lang === 'ar' ? 'طريقة الاستلام' : 'Delivery or pickup'}</legend><label className={`artwork-option ${deliveryMethod === 'delivery' ? 'selected' : ''}`}><input type="radio" name="delivery-method" checked={deliveryMethod === 'delivery'} onChange={() => setDeliveryMethod('delivery')} /><span><strong>{lang === 'ar' ? 'توصيل داخل المنصورة' : 'Deliver in Mansoura'}</strong><small>{lang === 'ar' ? 'المتجر: سامية الجمل، المنصورة، الدقهلية. رسوم التوصيل غير مضافة إلى إجمالي الطباعة، وستؤكدها المطبعة قبل التنفيذ.' : 'Shop location: Samia El-Gamal, Mansoura, Dakahlia. Delivery is not included in the print total; the shop will confirm coverage and fee before fulfillment.'}</small>{deliveryMethod === 'delivery' && <div className="form-row"><label>{lang === 'ar' ? 'المنطقة' : 'District'}<select value={deliveryAddress.district} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, district: event.target.value })}><option>Samia El-Gamal</option><option>Other Mansoura area</option></select></label><label>{lang === 'ar' ? 'الشارع' : 'Street'}<input required value={deliveryAddress.street} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, street: event.target.value })} /></label></div>}{deliveryMethod === 'delivery' && <div className="form-row"><label>{lang === 'ar' ? 'المبنى / الشقة' : 'Building / apartment'}<input required value={deliveryAddress.building} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, building: event.target.value })} /></label><label>{lang === 'ar' ? 'هاتف المستلم' : 'Recipient phone'}<input required type="tel" autoComplete="tel" value={deliveryAddress.phone} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, phone: event.target.value })} /></label></div>}{deliveryMethod === 'delivery' && <label>{lang === 'ar' ? 'ملاحظات (اختياري)' : 'Delivery notes (optional)'}<input value={deliveryAddress.notes} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, notes: event.target.value })} /></label>}</span></label><label className={`artwork-option ${deliveryMethod === 'pickup' ? 'selected' : ''}`}><input type="radio" name="delivery-method" checked={deliveryMethod === 'pickup'} onChange={() => setDeliveryMethod('pickup')} /><span><strong>{lang === 'ar' ? 'استلام من المتجر' : 'Pick up from the shop'}</strong><small>Samia El-Gamal, Mansoura, Dakahlia</small></span></label></fieldset>}
              <div className="quote-actions"><button className="primary" disabled={busy} onClick={() => void calculateOrSave(true)}>{busy ? t.loading : (lang === 'ar' ? 'احسب الإجمالي وتابع' : 'Review total and continue')}</button></div>
              <p className="fine-print">{t.marketNote}</p>
              {quote && <div className="quote-result"><div className="total-row"><span>{t.total}</span><strong>{money(quote.total, lang)}</strong></div><div className="breakdown"><span>{t.quoteBreakdown}</span><span>{money(quote.subtotal, lang)}</span>{quotedOptionSurcharge > 0 && <><span>{lang === 'ar' ? 'رسوم الخيارات' : 'Product options'}</span><span>{money(quotedOptionSurcharge, lang)}</span></>}{designRequired && <><span>{t.designFeeLabel}</span><span>{money(quotedDesignFee, lang)}</span></>}<span>{lang === 'ar' ? 'الضريبة' : 'Tax'}</span><span>{money(quote.tax, lang)}</span></div>{designRequired && !approvedDesignPriceReady && <p className="alert error">{t.designPriceMissing}</p>}{savedQuoteId && <><p className="payment-note">{t.paymentPending}</p><button className="accept" disabled={busy || (profile?.role === 'customer' && !approvedDesignPriceReady)} onClick={() => void acceptQuote()}>{quoteAccepted ? t.retryOrder : t.accept} →</button></>}</div>}
            </div></div>
          <div className="reference-banner"><span className="reference-icon">i</span><span>{t.marketNote}</span><span className="reference-tag">REFERENCE ≠ SHOP COST</span></div>
        </>}
        {tab === 'orders' && <div className="stack">{orders.length === 0 ? <div className="empty card">{t.emptyOrders}</div> : orders.map((order) => <article className="card order-row" key={String(order.id)}><div className="order-id"><span className="order-symbol">↗</span><div><strong>#{String(order.id).slice(0,8).toUpperCase()}</strong><small>{new Date(String(order.created_at)).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG')}</small></div></div>{isManager && <OrderNextAction order={order} busy={busy} lang={lang} onJob={changeJob} onOrder={changeOrderStatus} />}
<div><small>{t.status}</small><strong className="status-pill">{labelStatus(order.status)}</strong></div><div><small>{lang === 'ar' ? 'الإنتاج' : 'Production'}</small><strong>{labelStatus(order.production_status)}</strong></div><div><small>{t.paymentStatus}</small><strong className={`status-pill status-${String(order.payment_status ?? 'unpaid')}`}>{order.payment_status === 'paid' ? t.paid : order.payment_status === 'partial' ? t.partial : order.payment_status === 'refunded' ? t.refunded : t.unpaid}</strong></div>{Array.isArray(order.order_items) && (order.order_items as Row[]).map((item, index) => { const variant = item.product_variants as Row | undefined; return <div className="order-item-summary" key={String(item.id ?? index)}><small>{String(variant?.name ?? variant?.sku ?? (lang === 'ar' ? 'منتج طباعة' : 'Print item'))}</small><strong>× {Number(item.quantity).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG')}</strong></div>; })}{isManager && <div><small>{lang === 'ar' ? 'التوصيل' : 'Delivery'}</small><strong>{String(order.delivery_method ?? '—')} · {String(order.delivery_address ?? '—')}{order.delivery_phone ? ` · ${String(order.delivery_phone)}` : ''}</strong></div>}{isManager && Array.isArray(order.design_requests) && (order.design_requests as Row[]).map((request) => <div key={String(request.id)}><small>{lang === 'ar' ? 'التصميم' : 'Design request'} · {money(request.design_fee, lang)}</small><strong>{labelStatus(request.status)}</strong><small>{String(request.brief ?? '')}</small></div>)}<div><small>{lang === 'ar' ? 'الإجمالي' : 'Total'}</small><strong>{money(order.total, lang)}</strong></div><OrderProgress status={order.status === 'delivered' ? 'delivered' : order.production_status} lang={lang} />{isManager && ['confirmed','in_production'].includes(String(order.status)) && <button className="secondary compact" disabled={busy} onClick={() => void changeOrderStatus(String(order.id), 'cancelled')}>{t.cancelOrder}</button>}</article>)}</div>}

        {tab === 'quotes' && <div className="quote-list">{quotes.length === 0 ? <div className="empty card">{t.emptyQuotes}<button className="secondary compact quote-empty-action" onClick={() => setTab('catalog')}>{t.openCatalog} ↗</button></div> : quotes.map((item) => {
          const lines = Array.isArray(item.quote_items) ? item.quote_items as Row[] : [];
          const status = String(item.status);
          return <article className="card quote-row" key={String(item.id)}><div className="quote-row-head"><div className="quote-row-id"><span className="quote-mark">Q</span><div><strong>#{String(item.id).slice(0,8).toUpperCase()}</strong><small>{new Date(String(item.created_at)).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG')}</small></div></div><span className={`quote-status status-${status}`}>{labelStatus(status)}</span></div><div className="quote-row-items">{lines.map((line,index)=>{const v=line.product_variants as Row|undefined; const product=v?.products as Row|undefined; return <div className="quote-line" key={String(line.id ?? index)}><div><strong>{String(product?.name ?? v?.name ?? (lang==='ar'?'منتج طباعة':'Print item'))}</strong><small>{String(v?.name ?? v?.sku ?? '')} · {Number(line.quantity).toLocaleString(lang==='ar'?'ar-EG':'en-EG')} {lang==='ar'?'قطعة':'pcs'}</small></div><strong>{money(Number(line.unit_price)*Number(line.quantity),lang)}</strong></div>;})}</div><div className="quote-row-foot"><div><small>{lang==='ar'?'الإجمالي':'Quote total'}</small><strong>{money(item.total,lang)}</strong></div><div className="quote-row-actions">{['manager','sales','admin'].includes(profile?.role ?? '') && status==='draft' && <button className="secondary compact" disabled={busy} onClick={()=>void respondToQuote(String(item.id),'sent')}>{t.sendQuote} ↗</button>}{!isStaff && ['draft','sent'].includes(status) && <><button className="text-button" disabled={busy} onClick={()=>void respondToQuote(String(item.id),'rejected')}>{t.rejectQuote}</button><button className="primary compact" disabled={busy} onClick={()=>void respondToQuote(String(item.id),'accepted')}>{t.acceptQuote} · {t.orderFromQuote}</button></>}{status==='accepted' && <span className="quote-confirmed">✓ {lang==='ar'?'تم القبول':'Accepted'}</span>}</div></div></article>;
        })}</div>}
        {tab === 'customers' && <div className="customers-page"><form className="card customer-create form-card" onSubmit={createCustomer}><div className="eyebrow">CUSTOMER RELATIONSHIPS</div><h2>{t.newCustomer}</h2><div className="form-row"><label>{t.customerName}<input required value={customerForm.name} onChange={(event)=>setCustomerForm({...customerForm,name:event.target.value})}/></label><label>{t.companyName}<input value={customerForm.company_name} onChange={(event)=>setCustomerForm({...customerForm,company_name:event.target.value})}/></label></div><div className="form-row"><label>{t.email}<input type="email" value={customerForm.email} onChange={(event)=>setCustomerForm({...customerForm,email:event.target.value})}/></label><label>{t.phone}<input type="tel" value={customerForm.phone} onChange={(event)=>setCustomerForm({...customerForm,phone:event.target.value})}/></label></div><button className="primary" disabled={busy}>{t.newCustomer}</button></form><section className="customer-grid">{customers.length === 0 ? <div className="empty card">{t.emptyCustomers}</div> : customers.map((customer) => { const customerOrders=orders.filter((order)=>String(order.customer_id)===customer.id); const active=customerOrders.filter((order)=>!['delivered','cancelled'].includes(String(order.status))).length; return <article className="card customer-card" key={customer.id}><div className="customer-card-head"><span className="customer-avatar">{(customer.company_name || customer.name || 'C').slice(0,1).toUpperCase()}</span><span className="customer-total">{customerOrders.length.toString().padStart(2,'0')} {lang==='ar'?'طلبات':'ORDERS'}</span></div><h2>{customer.company_name || customer.name}</h2>{customer.company_name && <p className="customer-contact">{customer.name}</p>}<div className="customer-contact">{customer.email || '—'}{customer.phone ? ' · '+customer.phone : ''}</div><div className="customer-card-foot"><span><small>{lang==='ar'?'نشطة':'Active'}</small><strong>{active}</strong></span><button className="secondary compact" onClick={()=>setTab('orders')}>{lang==='ar'?'الطلبات':'View orders'} ↗</button></div></article>; })}</section></div>}
        {tab === 'design' && <div className="design-layout"><form className="card form-card" onSubmit={createDesign}><div className="eyebrow">DESIGN STUDIO / 01</div><h2>{t.designTitle}</h2>{['manager','sales','admin'].includes(profile?.role ?? '') && <label>{lang === 'ar' ? 'العميل' : 'Customer'}<select required value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}><option value="">{t.customerRequired}</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || customer.name}</option>)}</select></label>}<label>{t.brief}<textarea required minLength={8} maxLength={4000} rows={6} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={lang === 'ar' ? 'مثال: أحتاج تصميم ملصق لمقهى...' : 'Example: I need a waterproof label for my cafe…'} /></label><label>{lang === 'ar' ? 'ملفات مرجعية (حتى 10 ملفات، 20 ميجابايت للملف)' : 'Reference artwork (up to 10 files, 20 MB each)'}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []))} /></label><button className="primary" disabled={busy || (profile?.role === 'customer' && !latestCustomerOrderId)}>{busy ? t.loading : t.sendRequest}</button>{profile?.role === 'customer' && !latestCustomerOrderId && <p className="subtext">{t.placeOrderFirst}</p>}</form><div className="design-side"><div className="card designer-note"><span className="design-orbit">✳</span><div className="eyebrow">CREATIVE HANDOFF</div><h3>{lang === 'ar' ? 'من الفكرة إلى الطباعة' : 'From brief to print'}</h3><p>{t.designText}</p><span className="status-pill">MANUAL REVIEW</span></div>{requests.map((item) => { const status = String(item.status); const next: Record<string, string> = { requested: 'reviewing', reviewing: 'designing', rejected: 'designing', approved: 'completed' }; return <div className="card request-row" key={String(item.id)}><div><small>{t.status}</small><strong>{labelStatus(item.status)}</strong></div><span>{new Date(String(item.created_at)).toLocaleDateString()}</span>{Array.isArray(item.reference_files) && (item.reference_files as string[]).map((path) => <span key={path}>{privateFileLinks[path] ? <a href={privateFileLinks[path]} target="_blank" rel="noreferrer">{lang === 'ar' ? 'فتح الملف المرجعي' : 'Open reference file'}</a> : <button className="text-button" onClick={() => void preparePrivateFileLink(path)}>{lang === 'ar' ? 'عرض الملف المرجعي' : 'View reference file'}</button>}</span>)}{typeof item.final_design_url === 'string' && item.final_design_url && (privateFileLinks[item.final_design_url] ? <a href={privateFileLinks[item.final_design_url]} target="_blank" rel="noreferrer">{lang === 'ar' ? 'تحميل التصميم النهائي' : 'Download final artwork'}</a> : <button className="text-button" onClick={() => void preparePrivateFileLink(String(item.final_design_url))}>{lang === 'ar' ? 'عرض التصميم النهائي' : 'View final artwork'}</button>)}{canManageDesign && status === 'designing' && <div className="final-design-upload"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) setFinalDesignFiles((files) => ({ ...files, [String(item.id)]: file })); }} /><button className="secondary compact" disabled={busy || !finalDesignFiles[String(item.id)]} onClick={() => void submitFinalDesign(String(item.id))}>{lang === 'ar' ? 'إرسال للعميل للمراجعة' : 'Upload & send for review'}</button></div>}{profile?.role === 'customer' && status === 'customer_review' ? <><button className="secondary compact" disabled={busy} onClick={() => void changeDesignStatus(String(item.id), 'approved')}>{t.approveDesign}</button><button className="text-button" disabled={busy} onClick={() => void changeDesignStatus(String(item.id), 'rejected')}>{t.rejectDesign}</button></> : canManageDesign && next[status] ? <button className="secondary compact" disabled={busy} onClick={() => void changeDesignStatus(String(item.id), next[status])}>{t.advanceDesign} →</button> : null}</div>; })}</div></div>}
        {tab === 'inventory' && <section className="card product-inventory-page"><div className="panel-heading"><div><span className="eyebrow">INVENTORY / PRODUCTS</span><h2>{lang === 'ar' ? 'مخزون المنتجات' : 'Product inventory'}</h2><p className="subtext">{lang === 'ar' ? 'إدارة الكميات المتاحة لطلبات العملاء. لا توجد إدارة خامات في هذا القسم.' : 'Manage customer-order quantities here. This inventory view tracks products only.'}</p></div><button className="secondary compact" onClick={() => setTab('products')}>{lang === 'ar' ? 'إدارة المنتجات' : 'Manage products'} ↗</button></div>
          <div className="inventory-summary"><div className="metric"><small>{lang === 'ar' ? 'أنواع المنتجات' : 'Product formats'}</small><strong>{managerStockRows.length}</strong></div><div className="metric"><small>{lang === 'ar' ? 'غير متاح' : 'Out of stock'}</small><strong>{outOfStockCount}</strong></div><div className="metric"><small>{lang === 'ar' ? 'إجمالي المتاح' : 'Available units'}</small><strong>{managerStockRows.reduce((sum, item) => sum + (item.available_quantity == null ? 0 : Number(item.available_quantity)), 0).toLocaleString()}</strong></div></div>
          {managerStockRows.length === 0 ? <div className="empty card">{lang === 'ar' ? 'أضف منتجاً أولاً لإدارة مخزونه.' : 'Add a product first to manage its stock.'}</div> : <div className="table-wrap"><table><thead><tr><th>{lang === 'ar' ? 'المنتج' : 'Product'}</th><th>SKU</th><th>{lang === 'ar' ? 'الحالة' : 'Store status'}</th><th>{lang === 'ar' ? 'الكمية المتاحة' : 'Available quantity'}</th><th>{lang === 'ar' ? 'الإجراء' : 'Update'}</th></tr></thead><tbody>{managerStockRows.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong><small>{item.name}</small></td><td>{item.sku}</td><td>{item.available_quantity === 0 ? (lang === 'ar' ? 'نفد المخزون' : 'Out of stock') : item.available_quantity == null ? (lang === 'ar' ? 'حسب الطلب' : 'Made to order') : item.productActive ? (lang === 'ar' ? 'متاح' : 'Available') : (lang === 'ar' ? 'مخفي' : 'Hidden')}</td><td>{item.available_quantity == null ? '—' : Number(item.available_quantity).toLocaleString()}</td><td><form className="inventory-quantity-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const raw = String(form.get('available_quantity') ?? ''); void updateVariantCapacity(item.id, raw === '' ? null : Number(raw)); }}><input key={`${item.id}-${item.available_quantity ?? 'unlimited'}`} name="available_quantity" type="number" min="0" step="1" placeholder={lang === 'ar' ? 'بلا حد' : 'Unlimited'} defaultValue={item.available_quantity ?? ''} aria-label={lang === 'ar' ? `الكمية المتاحة ${item.productName}` : `Available quantity for ${item.productName}`} /><button className="secondary compact" disabled={busy}>{lang === 'ar' ? 'حفظ' : 'Save'}</button></form></td></tr>)}</tbody></table></div>}
        </section>}
        {tab === 'production' && <div className="stack">{jobs.length === 0 ? <div className="empty card">{t.noJobs}</div> : jobs.map((job) => {
          const transitions: Record<string, string> = { queued: 'prepress', prepress: 'printing', printing: 'finishing', finishing: 'quality_check', quality_check: 'ready' };
          const next = transitions[String(job.status)];
          return <article className="card production-row" key={String(job.id)}><div className="production-mark">{String(job.status).slice(0, 2).toUpperCase()}</div><div className="job-main"><strong>#{String(job.order_id).slice(0, 8).toUpperCase()}</strong><small>{job.scheduled_at ? new Date(String(job.scheduled_at)).toLocaleString() : t.due + ': —'}</small></div><div className="job-state"><small>{t.status}</small><strong>{labelStatus(job.status)}</strong><div className="stage-line"><i className={['queued','prepress','printing','finishing','quality_check','ready'].indexOf(String(job.status)) >= 0 ? 'active' : ''} /></div></div>{next ? <button className="secondary compact" disabled={busy} onClick={() => void changeJob(String(job.id), next)}>{next === 'ready' ? t.ready : t.advance} →</button> : <span className="status-pill">{labelStatus(job.status)}</span>}</article>;
        })}</div>}
        {tab === 'marketing' && <div className="marketing-workspace">
          <MarketingCampaignBuilder lang={lang} products={products.filter((product) => product.active !== false).map(({ id, name, category }) => ({ id, name, category }))} busy={busy} onGenerate={generateMarketingCampaign} />
          <MarketingCampaignWorkspace lang={lang} campaigns={marketingCampaigns} assets={marketingAssets} products={products.filter((product) => product.active !== false).map(({ id, name, category }) => ({ id, name, category }))} busy={busy} imageLinks={privateFileLinks} imageGeneratingId={imageGeneratingId} onViewImage={(path) => void prepareMarketingImageLink(path)} onCampaign={changeMarketingCampaign} onSavePost={saveMarketingDraft} onStatus={setMarketingStatus} onImage={generatePostImage} onUpload={uploadMarketingPostImage} onDuplicate={duplicateMarketingPost} onDelete={deleteMarketingPost} onDeleteAll={deletePreviousCampaignDrafts} onAddPost={addMarketingPost} />
        </div>}
        {tab === 'ai' && isManager && <section className="card ai-chat"><div className="ai-history" aria-live="polite">{aiMessages.length === 0 ? <p className="ai-welcome">{t.aiWelcome}</p> : aiMessages.map((message, index) => <article className={`ai-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === 'assistant' ? 'HERMES' : (lang === 'ar' ? 'أنت' : 'You')}</small><p>{message.content}</p></article>)}</div><form className="ai-composer" onSubmit={sendAiMessage}><textarea maxLength={4000} rows={3} value={aiInput} onChange={(event) => setAiInput(event.target.value)} placeholder={t.aiPlaceholder} /><button className="primary" disabled={busy || !aiInput.trim()}>{busy ? t.loading : t.aiSend}</button></form></section>}
        <footer className="footer"><span>INKORA · EGP · {new Date().getFullYear()}</span><span>{isStaff ? 'OPERATIONS CONSOLE' : 'CUSTOMER PORTAL'}</span></footer>
      </section>
    </div>
  </main>;
}
