-- INKORA catalog expansion. All non-sticker shop prices and operating data
-- inserted here are fictional DEMO / SEED values for local/hackathon use.
-- They are not market quotes, actual shop costs, or validated customer prices.
begin;

with catalog as (
  select * from jsonb_to_recordset('[
    {"sku":"INK-BIZCARD","name":"Business Cards","category":"business_cards","description":"Premium business cards for teams, studios, and independent professionals.","unit":"piece","design":true,"formats":[{"suffix":"90X50","name":"90 × 50 mm · 350 gsm","w":9,"h":5,"material":"Coated cardstock","rate":12.0},{"suffix":"85X55","name":"85 × 55 mm · 350 gsm","w":8.5,"h":5.5,"material":"Coated cardstock","rate":12.0},{"suffix":"90X54","name":"90 × 54 mm · 400 gsm","w":9,"h":5.4,"material":"Premium cardstock","rate":15.0}]},
    {"sku":"INK-FLYER","name":"Flyers","category":"flyers","description":"Single and double-sided flyers for launches, menus, and local campaigns.","unit":"piece","design":true,"formats":[{"suffix":"A6","name":"A6 · 150 gsm","w":10.5,"h":14.8,"material":"Coated paper","rate":3.5},{"suffix":"A5","name":"A5 · 150 gsm","w":14.8,"h":21,"material":"Coated paper","rate":5.5},{"suffix":"A4","name":"A4 · 150 gsm","w":21,"h":29.7,"material":"Coated paper","rate":8.5}]},
    {"sku":"INK-POSTER","name":"Posters","category":"posters","description":"Large-format posters with crisp color for shops, events, and interiors.","unit":"piece","design":true,"formats":[{"suffix":"A3","name":"A3 · 170 gsm","w":29.7,"h":42,"material":"Poster paper","rate":28},{"suffix":"A2","name":"A2 · 170 gsm","w":42,"h":59.4,"material":"Poster paper","rate":55},{"suffix":"A1","name":"A1 · 170 gsm","w":59.4,"h":84.1,"material":"Poster paper","rate":95}]},
    {"sku":"INK-BANNER","name":"Banners & Roll-ups","category":"banners","description":"Event banners and roll-up displays for retail, exhibitions, and conferences.","unit":"piece","design":true,"formats":[{"suffix":"80X200","name":"80 × 200 cm · roll-up","w":80,"h":200,"material":"Display vinyl","rate":1550},{"suffix":"100X200","name":"100 × 200 cm · roll-up","w":100,"h":200,"material":"Display vinyl","rate":1850},{"suffix":"120X200","name":"120 × 200 cm · roll-up","w":120,"h":200,"material":"Display vinyl","rate":2250}]},
    {"sku":"INK-INVITE","name":"Invitations","category":"invitations","description":"Personalised invitations for weddings, celebrations, and business events.","unit":"piece","design":true,"formats":[{"suffix":"A6","name":"A6 · single card","w":10.5,"h":14.8,"material":"Textured cardstock","rate":9},{"suffix":"A5","name":"A5 · folded","w":14.8,"h":21,"material":"Textured cardstock","rate":15},{"suffix":"DL","name":"DL · folded","w":9.9,"h":21,"material":"Textured cardstock","rate":13}]},
    {"sku":"INK-BROCHURE","name":"Brochures","category":"brochures","description":"Folded brochures and product sheets with professional finishing options.","unit":"piece","design":true,"formats":[{"suffix":"A5","name":"A5 · bifold · 150 gsm","w":14.8,"h":21,"material":"Coated paper","rate":7.5},{"suffix":"A4","name":"A4 · bifold · 150 gsm","w":21,"h":29.7,"material":"Coated paper","rate":11},{"suffix":"A4TRI","name":"A4 · trifold · 170 gsm","w":21,"h":29.7,"material":"Coated paper","rate":14}]},
    {"sku":"INK-MENU","name":"Menus","category":"menus","description":"Durable menus for cafés and restaurants, with practical size and finish choices.","unit":"piece","design":true,"formats":[{"suffix":"A4","name":"A4 · single sheet","w":21,"h":29.7,"material":"Laminated paper","rate":22},{"suffix":"A3FOLD","name":"A3 · folded","w":29.7,"h":42,"material":"Laminated paper","rate":38},{"suffix":"A5BOOK","name":"A5 · 8 pages","w":14.8,"h":21,"material":"Coated paper","rate":68}]},
    {"sku":"INK-CERT","name":"Certificates","category":"certificates","description":"Formal certificates for courses, recognition, and corporate events.","unit":"piece","design":true,"formats":[{"suffix":"A5","name":"A5 · 250 gsm","w":14.8,"h":21,"material":"Certificate paper","rate":18},{"suffix":"A4","name":"A4 · 250 gsm","w":21,"h":29.7,"material":"Certificate paper","rate":28},{"suffix":"A3","name":"A3 · 250 gsm","w":29.7,"h":42,"material":"Certificate paper","rate":48}]},
    {"sku":"INK-BOOKLET","name":"Booklets","category":"booklets","description":"Stapled booklets for lookbooks, event guides, and compact product catalogues.","unit":"piece","design":true,"formats":[{"suffix":"A5-8P","name":"A5 · 8 pages","w":14.8,"h":21,"material":"Coated paper","rate":42},{"suffix":"A5-16P","name":"A5 · 16 pages","w":14.8,"h":21,"material":"Coated paper","rate":68},{"suffix":"A4-16P","name":"A4 · 16 pages","w":21,"h":29.7,"material":"Coated paper","rate":105}]},
    {"sku":"INK-NOTEBOOK","name":"Notebooks","category":"notebooks","description":"Custom-cover notebooks for teams, promotions, and thoughtful business gifts.","unit":"piece","design":true,"formats":[{"suffix":"A6","name":"A6 · 80 pages","w":10.5,"h":14.8,"material":"Offset paper","rate":75},{"suffix":"A5","name":"A5 · 100 pages","w":14.8,"h":21,"material":"Offset paper","rate":125},{"suffix":"A4","name":"A4 · 100 pages","w":21,"h":29.7,"material":"Offset paper","rate":190}]},
    {"sku":"INK-CALENDAR","name":"Calendars","category":"calendars","description":"Branded wall and desk calendars for year-round visibility.","unit":"piece","design":true,"formats":[{"suffix":"DESK","name":"Desk calendar · 13 leaves","w":21,"h":14.8,"material":"Coated paper","rate":145},{"suffix":"A4WALL","name":"A4 wall · 13 leaves","w":21,"h":29.7,"material":"Coated paper","rate":185},{"suffix":"A3WALL","name":"A3 wall · 13 leaves","w":29.7,"h":42,"material":"Coated paper","rate":295}]},
    {"sku":"INK-LABEL","name":"Product Labels","category":"labels","description":"Product and packaging labels in paper and synthetic materials.","unit":"piece","design":true,"formats":[{"suffix":"5X3","name":"5 × 3 cm · paper","w":5,"h":3,"material":"Label paper","rate":0.65},{"suffix":"7X5","name":"7 × 5 cm · paper","w":7,"h":5,"material":"Label paper","rate":0.95},{"suffix":"10X7","name":"10 × 7 cm · waterproof","w":10,"h":7,"material":"Waterproof label stock","rate":1.6}]},
    {"sku":"INK-PACK","name":"Packaging Sleeves","category":"packaging","description":"Printed sleeves and small-batch packaging for products and retail gifting.","unit":"piece","design":true,"formats":[{"suffix":"SMALL","name":"Small · 8 × 12 cm","w":8,"h":12,"material":"Folding carton","rate":14},{"suffix":"MEDIUM","name":"Medium · 12 × 18 cm","w":12,"h":18,"material":"Folding carton","rate":22},{"suffix":"LARGE","name":"Large · 18 × 25 cm","w":18,"h":25,"material":"Folding carton","rate":34}]},
    {"sku":"INK-TSHIRT","name":"Printed T-shirts","category":"apparel","description":"Made-to-order printed apparel for teams, events, and small brands.","unit":"piece","design":true,"formats":[{"suffix":"S","name":"Adult S · cotton","w":0,"h":0,"material":"Cotton textile","rate":320},{"suffix":"M","name":"Adult M · cotton","w":0,"h":0,"material":"Cotton textile","rate":320},{"suffix":"L","name":"Adult L · cotton","w":0,"h":0,"material":"Cotton textile","rate":340}]},
    {"sku":"INK-FOLDER","name":"Presentation Folders","category":"folders","description":"Branded presentation folders for proposals, onboarding, and conferences.","unit":"piece","design":true,"formats":[{"suffix":"A4","name":"A4 · 300 gsm","w":21,"h":29.7,"material":"Coated cardstock","rate":24},{"suffix":"A4POCKET","name":"A4 · pocket folder","w":21,"h":29.7,"material":"Coated cardstock","rate":38},{"suffix":"A5","name":"A5 · 300 gsm","w":14.8,"h":21,"material":"Coated cardstock","rate":19}]},
    {"sku":"INK-LETTERHEAD","name":"Letterheads & Envelopes","category":"stationery","description":"Coordinated office stationery for a consistent professional identity.","unit":"piece","design":true,"formats":[{"suffix":"A4","name":"A4 letterhead · 100 gsm","w":21,"h":29.7,"material":"Offset paper","rate":4.5},{"suffix":"DLENV","name":"DL envelope","w":11,"h":22,"material":"Offset paper","rate":5.5},{"suffix":"C5ENV","name":"C5 envelope","w":16.2,"h":22.9,"material":"Offset paper","rate":7}]},
    {"sku":"INK-MUG","name":"Printed Mugs","category":"gifts","description":"Personalised printed mugs for events, teams, and branded gifting.","unit":"piece","design":true,"formats":[{"suffix":"11OZ","name":"11 oz · ceramic","w":0,"h":0,"material":"Ceramic","rate":185},{"suffix":"15OZ","name":"15 oz · ceramic","w":0,"h":0,"material":"Ceramic","rate":230},{"suffix":"TRAVEL","name":"Travel mug · 350 ml","w":0,"h":0,"material":"Steel","rate":390}]},
    {"sku":"INK-BAG","name":"Printed Tote Bags","category":"bags","description":"Reusable printed cotton totes for retail, events, and promotional campaigns.","unit":"piece","design":true,"formats":[{"suffix":"SMALL","name":"Small · 30 × 35 cm","w":30,"h":35,"material":"Cotton canvas","rate":210},{"suffix":"MEDIUM","name":"Medium · 38 × 42 cm","w":38,"h":42,"material":"Cotton canvas","rate":260},{"suffix":"LARGE","name":"Large · 45 × 50 cm","w":45,"h":50,"material":"Cotton canvas","rate":320}]}
  ]'::jsonb) as x(sku text,name text,category text,description text,unit text,design boolean,formats jsonb)
), inserted_products as (
  insert into public.products(sku,name,category,description,base_unit,active,requires_design,requires_size)
  select sku,name,category,description,unit,true,design,true from catalog
  on conflict (sku) do update set name=excluded.name,category=excluded.category,description=excluded.description,
    base_unit=excluded.base_unit,active=true,requires_design=excluded.requires_design,requires_size=excluded.requires_size
  returning id,sku
), catalog_formats as (
  select p.id as product_id,p.sku as product_sku,f.*
  from inserted_products p join catalog c on c.sku=p.sku
  cross join lateral jsonb_to_recordset(c.formats) as f(suffix text,name text,w numeric,h numeric,material text,rate numeric)
), inserted_variants as (
  insert into public.product_variants(product_id,sku,name,width_cm,height_cm,material,active)
  select product_id,product_sku||'-'||suffix,name,nullif(w,0),nullif(h,0),material,true from catalog_formats
  on conflict (sku) do update set name=excluded.name,width_cm=excluded.width_cm,height_cm=excluded.height_cm,material=excluded.material,active=true
  returning id,sku
)
insert into public.price_rules(product_variant_id,quantity_min,quantity_max,material,unit_price,setup_fee,design_fee,tax_rate,active_from)
select v.id,t.qmin,t.qmax,f.material,
  case t.qmin when 1 then f.rate*1.2 when 100 then f.rate when 500 then f.rate*0.82 end,
  0,case when p.requires_design then 250 else 0 end,0,current_date
