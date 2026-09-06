const bcrypt = require('bcryptjs');
const {
  Role,
  User,
  Warehouse,
  Currency,
  BaseUnit,
  Unit,
  Setting,
  ProductCategory,
  Brand,
} = require('../models/associations');
const { getDefaultLogoDataUri } = require('../assets/defaultLogo');

const PERMISSIONS = Object.freeze([
  'products.manage',
  'purchases.create',
  'sales.create',
  'stock.manage',
  'warehouses.manage',
  'suppliers.manage',
  'customers.manage',
  'expenses.manage',
  'users.manage',
  'settings.manage',
  'registers.view',
  'reports.view',
]);

const DEFAULT_SETTINGS = Object.freeze({
  business_name: 'Shanthi Electricals',
  business_phone: '+94 77 123 4567',
  business_email: '',
  business_address: 'Negombo, Western Province, Sri Lanka',
  business_tax_number: '',
  business_tagline: 'Three Phase, Single Phase, Motor Winding, and AC/DC Spare Parts\nWater Pumps, Generators, Electrical Appliance Repair',
  business_logo: getDefaultLogoDataUri(),
  default_currency: process.env.DEFAULT_CURRENCY_CODE || 'LKR',
  currency_symbol: process.env.DEFAULT_CURRENCY_SYMBOL || 'Rs.',
  default_tax_rate: '0',
  date_format: process.env.DEFAULT_DATE_FORMAT || 'DD/MM/YYYY',
  timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Colombo',
  invoice_prefix: 'INV',
  receipt_footer: 'Thank you for shopping with Shanthi Electricals.',
  quotation_terms: 'Prices are valid for 14 days unless otherwise stated.',
});

function normalizeAdmin(admin = {}) {
  const normalized = {
    name: String(admin.name || '').trim(),
    email: String(admin.email || '').trim().toLowerCase(),
    password: String(admin.password || ''),
    phone: String(admin.phone || '').trim(),
  };

  if (!normalized.name) throw new Error('Administrator name is required.');
  if (!/^\S+@\S+\.\S+$/.test(normalized.email)) {
    throw new Error('A valid administrator email address is required.');
  }
  if (normalized.password.length < 8) {
    throw new Error('Administrator password must contain at least 8 characters.');
  }

  return normalized;
}

async function ensureRoles() {
  const [adminRole] = await Role.findOrCreate({
    where: { name: 'admin' },
    defaults: { display_name: 'Shop Owner / Admin', permissions: PERMISSIONS },
  });

  await Role.findOrCreate({
    where: { name: 'manager' },
    defaults: {
      display_name: 'Store Manager',
      permissions: PERMISSIONS.filter(
        (permission) => permission !== 'users.manage' && permission !== 'settings.manage'
      ),
    },
  });

  await Role.findOrCreate({
    where: { name: 'cashier' },
    defaults: { display_name: 'Cashier', permissions: ['sales.create', 'customers.manage'] },
  });

  return adminRole;
}

async function ensureWarehouse() {
  const [warehouse] = await Warehouse.findOrCreate({
    where: { name: 'Main Warehouse - Negombo' },
    defaults: {
      phone: '+94 31 222 3344',
      country: 'Sri Lanka',
      city: 'Negombo',
      address: 'Main Street, Negombo, Western Province',
      zip_code: '11500',
      is_default: true,
    },
  });

  return warehouse;
}

async function ensureCurrency() {
  await Currency.findOrCreate({
    where: { code: process.env.DEFAULT_CURRENCY_CODE || 'LKR' },
    defaults: {
      name: 'Sri Lankan Rupee',
      symbol: process.env.DEFAULT_CURRENCY_SYMBOL || 'Rs.',
      exchange_rate: 1,
      is_default: true,
      position: 'left',
    },
  });
}

async function ensureUnits() {
  const [pieceBase] = await BaseUnit.findOrCreate({
    where: { name: 'Piece' },
    defaults: { is_default: true },
  });
  const [meterBase] = await BaseUnit.findOrCreate({ where: { name: 'Meter' } });
  const [boxBase] = await BaseUnit.findOrCreate({ where: { name: 'Box' } });
  const [rollBase] = await BaseUnit.findOrCreate({ where: { name: 'Roll' } });

  // Sequential on purpose: this runs at most once per fresh install, so the
  // negligible time cost isn't worth any complexity around concurrent writes.
  const unitDefinitions = [
    { name: 'Piece', base: pieceBase, short_name: 'pc' },
    { name: 'Meter', base: meterBase, short_name: 'm' },
    { name: 'Box', base: boxBase, short_name: 'box' },
    { name: 'Roll', base: rollBase, short_name: 'roll' },
  ];
  for (const unit of unitDefinitions) {
    await Unit.findOrCreate({
      where: { name: unit.name, base_unit_id: unit.base.id },
      defaults: { short_name: unit.short_name, operator: '*', operation_value: 1 },
    });
  }
}

async function ensureCatalogDefaults() {
  // Sequential on purpose (see ensureUnits above): one-time bootstrap only.
  const categories = [
    'Wires & Cables', 'Switches & Sockets', 'Lighting (Bulbs/LED)',
    'Circuit Breakers & MCBs', 'Fans', 'Tools & Hardware', 'Conduits & Fittings',
  ];
  for (const name of categories) {
    await ProductCategory.findOrCreate({ where: { name } });
  }

  const brands = ['Orange Electric', 'ACL Cables', 'Philips', 'Schneider Electric', 'Generic/Local'];
  for (const name of brands) {
    await Brand.findOrCreate({ where: { name } });
  }
}

async function ensureSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const [setting] = await Setting.findOrCreate({ where: { key }, defaults: { value } });
    if (
      key === 'business_name' &&
      ['Electro Hardware Store', 'Electro POS', ''].includes(String(setting.value || ''))
    ) {
      setting.value = 'Shanthi Electricals';
      await setting.save();
    }
  }
}

async function ensureAdministrator({ admin, adminRole, warehouse, requireAdmin = false } = {}) {
  const userCount = await User.count();
  if (userCount > 0) return { created: false, existingUsers: userCount };

  if (!admin) {
    if (requireAdmin) {
      const error = new Error(
        'This database contains no POS users. Re-run desktop database setup and create the first administrator.'
      );
      error.code = 'POS_ADMIN_REQUIRED';
      throw error;
    }
    return { created: false, existingUsers: 0 };
  }

  const normalized = normalizeAdmin(admin);
  const hashed = await bcrypt.hash(normalized.password, 10);
  const user = await User.create({
    name: normalized.name,
    email: normalized.email,
    password: hashed,
    phone: normalized.phone || null,
    role_id: adminRole.id,
    warehouse_id: warehouse.id,
    status: 'active',
  });

  return { created: true, userId: user.id, email: user.email };
}

async function bootstrapShopData({ admin, requireAdmin = false } = {}) {
  const adminRole = await ensureRoles();
  const warehouse = await ensureWarehouse();
  await ensureCurrency();
  await ensureUnits();
  await ensureCatalogDefaults();
  await ensureSettings();
  const administrator = await ensureAdministrator({ admin, adminRole, warehouse, requireAdmin });

  return { administrator };
}

module.exports = {
  PERMISSIONS,
  DEFAULT_SETTINGS,
  normalizeAdmin,
  bootstrapShopData,
};
