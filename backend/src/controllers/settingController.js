const { Setting } = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');
const { getSettings } = require('../services/settingsService');

const getAll = asyncHandler(async (req, res) => {
  res.json({ data: await getSettings() });
});

// body: { key1: value1, key2: value2, ... } - upserts each entry
const updateMany = asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [key, value] of entries) {
    await Setting.upsert({ key, value: value === null || value === undefined ? '' : String(value) });
  }
  res.json({ data: await getSettings() });
});

module.exports = { getAll, updateMany };
