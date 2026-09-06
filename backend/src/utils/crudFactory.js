const { Op } = require('../config/sequelizeCompat');
const { asyncHandler } = require('./helpers');

/**
 * Builds standard list/get/create/update/delete handlers for a Sequelize model.
 * Keeps the many near-identical master-data resources (categories, brands,
 * units, warehouses, suppliers, customers, currencies, roles...) consistent
 * and free of copy-paste bugs.
 *
 * options:
 *  - searchFields: string[] columns matched against ?search=
 *  - include: Sequelize include array applied on list/get
 *  - order: default ordering, e.g. [['name', 'ASC']]
 *  - beforeCreate/beforeUpdate: optional (req, data) => data hooks
 */
function crudFactory(model, options = {}) {
  const { searchFields = [], include = [], order = [['id', 'DESC']] } = options;

  const list = asyncHandler(async (req, res) => {
    const requestedPage = Number(req.query.page || 1);
    const requestedPerPage = Number(req.query.per_page || 20);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const perPage = Number.isInteger(requestedPerPage) && requestedPerPage > 0 ? Math.min(requestedPerPage, 200) : 20;
    const where = {};

    if (req.query.search && searchFields.length) {
      where[Op.or] = searchFields.map((f) => ({ [f]: { [Op.like]: `%${req.query.search}%` } }));
    }

    const { rows, count } = await model.findAndCountAll({
      where,
      include,
      order,
      limit: perPage,
      offset: (page - 1) * perPage,
      distinct: true,
    });

    res.json({ data: rows, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
  });

  const getOne = asyncHandler(async (req, res) => {
    const record = await model.findByPk(req.params.id, { include });
    if (!record) return res.status(404).json({ message: 'Not found' });
    res.json({ data: record });
  });

  const create = asyncHandler(async (req, res) => {
    let data = req.body;
    if (options.beforeCreate) data = await options.beforeCreate(req, data);
    const record = await model.create(data);
    res.status(201).json({ data: record });
  });

  const update = asyncHandler(async (req, res) => {
    const record = await model.findByPk(req.params.id);
    if (!record) return res.status(404).json({ message: 'Not found' });
    let data = req.body;
    if (options.beforeUpdate) data = await options.beforeUpdate(req, data, record);
    await record.update(data);
    res.json({ data: record });
  });

  const remove = asyncHandler(async (req, res) => {
    const record = await model.findByPk(req.params.id);
    if (!record) return res.status(404).json({ message: 'Not found' });
    await record.destroy();
    res.json({ message: 'Deleted' });
  });

  return { list, getOne, create, update, remove };
}

module.exports = crudFactory;
