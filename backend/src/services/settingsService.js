const { Setting } = require('../models/associations');
const { getDefaultLogoDataUri } = require('../assets/defaultLogo');

const DEFAULT_SETTINGS = Object.freeze({
  business_name: 'Shanthi Electricals',
  business_phone: '',
  business_email: '',
  business_address: 'Sri Lanka',
  business_tax_number: '',
  business_tagline: 'Three Phase, Single Phase, Motor Winding, and AC/DC Spare Parts\nWater Pumps, Generators, Electrical Appliance Repair',
  business_logo: getDefaultLogoDataUri(),
  default_currency: 'LKR',
  currency_symbol: 'Rs.',
  default_tax_rate: '0',
  invoice_prefix: 'INV',
  timezone: 'Asia/Colombo',
  date_format: 'DD/MM/YYYY',
  receipt_footer: 'Thank you for shopping with Shanthi Electricals.',
  quotation_terms: 'Prices are valid for 14 days unless otherwise stated.',
});

const LEGACY_BRAND_NAMES = new Set(['', 'Electro Hardware Store', 'Electro POS', 'Electro POS System']);

async function ensureDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const [setting] = await Setting.findOrCreate({ where: { key }, defaults: { value } });
    if (key === 'business_name' && LEGACY_BRAND_NAMES.has(String(setting.value || '').trim())) {
      setting.value = 'Shanthi Electricals';
      await setting.save();
    }
  }
}

async function getSettings() {
  const rows = await Setting.findAll({ attributes: ['key', 'value'] });
  const settings = { ...DEFAULT_SETTINGS };
  rows.forEach((row) => {
    settings[row.key] = row.value;
  });
  if (LEGACY_BRAND_NAMES.has(String(settings.business_name || '').trim())) settings.business_name = 'Shanthi Electricals';
  return settings;
}

module.exports = { DEFAULT_SETTINGS, LEGACY_BRAND_NAMES, ensureDefaultSettings, getSettings };
