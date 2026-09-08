require('./environment');
const mongoose = require('mongoose');
const { getDatabaseConfig } = require('./databaseSetup');

// Sequelize-shaped facade over Mongoose. This preserves the existing REST/JSON
// contract while MongoDB is the application's only persistence engine.
const Op = Object.freeze({
  or: Symbol('or'), in: Symbol('in'), ne: Symbol('ne'), like: Symbol('like'),
  between: Symbol('between'), gte: Symbol('gte'), gt: Symbol('gt'),
  lte: Symbol('lte'), lt: Symbol('lt'),
});
const scalar = (kind) => Object.freeze({ __mongoType: kind });
const stringType = (length) => ({ __mongoType: 'string', length });
Object.assign(stringType, scalar('string'));
const DataTypes = {
  STRING: stringType,
  TEXT: Object.assign(() => scalar('string'), scalar('string')),
  INTEGER: scalar('number'), DOUBLE: scalar('number'), BOOLEAN: scalar('boolean'),
  JSON: scalar('mixed'), DATEONLY: scalar('string'), DATE: scalar('date'),
  ENUM: (...values) => ({ __mongoType: 'string', values }),
};
const fn = (name, value) => ({ __fn: String(name).toUpperCase(), value });
const col = (name) => ({ __col: String(name).split('.').pop() });

class MongoReferenceConstraintError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'MongoReferenceConstraintError';
    this.status = 409;
    this.field = field;
  }
}

function typeDescriptor(value) {
  if (value && value.__mongoType) return value;
  if (typeof value === 'function' && value.__mongoType) return value;
  return scalar('mixed');
}

function mongoField(definition = {}) {
  const descriptor = typeDescriptor(definition.type || definition);
  const type = descriptor.__mongoType === 'number' ? Number
    : descriptor.__mongoType === 'boolean' ? Boolean
      : descriptor.__mongoType === 'date' ? Date
        : descriptor.__mongoType === 'mixed' ? mongoose.Schema.Types.Mixed
          : String;
  const result = { type };
  if (definition.allowNull === false) result.required = true;
  if (definition.defaultValue !== undefined) result.default = definition.defaultValue;
  if (definition.unique) { result.unique = true; if (definition.allowNull !== false) result.sparse = true; }
  if (descriptor.values) result.enum = descriptor.values;
  if (definition.validate?.isEmail) result.match = /^\S+@\S+\.\S+$/;
  return result;
}

