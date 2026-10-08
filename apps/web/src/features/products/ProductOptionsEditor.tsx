import { useEffect, useState, type FormEvent } from 'react';

export type ProductOptionValueDraft = { key: string; label_en: string; label_ar: string; adjustment_type: 'per_unit'|'one_time'; price_adjustment: string|number };
export type ProductOptionGroupDraft = { key: string; label_en: string; label_ar: string; required: boolean; values: ProductOptionValueDraft[] };

export function ProductOptionsEditor({ lang, options, busy, onSave }: {
  lang: 'en'|'ar'; options: ProductOptionGroupDraft[]; busy: boolean;
  onSave: (options: ProductOptionGroupDraft[], reason: string) => Promise<boolean>;
}) {
  const ar = lang === 'ar';
  const [groups,setGroups]=useState<ProductOptionGroupDraft[]>(options);
  const [reason,setReason]=useState('');
  useEffect(()=>setGroups(options),[JSON.stringify(options)]);
  const updateGroup=(index:number,patch:Partial<ProductOptionGroupDraft>)=>setGroups(all=>all.map((group,i)=>i===index?{...group,...patch}:group));
  const updateValue=(groupIndex:number,valueIndex:number,patch:Partial<ProductOptionValueDraft>)=>setGroups(all=>all.map((group,i)=>i===groupIndex?{...group,values:group.values.map((value,j)=>j===valueIndex?{...value,...patch}:value)}:group));
  const save=async(event:FormEvent)=>{event.preventDefault();if(await onSave(groups,reason))setReason('');};
  return <details className="product-options-disclosure"><summary>{ar?'خيارات المنتج والرسوم':'Customer options and surcharges'} · {options.length}</summary>
    <form className="product-options-form" onSubmit={save}>
      <p className="subtext">{ar?'أضف اختيارات مثل اللون أو التغليف. أي رسوم تُحسب من القيم المحفوظة والمعتمدة في الخادم.':'Add choices such as color or packaging. Any surcharge is calculated from these saved manager-approved values on the server.'}</p>
      {groups.map((group,index)=><section className="product-option-group-editor" key={`${index}-${group.key}`}>
        <div className="form-row"><label>{ar?'مفتاح الخيار':'Option key'}<input required pattern="[a-z][a-z0-9_]{0,39}" maxLength={40} value={group.key} onChange={event=>updateGroup(index,{key:event.target.value})}/></label><label>{ar?'اسم الخيار بالإنجليزية':'English label'}<input required maxLength={80} value={group.label_en} onChange={event=>updateGroup(index,{label_en:event.target.value})}/></label><label dir="rtl">{ar?'الاسم بالعربية':'Arabic label'}<input required maxLength={80} value={group.label_ar} onChange={event=>updateGroup(index,{label_ar:event.target.value})}/></label></div>
        <label className="check-row"><input type="checkbox" checked={group.required} onChange={event=>updateGroup(index,{required:event.target.checked})}/>{ar?'اختيار إلزامي':'Customer must choose'}</label>
        {group.values.map((value,valueIndex)=><div className="product-option-value-editor" key={`${valueIndex}-${value.key}`}>
          <div className="form-row"><label>{ar?'مفتاح القيمة':'Value key'}<input required pattern="[a-z][a-z0-9_]{0,39}" maxLength={40} value={value.key} onChange={event=>updateValue(index,valueIndex,{key:event.target.value})}/></label><label>{ar?'القيمة بالإنجليزية':'English value'}<input required maxLength={80} value={value.label_en} onChange={event=>updateValue(index,valueIndex,{label_en:event.target.value})}/></label><label dir="rtl">{ar?'القيمة بالعربية':'Arabic value'}<input required maxLength={80} value={value.label_ar} onChange={event=>updateValue(index,valueIndex,{label_ar:event.target.value})}/></label></div>
          <div className="form-row"><label>{ar?'الزيادة بالجنيه':'Surcharge (EGP)'}<input type="number" min="0" max="9999999999.99" step="0.01" required value={value.price_adjustment} onChange={event=>updateValue(index,valueIndex,{price_adjustment:event.target.value})}/></label><label>{ar?'طريقة الحساب':'Charge basis'}<select value={value.adjustment_type} onChange={event=>updateValue(index,valueIndex,{adjustment_type:event.target.value as 'per_unit'|'one_time'})}><option value="per_unit">{ar?'لكل وحدة':'Per unit'}</option><option value="one_time">{ar?'مرة واحدة للطلب':'One time per line'}</option></select></label></div>
          {group.values.length>1&&<button type="button" className="text-button" onClick={()=>updateGroup(index,{values:group.values.filter((_,i)=>i!==valueIndex)})}>{ar?'حذف القيمة':'Remove value'}</button>}
        </div>)}
        <div className="product-option-group-actions"><button type="button" className="secondary compact" onClick={()=>updateGroup(index,{values:[...group.values,{key:`value_${group.values.length+1}`,label_en:'New value',label_ar:'قيمة جديدة',adjustment_type:'per_unit',price_adjustment:'0.00'}]})}>{ar?'إضافة قيمة':'Add value'}</button><button type="button" className="text-button" onClick={()=>setGroups(all=>all.filter((_,i)=>i!==index))}>{ar?'حذف الخيار':'Remove option'}</button></div>
      </section>)}
      <button type="button" className="secondary compact" onClick={()=>setGroups(all=>[...all,{key:`option_${all.length+1}`,label_en:'Option',label_ar:'اختيار',required:false,values:[{key:'standard',label_en:'Standard',label_ar:'عادي',adjustment_type:'per_unit',price_adjustment:'0.00'}]}])}>{ar?'إضافة مجموعة خيارات':'Add option group'}</button>
      <label>{ar?'سبب التغيير (للتدقيق)':'Change reason (audit)'}<input required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>
      <button className="primary compact" disabled={busy}>{ar?'حفظ الخيارات':'Save options'}</button>
    </form>
  </details>;
}
