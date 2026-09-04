const { Op } = require('../database/mongoOrm');
const {
  Product, ProductCategory, Brand, Unit, ManageStock, Warehouse,
  MainProduct, VariationProduct, Variation, VariationType, ProductPriceHistory, User, Purchase,
  Adjustment, AdjustmentItem, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const HttpError = require('../utils/httpError');
const { applyProductPriceChange } = require('../services/productPriceService');
const { generateUniqueProductCode, normalizeBarcodeInput, barcodeSymbolFor } = require('../utils/barcode');
const {
  normalizeProductPayload,
  normalizeInitialStock,
  requiredPositiveInteger,
  finiteNumber,
} = require('../utils/productPayload');
const { normalizeAttributes, normalizeVariantRows, variantKey } = require('../utils/variantPayload');
const { normalizeStockLevels, planStockReconciliation } = require('../utils/stockReconciliation');
const { adjustStock } = require('../utils/stockService');
const { todayISO } = require('../utils/date');

const baseProductIncludes = [
  { model: ProductCategory },
  { model: Brand },
  { model: Unit, as: 'stockUnit' },
  { model: Unit, as: 'saleUnit' },
  { model: Unit, as: 'purchaseUnit' },
  { model: ManageStock, include: [Warehouse] },
];

const includeGraph = [
  ...baseProductIncludes,
  { model: MainProduct },
];

const familyIncludeGraph = [
  {
    model: Product,
    as: 'variants',
    required: false,
    include: [
      ...baseProductIncludes,
      { model: VariationProduct, include: [Variation, VariationType] },
    ],
  },
];

function userCanManageStock(user) {
  const role = user?.Role;
  return role?.name === 'admin' || (role?.permissions || []).includes('stock.manage');
}

function assertOpeningStockPermission(variantRows, user) {
  const hasOpeningStock = (variantRows || []).some((variant) =>
    (variant.initial_stock || []).some((row) => Number(row.quantity || 0) > 0));
  if (hasOpeningStock && !userCanManageStock(user)) {
    throw new HttpError(403, 'You do not have permission to enter opening stock.');
  }
}

async function reconcileProductStock({ product, requestedRows, reason, userId, canManageStock = true, transaction }) {
  const requested = normalizeStockLevels(requestedRows);
  if (requested === null) return [];

  const warehouseIds = [...new Set(requested.map((row) => row.warehouse_id))];
  const warehouses = warehouseIds.length
    ? await Warehouse.findAll({ where: { id: { [Op.in]: warehouseIds } }, transaction })
    : [];
  if (warehouses.length !== warehouseIds.length) {
    throw new HttpError(422, 'One or more selected warehouses no longer exists. Refresh and try again.');
  }

  const currentRows = await ManageStock.findAll({
    where: { product_id: product.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const changes = planStockReconciliation(currentRows, requested);
  if (!changes.length) return [];
  if (!canManageStock) throw new HttpError(403, 'You do not have permission to change stock quantities.');

  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new HttpError(422, 'Enter a reason for the stock change.');
  if (cleanReason.length > 1000) throw new HttpError(422, 'Stock change reason must not exceed 1000 characters.');

  for (const change of changes) {
    const adjustment = await Adjustment.create({
      date: todayISO(),
      warehouse_id: change.warehouse_id,
      notes: `${cleanReason} (${product.name}: ${change.old_quantity} → ${change.quantity}; user ${userId || 'system'})`,
      reference_code: generateReferenceCode('ADJ'),
      created_by: userId || null,
    }, { transaction });
    await AdjustmentItem.create({
      adjustment_id: adjustment.id,
      product_id: product.id,
      type: change.type,
      quantity: Math.abs(change.delta),
    }, { transaction });
    await adjustStock({
      productId: product.id,
      warehouseId: change.warehouse_id,
      delta: change.delta,
      transaction,
    });
  }
  return changes;
}

async function validateProductReferences(productData, transaction) {
  const checks = [];

  if (productData.product_category_id !== undefined) {
    checks.push(
      ProductCategory.findByPk(productData.product_category_id, { transaction }).then((record) => {
        if (!record) throw new HttpError(422, 'The selected product category no longer exists. Refresh the page and select it again.');
      })
    );
  }

  if (productData.brand_id) {
    checks.push(
      Brand.findByPk(productData.brand_id, { transaction }).then((record) => {
        if (!record) throw new HttpError(422, 'The selected brand no longer exists. Refresh the page and select it again.');
      })
    );
  }

  if (productData.main_product_id) {
    checks.push(
      MainProduct.findByPk(productData.main_product_id, { transaction }).then((record) => {
        if (!record) throw new HttpError(422, 'The selected main product no longer exists.');
      })
    );
  }

  const unitIds = [...new Set([
    productData.product_unit,
    productData.sale_unit,
    productData.purchase_unit,
  ].filter(Boolean))];

  if (unitIds.length) {
    checks.push(
      Unit.count({ where: { id: unitIds }, transaction }).then((count) => {
        if (count !== unitIds.length) {
          throw new HttpError(422, 'One or more selected units no longer exist. Refresh the page and select the units again.');
        }
      })
    );
  }

  await Promise.all(checks);
}


function cleanFamilyText(value, fieldName, { required = false, max = 255 } = {}) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new HttpError(422, `${fieldName} is required.`);
  if (text.length > max) throw new HttpError(422, `${fieldName} must not exceed ${max} characters.`);
  return text;
}

function familyCodeBase(name) {
  const slug = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `FAM-${slug || 'PRODUCT'}`;
}

async function uniqueFamilyCode(name, requestedCode, transaction) {
  const requested = cleanFamilyText(requestedCode, 'Family code', { max: 80 }).toUpperCase();
  if (requested) {
    const exists = await MainProduct.count({ where: { code: requested }, transaction });
    if (exists) throw new HttpError(422, `Family code "${requested}" is already in use.`);
    return requested;
  }

  const base = familyCodeBase(name);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${base}${suffix}`.slice(0, 80);
    const exists = await MainProduct.count({ where: { code: candidate }, transaction });
    if (!exists) return candidate;
  }
  throw new HttpError(500, 'Could not generate a unique product-family code.');
}

function buildCommonProductData(input = {}) {
  const placeholder = normalizeProductPayload({
    name: 'Variant placeholder',
    code: 'VARIANT-PLACEHOLDER',
    product_category_id: input.product_category_id,
    brand_id: input.brand_id,
    product_cost: 0,
    product_price: 0,
    product_unit: input.product_unit,
    sale_unit: input.sale_unit,
    purchase_unit: input.purchase_unit,
    stock_alert: input.stock_alert,
    quantity_limit: input.quantity_limit,
    order_tax: input.order_tax,
    tax_type: input.tax_type,
    notes: input.notes,
  });
  delete placeholder.name;
  delete placeholder.code;
  delete placeholder.product_cost;
  delete placeholder.product_price;
  return placeholder;
}

async function getWarehousesAndValidateStock(variantRows, transaction) {
  const warehouses = await Warehouse.findAll({ transaction });
  const warehouseIds = new Set(warehouses.map((warehouse) => Number(warehouse.id)));
  for (const variant of variantRows) {
    const unknown = variant.initial_stock.find((row) => !warehouseIds.has(Number(row.warehouse_id)));
    if (unknown) {
      throw new HttpError(422, `Warehouse ${unknown.warehouse_id} no longer exists. Refresh the page and try again.`);
    }
  }
  return warehouses;
}

async function createStockRows(productId, initialStock, warehouses, transaction) {
  if (!warehouses.length) return;
  const initialByWarehouse = new Map(initialStock.map((row) => [Number(row.warehouse_id), Number(row.quantity || 0)]));
  await ManageStock.bulkCreate(
    warehouses.map((warehouse) => ({
      warehouse_id: warehouse.id,
      product_id: productId,
      quantity: initialByWarehouse.get(Number(warehouse.id)) || 0,
    })),
    { transaction }
  );
}

async function createVariationLinks(mainProductId, productId, attributes, transaction) {
  for (const [attributeName, optionName] of Object.entries(attributes || {})) {
    const [variation] = await Variation.findOrCreate({
      where: { name: attributeName },
      defaults: { name: attributeName },
      transaction,
    });
    const [variationType] = await VariationType.findOrCreate({
      where: { variation_id: variation.id, name: optionName },
      defaults: { variation_id: variation.id, name: optionName },
      transaction,
    });
    await VariationProduct.create({
      main_product_id: mainProductId,
      product_id: productId,
      variation_id: variation.id,
      variation_type_id: variationType.id,
    }, { transaction });
  }
}

async function assertVariantCodesAvailable(variantRows, transaction) {
  const codes = variantRows.map((row) => row.code).filter(Boolean);
  if (!codes.length) return;
  const existing = await Product.findOne({ where: { code: { [Op.in]: codes } }, transaction });
  if (existing) throw new HttpError(422, `Barcode/SKU "${existing.code}" is already used by another product.`);
}

async function createVariantRows({ family, commonData, variants, warehouses, transaction, startOrder = 0 }) {
  const created = [];
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    let code = variant.code;
    if (!code) code = await generateUniqueProductCode(Product, { transaction });
    const barcodeSymbol = barcodeSymbolFor(code, variant.barcode_symbol || (variant.code ? 'CODE128' : 'EAN13'));
    const productData = normalizeProductPayload({
      ...commonData,
      name: `${family.name} - ${variant.label}`,
      code,
      barcode_symbol: barcodeSymbol,
      product_cost: variant.product_cost,
      product_price: variant.product_price,
      stock_alert: variant.stock_alert,
      quantity_limit: variant.quantity_limit,
      main_product_id: family.id,
    });
    productData.variant_name = variant.label;
    productData.variant_attributes = variant.attributes;
    productData.variant_sort_order = startOrder + index;

    const product = await Product.create(productData, { transaction });
    await createStockRows(product.id, variant.initial_stock, warehouses, transaction);
    await createVariationLinks(family.id, product.id, variant.attributes, transaction);
    created.push(product);
  }
  return created;
}

function buildVariantConfig(variants) {
  const config = {};
  variants.forEach((variant) => {
    Object.entries(variant.attributes || {}).forEach(([name, value]) => {
      if (!config[name]) config[name] = [];
      if (!config[name].includes(value)) config[name].push(value);
    });
  });
  return Object.entries(config).map(([name, values]) => ({ name, values }));
}

async function loadFamily(id, transaction) {
  const family = await MainProduct.findByPk(id, {
    include: familyIncludeGraph,
    transaction,
  });
  if (!family) throw new HttpError(404, 'Product family not found.');
  return family;
}

const list = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(req.query.per_page || '20', 10) || 20, 1), 200);
  const where = { is_active: true };

  if (req.query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${req.query.search}%` } },
      { code: { [Op.like]: `%${req.query.search}%` } },
    ];
  }
  if (req.query.category_id) where.product_category_id = req.query.category_id;
  if (req.query.brand_id) where.brand_id = req.query.brand_id;

  const { rows, count } = await Product.findAndCountAll({
    where,
    include: includeGraph,
    order: [['id', 'DESC']],
    limit: perPage,
    offset: (page - 1) * perPage,
    distinct: true,
  });

  const data = rows.map((p) => {
    const json = p.toJSON();
    const totalStock = (json.ManageStocks || []).reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    json.total_stock = totalStock;
    json.low_stock = json.stock_alert != null && totalStock <= Number(json.stock_alert);
    return json;
  });

  res.json({ data, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
});

