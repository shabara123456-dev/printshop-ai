import { AppError } from './errors.ts';

export type QuoteLineInput = {
  variant_sku: string;
  quantity: number;
  material?: string;
  finishing?: string;
  design_required?: boolean;
  delivery_required?: boolean;
  installation_required?: boolean;
  custom_options?: Record<string, string>;
  notes?: string;
};

export type Variant = {
  id: string;
  sku: string;
  name: string;
  material: string | null;
  available_quantity?: number | null;
  demo_only?: boolean;
  product_id?: string;
};

export type ProductOptionValue = { key: string; label_en: string; label_ar: string; adjustment_type: 'per_unit' | 'one_time'; price_adjustment: string | number };
export type ProductOptionGroup = { key: string; label_en: string; label_ar: string; required: boolean; values: ProductOptionValue[] };

export type PriceRule = {
  id: string;
  product_variant_id: string;
  quantity_min: number;
  quantity_max: number | null;
  material: string | null;
  finishing: string | null;
  unit_price: string | number;
  fixed_fee: string | number;
  setup_fee: string | number;
  design_fee: string | number;
  installation_fee: string | number;
  delivery_fee: string | number;
  tax_rate: string | number;
  active_from: string;
  active_to: string | null;
  pricing_basis?: 'shop_approved' | 'user_approved_market_midpoint';
  market_reference_id?: string | null;
};

export type PricingRepository = {
  getVariantBySku(sku: string): Promise<Variant | null>;
  getPriceRules(variantId: string): Promise<PriceRule[]>;
  getProductOptionGroups?(productId: string): Promise<ProductOptionGroup[]>;
};

type Cents = bigint;
const RATE_SCALE = 100_000n;

function moneyToCents(value: string | number, field: string): Cents {
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new AppError('INVALID_PRICE_RULE', 500, `Invalid ${field} in configured price rule.`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

function rateToUnits(value: string | number): bigint {
  const match = /^(\d+)(?:\.(\d{1,5}))?$/.exec(String(value).trim());
  if (!match) throw new AppError('INVALID_PRICE_RULE', 500, 'Invalid tax_rate in configured price rule.');
  return BigInt(match[1]) * RATE_SCALE + BigInt((match[2] ?? '').padEnd(5, '0'));
}

function centsToMoney(cents: Cents): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function normalize(value: string | null | undefined): string | null {
  const cleaned = value?.trim().toLocaleLowerCase('en');
  return cleaned ? cleaned : null;
}

function cairoDate(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function ruleSpecificity(rule: PriceRule): number {
  return Number(normalize(rule.material) !== null) + Number(normalize(rule.finishing) !== null);
}

function selectRule(rules: PriceRule[], input: QuoteLineInput, variant: Variant, today: string): PriceRule {
  const requestedMaterial = normalize(input.material ?? variant.material);
  const requestedFinishing = normalize(input.finishing);
  const eligible = rules.filter((rule) =>
    input.quantity >= rule.quantity_min &&
    (rule.quantity_max === null || input.quantity <= rule.quantity_max) &&
    rule.active_from <= today &&
    (rule.active_to === null || rule.active_to >= today) &&
    (normalize(rule.material) === null || normalize(rule.material) === requestedMaterial) &&
    (normalize(rule.finishing) === null || normalize(rule.finishing) === requestedFinishing)
  );

  if (eligible.length === 0) {
    throw new AppError('PRICE_RULE_NOT_FOUND', 422, `No active internal price rule covers ${variant.sku} at quantity ${input.quantity} with the selected options.`);
  }
  const highest = Math.max(...eligible.map(ruleSpecificity));
  const best = eligible.filter((rule) => ruleSpecificity(rule) === highest);
  if (best.length !== 1) {
    throw new AppError('PRICE_RULE_AMBIGUOUS', 409, `Multiple equally specific active price rules match ${variant.sku}; ask a manager to resolve them.`);
  }
  return best[0];
}

function validateLine(input: QuoteLineInput, index: number): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('INVALID_REQUEST', 400, `items[${index}] must be an object.`);
  }
  if (typeof input.variant_sku !== 'string' || input.variant_sku.trim().length === 0 || input.variant_sku.length > 80) {
    throw new AppError('INVALID_REQUEST', 400, `items[${index}].variant_sku is required.`);
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 10_000_000) {
    throw new AppError('INVALID_REQUEST', 400, `items[${index}].quantity must be a positive whole number no greater than 10000000.`);
  }
  for (const key of ['material', 'finishing', 'notes'] as const) {
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 1000)) {
      throw new AppError('INVALID_REQUEST', 400, `items[${index}].${key} must be a string no longer than 1000 characters.`);
    }
  }
  for (const key of ['design_required', 'delivery_required', 'installation_required'] as const) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') {
      throw new AppError('INVALID_REQUEST', 400, `items[${index}].${key} must be a boolean.`);
    }
  }
  if (input.custom_options !== undefined && (!input.custom_options || typeof input.custom_options !== 'object' || Array.isArray(input.custom_options) || Object.keys(input.custom_options).length > 30 || Object.entries(input.custom_options).some(([key, value]) => !/^[a-z][a-z0-9_]{0,39}$/.test(key) || typeof value !== 'string' || value.length > 80))) {
    throw new AppError('INVALID_REQUEST', 400, `items[${index}].custom_options must map option keys to short string values.`);
  }
}

