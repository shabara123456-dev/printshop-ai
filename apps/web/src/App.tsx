import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { BusinessAnalyticsPage } from './features/analytics/BusinessAnalyticsPage.tsx';
import { ProductManagementPage } from './features/products/ProductManagementPage.tsx';
import { ProductArtwork, ProductImage } from './features/store/ProductArtwork.tsx';

const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const auth = supabaseUrl && publishableKey ? createClient(supabaseUrl, publishableKey) : null;

type Product = { id: string; sku: string; name: string; category: string; description?: string | null; base_unit?: string; active?: boolean; requires_design?: boolean; requires_size?: boolean; product_variants?: Variant[] };
type Variant = { id: string; sku: string; name: string; width_cm?: number | null; height_cm?: number | null; material?: string | null; public_price?: number | null; market_references?: Array<{ quantity: number; min_price: number; max_price: number; source_name: string }> };
type Profile = { user_id: string; role: string; customer_id: string | null };
type Customer = { id: string; name: string; company_name?: string | null; email?: string | null; phone?: string | null };
type Row = Record<string, unknown>;
type Language = 'en' | 'ar';
type Tab = 'dashboard' | 'analytics' | 'products' | 'catalog' | 'buy' | 'quotes' | 'orders' | 'customers' | 'design' | 'inventory' | 'production' | 'marketing' | 'ai';
type AiMessage = { role: 'user' | 'assistant'; content: string };
type ArtworkChoice = 'upload' | 'shop_design';

const preferredDemoVariantSku = 'DEMO-STICKER-10X8';

function defaultVariantSku(product: Product): string {
  const productVariants = product.product_variants ?? [];
  return productVariants.find((variant) => variant.sku === preferredDemoVariantSku)?.sku
    ?? productVariants[0]?.sku
    ?? '';
}

