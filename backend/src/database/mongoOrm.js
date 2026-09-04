const { MongoClient } = require('mongodb');

const operator = (name) => Symbol.for(`shanthi.mongo.${name}`);
const Op = Object.freeze({
  between: operator('between'),
  gte: operator('gte'),
  in: operator('in'),
  like: operator('like'),
  lt: operator('lt'),
  lte: operator('lte'),
  ne: operator('ne'),
  or: operator('or'),
});

function type(name, values = []) {
  return Object.freeze({ mongoType: name, values });
}

const STRING = () => type('string');
const TEXT = () => type('string');
const DataTypes = Object.freeze({
  STRING: Object.assign(STRING, type('string')),
  TEXT: Object.assign(TEXT, type('string')),
  INTEGER: type('number'),
  DOUBLE: type('number'),
  BOOLEAN: type('boolean'),
  JSON: type('mixed'),
  DATEONLY: type('dateonly'),
  DATE: type('date'),
  ENUM: (...values) => type('enum', values),
});

function databaseNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent(parsed.pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
}

function getMongoConfig() {
  const uri = String(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/electro_pos').trim();
  const database = String(process.env.MONGODB_DB || databaseNameFromUri(uri) || 'electro_pos').trim();
  if (!database || !/^[A-Za-z0-9_$-]+$/.test(database)) {
    throw new Error('MONGODB_DB may contain only letters, numbers, underscores, dollar signs, and hyphens.');
  }
  return { uri, database };
}

function sessionOption(transaction) {
  return transaction?.session ? { session: transaction.session } : {};
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function likeRegex(pattern) {
  const parts = String(pattern).split(/([%_])/).map((part) => {
    if (part === '%') return '.*';
    if (part === '_') return '.';
    return escapeRegex(part);
  });
  return new RegExp(`^${parts.join('')}$`, 'i');
}

function translateCondition(value) {
  if (Array.isArray(value)) return { $in: value.map(normalizeId) };
  if (!value || typeof value !== 'object' || value instanceof Date || value instanceof RegExp) return value;
  const output = {};
  for (const key of Reflect.ownKeys(value)) {
    const item = value[key];
    if (key === Op.between) {
      output.$gte = item[0];
      output.$lte = item[1];
    } else if (key === Op.gte) output.$gte = item;
    else if (key === Op.in) output.$in = item.map(normalizeId);
    else if (key === Op.like) output.$regex = likeRegex(item);
    else if (key === Op.lt) output.$lt = item;
    else if (key === Op.lte) output.$lte = item;
    else if (key === Op.ne) {
      output.$ne = item;
      if (item === null) output.$exists = true;
    }
    else output[key] = item;
  }
  return output;
}

function normalizeId(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return value;
}

function translateWhere(where = {}) {
  const filter = {};
  for (const key of Reflect.ownKeys(where || {})) {
    const value = where[key];
    if (key === Op.or) {
      filter.$or = value.map((entry) => translateWhere(entry));
    } else {
      filter[key] = translateCondition(key === 'id' || /_id$/.test(key) ? normalizeId(value) : value);
    }
  }
  return filter;
}

function cloneValue(value) {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return new Date(value);
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)]));
  return value;
}