export type CalculatedLine = {
  variant_id: string;
  variant_sku: string;
  product_name: string;
  pricing_basis: 'shop_approved' | 'user_approved_market_midpoint';
  market_reference_id: string | null;
  quantity: number;
  unit_price: string;
  design_required: boolean;
  options: Record<string, unknown>;
  notes: string | null;
  breakdown: {
    base: string;
    fixed_fee: string;
    setup_fee: string;
    design_fee: string;
    installation_fee: string;
    delivery_fee: string;
    subtotal: string;
    tax_rate: string;
    tax: string;
    total: string;
    option_surcharge: string;
  };
};

export async function calculateQuote(
  items: QuoteLineInput[],
  repository: PricingRepository,
  at = new Date()
): Promise<{ currency: 'EGP'; subtotal: string; discount: string; tax: string; total: string; breakdown: CalculatedLine[] }> {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    throw new AppError('INVALID_REQUEST', 400, 'items must contain between 1 and 20 quote lines.');
  }
  const today = cairoDate(at);
  const lines = await Promise.all(items.map(async (input, index): Promise<CalculatedLine> => {
    validateLine(input, index);
    const variant = await repository.getVariantBySku(input.variant_sku.trim());
    if (!variant) throw new AppError('PRODUCT_NOT_FOUND', 404, `Active product variant ${input.variant_sku} was not found.`);
    if (variant.demo_only) throw new AppError('DEMO_ONLY_PRODUCT', 409, `${variant.sku} is a sample item and is not available for sale. A manager must review and approve shop prices first.`);
    if (variant.available_quantity !== undefined && variant.available_quantity !== null && input.quantity > variant.available_quantity) {
      throw new AppError('PRODUCTION_CAPACITY_INSUFFICIENT', 409, `Only ${variant.available_quantity} units of ${variant.sku} are currently available for production.`);
    }
    const material = input.material?.trim() || variant.material || undefined;
    if (input.material && variant.material && normalize(input.material) !== normalize(variant.material)) {
      throw new AppError('INVALID_OPTION', 422, `Material ${input.material} is not available for ${variant.sku}.`);
    }
    const normalizedInput = { ...input, material };
    const rules = await repository.getPriceRules(variant.id);
    const rule = selectRule(rules, normalizedInput, variant, today);

    const requestedOptions = input.custom_options ?? {};
    let optionSurcharge = 0n;
    const optionSnapshot: Record<string, { value: string; label_en: string; label_ar: string; adjustment_type: 'per_unit' | 'one_time'; price_adjustment: string }> = {};
    if (Object.keys(requestedOptions).length && (!variant.product_id || !repository.getProductOptionGroups)) {
      throw new AppError('INVALID_OPTION', 422, 'Custom product options are not available for this item.');
    }
    const optionGroups = variant.product_id && repository.getProductOptionGroups ? await repository.getProductOptionGroups(variant.product_id) : [];
    for (const key of Object.keys(requestedOptions)) if (!optionGroups.some((group) => group.key === key)) {
      throw new AppError('INVALID_OPTION', 422, `Option ${key} is not configured for ${variant.sku}.`);
    }
    for (const group of optionGroups) {
      const selectedKey = requestedOptions[group.key];
      if (selectedKey === undefined) {
        if (group.required) throw new AppError('OPTION_REQUIRED', 422, `Choose ${group.label_en} for ${variant.sku}.`);
        continue;
      }
      const selected = group.values.find((option) => option.key === selectedKey);
      if (!selected) throw new AppError('INVALID_OPTION', 422, `The selected ${group.label_en} is not available for ${variant.sku}.`);
      const adjustment = moneyToCents(selected.price_adjustment, 'product option price adjustment');
      optionSurcharge += selected.adjustment_type === 'per_unit' ? adjustment * BigInt(input.quantity) : adjustment;
      optionSnapshot[group.key] = { value: selected.key, label_en: selected.label_en, label_ar: selected.label_ar, adjustment_type: selected.adjustment_type, price_adjustment: centsToMoney(adjustment) };
    }

    const base = moneyToCents(rule.unit_price, 'unit_price') * BigInt(input.quantity);
    const fixed = moneyToCents(rule.fixed_fee, 'fixed_fee');
    const setup = moneyToCents(rule.setup_fee, 'setup_fee');
    const design = input.design_required ? moneyToCents(rule.design_fee, 'design_fee') : 0n;
    const installation = input.installation_required ? moneyToCents(rule.installation_fee, 'installation_fee') : 0n;
    const delivery = input.delivery_required ? moneyToCents(rule.delivery_fee, 'delivery_fee') : 0n;
    const subtotal = base + fixed + setup + design + installation + delivery + optionSurcharge;
    const rate = rateToUnits(rule.tax_rate);
    if (rate > RATE_SCALE) throw new AppError('INVALID_PRICE_RULE', 500, 'Configured tax_rate exceeds 100%.');
    const tax = (subtotal * rate + RATE_SCALE / 2n) / RATE_SCALE;
    const total = subtotal + tax;

    return {
      variant_id: variant.id,
      variant_sku: variant.sku,
      product_name: variant.name,
      pricing_basis: rule.pricing_basis ?? 'shop_approved',
      market_reference_id: rule.market_reference_id ?? null,
      quantity: input.quantity,
      unit_price: centsToMoney(moneyToCents(rule.unit_price, 'unit_price')),
      design_required: input.design_required ?? false,
      options: {
        ...(material ? { material } : {}),
        ...(input.finishing?.trim() ? { finishing: input.finishing.trim() } : {}),
        ...(Object.keys(optionSnapshot).length ? { custom_options: optionSnapshot } : {}),
        design_fee: centsToMoney(design),
        delivery_required: input.delivery_required ?? false,
        installation_required: input.installation_required ?? false
      },
      notes: input.notes?.trim() || null,
      breakdown: {
        base: centsToMoney(base), fixed_fee: centsToMoney(fixed), setup_fee: centsToMoney(setup),
        design_fee: centsToMoney(design), installation_fee: centsToMoney(installation), delivery_fee: centsToMoney(delivery), option_surcharge: centsToMoney(optionSurcharge),
        subtotal: centsToMoney(subtotal), tax_rate: String(rule.tax_rate), tax: centsToMoney(tax), total: centsToMoney(total)
      }
    };
  }));

  const subtotalCents = lines.reduce((sum, line) => sum + moneyToCents(line.breakdown.subtotal, 'subtotal'), 0n);
  const taxCents = lines.reduce((sum, line) => sum + moneyToCents(line.breakdown.tax, 'tax'), 0n);
  return {
    currency: 'EGP',
    subtotal: centsToMoney(subtotalCents),
    discount: '0.00',
    tax: centsToMoney(taxCents),
    total: centsToMoney(subtotalCents + taxCents),
    breakdown: lines
  };
}