const words = {
  en: {
    brand: 'PRINTSHOP AI', tagline: 'Create. Print. Grow.', dashboard: 'Overview', analytics: 'Analytics', catalog: 'Store', buy: 'Buy', productsAdmin: 'Store', salesDesk: 'Sales desk', quotes: 'Quotes', orders: 'Orders', customers: 'Customers', design: 'Design studio', inventory: 'Inventory', production: 'Production', marketing: 'Marketing', ai: 'Hermes AI',
    signIn: 'Sign in', createAccount: 'Create account', email: 'Email', password: 'Password', name: 'Your name',
    artworkTitle: 'Artwork for this order', uploadArtwork: 'I have a finished design', shopDesign: 'Have PRINTSHOP AI create a design', artworkHint: 'Upload a print-ready PNG, JPEG, WebP, or PDF. The file is kept private and attached to your order.', shopDesignHint: 'A design request will be linked to this order. The approved design fee appears in your quote.', designFeeLabel: 'Design service', designPriceMissing: 'The current shop price rule does not charge the requested EGP 50 design fee yet. This order is blocked until the manager configures that approved fee.', placeOrderFirst: 'Place the print order first; then send its design brief here.', artworkRequired: 'Upload your finished design before placing this order.', artworkOrderBrief: 'Customer supplied print-ready artwork. Please review the file attached to this order.', designPlanTitle: 'Design service plan', designPlanText: 'One first concept includes up to five edit rounds. After those are used, another edit pack costs EGP 25.', designPlanStatus: 'AI generation and paid edit checkout are not connected yet.', paymentPending: 'Payment is not connected yet. This order will be recorded as unpaid.',
    welcome: 'Welcome back', welcomeText: 'Sign in to request quotes and follow your print jobs.',
    products: 'Print products', productsText: 'Choose a print, set the quantity, and get a price from the shop’s approved rules.', search: 'Search products', quantity: 'Quantity', getQuote: 'Continue to order', saveQuote: 'Continue to order',
    dashboardTitle: 'Good to see you.', dashboardText: 'Your PRINTSHOP AI workspace. Seed records are marked as demo data until you replace them with your shop’s real operations.', openCatalog: 'Create a quote', activeOrders: 'Active orders', inProduction: 'In production', lowMaterials: 'Low stock alerts', designQueue: 'Design queue', recentWork: 'Recent production', attention: 'Needs attention', allClear: 'Everything is running smoothly.', noRecentWork: 'Your production queue is clear.', productionStages: 'Production stages', stageQueued: 'Queued', stagePrint: 'Printing', stageFinish: 'Finishing', stageQuality: 'Quality check', analyticsTitle: 'Business analytics', analyticsText: 'Verified order totals from your database, compared with the previous equal period.', revenue: 'Order revenue', orderCount: 'Orders', averageOrder: 'Average order', paidOrders: 'Fully paid orders', dailyRevenue: 'Daily order value', topProducts: 'Top products', categories: 'Categories', dateFrom: 'From', dateTo: 'To', previousPeriod: 'Previous period', noAnalytics: 'No order activity in this period.',
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
    brand: 'PRINTSHOP AI', tagline: 'Create. Print. Grow.', dashboard: 'نظرة عامة', analytics: 'التحليلات', catalog: 'المتجر', buy: 'شراء', productsAdmin: 'إعداد المنتجات', salesDesk: 'المبيعات', quotes: 'عروض الأسعار', orders: 'الطلبات', customers: 'العملاء', design: 'استوديو التصميم', inventory: 'المخزون', production: 'الإنتاج', marketing: 'التسويق', ai: 'هيرمس AI',
    signIn: 'تسجيل الدخول', createAccount: 'إنشاء حساب', email: 'البريد الإلكتروني', password: 'كلمة المرور', name: 'الاسم',
    artworkTitle: 'التصميم الخاص بهذا الطلب', uploadArtwork: 'لديّ تصميم جاهز', shopDesign: 'صمّموا لي في PRINTSHOP AI', artworkHint: 'ارفع ملف PNG أو JPEG أو WebP أو PDF جاهزاً للطباعة. سيبقى الملف خاصاً ويرتبط بطلبك.', shopDesignHint: 'سنربط طلب التصميم بهذا الطلب. ستظهر رسوم التصميم المعتمدة في عرض السعر.', designFeeLabel: 'خدمة التصميم', designPriceMissing: 'قاعدة السعر الحالية لا تضيف رسوم التصميم المطلوبة وهي 50 ج.م. لا يمكن إرسال الطلب حتى يعتمد المدير هذه الرسوم.', placeOrderFirst: 'أرسل طلب الطباعة أولاً، ثم أرسل تفاصيل التصميم هنا.', artworkRequired: 'ارفع التصميم الجاهز قبل إرسال الطلب.', artworkOrderBrief: 'أرسل العميل تصميماً جاهزاً للطباعة. يرجى مراجعة الملف المرفق بالطلب.', designPlanTitle: 'خطة خدمة التصميم', designPlanText: 'يشمل التصميم المبدئي حتى خمسة جولات تعديل. بعد استخدامها، تبلغ تكلفة باقة التعديلات التالية 25 ج.م.', designPlanStatus: 'توليد التصميم بالذكاء الاصطناعي ودفع رسوم التعديلات غير متصلين حالياً.', paymentPending: 'الدفع الإلكتروني غير متصل حالياً. سيتم تسجيل هذا الطلب دون دفع.',
    welcome: 'أهلاً بعودتك', welcomeText: 'سجّل الدخول لطلب عرض سعر ومتابعة الطباعة.',
    products: 'منتجات الطباعة', productsText: 'اختر المنتج والكمية واحصل على سعر وفق قواعد المطبعة المعتمدة.', search: 'ابحث عن منتج', quantity: 'الكمية', getQuote: 'متابعة الطلب', saveQuote: 'متابعة الطلب',
    dashboardTitle: 'أهلاً بعودتك.', dashboardText: 'مساحة عمل PRINTSHOP AI. بيانات التأسيس تجريبية حتى تستبدلها ببيانات مطبعتك الفعلية.', openCatalog: 'إنشاء عرض سعر', activeOrders: 'الطلبات النشطة', inProduction: 'قيد الإنتاج', lowMaterials: 'تنبيهات المخزون', designQueue: 'طلبات التصميم', recentWork: 'أحدث مهام الإنتاج', attention: 'يحتاج متابعة', allClear: 'كل شيء يسير بشكل جيد.', noRecentWork: 'جدول الإنتاج فارغ حالياً.', productionStages: 'مراحل الإنتاج', stageQueued: 'في الانتظار', stagePrint: 'الطباعة', stageFinish: 'تشطيب', stageQuality: 'مراجعة الجودة', analyticsTitle: 'تحليلات الأعمال', analyticsText: 'إجماليات الطلبات الموثقة من قاعدة البيانات مقارنة بالفترة السابقة المماثلة.', revenue: 'قيمة الطلبات', orderCount: 'الطلبات', averageOrder: 'متوسط الطلب', paidOrders: 'طلبات مدفوعة بالكامل', dailyRevenue: 'قيمة الطلبات يومياً', topProducts: 'أفضل المنتجات', categories: 'الفئات', dateFrom: 'من', dateTo: 'إلى', previousPeriod: 'الفترة السابقة', noAnalytics: 'لا توجد حركة طلبات في هذه الفترة.',
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
  const [managerProducts, setManagerProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [variantSku, setVariantSku] = useState('');
  const [purchaseStarted, setPurchaseStarted] = useState(false);
  const [quantity, setQuantity] = useState('1000');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState({ district: 'Samia El-Gamal', street: '', building: '', phone: '', notes: '' });
  const [designRequired, setDesignRequired] = useState(false);
  const [orderDesignBrief, setOrderDesignBrief] = useState('');
  const [artworkChoice, setArtworkChoice] = useState<ArtworkChoice>('upload');
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
  const [materials, setMaterials] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [marketingAssets, setMarketingAssets] = useState<Row[]>([]);
  const [businessAnalytics, setBusinessAnalytics] = useState<Row | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState(currentUtcDates);
  const [marketingProductId, setMarketingProductId] = useState('');
  const [marketingBrief, setMarketingBrief] = useState('');
  const [marketingType, setMarketingType] = useState('product_showcase');
  const [marketingGenerateImage, setMarketingGenerateImage] = useState(false);
  const [marketingPlatform, setMarketingPlatform] = useState('instagram');
  const [brief, setBrief] = useState('');
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [finalDesignFiles, setFinalDesignFiles] = useState<Record<string, File>>({});
  const [privateFileLinks, setPrivateFileLinks] = useState<Record<string, string>>({});
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [materialForm, setMaterialForm] = useState({ sku: '', name: '', category: '', unit: '', reorder_point: '0', reorder_quantity: '0' });
  const [receiveForm, setReceiveForm] = useState({ material_id: '', quantity: '', unit_cost: '' });
  const [usageForm, setUsageForm] = useState({ variant_id: '', material_id: '', quantity_per_unit: '', waste_factor: '0' });
  const profileLoadId = useRef(0);
  const sessionRefresh = useRef<Promise<Session | null> | null>(null);

  const isStaff = ['manager', 'sales', 'production', 'admin'].includes(profile?.role ?? '');
  const isManager = ['manager', 'admin'].includes(profile?.role ?? '');
  const canManageDesign = ['manager', 'sales', 'admin'].includes(profile?.role ?? '');
  const variants = useMemo(() => products.flatMap((product) => (product.product_variants ?? []).map((variant) => ({ ...variant, productId: product.id, productName: product.name }))), [products]);
  const selectedVariant = variants.find((variant) => variant.sku === variantSku);
  const quotedDesignFee = Number((Array.isArray(quote?.breakdown) ? (quote.breakdown as Row[]) : []).reduce((sum, line) => sum + Number((line.breakdown as Row | undefined)?.design_fee ?? 0), 0).toFixed(2));
  const approvedDesignPriceReady = !designRequired || quotedDesignFee === 50;

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
    if (!sku) { setError(t.selectProduct); return; }
    setVariantSku(sku);
    setPurchaseStarted(true);
    setQuote(null); setSavedQuoteId(''); setQuoteAccepted(false);
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
      const list = await api<{ products: Product[] }>(`/api/products${search ? `?search=${encodeURIComponent(search)}` : ''}`);
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
          if (['customer','manager','sales','production','marketing','admin'].includes(role)) { indexes.design=requests.length; requests.push(api<{ design_requests: Row[] }>('/api/design-requests')); }
          else setRequests([]);
          if (['manager','marketing','admin'].includes(role)) { indexes.marketing=requests.length; requests.push(api<{ assets: Row[] }>('/api/marketing/assets')); }
          else setMarketingAssets([]);
          if (['manager','production','admin'].includes(role)) {
            indexes.inventory=requests.length; requests.push(api<{ materials: Row[] }>('/api/inventory'));
            indexes.production=requests.length; requests.push(api<{ jobs: Row[] }>('/api/production'));
          } else { setMaterials([]); setJobs([]); }
          const results = await Promise.all(requests);
          if (indexes.orders !== undefined) setOrders((results[indexes.orders] as {orders:Row[]}).orders ?? []);
          if (indexes.quotes !== undefined) setQuotes((results[indexes.quotes] as {quotes:Row[]}).quotes ?? []);
          if (indexes.customers !== undefined) { const rows=(results[indexes.customers] as {customers:Customer[]}).customers ?? []; setCustomers(rows); if (!selectedCustomerId && rows[0]) setSelectedCustomerId(rows[0].id); }
          if (indexes.design !== undefined) setRequests((results[indexes.design] as {design_requests:Row[]}).design_requests ?? []);
          if (indexes.marketing !== undefined) setMarketingAssets((results[indexes.marketing] as {assets:Row[]}).assets ?? []);
          if (indexes.inventory !== undefined) setMaterials((results[indexes.inventory] as {materials:Row[]}).materials ?? []);
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
      if (!current) { profileLoadId.current += 1; setProfile(null); setManagerProducts([]); setOrders([]); setQuotes([]); setMaterials([]); setJobs([]); setRequests([]); }
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
    api<{ products: Product[] }>('/api/manager/products').then((result) => {
      if (active) setManagerProducts(result.products ?? []);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : t.apiError);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [tab, session?.access_token, profile?.role]);

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
        ? await auth.auth.signUp({ email, password, options: { data: { name } } })
        : await auth.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (register && !result.data.session) setNotice(lang === 'ar' ? 'تحقق من بريدك الإلكتروني لتفعيل الحساب.' : 'Check your email to confirm the account.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
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
      const items = [{ variant_sku: selectedVariant.sku, quantity: amount, ...(selectedVariant.material ? { material: selectedVariant.material } : {}), design_required: designRequired }];
      const data = await api<Row>(save ? '/api/quotes' : '/api/quotes/calculate', { method: 'POST', body: JSON.stringify({ items, ...(save && ['manager','sales','admin'].includes(profile?.role ?? '') ? {customer_id:selectedCustomerId} : {}) }) });
      setQuote(data); setSavedQuoteId(String(data.quote_id ?? '')); setQuoteAccepted(false); setLatestCustomerOrderId('');
      if (save) setNotice(t.quoteSaved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function acceptQuote() {
    if (!savedQuoteId) return;
    if (profile?.role === 'customer' && deliveryMethod === 'delivery' && (!deliveryAddress.street.trim() || !deliveryAddress.building.trim() || deliveryAddress.phone.replace(/\D/g, '').length < 7)) { setError(lang === 'ar' ? 'أدخل الشارع والمبنى ورقم هاتف صحيح للتوصيل.' : 'Enter the street, building number, and a valid delivery phone.'); return; }
    if (profile?.role === 'customer' && artworkChoice === 'upload' && !customerArtwork) { setError(t.artworkRequired); return; }
    if (profile?.role === 'customer' && artworkChoice === 'shop_design' && orderDesignBrief.trim().length < 8) { setError(lang === 'ar' ? 'اكتب تفاصيل التصميم (8 أحرف على الأقل).' : 'Describe the requested design in at least 8 characters.'); return; }
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
      if (profile?.role === 'customer' && artworkChoice === 'upload' && customerArtwork) {
        const path = await uploadDesignFile(customerArtwork);
        await api('/api/design-requests', { method: 'POST', body: JSON.stringify({
          order_id: result.order_id,
          brief: t.artworkOrderBrief,
          reference_files: [path]
        }) });
      } else if (profile?.role === 'customer' && artworkChoice === 'shop_design') {
        const referencePaths = await Promise.all(referenceFiles.map(uploadDesignFile));
        await api('/api/design-requests', { method: 'POST', body: JSON.stringify({
          order_id: result.order_id,
          brief: orderDesignBrief.trim(),
          reference_files: referencePaths,
          shop_design: true
        }) });
        setLatestCustomerOrderId(result.order_id);
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
    const messages: AiMessage[] = [...aiMessages, { role: 'user' as const, content }].slice(-16);
    setAiMessages(messages); setAiInput(''); setBusy(true); setError('');
    try {
      const result = await api<{ reply: string }>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages }) });
      setAiMessages([...messages, { role: 'assistant' as const, content: result.reply }].slice(-16));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/manager/products', { method: 'POST', body: JSON.stringify({
        sku: form.get('sku'), name: form.get('name'), category: form.get('category'), base_unit: form.get('base_unit'), description: form.get('description'),
        requires_design: form.has('requires_design'), requires_size: form.has('requires_size')
      }) });
      formElement.reset(); setNotice(lang === 'ar' ? 'تم إنشاء المنتج.' : 'Product created.'); const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
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
        material: form.get('material') || null, finishing: form.get('finishing') || null
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

  async function updateProduct(productId: string, fields: { name: string; category: string; base_unit: string; description: string }): Promise<boolean> {
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

  async function toggleProduct(product: Product) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/manager/products/${encodeURIComponent(product.id)}`, { method: 'PATCH', body: JSON.stringify({ active: product.active === false }) });
      setNotice(lang === 'ar' ? 'تم تحديث حالة المنتج.' : 'Product availability updated.'); const result = await api<{ products: Product[] }>('/api/manager/products'); setManagerProducts(result.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function createMaterial(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/api/inventory/materials', { method: 'POST', body: JSON.stringify({ ...materialForm, reorder_point: Number(materialForm.reorder_point), reorder_quantity: Number(materialForm.reorder_quantity) }) });
      setMaterialForm({ sku: '', name: '', category: '', unit: '', reorder_point: '0', reorder_quantity: '0' });
      setNotice(lang === 'ar' ? 'تمت إضافة الخامة. سجّل الرصيد الافتتاحي من نموذج الاستلام.' : 'Material added. Record its opening stock in the receipt form.'); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function receiveStock(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/api/inventory/receive', { method: 'POST', body: JSON.stringify({ material_id: receiveForm.material_id, quantity: Number(receiveForm.quantity), unit_cost: receiveForm.unit_cost ? Number(receiveForm.unit_cost) : null }) });
      setReceiveForm({ material_id: '', quantity: '', unit_cost: '' }); setNotice(lang === 'ar' ? 'تم تسجيل استلام المخزون.' : 'Stock receipt recorded.'); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.apiError); }
    finally { setBusy(false); }
  }

  async function saveUsage(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const variant = variants.find((item) => item.id === usageForm.variant_id);
      if (!variant) throw new Error(t.chooseVariant);
      await api(`/api/products/${variant.productId}/material-requirements`, { method: 'POST', body: JSON.stringify({ variant_id: variant.id, material_id: usageForm.material_id, quantity_per_unit: Number(usageForm.quantity_per_unit), waste_factor: Number(usageForm.waste_factor) }) });
      setUsageForm({ variant_id: '', material_id: '', quantity_per_unit: '', waste_factor: '0' }); setNotice(lang === 'ar' ? 'تم حفظ قاعدة استهلاك الخامة.' : 'Material usage rule saved.');
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

  async function generateMarketingDraft(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/marketing/draft', { method: 'POST', body: JSON.stringify({ campaign_brief: marketingBrief, campaign_type: marketingType, product_id: marketingProductId || null, platform: marketingPlatform, generate_image: marketingGenerateImage }) });
      setMarketingBrief(''); setMarketingGenerateImage(false); setNotice(lang === 'ar' ? 'تم إنشاء المسودة وهي بانتظار الاعتماد.' : 'Campaign draft generated and queued for manager approval.'); await reload();
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

  const shell = <>
      <header className="topbar">
      <a className="brand" href="#home"><span className="brand-mark"><img src="/inkora-mark.svg" alt="" /></span><span>{t.brand}<small>{t.tagline}</small></span></a>
      <div className="top-actions"><span className="demo-indicator">DEMO / SEED DATA</span><button className="language" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{t.language}</button>{session && <><span className="role-chip">{t.role}: {profile?.role ?? '…'}</span><button className="text-button" onClick={signOut}>{t.signOut}</button></>}</div>
    </header>
  </>;

  if (!session) return <main dir={lang === 'ar' ? 'rtl' : 'ltr'} className="public-store">
    {shell}
    <section className="store-hero" id="home"><div className="store-hero-copy"><span className="eyebrow">MANSOURA PRINT STUDIO · PRINTSHOP AI</span><h1>{lang === 'ar' ? 'أفكارك، مطبوعة بعناية.' : 'Make your next idea tangible.'}</h1><p>{lang === 'ar' ? 'طباعة مخصصة، تصميم مدروس، ومتابعة واضحة من أول طلب حتى التسليم.' : 'Thoughtful print for ambitious brands. Configure a product and follow every production step from our Mansoura shop.'}</p><div className="store-hero-actions"><button className="primary" onClick={exploreCollection}>{lang === 'ar' ? 'اكتشف المنتجات' : 'Explore the collection'} <span>↘</span></button><a className="text-button" href="#account">{lang === 'ar' ? 'دخول العملاء' : 'Customer sign in'} ↗</a></div><div className="store-proof"><span><b>01</b> {lang === 'ar' ? 'تسعير واضح' : 'Verified pricing'}</span><span><b>02</b> {lang === 'ar' ? 'تصميم وطباعة' : 'Design & print'}</span><span><b>03</b> {lang === 'ar' ? 'متابعة الإنتاج' : 'Order tracking'}</span></div></div><div className="store-hero-art"><ProductImage category="business_cards" label="PRINTSHOP AI identity cards"/><div className="hero-orbit-label">IDEAS, MADE PHYSICAL<br/><span>PRINTED IN MANSOURA</span></div></div></section>
    {tab === 'catalog' && <section className="store-catalog" id="store-catalog"><div className="store-section-heading"><div><span className="eyebrow">THE PRINTSHOP AI COLLECTION</span><h2>{lang === 'ar' ? 'منتجات لكل فكرة.' : 'Print for every kind of idea.'}</h2><p>{lang === 'ar' ? 'اختر منتجاً لعرض خياراته وإعداد طلبك.' : 'Choose a product to open its options and configure your order.'}</p></div><span className="count">{products.length.toString().padStart(2, '0')} ITEMS</span></div>
      <div className="store-search"><input className="search" placeholder={t.search} value={search} onChange={(event) => setSearch(event.target.value)} /><span>{busy ? t.loading : `${products.length} ${lang === 'ar' ? 'منتج متاح' : 'products available'}`}</span></div>
      {products.length === 0 ? <div className="store-empty card">{error || (lang === 'ar' ? 'لا توجد منتجات نشطة. تأكد من اتصال قاعدة البيانات.' : 'No active products found. Check the database connection and seeded catalog.')}</div> : <div className="store-product-grid">{products.map((product) => <article className="store-product-card" key={product.id}><button className="store-product-image" aria-label={`${lang === 'ar' ? 'اشترِ' : 'Buy'} ${product.name}`} onClick={() => chooseProductForPurchase(product)}><ProductImage category={product.category} label={product.name}/><span className="store-image-arrow">↗</span></button><div className="store-product-info"><div><span>{product.category.replaceAll('_', ' ')}</span><h3>{product.name}</h3><p>{product.description || (lang === 'ar' ? 'منتج طباعة حسب الطلب.' : 'Made to order with options from the print studio.')}</p></div><button className="store-product-link" onClick={() => chooseProductForPurchase(product)}>{lang === 'ar' ? 'اشترِ هذا المنتج' : 'Buy this product'} <b>↗</b></button></div><div className="store-product-foot"><span>{product.product_variants?.length ?? 0} {lang === 'ar' ? 'خيارات' : 'formats'}</span><span>{lang === 'ar' ? 'عروض أسعار معتمدة' : 'Approved-rule quotes'}</span></div></article>)}</div>}
      <p className="store-data-note">{lang === 'ar' ? 'بيانات العرض والأسعار الأولية تجريبية وتحتاج مراجعة المطبعة قبل استقبال طلبات تجارية.' : 'Demo catalog and sample shop rules: review and replace operating values before accepting commercial orders. Market references are not used as shop prices.'}</p>
    </section>}
    {tab === 'buy' && <section className="public-buy-gate"><div className="eyebrow">PRINTSHOP AI / BUY</div><h2>{lang === 'ar' ? 'أكمل طلب الطباعة.' : 'Continue with your print order.'}</h2>{purchaseStarted && selectedVariant ? <><div className="public-buy-product"><ProductImage category={products.find((product) => product.id === selectedVariant.productId)?.category ?? ''} label={selectedVariant.productName}/><div><span>{lang === 'ar' ? 'المنتج المختار' : 'Selected product'}</span><h3>{selectedVariant.productName}</h3><p>{selectedVariant.name}</p></div></div><p>{lang === 'ar' ? 'سجّل الدخول للانتقال إلى إعداد المقاس والكمية والحصول على عرض سعر معتمد.' : 'Sign in to configure the size and quantity, get an approved quote, and place your order.'}</p><a className="primary" href="#account">{lang === 'ar' ? 'تسجيل الدخول للمتابعة' : 'Sign in to continue'} ↗</a></> : <><p>{lang === 'ar' ? 'اختر منتجاً من تبويب المتجر أولاً.' : 'Choose a product from the Store tab first.'}</p><button className="primary" onClick={() => setTab('catalog')}>{lang === 'ar' ? 'افتح المتجر' : 'Open Store'} ↗</button></>}</section>}
    <section className="auth-wrap public-auth-wrap" id="account"><div className="auth-copy"><div className="eyebrow">PRINTSHOP AI CUSTOMER ACCOUNT</div><h2>{t.welcome}</h2><p>{t.welcomeText}</p><div className="auth-points"><span>01 / Choose a print</span><span>02 / Review your artwork</span><span>03 / Track your order</span></div></div><form className="card auth-card" onSubmit={submitAuth}><h2>{register ? t.createAccount : t.signIn}</h2>{register && <label>{t.name}<input required value={name} onChange={(e) => setName(e.target.value)} /></label>}<label>{t.email}<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>{t.password}<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>{!auth && <p className="error">{t.setupMissing}</p>}{error && <p className="error">{error}</p>}{notice && <p className="notice">{notice}</p>}<button className="primary" disabled={busy || !auth}>{busy ? t.loading : register ? t.createAccount : t.signIn}</button><button type="button" className="text-button centered" onClick={() => setRegister(!register)}>{register ? t.signIn : t.createAccount}</button></form></section>
    <footer className="store-footer"><span>PRINTSHOP AI — CREATE. PRINT. GROW.</span><span>MANSOURA, EGYPT · MADE FOR REAL BUSINESS</span><a href="#home">BACK TO TOP ↑</a></footer>
  </main>;

  const customerTabs: Tab[] = ['catalog', ...(designRequired ? ['design' as const] : []), 'orders'];
  const tabs: Tab[] = isManager ? ['dashboard','analytics','products','orders','customers','marketing','ai'] : profile?.role === 'production' ? ['orders','inventory','production','design'] : profile?.role === 'marketing' ? ['marketing'] : profile?.role === 'sales' ? ['catalog','orders','customers'] : customerTabs;

  return <main dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    {shell}
    <div className="dashboard">
      <aside className="sidebar"><div className="sidebar-label">{isManager ? 'BUSINESS WORKSPACE' : 'CUSTOMER PORTAL'}</div>{tabs.map((key) => <button key={key} className={`nav-item ${tab === key || (key === 'catalog' && tab === 'buy') || (isManager && key === 'products' && tab === 'inventory') ? 'selected' : ''}`} onClick={() => setTab(key)}><span className="nav-dot" />{t[key]}</button>)}<div className="sidebar-bottom"><div className="mini-label">{profile?.role ?? 'customer'}</div><div className="mini-user">{session.user.email}</div></div></aside>
      <section className="content">
        <div className="content-head"><div><div className="eyebrow">PRINTSHOP AI / {String(tab).toUpperCase()}</div><h1>{tab === 'dashboard' ? t.dashboardTitle : tab === 'analytics' ? t.analyticsTitle : tab === 'products' || (tab === 'inventory' && isManager) ? t.productsAdmin : tab === 'catalog' ? t.products : tab === 'buy' ? (lang === 'ar' ? 'شراء' : 'Buy') : tab === 'quotes' ? t.quotesTitle : tab === 'orders' ? t.ordersTitle : tab === 'customers' ? t.customersTitle : tab === 'design' ? t.designTitle : tab === 'inventory' ? t.inventoryTitle : tab === 'ai' ? t.aiTitle : tab === 'marketing' ? t.marketingTitle : t.productionTitle}</h1><p>{tab === 'dashboard' ? t.dashboardText : tab === 'analytics' ? t.analyticsText : tab === 'products' ? (lang === 'ar' ? 'إدارة كتالوج المطبعة وأسعار البيع المعتمدة.' : 'Manage products, approved prices, and stock from the Store workspace.') : tab === 'catalog' ? t.productsText : tab === 'buy' ? (lang === 'ar' ? 'إعداد طلب الطباعة' : 'Configure your print order') : tab === 'quotes' ? t.quotesText : tab === 'orders' ? t.ordersText : tab === 'customers' ? t.customersText : tab === 'design' ? t.designText : tab === 'inventory' ? t.inventoryText : tab === 'ai' ? t.aiText : tab === 'marketing' ? t.marketingText : t.productionText}</p></div><button className="refresh" onClick={() => void reload()}>{t.refresh} ↻</button></div>
        {error && <div className="alert error">{error}</div>}{notice && <div className="alert notice">{notice}</div>}{tab === 'orders' && profile?.role === 'customer' && <div className="payment-note">{t.paymentPending}</div>}
        {tab === 'dashboard' && isManager && <section className="manager-dashboard">
            <div className="dashboard-hero"><div className="hero-copy"><span className="hero-kicker">PRINTSHOP AI / DAILY BRIEFING</span><h2>{lang === 'ar' ? 'كل شغل المطبعة، في مكان واحد.' : 'Your whole shop, in one place.'}</h2><p>{lang === 'ar' ? 'تابع الطلبات والخامات ومراحل الإنتاج من لوحة واحدة.' : 'Orders and production are together. Store and reports are one click away.'}</p><button className="hero-button" onClick={() => setTab('orders')}>{t.orders}<span>↗</span></button></div><div className="hero-art" aria-hidden="true"><div className="hero-sun"/><div className="paper paper-back"/><div className="paper paper-front"><span>PRINTSHOP</span><strong>01</strong><i>STUDIO / MANSOURA</i></div><div className="hero-stamp">P·S</div></div><div className="hero-foot"><span>SHOP STATUS</span><span><i/> {lang === 'ar' ? 'متصل ببيانات المطبعة' : 'Connected to shop data'}</span></div></div>
          <div className="metric-grid"><button className="metric-card" onClick={() => setTab('orders')}><span className="metric-icon">↗</span><small>{t.activeOrders}</small><strong>{orders.filter((order) => !['delivered', 'cancelled'].includes(String(order.status))).length.toString().padStart(2, '0')}</strong><span className="metric-note">{lang === 'ar' ? 'عرض الطلبات والإنتاج' : 'Orders and production'} <b>→</b></span></button><button className="metric-card" onClick={() => setTab('products')}><span className="metric-icon amber">⌁</span><small>{t.lowMaterials}</small><strong>{materials.filter((item) => Number(item.current_stock) - Number(item.reserved_stock) <= Number(item.reorder_point)).length.toString().padStart(2, '0')}</strong><span className="metric-note">{lang === 'ar' ? 'فتح المتجر والمخزون' : 'Open store stock'} <b>→</b></span></button></div>
          <div className="dashboard-columns"><section className="card dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">SHOP FLOOR</span><h2>{t.recentWork}</h2></div><button className="panel-link" onClick={() => setTab('orders')}>{lang === 'ar' ? 'الطلبات' : 'View orders'} ↗</button></div>{jobs.length === 0 ? <div className="dashboard-empty"><span>✳</span><p>{t.noRecentWork}</p></div> : <div className="recent-jobs">{jobs.slice(0, 4).map((job) => <div className="recent-job" key={String(job.id)}><span className="job-avatar">{String(job.status).slice(0,1).toUpperCase()}</span><div><strong>#{String(job.order_id).slice(0,8).toUpperCase()}</strong><small>{labelStatus(job.status)} · {job.scheduled_at ? new Date(String(job.scheduled_at)).toLocaleDateString() : t.due + ' —'}</small></div><span className="job-chevron">↗</span></div>)}</div>}</section>
            <section className="card dashboard-panel attention-panel"><div className="panel-heading"><div><span className="eyebrow">{t.attention.toUpperCase()}</span><h2>{t.lowStock}</h2></div><span className="attention-count">{materials.filter((item) => Number(item.current_stock) - Number(item.reserved_stock) <= Number(item.reorder_point)).length}</span></div><p className="subtext">{lang === 'ar' ? 'تظهر تفاصيل الكميات في قسم المتجر عند الحاجة.' : 'Open Store to review stock details when needed.'}</p><button className="panel-link" onClick={() => setTab('products')}>{lang === 'ar' ? 'فتح المخزون' : 'Open Store stock'} ↗</button></section></div>
        </section>}
        {tab === 'analytics' && isManager && <BusinessAnalyticsPage lang={lang} range={analyticsRange} onRangeChange={setAnalyticsRange} data={businessAnalytics} />}
        {tab === 'products' && isManager && <><div className="store-section-heading"><div><span className="eyebrow">MANAGER STORE</span><h2>{lang === 'ar' ? 'المنتجات والمخزون' : 'Products and stock'}</h2><p>{lang === 'ar' ? 'إدارة عناصر المتجر وأسعارها، أو راجع تنبيهات المخزون.' : 'Manage store items and approved prices, or review stock and materials when needed.'}</p></div><button className="secondary" onClick={() => setTab('inventory')}>{lang === 'ar' ? 'فتح المخزون' : 'Open inventory'} ↗</button></div><ProductManagementPage lang={lang} products={managerProducts} busy={busy} onCreateProduct={createProduct} onCreateVariant={createVariant} onCreatePriceRule={createPriceRule} onToggleProduct={(product) => void toggleProduct(product)} onEndPriceRule={(id, date, reason) => void endPriceRule(id, date, reason)} onUpdateProduct={updateProduct} /></>}
        {tab === 'catalog' && !isStaff && <>
          <div className="store-section-heading"><div><span className="eyebrow">THE PRINTSHOP AI COLLECTION</span><h2>{lang === 'ar' ? 'اختر منتجاً للشراء.' : 'Choose a product to buy.'}</h2><p>{lang === 'ar' ? 'اضغط على المنتج للانتقال إلى صفحة الشراء وإعداد المقاس والكمية والتصميم.' : 'Select a product to open its separate buying page, choose options, and request its price.'}</p></div><span className="count">{products.length.toString().padStart(2, '0')} ITEMS</span></div>
          <div className="store-search"><input className="search" placeholder={t.search} value={search} onChange={(event) => setSearch(event.target.value)} /><span>{products.length} {lang === 'ar' ? 'منتج' : 'products'}</span></div>
          {products.length === 0 ? <div className="store-empty card">{error || t.emptyOrders}</div> : <div className="store-product-grid">{products.map((product) => <article className="store-product-card" key={product.id}><button className="store-product-image" aria-label={`${lang === 'ar' ? 'اشترِ' : 'Buy'} ${product.name}`} onClick={() => chooseProductForPurchase(product)}><ProductImage category={product.category} label={product.name}/><span className="store-image-arrow">↗</span></button><div className="store-product-info"><div><span>{product.category.replaceAll('_', ' ')}</span><h3>{product.name}</h3><p>{product.description || (lang === 'ar' ? 'منتج طباعة حسب الطلب.' : 'Made to order with options from the print studio.')}</p></div><button className="store-product-link" onClick={() => chooseProductForPurchase(product)}>{lang === 'ar' ? 'اشترِ هذا المنتج' : 'Buy this product'} <b>↗</b></button></div><div className="store-product-foot"><span>{product.product_variants?.length ?? 0} {lang === 'ar' ? 'خيارات' : 'formats'}</span><span>{lang === 'ar' ? 'عرض سعر حسب قواعد المطبعة' : 'Shop-rule quote'}</span></div></article>)}</div>}
        </>}
        {tab === 'buy' && profile?.role === 'customer' && !purchaseStarted && <div className="empty card"><p>{lang === 'ar' ? 'اختر المنتج الذي تريد شراءه من تبويب المتجر.' : 'Choose the product you want to buy from the Store tab.'}</p><button className="primary" onClick={() => setTab('catalog')}>{lang === 'ar' ? 'افتح المتجر' : 'Open Store'} ↗</button></div>}
        {(tab === 'catalog' && isStaff || tab === 'buy' && profile?.role === 'customer' && purchaseStarted) && <>
          <div className={`catalog-layout ${tab === 'buy' ? 'customer-buy-layout' : ''}`}><div className="product-side"><div className="section-heading"><span>{t.products}</span><span className="count">{products.length.toString().padStart(2, '0')}</span></div><input className="search" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} /><div className="product-list">{products.map((product) => <button className="product-card" key={product.id} onClick={() => { const selectedSku = defaultVariantSku(product); if (selectedSku) setVariantSku(selectedSku); setQuote(null); setSavedQuoteId(''); }}><ProductImage category={product.category} label={product.name}/><span className="product-card-copy"><strong>{product.name}</strong><small>{product.category} · {product.product_variants?.length ?? 0} variants</small></span><span className="arrow">↗</span></button>)}</div></div>
            <div className="card quote-card"><div className="card-top"><div><div className="eyebrow">{lang === 'ar' ? 'تجهيز طلب الطباعة' : 'PRINT ORDER BUILDER'}</div><h2>{selectedVariant?.productName ?? t.selectProduct}</h2></div><span className="live-chip"><i /> LIVE</span></div>{['manager','sales','admin'].includes(profile?.role ?? '') && <label className="customer-picker">{lang==='ar'?'العميل':'Customer'}<select value={selectedCustomerId} onChange={(event)=>setSelectedCustomerId(event.target.value)}><option value="">{t.customerRequired}</option>{customers.map((customer)=><option key={customer.id} value={customer.id}>{customer.company_name || customer.name}{customer.email ? ` · ${customer.email}` : ''}</option>)}</select></label>}<label>{t.chooseVariant}<select value={variantSku} onChange={(e) => { setVariantSku(e.target.value); setQuote(null); setSavedQuoteId(''); }}>{variants.map((variant) => <option key={variant.id} value={variant.sku}>{variant.productName} · {variant.name} · {variant.sku}</option>)}</select></label><div className="form-row"><label>{t.quantity}<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><div className="meta-box"><small>{lang === 'ar' ? 'الخامة' : 'Material'}</small><strong>{selectedVariant?.material ?? '—'}</strong></div></div>
              {profile?.role === 'customer' ? <fieldset className="artwork-choice"><legend>{t.artworkTitle}</legend>
                <label className={`artwork-option ${artworkChoice === 'upload' ? 'selected' : ''}`}><input type="radio" name="artwork-choice" checked={artworkChoice === 'upload'} onChange={() => { setArtworkChoice('upload'); setDesignRequired(false); setQuote(null); setSavedQuoteId(''); }} /><span><strong>{t.uploadArtwork}</strong><small>{t.artworkHint}</small>{artworkChoice === 'upload' && <input aria-label={t.uploadArtwork} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setCustomerArtwork(event.target.files?.[0] ?? null)} />}</span></label>
                <label className={`artwork-option ${artworkChoice === 'shop_design' ? 'selected' : ''}`}><input type="radio" name="artwork-choice" checked={artworkChoice === 'shop_design'} onChange={() => { setArtworkChoice('shop_design'); setDesignRequired(true); setCustomerArtwork(null); setQuote(null); setSavedQuoteId(''); }} /><span><strong>{t.shopDesign} · EGP 50</strong><small>{t.shopDesignHint}</small></span></label>
               </fieldset> : <label className="check-row"><input type="checkbox" checked={designRequired} onChange={(e) => setDesignRequired(e.target.checked)} />{t.designNeeded}</label>}
               {profile?.role === 'customer' && artworkChoice === 'shop_design' && <div className="order-design-brief"><label>{t.orderDesignBrief}<textarea required minLength={8} maxLength={2000} rows={4} value={orderDesignBrief} onChange={(event) => setOrderDesignBrief(event.target.value)} placeholder={lang === 'ar' ? 'اكتب النص المطلوب والألوان وطابع التصميم...' : 'Include the wording, colors, and style you want…'} /></label><label>{lang === 'ar' ? 'الشعار أو الملفات المرجعية (اختياري)' : 'Logo or reference files (optional)'}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []))} /></label><small className="subtext">{t.designPlanStatus}</small></div>}
              {profile?.role === 'customer' && <fieldset className="artwork-choice delivery-choice"><legend>{lang === 'ar' ? 'طريقة الاستلام' : 'Delivery or pickup'}</legend><label className={`artwork-option ${deliveryMethod === 'delivery' ? 'selected' : ''}`}><input type="radio" name="delivery-method" checked={deliveryMethod === 'delivery'} onChange={() => setDeliveryMethod('delivery')} /><span><strong>{lang === 'ar' ? 'توصيل داخل المنصورة' : 'Deliver in Mansoura'}</strong><small>{lang === 'ar' ? 'المتجر: سامية الجمل، المنصورة، الدقهلية. رسوم التوصيل غير مضافة إلى إجمالي الطباعة، وستؤكدها المطبعة قبل التنفيذ.' : 'Shop location: Samia El-Gamal, Mansoura, Dakahlia. Delivery is not included in the print total; the shop will confirm coverage and fee before fulfillment.'}</small>{deliveryMethod === 'delivery' && <div className="form-row"><label>{lang === 'ar' ? 'المنطقة' : 'District'}<select value={deliveryAddress.district} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, district: event.target.value })}><option>Samia El-Gamal</option><option>Other Mansoura area</option></select></label><label>{lang === 'ar' ? 'الشارع' : 'Street'}<input required value={deliveryAddress.street} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, street: event.target.value })} /></label></div>}{deliveryMethod === 'delivery' && <div className="form-row"><label>{lang === 'ar' ? 'المبنى / الشقة' : 'Building / apartment'}<input required value={deliveryAddress.building} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, building: event.target.value })} /></label><label>{lang === 'ar' ? 'هاتف المستلم' : 'Recipient phone'}<input required type="tel" autoComplete="tel" value={deliveryAddress.phone} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, phone: event.target.value })} /></label></div>}{deliveryMethod === 'delivery' && <label>{lang === 'ar' ? 'ملاحظات (اختياري)' : 'Delivery notes (optional)'}<input value={deliveryAddress.notes} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, notes: event.target.value })} /></label>}</span></label><label className={`artwork-option ${deliveryMethod === 'pickup' ? 'selected' : ''}`}><input type="radio" name="delivery-method" checked={deliveryMethod === 'pickup'} onChange={() => setDeliveryMethod('pickup')} /><span><strong>{lang === 'ar' ? 'استلام من المتجر' : 'Pick up from the shop'}</strong><small>Samia El-Gamal, Mansoura, Dakahlia</small></span></label></fieldset>}
              <div className="quote-actions"><button className="primary" disabled={busy} onClick={() => void calculateOrSave(true)}>{busy ? t.loading : (lang === 'ar' ? 'احسب الإجمالي وتابع' : 'Review total and continue')}</button></div>
              <p className="fine-print">{t.marketNote}</p>
              {quote && <div className="quote-result"><div className="total-row"><span>{t.total}</span><strong>{money(quote.total, lang)}</strong></div><div className="breakdown"><span>{t.quoteBreakdown}</span><span>{money(quote.subtotal, lang)}</span>{designRequired && <><span>{t.designFeeLabel}</span><span>{money(quotedDesignFee, lang)}</span></>}<span>{lang === 'ar' ? 'الضريبة' : 'Tax'}</span><span>{money(quote.tax, lang)}</span></div>{designRequired && !approvedDesignPriceReady && <p className="alert error">{t.designPriceMissing}</p>}{savedQuoteId && <><p className="payment-note">{t.paymentPending}</p><button className="accept" disabled={busy || (profile?.role === 'customer' && artworkChoice === 'upload' && !customerArtwork) || (profile?.role === 'customer' && !approvedDesignPriceReady)} onClick={() => void acceptQuote()}>{quoteAccepted ? t.retryOrder : t.accept} →</button></>}</div>}
            </div></div>
          <div className="reference-banner"><span className="reference-icon">i</span><span>{t.marketNote}</span><span className="reference-tag">REFERENCE ≠ SHOP COST</span></div>
        </>}
        {tab === 'orders' && <div className="stack">{orders.length === 0 ? <div className="empty card">{t.emptyOrders}</div> : orders.map((order) => <article className="card order-row" key={String(order.id)}><div className="order-id"><span className="order-symbol">↗</span><div><strong>#{String(order.id).slice(0,8).toUpperCase()}</strong><small>{new Date(String(order.created_at)).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG')}</small></div></div><div><small>{t.status}</small><strong className="status-pill">{labelStatus(order.status)}</strong></div><div><small>{lang === 'ar' ? 'الإنتاج' : 'Production'}</small><strong>{labelStatus(order.production_status)}</strong></div><div><small>{t.paymentStatus}</small><strong className={`status-pill status-${String(order.payment_status ?? 'unpaid')}`}>{order.payment_status === 'paid' ? t.paid : order.payment_status === 'partial' ? t.partial : order.payment_status === 'refunded' ? t.refunded : t.unpaid}</strong></div>{Array.isArray(order.order_items) && (order.order_items as Row[]).map((item, index) => { const variant = item.product_variants as Row | undefined; return <div className="order-item-summary" key={String(item.id ?? index)}><small>{String(variant?.name ?? variant?.sku ?? (lang === 'ar' ? 'منتج طباعة' : 'Print item'))}</small><strong>× {Number(item.quantity).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG')}</strong></div>; })}{isManager && <div><small>{lang === 'ar' ? 'التوصيل' : 'Delivery'}</small><strong>{String(order.delivery_method ?? '—')} · {String(order.delivery_address ?? '—')}{order.delivery_phone ? ` · ${String(order.delivery_phone)}` : ''}</strong></div>}{isManager && Array.isArray(order.design_requests) && (order.design_requests as Row[]).map((request) => <div key={String(request.id)}><small>{lang === 'ar' ? 'التصميم' : 'Design request'} · {money(request.design_fee, lang)}</small><strong>{labelStatus(request.status)}</strong><small>{String(request.brief ?? '')}</small></div>)}<div><small>{lang === 'ar' ? 'الإجمالي' : 'Total'}</small><strong>{money(order.total, lang)}</strong></div><OrderProgress status={order.status === 'delivered' ? 'delivered' : order.production_status} lang={lang} />{isManager && order.status === 'ready' && <button className="secondary compact" disabled={busy} onClick={() => void changeOrderStatus(String(order.id), 'delivered')}>{t.delivered} →</button>}{isManager && ['confirmed','in_production'].includes(String(order.status)) && <button className="secondary compact" disabled={busy} onClick={() => void changeOrderStatus(String(order.id), 'cancelled')}>{t.cancelOrder}</button>}</article>)}</div>}
        {tab === 'orders' && isManager && <section className="card dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">ORDERS / PRODUCTION</span><h2>{t.recentWork}</h2></div><span className="count">{jobs.filter((job) => !['ready','cancelled'].includes(String(job.status))).length.toString().padStart(2,'0')}</span></div>{jobs.length === 0 ? <p className="subtext">{t.noJobs}</p> : jobs.map((job) => { const transitions: Record<string,string> = { queued:'prepress', prepress:'printing', printing:'finishing', finishing:'quality_check', quality_check:'ready' }; const next = transitions[String(job.status)]; return <article className="card production-row" key={String(job.id)}><div className="production-mark">{String(job.status).slice(0,2).toUpperCase()}</div><div className="job-main"><strong>#{String(job.order_id).slice(0,8).toUpperCase()}</strong><small>{job.scheduled_at ? new Date(String(job.scheduled_at)).toLocaleString() : t.due + ': —'}</small></div><div className="job-state"><small>{t.status}</small><strong>{labelStatus(job.status)}</strong></div>{next ? <button className="secondary compact" disabled={busy} onClick={() => void changeJob(String(job.id), next)}>{next === 'ready' ? t.ready : t.advance} →</button> : <span className="status-pill">{labelStatus(job.status)}</span>}</article>; })}</section>}
        {tab === 'quotes' && <div className="quote-list">{quotes.length === 0 ? <div className="empty card">{t.emptyQuotes}<button className="secondary compact quote-empty-action" onClick={() => setTab('catalog')}>{t.openCatalog} ↗</button></div> : quotes.map((item) => {
          const lines = Array.isArray(item.quote_items) ? item.quote_items as Row[] : [];
          const status = String(item.status);
          return <article className="card quote-row" key={String(item.id)}><div className="quote-row-head"><div className="quote-row-id"><span className="quote-mark">Q</span><div><strong>#{String(item.id).slice(0,8).toUpperCase()}</strong><small>{new Date(String(item.created_at)).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-EG')}</small></div></div><span className={`quote-status status-${status}`}>{labelStatus(status)}</span></div><div className="quote-row-items">{lines.map((line,index)=>{const v=line.product_variants as Row|undefined; const product=v?.products as Row|undefined; return <div className="quote-line" key={String(line.id ?? index)}><div><strong>{String(product?.name ?? v?.name ?? (lang==='ar'?'منتج طباعة':'Print item'))}</strong><small>{String(v?.name ?? v?.sku ?? '')} · {Number(line.quantity).toLocaleString(lang==='ar'?'ar-EG':'en-EG')} {lang==='ar'?'قطعة':'pcs'}</small></div><strong>{money(Number(line.unit_price)*Number(line.quantity),lang)}</strong></div>;})}</div><div className="quote-row-foot"><div><small>{lang==='ar'?'الإجمالي':'Quote total'}</small><strong>{money(item.total,lang)}</strong></div><div className="quote-row-actions">{['manager','sales','admin'].includes(profile?.role ?? '') && status==='draft' && <button className="secondary compact" disabled={busy} onClick={()=>void respondToQuote(String(item.id),'sent')}>{t.sendQuote} ↗</button>}{!isStaff && ['draft','sent'].includes(status) && <><button className="text-button" disabled={busy} onClick={()=>void respondToQuote(String(item.id),'rejected')}>{t.rejectQuote}</button><button className="primary compact" disabled={busy} onClick={()=>void respondToQuote(String(item.id),'accepted')}>{t.acceptQuote} · {t.orderFromQuote}</button></>}{status==='accepted' && <span className="quote-confirmed">✓ {lang==='ar'?'تم القبول':'Accepted'}</span>}</div></div></article>;
        })}</div>}
        {tab === 'customers' && <div className="customers-page"><form className="card customer-create form-card" onSubmit={createCustomer}><div className="eyebrow">CUSTOMER RELATIONSHIPS</div><h2>{t.newCustomer}</h2><div className="form-row"><label>{t.customerName}<input required value={customerForm.name} onChange={(event)=>setCustomerForm({...customerForm,name:event.target.value})}/></label><label>{t.companyName}<input value={customerForm.company_name} onChange={(event)=>setCustomerForm({...customerForm,company_name:event.target.value})}/></label></div><div className="form-row"><label>{t.email}<input type="email" value={customerForm.email} onChange={(event)=>setCustomerForm({...customerForm,email:event.target.value})}/></label><label>{t.phone}<input type="tel" value={customerForm.phone} onChange={(event)=>setCustomerForm({...customerForm,phone:event.target.value})}/></label></div><button className="primary" disabled={busy}>{t.newCustomer}</button></form><section className="customer-grid">{customers.length === 0 ? <div className="empty card">{t.emptyCustomers}</div> : customers.map((customer) => { const customerOrders=orders.filter((order)=>String(order.customer_id)===customer.id); const active=customerOrders.filter((order)=>!['delivered','cancelled'].includes(String(order.status))).length; return <article className="card customer-card" key={customer.id}><div className="customer-card-head"><span className="customer-avatar">{(customer.company_name || customer.name || 'C').slice(0,1).toUpperCase()}</span><span className="customer-total">{customerOrders.length.toString().padStart(2,'0')} {lang==='ar'?'طلبات':'ORDERS'}</span></div><h2>{customer.company_name || customer.name}</h2>{customer.company_name && <p className="customer-contact">{customer.name}</p>}<div className="customer-contact">{customer.email || '—'}{customer.phone ? ' · '+customer.phone : ''}</div><div className="customer-card-foot"><span><small>{lang==='ar'?'نشطة':'Active'}</small><strong>{active}</strong></span><button className="secondary compact" onClick={()=>setTab('orders')}>{lang==='ar'?'الطلبات':'View orders'} ↗</button></div></article>; })}</section></div>}
        {tab === 'design' && <div className="design-layout">{profile?.role === 'customer' && <section className="card design-service-plan"><span className="eyebrow">PRINTSHOP AI / DESIGN SERVICE</span><h2>{t.designPlanTitle}</h2><p>{t.designPlanText}</p><div className="design-plan-price"><strong>EGP 50</strong><span>{t.designFeeLabel}</span></div><p className="integration-note">{t.designPlanStatus}</p></section>}<form className="card form-card" onSubmit={createDesign}><div className="eyebrow">DESIGN STUDIO / 01</div><h2>{t.designTitle}</h2>{['manager','sales','admin'].includes(profile?.role ?? '') && <label>{lang === 'ar' ? 'العميل' : 'Customer'}<select required value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}><option value="">{t.customerRequired}</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || customer.name}</option>)}</select></label>}<label>{t.brief}<textarea required minLength={8} maxLength={4000} rows={6} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={lang === 'ar' ? 'مثال: أحتاج تصميم ملصق لمقهى...' : 'Example: I need a waterproof label for my cafe…'} /></label><label>{lang === 'ar' ? 'ملفات مرجعية (حتى 10 ملفات، 20 ميجابايت للملف)' : 'Reference artwork (up to 10 files, 20 MB each)'}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []))} /></label><button className="primary" disabled={busy || (profile?.role === 'customer' && !latestCustomerOrderId)}>{busy ? t.loading : t.sendRequest}</button>{profile?.role === 'customer' && !latestCustomerOrderId && <p className="subtext">{t.placeOrderFirst}</p>}</form><div className="design-side"><div className="card designer-note"><span className="design-orbit">✳</span><div className="eyebrow">CREATIVE HANDOFF</div><h3>{lang === 'ar' ? 'من الفكرة إلى الطباعة' : 'From brief to print'}</h3><p>{t.designText}</p><span className="status-pill">MANUAL REVIEW</span></div>{requests.map((item) => { const status = String(item.status); const next: Record<string, string> = { requested: 'reviewing', reviewing: 'designing', rejected: 'designing', approved: 'completed' }; return <div className="card request-row" key={String(item.id)}><div><small>{t.status}</small><strong>{labelStatus(item.status)}</strong></div><span>{new Date(String(item.created_at)).toLocaleDateString()}</span>{Array.isArray(item.reference_files) && (item.reference_files as string[]).map((path) => <span key={path}>{privateFileLinks[path] ? <a href={privateFileLinks[path]} target="_blank" rel="noreferrer">{lang === 'ar' ? 'فتح الملف المرجعي' : 'Open reference file'}</a> : <button className="text-button" onClick={() => void preparePrivateFileLink(path)}>{lang === 'ar' ? 'عرض الملف المرجعي' : 'View reference file'}</button>}</span>)}{typeof item.final_design_url === 'string' && item.final_design_url && (privateFileLinks[item.final_design_url] ? <a href={privateFileLinks[item.final_design_url]} target="_blank" rel="noreferrer">{lang === 'ar' ? 'تحميل التصميم النهائي' : 'Download final artwork'}</a> : <button className="text-button" onClick={() => void preparePrivateFileLink(String(item.final_design_url))}>{lang === 'ar' ? 'عرض التصميم النهائي' : 'View final artwork'}</button>)}{canManageDesign && status === 'designing' && <div className="final-design-upload"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) setFinalDesignFiles((files) => ({ ...files, [String(item.id)]: file })); }} /><button className="secondary compact" disabled={busy || !finalDesignFiles[String(item.id)]} onClick={() => void submitFinalDesign(String(item.id))}>{lang === 'ar' ? 'إرسال للعميل للمراجعة' : 'Upload & send for review'}</button></div>}{profile?.role === 'customer' && status === 'customer_review' ? <><button className="secondary compact" disabled={busy} onClick={() => void changeDesignStatus(String(item.id), 'approved')}>{t.approveDesign}</button><button className="text-button" disabled={busy} onClick={() => void changeDesignStatus(String(item.id), 'rejected')}>{t.rejectDesign}</button></> : canManageDesign && next[status] ? <button className="secondary compact" disabled={busy} onClick={() => void changeDesignStatus(String(item.id), next[status])}>{t.advanceDesign} →</button> : null}</div>; })}</div></div>}
        {tab === 'inventory' && <div className="stack">{isManager && <button className="secondary compact" onClick={() => setTab('products')}>← {lang === 'ar' ? 'العودة إلى المتجر' : 'Back to Store'}</button>}<div className="inventory-summary"><div className="metric"><small>{t.materials}</small><strong>{materials.length}</strong></div><div className="metric"><small>{t.lowStock}</small><strong>{materials.filter((item) => Number(item.current_stock) - Number(item.reserved_stock) <= Number(item.reorder_point)).length}</strong></div><div className="metric"><small>{t.suggestion}</small><strong>{materials.filter((item) => Number(item.current_stock) - Number(item.reserved_stock) <= Number(item.reorder_point)).reduce((sum, item) => sum + Number(item.reorder_quantity), 0)}</strong></div></div>
            <section className="card purchase-suggestions"><div className="panel-heading"><div><span className="eyebrow">PROCUREMENT</span><h2>{lang === 'ar' ? 'اقتراحات إعادة الشراء' : 'Purchase suggestions'}</h2></div><span className="attention-count">{materials.filter((item) => Number(item.current_stock)-Number(item.reserved_stock) <= Number(item.reorder_point)).length}</span></div>{materials.filter((item) => Number(item.current_stock)-Number(item.reserved_stock) <= Number(item.reorder_point)).length === 0 ? <p className="subtext">{t.allClear}</p> : <div className="table-wrap"><table><thead><tr><th>{t.materialName}</th><th>{lang === 'ar' ? 'المتاح' : 'Available'}</th><th>{t.reorderPoint}</th><th>{t.suggestion}</th></tr></thead><tbody>{materials.filter((item) => Number(item.current_stock)-Number(item.reserved_stock) <= Number(item.reorder_point)).map((item) => <tr key={String(item.id)}><td>{String(item.name)}</td><td>{(Number(item.current_stock)-Number(item.reserved_stock)).toFixed(3)} {String(item.unit)}</td><td>{String(item.reorder_point)} {String(item.unit)}</td><td><strong>{String(item.reorder_quantity)} {String(item.unit)}</strong></td></tr>)}</tbody></table></div>}</section>
            <div className="inventory-grid"><form className="card form-card" onSubmit={createMaterial}><div className="eyebrow">MATERIAL SETUP</div><h2>{t.createMaterial}</h2><div className="form-row"><label>{t.sku}<input required value={materialForm.sku} onChange={(e) => setMaterialForm({ ...materialForm, sku: e.target.value })} /></label><label>{t.materialName}<input required value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} /></label></div><div className="form-row"><label>{t.category}<input required value={materialForm.category} onChange={(e) => setMaterialForm({ ...materialForm, category: e.target.value })} /></label><label>{t.unit}<input required placeholder="meter / sheet / piece" value={materialForm.unit} onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })} /></label></div><div className="form-row"><label>{t.reorderPoint}<input type="number" min="0" step="0.001" value={materialForm.reorder_point} onChange={(e) => setMaterialForm({ ...materialForm, reorder_point: e.target.value })} /></label><label>{t.reorderQty}<input type="number" min="0" step="0.001" value={materialForm.reorder_quantity} onChange={(e) => setMaterialForm({ ...materialForm, reorder_quantity: e.target.value })} /></label></div><button className="primary" disabled={busy}>{t.createMaterial}</button></form>
              <form className="card form-card" onSubmit={receiveStock}><div className="eyebrow">INVENTORY LEDGER</div><h2>{t.receive}</h2><label>{t.chooseMaterial}<select required value={receiveForm.material_id} onChange={(e) => setReceiveForm({ ...receiveForm, material_id: e.target.value })}><option value="">—</option>{materials.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.sku)} · {String(item.name)}</option>)}</select></label><div className="form-row"><label>{t.receiveQty}<input required type="number" min="0.001" step="0.001" value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} /></label><label>{t.unitCost}<input type="number" min="0" step="0.0001" value={receiveForm.unit_cost} onChange={(e) => setReceiveForm({ ...receiveForm, unit_cost: e.target.value })} /></label></div><button className="secondary" disabled={busy}>{t.receive}</button></form></div>
            <form className="card form-card" onSubmit={saveUsage}><div className="eyebrow">PRODUCTION INPUTS</div><h2>{t.mapTitle}</h2><p className="subtext">{t.mapText}</p><div className="form-row"><label>{t.chooseVariant}<select required value={usageForm.variant_id} onChange={(e) => setUsageForm({ ...usageForm, variant_id: e.target.value })}><option value="">—</option>{variants.map((item) => <option key={item.id} value={item.id}>{item.productName} · {item.name}</option>)}</select></label><label>{t.chooseMaterial}<select required value={usageForm.material_id} onChange={(e) => setUsageForm({ ...usageForm, material_id: e.target.value })}><option value="">—</option>{materials.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.sku)} · {String(item.name)} ({String(item.unit)})</option>)}</select></label></div><div className="form-row"><label>{t.qtyPerUnit}<input required type="number" min="0.000001" step="0.000001" value={usageForm.quantity_per_unit} onChange={(e) => setUsageForm({ ...usageForm, quantity_per_unit: e.target.value })} /></label><label>{t.waste}<input type="number" min="0" max="10" step="0.01" value={usageForm.waste_factor} onChange={(e) => setUsageForm({ ...usageForm, waste_factor: e.target.value })} /></label></div><button className="primary" disabled={busy}>{t.saveRequirement}</button></form>
            <div className="card table-card"><div className="section-heading"><span>{t.materials}</span><span className="count">{materials.length.toString().padStart(2, '0')}</span></div><div className="table-wrap"><table><thead><tr><th>{t.sku}</th><th>{t.materialName}</th><th>{t.unit}</th><th>{lang === 'ar' ? 'المتاح' : 'Available'}</th><th>{t.reorderPoint}</th></tr></thead><tbody>{materials.map((item) => <tr key={String(item.id)}><td>{String(item.sku)}</td><td>{String(item.name)}</td><td>{String(item.unit)}</td><td>{(Number(item.current_stock) - Number(item.reserved_stock)).toFixed(3)}</td><td>{String(item.reorder_point)}</td></tr>)}</tbody></table></div></div></div>}
        {tab === 'production' && <div className="stack">{jobs.length === 0 ? <div className="empty card">{t.noJobs}</div> : jobs.map((job) => {
          const transitions: Record<string, string> = { queued: 'prepress', prepress: 'printing', printing: 'finishing', finishing: 'quality_check', quality_check: 'ready' };
          const next = transitions[String(job.status)];
          return <article className="card production-row" key={String(job.id)}><div className="production-mark">{String(job.status).slice(0, 2).toUpperCase()}</div><div className="job-main"><strong>#{String(job.order_id).slice(0, 8).toUpperCase()}</strong><small>{job.scheduled_at ? new Date(String(job.scheduled_at)).toLocaleString() : t.due + ': —'}</small></div><div className="job-state"><small>{t.status}</small><strong>{labelStatus(job.status)}</strong><div className="stage-line"><i className={['queued','prepress','printing','finishing','quality_check','ready'].indexOf(String(job.status)) >= 0 ? 'active' : ''} /></div></div>{next ? <button className="secondary compact" disabled={busy} onClick={() => void changeJob(String(job.id), next)}>{next === 'ready' ? t.ready : t.advance} →</button> : <span className="status-pill">{labelStatus(job.status)}</span>}</article>;
        })}</div>}
        {tab === 'marketing' && <div className="marketing-layout"><form className="card form-card" onSubmit={generateMarketingDraft}><div className="eyebrow">MARKETING / APPROVAL REQUIRED</div><h2>{t.generateDraft}</h2><p className="subtext">{t.marketingText}</p><label>{t.campaignBrief}<textarea required minLength={8} maxLength={1500} rows={5} value={marketingBrief} onChange={(event) => setMarketingBrief(event.target.value)} placeholder={lang === 'ar' ? 'مثال: حملة توعوية عن جودة الطباعة للمشروعات الصغيرة' : 'Example: Promote print quality for small businesses'} /></label><div className="form-row"><label>{t.campaignType}<select value={marketingType} onChange={(event) => setMarketingType(event.target.value)}><option value="product_showcase">Product showcase</option><option value="promotion">Promotion</option><option value="educational">Educational</option><option value="seasonal">Seasonal</option><option value="brand">Brand</option><option value="engagement">Engagement</option><option value="new_product">New product</option></select></label><label>{t.campaignProduct}<select value={marketingProductId} onChange={(event) => setMarketingProductId(event.target.value)}><option value="">{lang === 'ar' ? 'بدون منتج محدد' : 'No specific product'}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label></div><label>{lang === 'ar' ? 'المنصة' : 'Platform'}<select value={marketingPlatform} onChange={(event) => setMarketingPlatform(event.target.value)}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="x">X</option><option value="general">General</option></select></label><label className="check-row"><input type="checkbox" checked={marketingGenerateImage} onChange={(event) => setMarketingGenerateImage(event.target.checked)} />{t.campaignImage}</label><small className="subtext">{t.campaignImageUnavailable}</small><button className="primary" disabled={busy || !marketingBrief.trim()}>{busy ? t.loading : t.generateDraft}</button></form><section className="marketing-assets">{marketingAssets.length === 0 ? <div className="empty card">{t.noMarketingAssets}</div> : marketingAssets.map((asset) => <article className="card marketing-card" key={String(asset.id)}><div className="marketing-card-top"><span className="eyebrow">{String(asset.platform ?? 'GENERAL').toUpperCase()}</span><span className={`status-pill status-${String(asset.status)}`}>{labelStatus(asset.status)}</span></div><small>{t.independentCampaign}{asset.products && typeof asset.products === 'object' ? ` · ${String((asset.products as Row).name ?? '')}` : ''}</small><p>{String(asset.campaign_brief ?? '')}</p>{typeof asset.design_url === 'string' && asset.design_url && (privateFileLinks[asset.design_url] ? <a href={privateFileLinks[asset.design_url]} target="_blank" rel="noreferrer"><img className="marketing-artwork" src={privateFileLinks[asset.design_url]} alt={t.viewMarketingImage} /></a> : <button className="text-button" onClick={() => void prepareMarketingImageLink(String(asset.design_url))}>{t.viewMarketingImage}</button>)}<p>{String(asset.caption ?? '')}</p>{isManager && asset.status === 'pending_approval' && <div className="marketing-actions"><button className="primary" disabled={busy} onClick={() => void setMarketingStatus(String(asset.id), 'approved')}>{t.approveMarketing}</button><button className="secondary" disabled={busy} onClick={() => void setMarketingStatus(String(asset.id), 'rejected')}>{t.rejectMarketing}</button></div>}</article>)}</section></div>}        {tab === 'ai' && isManager && <section className="card ai-chat"><div className="ai-history" aria-live="polite">{aiMessages.length === 0 ? <p className="ai-welcome">{t.aiWelcome}</p> : aiMessages.map((message, index) => <article className={`ai-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === 'assistant' ? 'HERMES' : (lang === 'ar' ? 'أنت' : 'You')}</small><p>{message.content}</p></article>)}</div><form className="ai-composer" onSubmit={sendAiMessage}><textarea maxLength={4000} rows={3} value={aiInput} onChange={(event) => setAiInput(event.target.value)} placeholder={t.aiPlaceholder} /><button className="primary" disabled={busy || !aiInput.trim()}>{busy ? t.loading : t.aiSend}</button></form></section>}
        <footer className="footer"><span>PRINTSHOP AI · EGP · {new Date().getFullYear()}</span><span>{isStaff ? 'OPERATIONS CONSOLE' : 'CUSTOMER PORTAL'}</span></footer>
      </section>
    </div>
  </main>;
}