function plain(value) {
  if (value === undefined || value === null) return value;
  if (value instanceof RecordInstance) return value.toJSON();
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_id').map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

class RecordInstance {
  constructor(model, document) {
    Object.defineProperty(this, '_model', { value: model, enumerable: false, writable: false });
    Object.assign(this, cloneValue(document));
    delete this._id;
  }

  toJSON() {
    return plain(Object.fromEntries(Object.entries(this)));
  }

  async update(values, options = {}) {
    Object.assign(this, values);
    await this.save(options);
    return this;
  }

  async save(options = {}) {
    await this._model._runHooks('beforeUpdate', this, options);
    Object.assign(this, this._model._coerce(Object.fromEntries(Object.entries(this))));
    this._model._validate(this);
    this.updated_at = new Date();
    const document = this._model._documentFromInstance(this);
    await this._model._collection().replaceOne(
      { _id: this.id },
      document,
      { ...sessionOption(options.transaction), upsert: false }
    );
    return this;
  }

  async destroy(options = {}) {
    await this._model._destroyById(this.id, options);
  }
}

class MongoModel {
  static _init(orm, name, attributes, options = {}) {
    this.orm = orm;
    this.modelName = name;
    this.tableName = options.tableName || `${name.toLowerCase()}s`;
    this.attributes = { id: { type: DataTypes.INTEGER, allowNull: false }, ...attributes };
    this.rawAttributes = this.attributes;
    this.options = options;
    this.associations = [];
    this.hooks = { beforeCreate: [], beforeUpdate: [] };
  }

  static _collection() {
    return this.orm.db.collection(this.tableName);
  }

  static getAttributes() {
    return this.attributes;
  }

  static getTableName() {
    return this.tableName;
  }

  static beforeCreate(callback) {
    this.hooks.beforeCreate.push(callback);
  }

  static beforeUpdate(callback) {
    this.hooks.beforeUpdate.push(callback);
  }

  static async _runHooks(name, instance, options) {
    for (const hook of this.hooks[name] || []) await hook(instance, options);
  }

  static belongsTo(target, options = {}) {
    this.associations.push({ kind: 'belongsTo', target, foreignKey: options.foreignKey, as: options.as || target.modelName, onDelete: options.onDelete });
  }

  static hasMany(target, options = {}) {
    this.associations.push({ kind: 'hasMany', target, foreignKey: options.foreignKey, as: options.as || `${target.modelName}s`, onDelete: options.onDelete });
  }

  static _associationFor(target, as) {
    return this.associations.find((entry) => entry.target === target && (!as || entry.as === as));
  }

  static _applyDefaults(values) {
    const output = { ...values };
    for (const [field, definition] of Object.entries(this.attributes)) {
      if (field === 'id' || output[field] !== undefined || definition.defaultValue === undefined) continue;
      output[field] = typeof definition.defaultValue === 'function' ? definition.defaultValue() : cloneValue(definition.defaultValue);
    }
    return output;
  }

  static _coerce(values) {
    const output = { ...values };
    for (const [field, definition] of Object.entries(this.attributes)) {
      const value = output[field];
      if (value === undefined || value === null) continue;
      const fieldType = definition.type?.mongoType;
      if (fieldType === 'number') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) output[field] = numeric;
      } else if (fieldType === 'boolean') output[field] = Boolean(value);
      else if (fieldType === 'date') output[field] = value instanceof Date ? value : new Date(value);
      else if (fieldType === 'dateonly') output[field] = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
      else if (fieldType === 'string' || fieldType === 'enum') output[field] = String(value);
    }
    return output;
  }

  static _validate(values, { partial = false } = {}) {
    for (const [field, definition] of Object.entries(this.attributes)) {
      if (field === 'id') continue;
      const value = values[field];
      if (!partial && definition.allowNull === false && (value === null || value === undefined)) {
        const error = new Error(`${field} is required.`);
        error.name = 'MongoValidationError';
        throw error;
      }
      if (value == null) continue;
      if (definition.type?.mongoType === 'enum' && !definition.type.values.includes(value)) {
        const error = new Error(`${field} must be one of: ${definition.type.values.join(', ')}.`);
        error.name = 'MongoValidationError';
        throw error;
      }
      if (definition.validate?.isEmail && !/^\S+@\S+\.\S+$/.test(String(value))) {
        const error = new Error(`${field} must be a valid email address.`);
        error.name = 'MongoValidationError';
        throw error;
      }
    }
  }

  static _documentFromInstance(instance) {
    const document = { _id: instance.id, id: instance.id };
    for (const field of Object.keys(this.attributes)) {
      if (field !== 'id' && instance[field] !== undefined) document[field] = cloneValue(instance[field]);
    }
    if (instance.created_at) document.created_at = new Date(instance.created_at);
    if (instance.updated_at) document.updated_at = new Date(instance.updated_at);
    return document;
  }

  static async _nextId(transaction) {
    const result = await this.orm.db.collection('_counters').findOneAndUpdate(
      { _id: this.tableName },
      { $inc: { sequence: 1 } },
      { ...sessionOption(transaction), upsert: true, returnDocument: 'after' }
    );
    return Number(result.sequence);
  }

  static async create(values, options = {}) {
    const data = this._coerce(this._applyDefaults(values || {}));
    if (data.id === undefined || data.id === null) data.id = await this._nextId(options.transaction);
    else data.id = normalizeId(data.id);
    const now = new Date();
    data.created_at = data.created_at ? new Date(data.created_at) : now;
    data.updated_at = data.updated_at ? new Date(data.updated_at) : now;
    this._validate(data);
    const instance = new RecordInstance(this, data);
    await this._runHooks('beforeCreate', instance, options);
    await this._collection().insertOne(this._documentFromInstance(instance), sessionOption(options.transaction));
    return instance;
  }

  static async bulkCreate(rows, options = {}) {
    const created = [];
    for (const row of rows || []) created.push(await this.create(row, options));
    return created;
  }

  static async findByPk(id, options = {}) {
    return this.findOne({ ...options, where: { id: normalizeId(id) } });
  }

  static async findOne(options = {}) {
    const rows = await this.findAll({ ...options, limit: 1 });
    return rows[0] || null;
  }

  static async findAll(options = {}) {
    const filter = translateWhere(options.where || {});
    const documents = await this._collection().find(filter, sessionOption(options.transaction)).toArray();
    let rows = documents.map((document) => new RecordInstance(this, document));
    if (options.include?.length) rows = await Promise.all(rows.map((row) => this._hydrate(row, options.include, options.transaction)));
    if (options.include?.some((item) => item?.required)) {
      rows = rows.filter((row) => options.include.every((item) => !item?.required || (Array.isArray(row[item.as || item.model.modelName]) ? row[item.as || item.model.modelName].length : row[item.as || item.model.modelName])));
    }
    if (options.order?.length) rows.sort((a, b) => compareOrder(a, b, options.order));
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = options.limit == null ? null : Math.max(0, Number(options.limit));
    rows = rows.slice(offset, limit == null ? undefined : offset + limit);
    if (options.attributes) rows = rows.map((row) => this._selectAttributes(row, options.attributes));
    return options.raw ? rows.map((row) => row.toJSON()) : rows;
  }

  static _selectAttributes(row, attributes) {
    const associationKeys = this.associations.map((entry) => entry.as);
    if (Array.isArray(attributes)) {
      const keep = new Set(['id', ...attributes, ...associationKeys]);
      for (const key of Object.keys(row)) if (!keep.has(key)) delete row[key];
    } else if (attributes?.exclude) {
      for (const key of attributes.exclude) delete row[key];
    }
    return row;
  }

  static async _hydrate(instance, includes, transaction) {
    for (const rawInclude of includes || []) {
      const include = rawInclude && rawInclude.model ? rawInclude : { model: rawInclude };
      const association = this._associationFor(include.model, include.as);
      if (!association) continue;
      const nestedOptions = { where: include.where || {}, include: include.include || [], attributes: include.attributes, transaction };
      if (association.kind === 'belongsTo') {
        const foreignValue = instance[association.foreignKey];
        instance[association.as] = foreignValue == null ? null : await association.target.findOne({ ...nestedOptions, where: { ...nestedOptions.where, id: foreignValue } });
      } else {
        instance[association.as] = await association.target.findAll({ ...nestedOptions, where: { ...nestedOptions.where, [association.foreignKey]: instance.id } });
      }
    }
    return instance;
  }

  static async findAndCountAll(options = {}) {
    const count = await this.count({ where: options.where, transaction: options.transaction });
    const rows = await this.findAll(options);
    return { rows, count };
  }

  static async count(options = {}) {
    return this._collection().countDocuments(translateWhere(options.where || {}), sessionOption(options.transaction));
  }

  static async sum(field, options = {}) {
    const [row] = await this.aggregate([
      { $match: translateWhere(options.where || {}) },
      { $group: { _id: null, value: { $sum: { $ifNull: [`$${field}`, 0] } } } },
    ], options);
    return row?.value || 0;
  }

  static async max(field, options = {}) {
    const row = await this._collection().find(translateWhere(options.where || {}), sessionOption(options.transaction)).sort({ [field]: -1 }).limit(1).next();
    return row?.[field] ?? null;
  }

  static async aggregate(pipeline, options = {}) {
    return this._collection().aggregate(pipeline, sessionOption(options.transaction)).toArray();
  }

  static async findOrCreate({ where = {}, defaults = {}, transaction } = {}) {
    const existing = await this.findOne({ where, transaction });
    if (existing) return [existing, false];
    try {
      return [await this.create({ ...defaults, ...where }, { transaction }), true];
    } catch (error) {
      if (error?.code === 11000) {
        const raced = await this.findOne({ where, transaction });
        if (raced) return [raced, false];
      }
      throw error;
    }
  }

  static async update(values, options = {}) {
    const normalized = this._coerce(values);
    this._validate(normalized, { partial: true });
    const result = await this._collection().updateMany(
      translateWhere(options.where || {}),
      { $set: { ...normalized, updated_at: new Date() } },
      sessionOption(options.transaction)
    );
    return [result.modifiedCount];
  }

  static async upsert(values, options = {}) {
    const where = options.where || { id: values.id };
    const existing = await this.findOne({ where, transaction: options.transaction });
    if (existing) {
      await existing.update(values, options);
      return [existing, false];
    }
    return [await this.create({ ...where, ...values }, options), true];
  }

  static async destroy(options = {}) {
    const rows = await this.findAll({ where: options.where || {}, transaction: options.transaction });
    for (const row of rows) await row.destroy(options);
    return rows.length;
  }

  static async _destroyById(id, options = {}) {
    for (const association of this.associations.filter((entry) => entry.kind === 'hasMany' && entry.onDelete === 'CASCADE')) {
      await association.target.destroy({ where: { [association.foreignKey]: id }, transaction: options.transaction });
    }
    await this._collection().deleteOne({ _id: normalizeId(id) }, sessionOption(options.transaction));
  }
}