const lookupByCode = asyncHandler(async (req, res) => {
  const code = normalizeBarcodeInput(req.params.code);
  if (!code) throw new HttpError(422, 'Scan or enter a product barcode/code.');

  const product = await Product.findOne({
    where: { code, is_active: true },
    include: includeGraph,
  });
  if (!product) return res.status(404).json({ message: 'Product not found for this barcode/code' });
  res.json({ data: product });
});

const generateCode = asyncHandler(async (req, res) => {
  const code = await generateUniqueProductCode(Product);
  res.json({ data: { code, barcode_symbol: 'EAN13' } });
});

const getOne = asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id, {
    include: [
      ...includeGraph,
      { model: VariationProduct, include: [Variation, VariationType] },
    ],
  });
  if (!product) return res.status(404).json({ message: 'Not found' });
  res.json({ data: product });
});

// Creates a product and optionally seeds initial stock per warehouse.
// body.initial_stock = [{ warehouse_id, quantity }]
const create = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const { initial_stock: rawInitialStock, ...rawProductData } = req.body || {};
    rawProductData.code = normalizeBarcodeInput(rawProductData.code);
    if (!rawProductData.code) {
      rawProductData.code = await generateUniqueProductCode(Product, { transaction });
      rawProductData.barcode_symbol = 'EAN13';
    } else {
      rawProductData.barcode_symbol = barcodeSymbolFor(rawProductData.code, rawProductData.barcode_symbol);
    }
    const productData = normalizeProductPayload(rawProductData);
    const initialStock = normalizeInitialStock(rawInitialStock);
    if (initialStock.some((row) => Number(row.quantity) > 0) && !userCanManageStock(req.user)) {
      throw new HttpError(403, 'You do not have permission to enter opening stock.');
    }

    await validateProductReferences(productData, transaction);

    const warehouses = await Warehouse.findAll({ transaction });
    const warehouseIds = new Set(warehouses.map((warehouse) => warehouse.id));
    const unknownWarehouse = initialStock.find((row) => !warehouseIds.has(row.warehouse_id));
    if (unknownWarehouse) {
      throw new HttpError(422, `Warehouse ${unknownWarehouse.warehouse_id} no longer exists. Refresh the page and try again.`);
    }

    const product = await Product.create(productData, { transaction });
    const initialByWarehouse = new Map(initialStock.map((row) => [row.warehouse_id, row.quantity]));

    if (warehouses.length) {
      await ManageStock.bulkCreate(
        warehouses.map((warehouse) => ({
          warehouse_id: warehouse.id,
          product_id: product.id,
          quantity: initialByWarehouse.get(warehouse.id) || 0,
        })),
        { transaction }
      );
    }

    return product;
  });

  const full = await Product.findByPk(result.id, { include: includeGraph });
  res.status(201).json({ data: full });
});


