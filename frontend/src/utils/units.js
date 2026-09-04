// Converts a quantity expressed in `unit` into its BaseUnit-equivalent
// (e.g. 5 feet -> 1.524, when Foot's base unit is Meter).
export function toBaseQuantity(quantity, unit) {
  const qty = Number(quantity) || 0;
  if (!unit) return qty;
  const factor = Number(unit.operation_value) || 1;
  return unit.operator === '/' ? qty / factor : qty * factor;
}

// Converts a BaseUnit-equivalent quantity back into `unit`'s terms.
export function fromBaseQuantity(baseQuantity, unit) {
  const qty = Number(baseQuantity) || 0;
  if (!unit) return qty;
  const factor = Number(unit.operation_value) || 1;
  return unit.operator === '/' ? qty * factor : qty / factor;
}

// Converts a quantity directly between two sibling units (same BaseUnit),
// e.g. 5 Feet -> Meters, by round-tripping through the shared base unit.
export function convertUnits(quantity, fromUnit, toUnit) {
  return fromBaseQuantity(toBaseQuantity(quantity, fromUnit), toUnit);
}

// Returns the list of units that share a base unit with the product's own
// sale/stock unit (e.g. Meter/Foot/Yard/Inch), only when there's more than
// one option -- that's the signal to show a unit picker in the cart line.
// `allUnits` is the full Units master list (already includes base_unit_id).
export function compatibleUnits(product, allUnits = []) {
  const refUnit = product?.saleUnit || product?.stockUnit;
  if (!refUnit?.base_unit_id) return [];
  const siblings = allUnits.filter((unit) => unit.base_unit_id === refUnit.base_unit_id);
  return siblings.length > 1 ? siblings : [];
}

// The unit a cart line should default to when first added -- the product's
// configured sale unit, falling back to its stock unit.
export function defaultUnitId(product) {
  return product?.sale_unit || product?.product_unit || null;
}

export function findUnit(unitId, allUnits = []) {
  if (!unitId) return null;
  return allUnits.find((unit) => unit.id === Number(unitId)) || null;
}