function pluralize(name) {
  if (/y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}

function convertValue(value) {
  if (value instanceof RegExp || value instanceof Date || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(convertValue);
  if (typeof value !== 'object') return value;
  const output = {};
  for (const key of Reflect.ownKeys(value)) {
    const item = value[key];
    if (key === Op.or) output.$or = item.map(convertWhere);
    else if (key === Op.in) output.$in = item;
    else if (key === Op.ne) output.$ne = item;
    else if (key === Op.like) output.$regex = new RegExp(String(item).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*'), 'i');
    else if (key === Op.between) { output.$gte = item[0]; output.$lte = item[1]; }
    else if (key === Op.gte) output.$gte = item;
    else if (key === Op.gt) output.$gt = item;
    else if (key === Op.lte) output.$lte = item;
    else if (key === Op.lt) output.$lt = item;
    else output[key] = convertValue(item);
  }
  return output;
}

function convertWhere(where = {}) {
  const converted = convertValue(where);
  for (const [key, value] of Object.entries(converted)) {
    if (Array.isArray(value)) converted[key] = { $in: value };
  }
  return converted;
}
function sessionOption(options = {}) { return options.transaction?.session ? { session: options.transaction.session } : {}; }

function applyProjection(query, attributes, model, include) {
  if (Array.isArray(attributes)) {
    const plain = attributes.filter((item) => typeof item === 'string');
    for (const spec of normalizeInclude(include)) {
      const association = model.associations.find((item) => item.target === spec.model && (!spec.as || item.as === spec.as));
      if (!association) continue;
      const requiredField = association.kind === 'belongsTo' ? association.foreignKey : 'id';
      if (!plain.includes(requiredField)) plain.push(requiredField);
    }
    if (plain.length) query.select(plain.join(' '));
  } else if (attributes?.exclude) query.select(attributes.exclude.map((key) => `-${key}`).join(' '));
  return query;
}

function normalizeInclude(include) {
  return (include || []).map((entry) => typeof entry === 'function' || entry?.__mongooseModel ? { model: entry } : entry);
}

async function attachIncludes(documents, include, options = {}) {
  const docs = Array.isArray(documents) ? documents : [documents];
  const active = docs.filter(Boolean);
  for (const spec of normalizeInclude(include)) {
    const target = spec.model;
    if (!target) continue;
    const association = options.source.associations.find((item) => item.target === target && (!spec.as || item.as === spec.as));
    if (!association) continue;
    for (const doc of active) {
      let related;
      if (association.kind === 'belongsTo') {
        related = doc[association.foreignKey] == null ? null : await target.findOne({ where: { id: doc[association.foreignKey], ...(spec.where || {}) }, attributes: spec.attributes, include: spec.include, transaction: options.transaction });
      } else {
        related = await target.findAll({ where: { [association.foreignKey]: doc.id, ...(spec.where || {}) }, attributes: spec.attributes, include: spec.include, transaction: options.transaction });
      }
      doc.$locals.includes ||= {};
      doc.$locals.includes[association.as] = related;
      doc[association.as] = related;
    }
  }
  return Array.isArray(documents) ? active : active[0] || null;
}

function installDocumentCompatibility(schema) {
  schema.set('toJSON', {
    virtuals: false,
    transform(doc, ret) {
      delete ret._id; delete ret.__v;
      for (const [key, value] of Object.entries(doc.$locals?.includes || {})) {
        ret[key] = Array.isArray(value) ? value.map((row) => row.toJSON()) : value?.toJSON?.() ?? value;
      }
      return ret;
    },
  });
  schema.methods.update = function update(values, options = {}) { Object.assign(this, values); return this.save(sessionOption(options)); };
  schema.methods.destroy = async function destroy(options = {}) {
    if (!options.transaction) return database.transaction((transaction) => this.destroy({ ...options, transaction }));
    const transaction = options.transaction;
    const model = this.constructor;
    const referencing = [];
    for (const source of database.modelManager.models) {
      for (const association of source.associations) {
        if (association.kind === 'belongsTo' && association.target === model) referencing.push({ source, association });
      }
    }
    for (const association of model.associations.filter((item) => item.kind === 'hasMany')) {
      if (!referencing.some((item) => item.source === association.target && item.association.foreignKey === association.foreignKey)) {
        referencing.push({ source: association.target, association: { ...association, target: model, kind: 'belongsTo' } });
      }
    }
    for (const { source, association } of referencing) {
      const inverse = model.associations.find((item) => item.kind === 'hasMany' && item.target === source && item.foreignKey === association.foreignKey);
      const rows = await source.findAll({ where: { [association.foreignKey]: this.id }, transaction });
      if (!rows.length) continue;
      if (String(inverse?.onDelete || association.onDelete || '').toUpperCase() !== 'CASCADE') {
        throw new MongoReferenceConstraintError('This record is already used elsewhere and cannot be deleted.', association.foreignKey);
      }
      for (const row of rows) await row.destroy({ transaction });
    }
    return this.deleteOne({ session: transaction.session });
  };
}

const counterSchema = new mongoose.Schema({ _id: String, value: { type: Number, default: 0 } }, { versionKey: false });
const Counter = mongoose.models._Counter || mongoose.model('_Counter', counterSchema, '_counters');

class MongoDatabase {
  constructor() { this.models = {}; this.modelManager = { models: [] }; }

  define(name, attributes, options = {}) {
    const fields = { id: { type: Number, unique: true, index: true } };
    for (const [key, definition] of Object.entries(attributes)) fields[key] = mongoField(definition);
    const schema = new mongoose.Schema(fields, {
      collection: options.tableName,
      timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
      minimize: false,
    });
    for (const index of options.indexes || []) schema.index(Object.fromEntries(index.fields.map((field) => [field, 1])), { unique: Boolean(index.unique) });
    schema.pre('save', async function assignNumericId() {
      if (this.id != null) return;
      const session = this.$session();
      const counter = await Counter.findByIdAndUpdate(options.tableName, { $inc: { value: 1 } }, { new: true, upsert: true, ...(session ? { session } : {}) });
      this.id = counter.value;
    });
    schema.pre('save', async function validateReferences() {
      const session = this.$session();
      const checks = [];
      for (const association of this.constructor.associations || []) {
        if (association.kind === 'belongsTo') checks.push({ field: association.foreignKey, target: association.target });
      }
      for (const parent of database.modelManager.models) {
        for (const association of parent.associations || []) {
          if (association.kind === 'hasMany' && association.target === this.constructor) checks.push({ field: association.foreignKey, target: parent });
        }
      }
      const seen = new Set();
      for (const check of checks) {
        const signature = `${check.field}:${check.target.modelName}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const value = this[check.field];
        if (value === null || value === undefined) continue;
        const exists = await check.target.collection.findOne({ id: Number(value) }, { projection: { _id: 1 }, ...(session ? { session } : {}) });
        if (!exists) throw new MongoReferenceConstraintError(`The selected value for "${check.field}" does not exist.`, check.field);
      }
    });
    installDocumentCompatibility(schema);
    const Model = mongoose.models[name] || mongoose.model(name, schema, options.tableName);
    Model.__mongooseModel = true;
    Model.tableName = options.tableName;
    Model.rawAttributes = attributes;
    Model.associations = [];
    Model.hasMany = (target, association = {}) => Model.associations.push({ kind: 'hasMany', target, foreignKey: association.foreignKey, as: association.as || pluralize(target.modelName), onDelete: association.onDelete });
    Model.belongsTo = (target, association = {}) => Model.associations.push({ kind: 'belongsTo', target, foreignKey: association.foreignKey, as: association.as || target.modelName, onDelete: association.onDelete });
    Model.findAll = async (queryOptions = {}) => {
      const aggregateAttrs = (queryOptions.attributes || []).filter(Array.isArray);
      if (queryOptions.group && aggregateAttrs.length) {
        const groupFields = (Array.isArray(queryOptions.group) ? queryOptions.group : [queryOptions.group]).map((field) => String(field).split('.').pop());
        const pipeline = [{ $match: convertWhere(queryOptions.where) }];
        const required = normalizeInclude(queryOptions.include).find((entry) => entry.required);
        if (required) {
          const assoc = Model.associations.find((item) => item.target === required.model && (!required.as || item.as === required.as));
          pipeline.push({ $lookup: { from: required.model.collection.name, localField: assoc.foreignKey, foreignField: 'id', as: '__joined' } });
          pipeline.push({ $unwind: '$__joined' }, { $match: Object.fromEntries(Object.entries(convertWhere(required.where)).map(([key, value]) => [`__joined.${key}`, value])) });
        }
        const group = { _id: Object.fromEntries(groupFields.map((field) => [field, `$${field}`])) };
        for (const [expression, alias] of aggregateAttrs) {
          const field = expression.value?.__col || expression.value;
          group[alias] = expression.__fn === 'COUNT' ? { $sum: 1 } : { $sum: { $ifNull: [`$${field}`, 0] } };
        }
        pipeline.push({ $group: group }, { $project: { _id: 0, ...Object.fromEntries(groupFields.map((field) => [field, `$_id.${field}`])), ...Object.fromEntries(aggregateAttrs.map(([, alias]) => [alias, 1])) } });
        if (queryOptions.order) {
          const sort = {};
          for (const [field, direction] of queryOptions.order) {
            let key = field;
            if (typeof field !== 'string') {
              const column = field?.value?.__col || field?.value;
              key = aggregateAttrs.find(([expression]) => expression.__fn === field?.__fn && (expression.value?.__col || expression.value) === column)?.[1];
            }
            if (key) sort[key] = String(direction).toUpperCase() === 'DESC' ? -1 : 1;
          }
          if (Object.keys(sort).length) pipeline.push({ $sort: sort });
        }
        if (queryOptions.limit) pipeline.push({ $limit: queryOptions.limit });
        return Model.aggregate(pipeline).session(queryOptions.transaction?.session || null);
      }
      let query = Model.find(convertWhere(queryOptions.where));
      applyProjection(query, queryOptions.attributes, Model, queryOptions.include);
      if (queryOptions.order) query.sort(Object.fromEntries(queryOptions.order.filter(([field]) => typeof field === 'string').map(([field, direction]) => [field, String(direction).toUpperCase() === 'DESC' ? -1 : 1])));
      if (queryOptions.offset) query.skip(queryOptions.offset);
      if (queryOptions.limit) query.limit(queryOptions.limit);
      if (queryOptions.transaction?.session) query.session(queryOptions.transaction.session);
      const docs = await query.exec();
      await attachIncludes(docs, queryOptions.include, { source: Model, transaction: queryOptions.transaction });
      const associationOrders = (queryOptions.order || []).filter(([first]) => typeof first !== 'string').map(([associationModel, field, direction]) => ({
        association: Model.associations.find((item) => item.target === associationModel), field,
        multiplier: String(direction).toUpperCase() === 'DESC' ? -1 : 1,
      })).filter((item) => item.association);
      if (associationOrders.length) docs.sort((left, right) => {
        for (const item of associationOrders) {
          const a = left[item.association.as]?.[item.field] ?? '';
          const b = right[item.association.as]?.[item.field] ?? '';
          const result = String(a).localeCompare(String(b)) * item.multiplier;
          if (result) return result;
        }
        return 0;
      });
      return queryOptions.raw ? docs.map((doc) => doc.toJSON()) : docs;
    };
    Model.findOne = async (queryOptions = {}) => (await Model.findAll({ ...queryOptions, limit: 1 }))[0] || null;
    Model.findByPk = (id, queryOptions = {}) => Model.findOne({ ...queryOptions, where: { ...(queryOptions.where || {}), id: Number(id) } });
    Model.findAndCountAll = async (queryOptions = {}) => ({ rows: await Model.findAll(queryOptions), count: await Model.count({ where: queryOptions.where, transaction: queryOptions.transaction }) });
    Model.count = (queryOptions = {}) => Model.countDocuments(convertWhere(queryOptions.where)).session(queryOptions.transaction?.session || null);
    Model.sum = async (field, queryOptions = {}) => {
      const [result] = await Model.aggregate([{ $match: convertWhere(queryOptions.where) }, { $group: { _id: null, total: { $sum: { $ifNull: [`$${field}`, 0] } } } }]).session(queryOptions.transaction?.session || null);
      return result?.total || 0;
    };
    Model.create = async (values, createOptions = {}) => { const doc = new Model(values); if (createOptions.transaction?.session) doc.$session(createOptions.transaction.session); return doc.save(); };
    Model.bulkCreate = async (rows, createOptions = {}) => {
      const created = [];
      for (const row of rows) created.push(await Model.create(row, createOptions));
      return created;
    };
    Model.destroy = async (queryOptions = {}) => {
      if (!queryOptions.transaction) return database.transaction((transaction) => Model.destroy({ ...queryOptions, transaction }));
      const rows = await Model.findAll({ where: queryOptions.where, transaction: queryOptions.transaction });
      for (const row of rows) await row.destroy({ transaction: queryOptions.transaction });
      return rows.length;
    };
    Model.update = async (values, queryOptions = {}) => {
      const result = await Model.updateMany(convertWhere(queryOptions.where), { $set: values }, sessionOption(queryOptions));
      return [result.modifiedCount || 0];
    };
    Model.upsert = async (values, queryOptions = {}) => {
      const uniqueKey = Object.keys(attributes).find((key) => attributes[key].unique) || 'id';
      const filter = queryOptions.where || { [uniqueKey]: values[uniqueKey] };
      const existing = await Model.findOne({ where: filter, transaction: queryOptions.transaction });
      if (existing) { await existing.update(values, queryOptions); return [existing, false]; }
      return [await Model.create({ ...filter, ...values }, queryOptions), true];
    };
    Model.findOrCreate = async ({ where = {}, defaults = {}, transaction } = {}) => {
      const existing = await Model.findOne({ where, transaction });
      if (existing) return [existing, false];
      try { return [await Model.create({ ...where, ...defaults }, { transaction }), true]; }
      catch (error) { if (error.code === 11000) return [await Model.findOne({ where, transaction }), false]; throw error; }
    };
    this.models[name] = Model;
    this.modelManager.models.push(Model);
    return Model;
  }

  async authenticate() {
    if (mongoose.connection.readyState !== 1) {
      const { uri, database: dbName } = getDatabaseConfig();
      await mongoose.connect(uri, {
        dbName,
        serverSelectionTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000),
      });
    }
    if (!this._topologyChecked) {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid') {
        await mongoose.disconnect();
        throw new Error('MongoDB must be a replica set or sharded cluster because the POS uses multi-document transactions.');
      }
      this._topologyChecked = true;
    }
  }
  async sync() { await Promise.all(Object.values(this.models).map((model) => model.createIndexes())); }
  async resetCounter(collection, value, session) {
    await Counter.findByIdAndUpdate(collection, { $max: { value: Number(value || 0) } }, { upsert: true, ...(session ? { session } : {}) });
  }
  async nextNumericId(collection, session) {
    const counter = await Counter.findByIdAndUpdate(
      collection,
      { $inc: { value: 1 } },
      { new: true, upsert: true, ...(session ? { session } : {}) }
    );
    return counter.value;
  }
  async close() { if (mongoose.connection.readyState) await mongoose.disconnect(); this._topologyChecked = false; }
  async transaction(callback) {
    const session = await mongoose.startSession();
    const tx = { session, LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    try { return await session.withTransaction(() => callback(tx)); }
    finally { await session.endSession(); }
  }
  getDialect() { return 'mongodb'; }
}

const database = new MongoDatabase();
database.DataTypes = DataTypes;
database.Op = Op;
database.fn = fn;
database.col = col;
database.mongoose = mongoose;

module.exports = database;
module.exports.DataTypes = DataTypes;
module.exports.Op = Op;
module.exports.fn = fn;
module.exports.col = col;
