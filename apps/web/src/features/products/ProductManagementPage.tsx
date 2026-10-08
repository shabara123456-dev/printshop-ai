import { useState, type FormEvent } from 'react';
import './ProductManagementPage.css';
import { ProductOptionsEditor, type ProductOptionGroupDraft } from './ProductOptionsEditor.tsx';

type Language = 'en' | 'ar';
type Vertical = { vertical_key: string; label_en: string; label_ar: string; capabilities: Record<string, unknown>; active: boolean };
type PriceRule = { id: string; quantity_min: number; quantity_max: number | null; material: string | null; finishing: string | null; unit_price: number | string; active_from: string; active_to: string | null };
type Variant = { id: string; sku: string; name: string; width_cm?: number | null; height_cm?: number | null; material?: string | null; finishing?: string | null; available_quantity?: number | null; attributes?: Record<string, unknown>; active?: boolean; price_rules?: PriceRule[] };
type ProductOptionGroup = ProductOptionGroupDraft & { id?: string };
type Product = { id: string; sku: string; name: string; category: string; description?: string | null; base_unit?: string; vertical_key?: string; attributes?: Record<string, unknown>; active?: boolean; demo_only?: boolean; requires_design?: boolean; requires_size?: boolean; product_option_groups?: ProductOptionGroup[]; product_variants?: Variant[] };
type PriceRuleDraft = { product_variant_id: string; quantity_min: string; quantity_max: string; material: string; finishing: string; unit_price: string; fixed_fee: string; setup_fee: string; design_fee: string; delivery_fee: string; installation_fee: string; tax_rate: string; active_from: string };
type Props = { lang: Language; products: Product[]; verticals: Vertical[]; busy: boolean; onCreateProduct: (event: FormEvent<HTMLFormElement>) => void; onCreateVariant: (event: FormEvent<HTMLFormElement>) => void; onCreatePriceRule: (event: FormEvent<HTMLFormElement>) => void; onToggleProduct: (product: Product) => void; onEndPriceRule: (id: string, activeTo: string, reason: string) => void; onUpdateProduct: (id: string, fields: { name: string; category: string; base_unit: string; description: string; vertical_key: string; attributes: string }) => Promise<boolean>; onUpdateVariantCapacity: (id: string, quantity: number | null) => Promise<boolean>; onUpdateVariantAttributes: (id: string, attributes: string) => Promise<boolean>; onPromoteDemoProduct: (productId: string) => Promise<boolean>; onSaveProductOptions: (productId: string, options: ProductOptionGroupDraft[], reason: string) => Promise<boolean> };

const today = new Date().toISOString().slice(0, 10);