function valueAt(row, path) {
  if (typeof path === 'string') return row[path];
  return undefined;
}

function compareOrder(a, b, order) {
  for (const entry of order) {
    let field;
    let direction;
    let left = a;
    let right = b;
    if (typeof entry[0] === 'function' && entry[0].modelName) {
      const association = a._model.associations.find((item) => item.target === entry[0]);
      left = association ? a[association.as] : null;
      right = association ? b[association.as] : null;
      field = entry[1];
      direction = entry[2];
    } else {
      field = entry[0];
      direction = entry[1];
    }
    const av = valueAt(left || {}, field);
    const bv = valueAt(right || {}, field);
    if (av === bv) continue;
    const comparison = av == null ? -1 : bv == null ? 1 : typeof av === 'string' ? av.localeCompare(bv) : av < bv ? -1 : 1;
    return String(direction || 'ASC').toUpperCase() === 'DESC' ? -comparison : comparison;
  }
  return 0;
}

class MongoOrm {
  constructor() {
    this.client = null;
    this.db = null;
    this.models = {};
    this.modelManager = { models: [] };
  }

  define(name, attributes, options) {
    const model = class extends MongoModel {};
    Object.defineProperty(model, 'name', { value: name });
    model._init(this, name, attributes, options);
    this.models[name] = model;
    this.modelManager.models.push(model);
    return model;
  }