from inserted_variants v
join catalog_formats f on (f.product_sku||'-'||f.suffix)=v.sku
join public.products p on p.id=f.product_id
cross join (values (1,99),(100,499),(500,null::integer)) as t(qmin,qmax)
where v.sku not like 'INK-STICKER%'
  and not exists (select 1 from public.price_rules r where r.product_variant_id=v.id and r.quantity_min=t.qmin and r.quantity_max is not distinct from t.qmax and r.active_to is null);

insert into public.suppliers(name,contact_name,phone,email,address,lead_time_days,notes,active)
select x.name,x.contact,x.phone,x.email,x.address,x.days,'DEMO / SEED DATA — fictional supplier for local/hackathon use.',true
from (values
 ('Cairo Paper & Board','Demo Contact','+20 2 0000 0101','paper@example.invalid','Cairo, Egypt',4),
 ('Nile Sign Materials','Demo Contact','+20 2 0000 0102','signs@example.invalid','Giza, Egypt',5),
 ('Delta Print Consumables','Demo Contact','+20 40 0000 0103','consumables@example.invalid','Tanta, Egypt',3),
 ('Studio Packaging Supply','Demo Contact','+20 2 0000 0104','packaging@example.invalid','Cairo, Egypt',7)
) as x(name,contact,phone,email,address,days)
where not exists(select 1 from public.suppliers s where s.name=x.name);