const getFamily = asyncHandler(async (req, res) => {
  const family = await loadFamily(req.params.id);
  const json = family.toJSON();
  json.variants = (json.variants || [])
    .map((product) => {
      const totalStock = (product.ManageStocks || []).reduce((sum, stock) => sum + Number(stock.quantity || 0), 0);
      return { ...product, total_stock: totalStock };
    })
    .sort((a, b) => Number(a.variant_sort_order || 0) - Number(b.variant_sort_order || 0));
  res.json({ data: json });
});

const createFamily = asyncHandler(async (req, res) => {
  const familyId = await sequelize.transaction(async (transaction) => {
    const familyName = cleanFamilyText(req.body?.name, 'Product family name', { required: true });
    const variantRows = normalizeVariantRows(req.body?.variants);
    assertOpeningStockPermission(variantRows, req.user);
    const commonData = buildCommonProductData(req.body || {});
    await validateProductReferences(commonData, transaction);
    await assertVariantCodesAvailable(variantRows, transaction);
    const warehouses = await getWarehousesAndValidateStock(variantRows, transaction);
    const familyCode = await uniqueFamilyCode(familyName, req.body?.family_code || req.body?.code, transaction);

    const family = await MainProduct.create({
      name: familyName,
      code: familyCode,
      product_unit: commonData.product_unit,
      product_type: 'variable',
      variant_config: buildVariantConfig(variantRows),
    }, { transaction });

    await createVariantRows({
      family,
      commonData,
      variants: variantRows,
      warehouses,
      transaction,
    });
    return family.id;
  });

  const family = await loadFamily(familyId);
  res.status(201).json({ data: family, message: 'Product family and variants created.' });
});