  async authenticate() {
    if (this.client) return;
    const config = getMongoConfig();
    this.client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 10000 });
    await this.client.connect();
    this.db = this.client.db(config.database);
    await this.db.command({ ping: 1 });
    const hello = await this.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
      await this.client.close();
      this.client = null;
      this.db = null;
      throw new Error('MongoDB transaction support is required. Use MongoDB Atlas or configure the server as a replica set.');
    }
  }

  async sync() {
    await this.authenticate();
    for (const model of this.modelManager.models) {
      await this.db.createCollection(model.tableName).catch((error) => {
        if (error?.codeName !== 'NamespaceExists') throw error;
      });
      const indexes = [];
      for (const [field, definition] of Object.entries(model.attributes)) {
        if (definition.unique) {
          indexes.push({
            key: { [field]: 1 }, unique: true, name: `uniq_${field}`,
            ...(definition.allowNull !== false ? { partialFilterExpression: { [field]: { $type: 'string' } } } : {}),
          });
        }
      }
      for (const index of model.options.indexes || []) {
        indexes.push({ key: Object.fromEntries(index.fields.map((field) => [field, 1])), unique: Boolean(index.unique), name: `idx_${index.fields.join('_')}` });
      }
      for (const index of indexes) {
        const { key, ...indexOptions } = index;
        await model._collection().createIndex(key, indexOptions);
      }
    }
  }

  async transaction(callback) {
    await this.authenticate();
    const session = this.client.startSession();
    const transaction = { session, LOCK: { UPDATE: 'update', SHARE: 'share' } };
    try {
      return await session.withTransaction(() => callback(transaction), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } finally {
      await session.endSession();
    }
  }

  async close() {
    if (this.client) await this.client.close();
    this.client = null;
    this.db = null;
  }
}

module.exports = { MongoOrm, DataTypes, Op, getMongoConfig, translateWhere };