insert into public.materials(sku,name,category,unit,current_stock,reserved_stock,reorder_point,reorder_quantity,cost_per_unit,supplier_id,active)
select x.sku,x.name,x.category,x.unit,x.stock,0,x.reorder,x.order_qty,x.cost,s.id,true
from (values
 ('DEMO-PAPER-150','Coated paper 150 gsm','paper','sheet',8200::numeric,1800::numeric,5000::numeric,0.62::numeric,'Cairo Paper & Board'),
 ('DEMO-CARD-350','Premium cardstock 350 gsm','paper','sheet',2450,600,1500,0.97,'Cairo Paper & Board'),
 ('DEMO-VINYL','Waterproof vinyl roll','vinyl','meter',640,160,300,19.5,'Nile Sign Materials'),
 ('DEMO-INK-CMYK','CMYK ink set','ink','set',42,8,20,36,'Delta Print Consumables'),
 ('DEMO-LAMINATE','Gloss lamination film','finishing','meter',390,55,180,11.2,'Delta Print Consumables'),
 ('DEMO-CANVAS','Cotton canvas','textile','meter',210,15,80,75,'Studio Packaging Supply'),
 ('DEMO-CARTON','Folding carton board','packaging','sheet',1100,80,450,1.85,'Studio Packaging Supply'),
 ('DEMO-PACK','Shipping mailer','packaging','piece',310,20,120,3.1,'Studio Packaging Supply')
) as x(sku,name,category,unit,stock,reorder,order_qty,cost,supplier_name)
join public.suppliers s on s.name=x.supplier_name
where not exists(select 1 from public.materials m where m.sku=x.sku);