const addFamilyVariants = asyncHandler(async (req, res) => {
  const familyId = requiredPositiveInteger(req.params.id, 'Product family');
  await sequelize.transaction(async (transaction) => {
    const family = await loadFamily(familyId, transaction);
    const existingProducts = family.variants || [];
    const source = existingProducts.find((product) => product.is_active) || existingProducts[0];
    if (!source) throw new HttpError(422, 'This product family has no base variant to copy common product settings from.');

    const variantRows = normalizeVariantRows(req.body?.variants);
    assertOpeningStockPermission(variantRows, req.user);
    const existingLabels = new Set(existingProducts.map((product) => String(product.variant_name || '').trim().toLowerCase()).filter(Boolean));
    const existingKeys = new Set(existingProducts.map((product) => variantKey(product.variant_attributes, product.variant_name)).filter(Boolean));
    for (const variant of variantRows) {
      if (existingLabels.has(variant.label.toLowerCase())) {
        throw new HttpError(422, `Variant name "${variant.label}" already exists in this family.`);
      }
      if (existingKeys.has(variantKey(variant.attributes, variant.label))) {
        throw new HttpError(422, `Variant combination "${variant.label}" already exists in this family.`);
      }
    }

    await assertVariantCodesAvailable(variantRows, transaction);
    const warehouses = await getWarehousesAndValidateStock(variantRows, transaction);
    const commonData = buildCommonProductData({
      product_category_id: source.product_category_id,
      brand_id: source.brand_id,
      product_unit: source.product_unit,
      sale_unit: source.sale_unit,
      purchase_unit: source.purchase_unit,
      stock_alert: source.stock_alert,
      quantity_limit: source.quantity_limit,
      order_tax: source.order_tax,
      tax_type: source.tax_type,
      notes: source.notes,
    });
    await validateProductReferences(commonData, transaction);

    const startOrder = existingProducts.reduce((max, product) => Math.max(max, Number(product.variant_sort_order || 0)), -1) + 1;
    await createVariantRows({ family, commonData, variants: variantRows, warehouses, transaction, startOrder });

    const combinedConfig = buildVariantConfig([
      ...existingProducts.map((product) => ({ attributes: product.variant_attributes || {} })),
      ...variantRows,
    ]);
    await family.update({ variant_config: combinedConfig }, { transaction });
  });

  const family = await loadFamily(familyId);
  res.status(201).json({ data: family, message: 'New variants added to the product family.' });
});