export function ProductManagementPage({ lang, products, verticals, busy, onCreateProduct, onCreateVariant, onCreatePriceRule, onToggleProduct, onEndPriceRule, onUpdateProduct, onUpdateVariantCapacity, onUpdateVariantAttributes, onPromoteDemoProduct, onSaveProductOptions }: Props) {
  const [retirements, setRetirements] = useState<Record<string, { date: string; reason: string }>>({});
  const [capacityInputs, setCapacityInputs] = useState<Record<string, string>>({});
  const [variantAttributesInputs, setVariantAttributesInputs] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; name: string; category: string; base_unit: string; description: string; vertical_key: string; attributes: string } | null>(null);
  const ar = lang === 'ar';
  const variants = products.flatMap((product) => (product.product_variants ?? []).map((variant) => ({ ...variant, productName: product.name })));
  return <section className="product-admin">
    <div className="product-admin-intro"><span className="eyebrow">{ar ? 'إدارة الكتالوج' : 'CATALOG MANAGEMENT'}</span><p>{ar ? 'الخامة هي الورق أو الفينيل المستخدم فعلياً؛ اختيارها يحدد مواصفات الطباعة والخامات التي سيخصمها المخزون. السعر النهائي يأتي من قاعدة السعر المعتمدة. المنتجات التجريبية غير قابلة للبيع حتى تنهي أسعار العينة وتضيف أسعاراً معتمدة لكل مقاس.' : 'Material means the physical paper, vinyl, or other stock used to print the selected format. It helps identify production stock; approved price rules determine the customer price. Demo products cannot be sold until sample prices are ended and manager-approved prices are added for every active format.'}</p></div>
    <div className="product-admin-forms">
      <details className="card product-admin-disclosure" open>
      <summary><span>01 / PRODUCT</span><strong>{ar ? 'إضافة منتج' : 'Add a product'}</strong><small>{ar ? 'الاسم والفئة ووحدة البيع' : 'Name, category, and selling unit'}</small></summary>
      <form className="form-card product-admin-form" onSubmit={onCreateProduct}>
        <span className="eyebrow">01 / PRODUCT</span><h2>{ar ? 'منتج جديد' : 'Add a product'}</h2>
        <div className="form-row"><label>SKU<input name="sku" required maxLength={80} /></label><label>{ar ? 'الاسم' : 'Name'}<input name="name" required maxLength={200} /></label></div>
        <div className="form-row"><label>{ar ? 'الفئة' : 'Category'}<input name="category" required maxLength={80} placeholder="stickers, flyers, cards" /></label><label>{ar ? 'وحدة البيع' : 'Base unit'}<input name="base_unit" required maxLength={40} placeholder="piece, set, roll" /></label></div>
        <div className="form-row"><label>{ar ? 'مجال المتجر' : 'Store vertical'}<select name="vertical_key" defaultValue="printing" required>{verticals.map((vertical) => <option key={vertical.vertical_key} value={vertical.vertical_key}>{ar ? vertical.label_ar : vertical.label_en}</option>)}</select><small className="subtext">{ar ? 'يحدد قدرات التشغيل، مع بقاء قواعد الطباعة متاحة للطباعة فقط.' : 'Selects business capabilities while keeping printing-specific rules scoped to printing.'}</small></label><label>{ar ? 'خصائص المنتج (JSON)' : 'Product specifications (JSON)'}<textarea name="attributes" rows={3} defaultValue="{}" placeholder={'{"warranty_months":12}'} /></label></div>
        <label>{ar ? 'الوصف' : 'Description'}<textarea name="description" rows={3} maxLength={4000} /></label>
        <div className="product-flags"><label><input name="requires_design" type="checkbox" />{ar ? 'يحتاج تصميماً' : 'Design required'}</label><label><input name="requires_size" type="checkbox" />{ar ? 'يحتاج مقاساً' : 'Size required'}</label></div>
        <button className="primary" disabled={busy}>{ar ? 'إضافة المنتج' : 'Create product'}</button>
      </form>
      </details>
      <details className="card product-admin-disclosure">
      <summary><span>02 / FORMAT</span><strong>{ar ? 'المقاس والخامة' : 'Format and material'}</strong><small>{ar ? 'أظهر خيارات المنتج للعميل' : 'Define size, material, and finish'}</small></summary>
      <form className="form-card product-admin-form" onSubmit={onCreateVariant}>
        <span className="eyebrow">02 / VARIANT</span><h2>{ar ? 'مقاس أو نوع' : 'Add a variant'}</h2>
        <label>{ar ? 'المنتج' : 'Product'}<select name="product_id" required defaultValue=""><option value="" disabled>{ar ? 'اختر منتجاً' : 'Select a product'}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
        <div className="form-row"><label>SKU<input name="sku" required maxLength={80} /></label><label>{ar ? 'الاسم' : 'Variant name'}<input name="name" required maxLength={200} placeholder="10 × 8 cm · Waterproof Vinyl" /></label></div>
        <div className="form-row"><label>{ar ? 'العرض (سم)' : 'Width (cm)'}<input name="width_cm" type="number" min="0.01" step="0.01" /></label><label>{ar ? 'الارتفاع (سم)' : 'Height (cm)'}<input name="height_cm" type="number" min="0.01" step="0.01" /></label></div>
        <div className="form-row"><label>{ar ? 'الخامة' : 'Material'}<input name="material" maxLength={120} placeholder={ar ? 'مثال: فينيل مقاوم للماء' : 'e.g. waterproof vinyl'} /><small className="subtext">{ar ? 'الخامة الفعلية المستخدمة في الطباعة والمخزون.' : 'The physical stock used for printing and inventory planning.'}</small></label><label>{ar ? 'التشطيب' : 'Finish'}<input name="finishing" maxLength={120} placeholder={ar ? 'مثال: مطفي أو لامع' : 'e.g. matte or gloss'} /></label></div>
        <label>{ar ? 'الكمية المتاحة للطلبات (اختياري)' : 'Available quantity for new orders (optional)'}<input name="available_quantity" type="number" min="0" step="1" placeholder={ar ? 'اتركها فارغة إذا لم تضع حداً' : 'Leave blank for no limit'} /><small className="subtext">{ar ? 'يتم خصمها تلقائياً عند تأكيد الطلب وتُعاد عند إلغائه.' : 'Orders reserve this quantity; cancellations restore it.'}</small></label>
        <label>{ar ? 'خصائص النوع (JSON)' : 'Variant specifications (JSON)'}<textarea name="attributes" rows={3} defaultValue="{}" placeholder={'{"size":"M","color":"black"}'} /></label>
        <button className="primary" disabled={busy || products.length === 0}>{ar ? 'إضافة المقاس' : 'Create variant'}</button>
      </form>
      </details>
      <details className="card product-admin-disclosure price-rule-disclosure">
      <summary><span>03 / PRICING</span><strong>{ar ? 'السعر المعتمد' : 'Approved pricing'}</strong><small>{ar ? 'السعر والرسوم والضريبة' : 'Price, fees, and tax'}</small></summary>
      <form className="form-card product-admin-form price-rule-form" onSubmit={onCreatePriceRule}>
        <span className="eyebrow">03 / APPROVED SHOP PRICING</span><h2>{ar ? 'قاعدة سعر معتمدة' : 'Shop-approved price rule'}</h2>
        <label>{ar ? 'المقاس / النوع' : 'Variant'}<select name="product_variant_id" required defaultValue=""><option value="" disabled>{ar ? 'اختر نوعاً' : 'Select a variant'}</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.productName} · {variant.name} · {variant.sku}</option>)}</select></label>
        <div className="form-row"><label>{ar ? 'أقل كمية' : 'Minimum quantity'}<input name="quantity_min" type="number" min="1" step="1" required /></label><label>{ar ? 'أقصى كمية (اختياري)' : 'Maximum quantity (optional)'}<input name="quantity_max" type="number" min="1" step="1" /></label></div>
        <div className="form-row"><label>{ar ? 'الخامة (اختياري)' : 'Material (optional)'}<input name="material" /><small className="subtext">{ar ? 'املأها فقط إذا كان السعر يختلف حسب الخامة؛ اتركها فارغة لتطبيق السعر على كل الخامات.' : 'Only fill this in if the price changes by material; leave blank to apply this rule to any material.'}</small></label><label>{ar ? 'التشطيب (اختياري)' : 'Finish (optional)'}<input name="finishing" /><small className="subtext">{ar ? 'املأه فقط إذا كان السعر يختلف حسب التشطيب.' : 'Only fill this in if the price changes by finish.'}</small></label></div>
        <div className="form-row"><label>{ar ? 'سعر الوحدة بالجنيه' : 'Unit price (EGP)'}<input name="unit_price" type="number" min="0" step="0.01" required /></label><label>{ar ? 'الضريبة (0 إلى 1)' : 'Tax rate (0 to 1)'}<input name="tax_rate" type="number" min="0" max="1" step="0.00001" defaultValue="0" required /></label></div>
        <div className="form-row"><label>{ar ? 'رسوم ثابتة' : 'Fixed fee (EGP)'}<input name="fixed_fee" type="number" min="0" step="0.01" defaultValue="0" /></label><label>{ar ? 'رسوم التجهيز' : 'Setup fee (EGP)'}<input name="setup_fee" type="number" min="0" step="0.01" defaultValue="0" /></label></div>
        <div className="form-row"><label>{ar ? 'رسوم التصميم' : 'Design fee (EGP)'}<input name="design_fee" type="number" min="0" step="0.01" defaultValue="50" /></label><label>{ar ? 'رسوم التوصيل' : 'Delivery fee (EGP)'}<input name="delivery_fee" type="number" min="0" step="0.01" defaultValue="0" /></label></div>
        <div className="form-row"><label>{ar ? 'رسوم التركيب' : 'Installation fee (EGP)'}<input name="installation_fee" type="number" min="0" step="0.01" defaultValue="0" /></label><label>{ar ? 'سارية من' : 'Effective from'}<input name="active_from" type="date" defaultValue={today} required /></label></div>
        <label>{ar ? 'سبب اعتماد السعر' : 'Approval reason'}<input name="reason" required minLength={3} maxLength={500} placeholder={ar ? 'مثال: اعتماد مدير المطبعة' : 'For example: approved shop selling price'} /></label>
        <button className="primary" disabled={busy || variants.length === 0}>{ar ? 'حفظ قاعدة السعر' : 'Save approved price rule'}</button>
      </form>
      </details>
    </div>
    <section className="card product-admin-list"><div className="panel-heading"><div><span className="eyebrow">{products.length.toString().padStart(2, '0')} {ar ? 'منتجات' : 'PRODUCTS'}</span><h2>{ar ? 'الكتالوج الحالي' : 'Current catalog'}</h2></div></div>
      {products.length === 0 ? <div className="dashboard-empty"><p>{ar ? 'لا توجد منتجات حتى الآن.' : 'No products have been added yet.'}</p></div> : <div className="product-admin-table"><div className="product-admin-table-head"><span>PRODUCT / DETAILS</span><span>STATE</span><span>AVAILABILITY</span><span>EDIT</span></div>{products.map((product) => {
        const isEditing = editing?.id === product.id;
        const variantRows = product.product_variants ?? [];
        return <article className="product-admin-row" key={product.id}>
          {isEditing ? <form className="product-admin-edit" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const saved = await onUpdateProduct(product.id, { name: String(form.get('name') ?? ''), category: String(form.get('category') ?? ''), base_unit: String(form.get('base_unit') ?? ''), description: String(form.get('description') ?? ''), vertical_key: String(form.get('vertical_key') ?? 'printing'), attributes: String(form.get('attributes') ?? '{}') });
            if (saved) setEditing(null);
          }}>
            <label>{ar ? 'الاسم' : 'Name'}<input name="name" defaultValue={product.name} required maxLength={200} /></label>
            <label>{ar ? 'الفئة' : 'Category'}<input name="category" defaultValue={product.category} required maxLength={80} /></label>
            <label>{ar ? 'وحدة البيع' : 'Base unit'}<input name="base_unit" defaultValue={product.base_unit ?? ''} required maxLength={40} /></label>
            <label>{ar ? 'مجال المتجر' : 'Store vertical'}<select name="vertical_key" defaultValue={product.vertical_key ?? 'printing'} required>{verticals.map((vertical) => <option key={vertical.vertical_key} value={vertical.vertical_key}>{ar ? vertical.label_ar : vertical.label_en}</option>)}</select></label>
            <label>{ar ? 'خصائص المنتج (JSON)' : 'Product specifications (JSON)'}<textarea name="attributes" rows={3} defaultValue={JSON.stringify(product.attributes ?? {}, null, 2)} /></label>
            <label>{ar ? 'الوصف' : 'Description'}<textarea name="description" defaultValue={product.description ?? ''} maxLength={4000} /></label>
            <div className="product-admin-edit-actions"><button className="primary compact" disabled={busy}>{ar ? 'حفظ' : 'Save'}</button><button type="button" className="secondary compact" onClick={() => setEditing(null)}>{ar ? 'إلغاء' : 'Cancel'}</button></div>
          </form> : <div className="product-admin-identity"><strong>{product.name}</strong><small>{product.sku} · {product.base_unit}</small><small>{product.category} · {variantRows.length} {ar ? 'أنواع' : 'variants'}</small></div>}
          <span className={`status-pill ${product.demo_only ? 'status-rejected' : product.active === false ? 'status-rejected' : 'status-approved'}`}>{product.demo_only ? (ar ? 'عينة فقط' : 'Demo only') : product.active === false ? (ar ? 'مخفي' : 'Hidden') : (ar ? 'نشط' : 'Active')}</span>
          <ProductOptionsEditor lang={lang} options={product.product_option_groups ?? []} busy={busy} onSave={(options, reason) => onSaveProductOptions(product.id, options, reason)} />
          <button type="button" className="secondary compact" disabled={busy} onClick={() => onToggleProduct(product)}>{product.active === false ? (ar ? 'تفعيل' : 'Activate') : (ar ? 'إخفاء' : 'Hide')}</button>
          {!isEditing && <button type="button" className="secondary compact" disabled={busy} onClick={() => setEditing({ id: product.id, name: product.name, category: product.category, base_unit: product.base_unit ?? '', description: product.description ?? '', vertical_key: product.vertical_key ?? 'printing', attributes: JSON.stringify(product.attributes ?? {}, null, 2) })}>{ar ? 'تعديل' : 'Edit'}</button>}
          {product.demo_only && <div className="demo-promotion"><p>{ar ? 'للتفعيل: أنهِ كل أسعار العينة، ثم أضف قاعدة سعر معتمدة لكل مقاس نشط.' : 'To enable sales: end every sample price, then add an audited shop price for each active format.'}</p><button type="button" className="secondary compact" disabled={busy} onClick={() => void onPromoteDemoProduct(product.id)}>{ar ? 'مراجعة وتفعيل للبيع' : 'Review and enable for sale'}</button></div>}
          {variantRows.map((variant) => <details className="product-admin-rule-list variant-admin-details" key={variant.id}>
            <summary><strong>{variant.name} · {variant.sku}</strong><small>{product.vertical_key === 'printing' ? (variant.material || (ar ? 'لم تُحدد خامة' : 'Material not set')) : (ar ? 'مواصفات المنتج' : 'Product specifications')} · {variant.available_quantity == null ? (ar ? 'متاح بلا حد' : 'Unlimited availability') : `${variant.available_quantity} ${ar ? 'متاح للطلبات' : 'available to order'}`}</small></summary>
            <form className="capacity-editor" onSubmit={async (event) => {
              event.preventDefault();
              const value = capacityInputs[variant.id] ?? (variant.available_quantity == null ? '' : String(variant.available_quantity));
              const saved = await onUpdateVariantCapacity(variant.id, value.trim() === '' ? null : Number(value));
              if (saved) setCapacityInputs((all) => ({ ...all, [variant.id]: value }));
            }}>
              <label>{ar ? 'الكمية المتاحة' : 'Available quantity'}<input type="number" min="0" step="1" value={capacityInputs[variant.id] ?? (variant.available_quantity == null ? '' : String(variant.available_quantity))} placeholder={ar ? 'بلا حد' : 'Unlimited'} onChange={(event) => setCapacityInputs((all) => ({ ...all, [variant.id]: event.target.value }))} /></label>
              <small>{ar ? 'الكمية المتاحة حالياً للطلبات الجديدة؛ الصفر يوقف الطلبات.' : 'Remaining units for new orders; set 0 to pause ordering.'}</small>
              <button className="secondary compact" disabled={busy}>{ar ? 'حفظ المتاح' : 'Save availability'}</button>
            </form>
            <form className="variant-attributes-editor" onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = String(form.get('attributes') ?? '{}');
              const saved = await onUpdateVariantAttributes(variant.id, value);
              if (saved) setVariantAttributesInputs((all) => ({ ...all, [variant.id]: value }));
            }}>
              <label>{ar ? 'مواصفات النوع (JSON)' : 'Variant specifications (JSON)'}<textarea name="attributes" rows={2} value={variantAttributesInputs[variant.id] ?? JSON.stringify(variant.attributes ?? {}, null, 2)} onChange={(event) => setVariantAttributesInputs((all) => ({ ...all, [variant.id]: event.target.value }))} /></label>
              <small>{ar ? 'مثال: المقاس واللون والضمان حسب نوع المنتج.' : 'Use product-specific fields such as size, color, or warranty.'}</small>
              <button className="secondary compact" disabled={busy}>{ar ? 'حفظ المواصفات' : 'Save specifications'}</button>
            </form>
            {(variant.price_rules ?? []).length === 0 ? <small>{ar ? 'لا توجد قواعد تسعير داخلية.' : 'No shop price rules configured.'}</small> : variant.price_rules?.map((rule) => {
              const form = retirements[rule.id] ?? { date: rule.active_to ?? today, reason: '' };
              return <div className="product-admin-rule" key={rule.id}>
                <span>{Number(rule.quantity_min).toLocaleString()}–{rule.quantity_max === null ? '∞' : Number(rule.quantity_max).toLocaleString()} · {rule.material || 'Any material'} · EGP {Number(rule.unit_price).toFixed(2)} / unit · {rule.active_from} → {rule.active_to ?? (ar ? 'مفتوحة' : 'open')}</span>
                {rule.active_to === null && <div className="product-admin-rule-controls"><input type="date" aria-label={ar ? 'تاريخ انتهاء السعر' : 'Price rule end date'} min={rule.active_from} value={form.date} onChange={(event) => setRetirements((all) => ({ ...all, [rule.id]: { ...form, date: event.target.value } }))} /><input aria-label={ar ? 'سبب إنهاء قاعدة السعر' : 'Reason for ending this price rule'} required maxLength={500} placeholder={ar ? 'سبب التعديل' : 'Reason for ending this rule'} value={form.reason} onChange={(event) => setRetirements((all) => ({ ...all, [rule.id]: { ...form, reason: event.target.value } }))} /><button className="secondary compact" disabled={busy || form.reason.trim().length < 3} onClick={() => onEndPriceRule(rule.id, form.date, form.reason)}>{ar ? 'إنهاء السعر' : 'End price'}</button></div>}
              </div>;
            })}
          </details>)}
        </article>;
      })}</div>}
    </section>
  </section>;
}