-- Seed opening balances through the inventory ledger as well as the cached stock fields.
insert into public.inventory_transactions(material_id,transaction_type,quantity,unit_cost,reference_type)
select m.id,'adjustment',m.current_stock,m.cost_per_unit,'demo_seed_opening_balance'
from public.materials m
where m.sku like 'DEMO-%'
  and m.current_stock > 0
  and not exists(select 1 from public.inventory_transactions t where t.material_id=m.id and t.reference_type='demo_seed_opening_balance');

insert into public.machines(name,machine_type,capacity,status,location)
select x.name,x.kind,x.capacity,'available','DEMO / SEED DATA — Cairo shop floor'
from (values
 ('Digital Press A','digital press',1200::numeric),('Wide Format Printer','large format',180::numeric),
 ('Cutting Plotter','finishing',500::numeric),('Lamination Unit','finishing',240::numeric),
 ('Binding & Folding Station','binding',350::numeric)
) as x(name,kind,capacity)
where not exists(select 1 from public.machines m where m.name=x.name);

-- Fictional contacts and activity populate manager screens for the demo.
insert into public.customers(name,company_name,phone,email,address,notes)
select x.name,x.company,x.phone,x.email,x.address,'DEMO / SEED DATA — fictional contact. Never use for real fulfillment.'
from (values
 ('Mariam Hassan','Olive & Rye Café','+20 10 0000 1001','demo+customer01@example.invalid','Zamalek, Cairo'),
 ('Omar Nabil','Northline Architects','+20 10 0000 1002','demo+customer02@example.invalid','New Cairo'),
 ('Salma Adel','Daybreak Studio','+20 10 0000 1003','demo+customer03@example.invalid','Maadi, Cairo'),
 ('Youssef Amin','Palm Market','+20 10 0000 1004','demo+customer04@example.invalid','Heliopolis, Cairo'),
 ('Nour Farouk','Form & Field','+20 10 0000 1005','demo+customer05@example.invalid','Dokki, Giza'),
 ('Karim Samir','Common Ground Coffee','+20 10 0000 1006','demo+customer06@example.invalid','Garden City, Cairo'),
 ('Laila Tarek','Saffron House','+20 10 0000 1007','demo+customer07@example.invalid','Sheikh Zayed'),
 ('Hana Magdy','Little Atlas Books','+20 10 0000 1008','demo+customer08@example.invalid','Downtown Cairo'),
 ('Adam Sherif','Cedar & Clay','+20 10 0000 1009','demo+customer09@example.invalid','6th of October'),
 ('Farida Hany','Morrow Wellness','+20 10 0000 1010','demo+customer10@example.invalid','New Cairo'),
 ('Ziad Fathy','Eastbank Events','+20 10 0000 1011','demo+customer11@example.invalid','Nasr City, Cairo'),
 ('Dina Mostafa','The Good Label','+20 10 0000 1012','demo+customer12@example.invalid','Maadi, Cairo'),
 ('Tamer Reda','Studio Forty','+20 10 0000 1013','demo+customer13@example.invalid','Zamalek, Cairo'),
 ('Rana Sameh','Linen & Light','+20 10 0000 1014','demo+customer14@example.invalid','Heliopolis, Cairo'),
 ('Malik Ezz','Nomad Supply','+20 10 0000 1015','demo+customer15@example.invalid','Sheikh Zayed'),
 ('Aya Wael','Sunday Market','+20 10 0000 1016','demo+customer16@example.invalid','Downtown Cairo'),
 ('Hassan Galal','Brightside Learning','+20 10 0000 1017','demo+customer17@example.invalid','Giza'),
 ('Mina Rami','Good Company Foods','+20 10 0000 1018','demo+customer18@example.invalid','New Cairo')
) as x(name,company,phone,email,address)
where not exists(select 1 from public.customers c where c.email=x.email);