const convertProductToFamily = asyncHandler(async (req, res) => {
  const productId = requiredPositiveInteger(req.params.id, 'Product');
  const familyId = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw new HttpError(404, 'Product not found.');
    if (product.main_product_id) throw new HttpError(422, 'This product already belongs to a product family.');

    const familyName = cleanFamilyText(req.body?.name || product.name, 'Product family name', { required: true });
    const existingLabel = cleanFamilyText(req.body?.existing_variant_name || 'Standard', 'Existing variant name', { required: true, max: 180 });
    const existingAttributes = normalizeAttributes(req.body?.existing_attributes || { Variant: existingLabel });
    const newVariants = Array.isArray(req.body?.variants) && req.body.variants.length
      ? normalizeVariantRows(req.body.variants)
      : [];
    assertOpeningStockPermission(newVariants, req.user);

    const existingKey = variantKey(existingAttributes, existingLabel);
    for (const variant of newVariants) {
      if (variant.label.toLowerCase() === existingLabel.toLowerCase() || variantKey(variant.attributes, variant.label) === existingKey) {
        throw new HttpError(422, `New variant "${variant.label}" duplicates the existing product variant.`);
      }
    }
    await assertVariantCodesAvailable(newVariants, transaction);
    const warehouses = await getWarehousesAndValidateStock(newVariants, transaction);
    const familyCode = await uniqueFamilyCode(familyName, req.body?.family_code, transaction);

    const family = await MainProduct.create({
      name: familyName,
      code: familyCode,
      product_unit: product.product_unit,
      product_type: 'variable',
      variant_config: buildVariantConfig([
        { attributes: existingAttributes },
        ...newVariants,
      ]),
    }, { transaction });

    await product.update({
      main_product_id: family.id,
      name: `${familyName} - ${existingLabel}`,
      variant_name: existingLabel,
      variant_attributes: existingAttributes,
      variant_sort_order: 0,
    }, { transaction });
    await createVariationLinks(family.id, product.id, existingAttributes, transaction);

    if (newVariants.length) {
      const commonData = buildCommonProductData({
        product_category_id: product.product_category_id,
        brand_id: product.brand_id,
        product_unit: product.product_unit,
        sale_unit: product.sale_unit,
        purchase_unit: product.purchase_unit,
        stock_alert: product.stock_alert,
        quantity_limit: product.quantity_limit,
        order_tax: product.order_tax,
        tax_type: product.tax_type,
        notes: product.notes,
      });
      await createVariantRows({
        family,
        commonData,
        variants: newVariants,
        warehouses,
        transaction,
        startOrder: 1,
      });
    }
    return family.id;
  });

  const family = await loadFamily(familyId);
  res.status(201).json({ data: family, message: 'Product converted into a variant family.' });
});