with demo_lines as (
  select n,
    ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid as quote_id,
    c.id as customer_id,v.id as variant_id,r.unit_price,
    (20+(n%5)*15)::integer as quantity,
    round(r.unit_price*(20+(n%5)*15),2) as line_total,
    (current_date-((n*3)%60))::timestamptz as created_at,
    case n%5 when 0 then 'delivered'::public.order_status when 1 then 'in_production'::public.order_status when 2 then 'confirmed'::public.order_status when 3 then 'ready'::public.order_status else 'delivered'::public.order_status end as order_status,
    case n%5 when 0 then 'ready'::public.production_status when 1 then 'printing'::public.production_status when 2 then 'queued'::public.production_status when 3 then 'ready'::public.production_status else 'ready'::public.production_status end as production_status,
    case n%5 when 1 then 'partial'::public.payment_status when 2 then 'unpaid'::public.payment_status else 'paid'::public.payment_status end as payment_status
  from generate_series(1,24) as n
  join public.customers c on c.email='demo+customer'||lpad(((n-1)%18+1)::text,2,'0')||'@example.invalid'
  cross join lateral (select pv.id from public.product_variants pv where pv.sku like 'INK-%' order by pv.sku offset ((n*7)%54) limit 1) chosen
  join public.product_variants v on v.id=chosen.id
  join public.price_rules r on r.product_variant_id=v.id and r.quantity_min=1 and r.active_to is null
), inserted_quotes as (
  insert into public.quotes(id,customer_id,status,currency,subtotal,total,created_at,updated_at)
  select quote_id,customer_id,'accepted','EGP',line_total,line_total,created_at,created_at from demo_lines
  on conflict(id) do nothing returning id
), inserted_quote_items as (
  insert into public.quote_items(quote_id,product_variant_id,quantity,unit_price,options,design_required,notes)
  select l.quote_id,l.variant_id,l.quantity,l.unit_price,'{"demo_seed":true}'::jsonb,false,'DEMO / SEED DATA — sample quote'
  from demo_lines l join inserted_quotes q on q.id=l.quote_id
  returning quote_id
), inserted_orders as (
  insert into public.orders(customer_id,quote_id,status,payment_status,production_status,delivery_method,delivery_address,due_at,subtotal,total,created_at,updated_at)
  select customer_id,quote_id,order_status,payment_status,production_status,'local_delivery','DEMO / SEED ADDRESS',created_at+interval '5 days',line_total,line_total,created_at,created_at
  from demo_lines join inserted_quotes q on q.id=demo_lines.quote_id
  on conflict(quote_id) do nothing returning id,quote_id,production_status
), inserted_order_items as (
  insert into public.order_items(order_id,product_variant_id,quantity,unit_price,options,notes)
  select o.id,l.variant_id,l.quantity,l.unit_price,'{"demo_seed":true}'::jsonb,'DEMO / SEED DATA — sample order snapshot'
  from inserted_orders o join demo_lines l on l.quote_id=o.quote_id
  returning order_id
)
insert into public.production_jobs(order_id,machine_id,status,priority,scheduled_at,notes)
select o.id,m.id,o.production_status,(l.n%3),l.created_at+interval '1 day','DEMO / SEED DATA — sample production job'
from inserted_orders o join demo_lines l on l.quote_id=o.quote_id
join public.machines m on m.name=case when l.n%3=0 then 'Wide Format Printer' when l.n%3=1 then 'Digital Press A' else 'Lamination Unit' end
where not exists(select 1 from public.production_jobs j where j.order_id=o.id);

insert into public.marketing_assets(order_id,caption,platform,status)
select o.id,'DEMO / SEED DATA — sample creative draft. Replace with approved shop content.','instagram','draft'
from public.orders o join public.quotes q on q.id=o.quote_id
where q.id::text like '00000000-0000-4000-8000-%' and o.status='delivered'
  and not exists(select 1 from public.marketing_assets a where a.order_id=o.id);

insert into public.design_requests(customer_id,order_id,brief,design_fee,status,customer_notes)
select o.customer_id,o.id,'DEMO / SEED DATA — sample brief for a Cairo coffee brand. Replace with a real customer brief.',250,
  'requested'::public.design_request_status,
  'Fictional demo request. No production artwork is attached.'
from public.orders o join public.quotes q on q.id=o.quote_id
where q.id::text like '00000000-0000-4000-8000-%'
  and mod(substring(q.id::text from 25 for 12)::bigint,3)=0
  and not exists(select 1 from public.design_requests d where d.order_id=o.id);

insert into public.marketing_posts(marketing_asset_id,platform,status,metrics)
select a.id,'instagram','pending_approval','{"demo_seed":true}'::jsonb
from public.marketing_assets a join public.orders o on o.id=a.order_id
where a.caption like 'DEMO / SEED DATA%' and not exists(select 1 from public.marketing_posts p where p.marketing_asset_id=a.id);

commit;