const update = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw new HttpError(404, 'Product not found');

    const {
      initial_stock: _ignoredInitialStock,
      stock_levels: stockLevels,
      stock_change_reason: stockChangeReason,
      price_change_reason: priceChangeReason,
      ...rawProductData
    } = req.body || {};
    if (Object.prototype.hasOwnProperty.call(rawProductData, 'code')) {
      rawProductData.code = normalizeBarcodeInput(rawProductData.code);
      if (!rawProductData.code) throw new HttpError(422, 'Product barcode/code cannot be empty.');
      rawProductData.barcode_symbol = barcodeSymbolFor(rawProductData.code, rawProductData.barcode_symbol || product.barcode_symbol);
    }
    const productData = normalizeProductPayload(rawProductData, { partial: true });
    await validateProductReferences(productData, transaction);

    const requestedCost = productData.product_cost;
    const requestedPrice = productData.product_price;
    delete productData.product_cost;
    delete productData.product_price;

    if (Object.keys(productData).length) await product.update(productData, { transaction });
    await applyProductPriceChange({
      product,
      newCost: requestedCost,
      newPrice: requestedPrice,
      reason: priceChangeReason || 'Product details edited',
      source: 'product_edit',
      changedBy: req.user?.id,
      transaction,
    });
    await reconcileProductStock({
      product,
      requestedRows: stockLevels,
      reason: stockChangeReason,
      userId: req.user?.id,
      canManageStock: userCanManageStock(req.user),
      transaction,
    });
    return product;
  });

  const full = await Product.findByPk(result.id, { include: includeGraph });
  res.json({ data: full });
});

const adjustPrices = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw new HttpError(404, 'Product not found');

    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw new HttpError(422, 'Please enter a reason for the price adjustment.');

    const change = await applyProductPriceChange({
      product,
      newCost: req.body?.new_cost,
      newPrice: req.body?.new_price,
      reason,
      source: 'manual',
      changedBy: req.user?.id,
      transaction,
    });

    if (!change.changed) throw new HttpError(422, 'Enter a different cost price or selling price.');
    return product;
  });

  const full = await Product.findByPk(result.id, { include: includeGraph });
  res.json({ data: full, message: 'Product prices updated and recorded in price history.' });
});

const priceHistory = asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id, { attributes: ['id', 'name', 'code', 'product_cost', 'product_price'] });
  if (!product) throw new HttpError(404, 'Product not found');

  const history = await ProductPriceHistory.findAll({
    where: { product_id: product.id },
    include: [
      { model: User, as: 'changedBy', attributes: ['id', 'name'] },
      { model: Purchase, attributes: ['id', 'reference_code', 'date'] },
    ],
    order: [['id', 'DESC']],
    limit: 100,
  });

  res.json({ data: history, product });
});

const remove = asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: 'Not found' });
  await product.update({ is_active: false });
  res.json({ message: 'Product deactivated' });
});

const setStock = asyncHandler(async (req, res) => {
  const productId = requiredPositiveInteger(req.params.id, 'Product');
  const warehouseId = requiredPositiveInteger(req.body?.warehouse_id, 'Warehouse');
  const quantity = finiteNumber(req.body?.quantity, 'Stock quantity', { required: true, min: 0 });

  const result = await sequelize.transaction(async (transaction) => {
    const [product, warehouse] = await Promise.all([
      Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE }),
      Warehouse.findByPk(warehouseId, { transaction }),
    ]);
    if (!product) throw new HttpError(404, 'Product not found');
    if (!warehouse) throw new HttpError(422, 'The selected warehouse no longer exists.');

    await reconcileProductStock({
      product,
      requestedRows: [{ warehouse_id: warehouseId, quantity }],
      reason: req.body?.reason,
      userId: req.user?.id,
      transaction,
    });
    return ManageStock.findOne({ where: { product_id: productId, warehouse_id: warehouseId }, transaction });
  });

  res.json({ data: result });
});

module.exports = {
  list, getOne, create, update, remove, lookupByCode, setStock, adjustPrices, priceHistory, generateCode,
  getFamily, createFamily, addFamilyVariants, convertProductToFamily,
};
