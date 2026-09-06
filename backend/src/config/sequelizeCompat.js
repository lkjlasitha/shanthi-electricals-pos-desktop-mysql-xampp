/**
 * ============================================================================
 * Sequelize-compatible adapter, backed by MongoDB (via the official driver).
 * ============================================================================
 *
 * WHY THIS EXISTS
 * ----------------
 * This backend was originally written against Sequelize/MySQL. Every
 * controller uses Sequelize idioms throughout: `Model.findByPk(id, {include})`,
 * `Model.findAll({where, include, order, limit})`, `Op.gte/like/in/between`,
 * `sequelize.transaction(async (t) => {...})`, instance `.save()`/`.update()`/
 * `.destroy()`/`.toJSON()`, and association helpers `belongsTo`/`hasMany`.
 *
 * Rather than rewrite ~3000 lines of controller business logic (which would
 * multiply the risk of introducing new bugs), this module reimplements the
 * *subset* of the Sequelize API this codebase actually uses, on top of
 * MongoDB. Controllers, crudFactory, and services keep working unchanged.
 *
 * KEY DESIGN DECISIONS
 * ---------------------
 * - Every document keeps a plain sequential Number `id` field (via a
 *   `counters` collection), in addition to Mongo's own `_id`. All app code,
 *   printed invoice numbers, barcodes, and API URLs keep using `id` exactly
 *   as before -- nothing else in the app had to change to accommodate this.
 * - `where` clauses are translated from Sequelize shape to MongoDB query
 *   shape (see `translateWhere`).
 * - `include` is resolved by looking up association metadata registered via
 *   `Model.belongsTo(...)` / `Model.hasMany(...)` (mirroring associations.js),
 *   then doing a batched `$in` fetch for the related documents -- no N+1.
 * - `sequelize.transaction(fn)` maps to a MongoDB session + transaction.
 *   MongoDB transactions require the server to be a replica set (a MongoDB
 *   Atlas free-tier cluster always is). See README for local dev options.
 * - Errors are thrown with the *same* `.name` values Sequelize used
 *   (`SequelizeUniqueConstraintError`, `SequelizeValidationError`,
 *   `SequelizeForeignKeyConstraintError`) so `middleware/errorHandler.js`
 *   keeps working completely unchanged.
 */

const mongoose = require('mongoose');

const Op = Object.freeze({
  gte: Symbol('gte'),
  lte: Symbol('lte'),
  gt: Symbol('gt'),
  lt: Symbol('lt'),
  ne: Symbol('ne'),
  in: Symbol('in'),
  notIn: Symbol('notIn'),
  like: Symbol('like'),
  notLike: Symbol('notLike'),
  between: Symbol('between'),
  or: Symbol('or'),
  and: Symbol('and'),
});

// Mirrors Sequelize's DataTypes closely enough for this codebase's model
// definitions to stay nearly identical to the originals.
const DataTypes = {
  STRING: (length) => ({ kind: 'string', length }),
  TEXT: (variant) => ({ kind: 'string', long: variant === 'long' }),
  INTEGER: { kind: 'number', integer: true },
  DOUBLE: { kind: 'number' },
  BOOLEAN: { kind: 'boolean' },
  DATE: { kind: 'date' },
  DATEONLY: { kind: 'dateonly' },
  JSON: { kind: 'mixed' },
  ENUM: (...values) => ({ kind: 'enum', values }),
};
// Support both `DataTypes.STRING` (no call) and `DataTypes.STRING(255)` (call).
DataTypes.STRING.kind = 'string';
DataTypes.TEXT.kind = 'string';

const QueryTypes = Object.freeze({ SELECT: 'SELECT' });

/* ---------------------------------------------------------------------------
 * Field normalization: turns a Sequelize-style field spec into a plain
 * descriptor {kind, allowNull, defaultValue, unique, values, long}.
 * ------------------------------------------------------------------------ */
function normalizeType(type) {
  if (typeof type === 'function' && type.kind) return { kind: type.kind };
  if (type && typeof type === 'object' && type.kind) return type;
  return { kind: 'mixed' };
}

function normalizeField(spec) {
  if (spec === undefined || spec === null) return { kind: 'mixed', allowNull: true };
  // Shorthand: field defined directly as a DataTypes value, e.g. `name: DataTypes.STRING`
  if (spec.kind || typeof spec === 'function') {
    return { ...normalizeType(spec), allowNull: true };
  }
  const typeInfo = normalizeType(spec.type);
  return {
    kind: typeInfo.kind,
    values: typeInfo.values,
    long: typeInfo.long,
    allowNull: spec.allowNull !== false,
    defaultValue: spec.defaultValue,
    unique: Boolean(spec.unique),
    validateEmail: Boolean(spec.validate?.isEmail),
  };
}

/* ---------------------------------------------------------------------------
 * Auto-increment sequence, matching the old integer primary keys.
 * ------------------------------------------------------------------------ */
let countersCollectionPromise = null;
function countersCollection() {
  if (!countersCollectionPromise) {
    countersCollectionPromise = Promise.resolve(mongoose.connection.collection('counters'));
  }
  return countersCollectionPromise;
}

async function nextSequence(name, session) {
  const collection = await countersCollection();
  // Concurrent first-time increments for the same counter can race on the
  // upsert (two requests both find no document and both try to insert one)
  // -- a well-known MongoDB gotcha, not specific to this adapter. Retrying
  // once on the resulting duplicate-key error is the standard fix: the
  // second attempt finds the now-existing document and increments it.
  // (Real MongoDB's $inc is atomic per-document; this only guards the
  // create-the-counter-document-for-the-first-time race.)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await collection.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session }
      );
      const doc = result?.value ?? result;
      return doc.seq;
    } catch (error) {
      if (error?.code === 11000 && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error(`Could not allocate an id for "${name}".`);
}

// Used by the migration bootstrap to make sure a fresh counters collection
// continues after the highest `id` already present (defensive; normally the
// counters collection is authoritative from the very first insert).
async function ensureSequenceAtLeast(name, minimumValue) {
  const collection = await countersCollection();
  await collection.updateOne(
    { _id: name },
    { $max: { seq: minimumValue } },
    { upsert: true }
  );
}

/* ---------------------------------------------------------------------------
 * WHERE clause translation: Sequelize shape -> MongoDB query shape.
 * ------------------------------------------------------------------------ */
function translateOperand(value) {
  if (value === null) return null;
  if (Array.isArray(value)) return { $in: value };
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const mongo = {};
    for (const key of Object.getOwnPropertySymbols(value)) {
      const raw = value[key];
      switch (key) {
        case Op.gte: mongo.$gte = raw; break;
        case Op.lte: mongo.$lte = raw; break;
        case Op.gt: mongo.$gt = raw; break;
        case Op.lt: mongo.$lt = raw; break;
        case Op.ne: mongo.$ne = raw; break;
        case Op.in: mongo.$in = raw; break;
        case Op.notIn: mongo.$nin = raw; break;
        case Op.between: mongo.$gte = raw[0]; mongo.$lte = raw[1]; break;
        case Op.like: mongo.$regex = likeToRegex(raw); mongo.$options = 'i'; break;
        case Op.notLike: mongo.$not = new RegExp(likeToRegex(raw), 'i'); break;
        default: break;
      }
    }
    // Plain object with no operator symbols and no own enumerable keys either
    // (e.g. {}) falls through to equality against an empty object, which is
    // never used in this codebase.
    if (Object.keys(mongo).length) return mongo;
  }
  return value;
}

function likeToRegex(pattern) {
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^${escaped.replace(/%/g, '.*')}$`;
}

function translateWhere(where) {
  if (!where || typeof where !== 'object') return {};
  const mongo = {};
  const andParts = [];

  for (const key of Object.getOwnPropertySymbols(where)) {
    if (key === Op.or) {
      andParts.push({ $or: where[key].map(translateWhere) });
    } else if (key === Op.and) {
      andParts.push({ $and: where[key].map(translateWhere) });
    }
  }

  for (const [field, value] of Object.entries(where)) {
    mongo[field] = translateOperand(value);
  }

  if (andParts.length) {
    return Object.keys(mongo).length ? { $and: [mongo, ...andParts] } : (andParts.length === 1 ? andParts[0] : { $and: andParts });
  }
  return mongo;
}

/* ---------------------------------------------------------------------------
 * Association registry (populated by belongsTo/hasMany calls in associations.js)
 * ------------------------------------------------------------------------ */
const registry = new Map(); // modelName -> ModelWrapper

function pluralize(name) {
  if (/[a-z]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  return `${name}s`;
}

/* ---------------------------------------------------------------------------
 * Instance wrapper: a plain object with Sequelize-like instance methods.
 * ------------------------------------------------------------------------ */
function attachInstanceMethods(doc, ModelWrapper) {
  Object.defineProperty(doc, '__model', { value: ModelWrapper, enumerable: false, writable: true });

  Object.defineProperty(doc, 'toJSON', {
    enumerable: false,
    value() {
      const plain = {};
      for (const key of Object.keys(this)) {
        if (key.startsWith('__')) continue;
        const value = this[key];
        plain[key] = (value && typeof value.toJSON === 'function' && value !== this) ? value.toJSON() : value;
      }
      return plain;
    },
  });

  Object.defineProperty(doc, 'get', {
    enumerable: false,
    value(opts) {
      return opts && opts.plain ? this.toJSON() : this;
    },
  });

  Object.defineProperty(doc, 'save', {
    enumerable: false,
    async value(options = {}) {
      const patch = this.toJSON();
      delete patch._id;
      await ModelWrapper._rawUpdateById(this.id, patch, options);
      return this;
    },
  });

  Object.defineProperty(doc, 'update', {
    enumerable: false,
    async value(patch, options = {}) {
      Object.assign(this, patch);
      await ModelWrapper._rawUpdateById(this.id, this.toJSON(), options);
      return this;
    },
  });

  Object.defineProperty(doc, 'destroy', {
    enumerable: false,
    async value(options = {}) {
      await ModelWrapper.destroy({ where: { id: this.id } }, options);
      return true;
    },
  });

  Object.defineProperty(doc, 'reload', {
    enumerable: false,
    async value(options = {}) {
      const fresh = await ModelWrapper.findByPk(this.id, options);
      Object.assign(this, fresh);
      return this;
    },
  });

  return doc;
}

function toPlainInstance(raw, ModelWrapper) {
  if (raw === null || raw === undefined) return null;
  const { _id, ...rest } = raw;
  return attachInstanceMethods({ ...rest }, ModelWrapper);
}

/* ---------------------------------------------------------------------------
 * Sequelize-shaped errors, so middleware/errorHandler.js needs no changes.
 * ------------------------------------------------------------------------ */
function uniqueConstraintError(fields) {
  const err = new Error('A record with this value already exists.');
  err.name = 'SequelizeUniqueConstraintError';
  err.fields = fields;
  return err;
}

function validationError(messages) {
  const err = new Error(messages.map((m) => m.message).join(', '));
  err.name = 'SequelizeValidationError';
  err.errors = messages;
  return err;
}

function foreignKeyError(field) {
  const err = new Error('This record is already used elsewhere and cannot be deleted.');
  err.name = 'SequelizeForeignKeyConstraintError';
  err.fields = field ? [field] : [];
  return err;
}

/* ---------------------------------------------------------------------------
 * Validation + defaulting for create/update, matching allowNull/ENUM/defaults.
 * ------------------------------------------------------------------------ */
function applyDefaultsAndValidate(fields, data, { partial = false } = {}) {
  const output = { ...data };
  const problems = [];

  for (const [name, descriptor] of Object.entries(fields)) {
    const provided = Object.prototype.hasOwnProperty.call(data, name);
    if (!provided) {
      if (!partial && descriptor.defaultValue !== undefined) {
        output[name] = typeof descriptor.defaultValue === 'function' ? descriptor.defaultValue() : descriptor.defaultValue;
      } else if (!partial && descriptor.allowNull === false && descriptor.defaultValue === undefined) {
        problems.push({ path: name, message: `${name} cannot be null` });
      }
      continue;
    }
    const value = output[name];
    if ((value === null || value === undefined) && descriptor.allowNull === false) {
      problems.push({ path: name, message: `${name} cannot be null` });
    }
    if (value !== null && value !== undefined && descriptor.kind === 'enum' && !descriptor.values.includes(value)) {
      problems.push({ path: name, message: `${name} must be one of: ${descriptor.values.join(', ')}` });
    }
    if (value !== null && value !== undefined && descriptor.validateEmail && !/^\S+@\S+\.\S+$/.test(String(value))) {
      problems.push({ path: name, message: `${name} must be a valid email address` });
    }
  }

  if (problems.length) throw validationError(problems);
  return output;
}

/* ---------------------------------------------------------------------------
 * Model factory
 * ------------------------------------------------------------------------ */
function defineModel(name, fieldsSpec, options = {}) {
  const fields = {};
  for (const [key, spec] of Object.entries(fieldsSpec)) fields[key] = normalizeField(spec);
  const collectionName = options.tableName || pluralize(name.toLowerCase());
  const uniqueFields = Object.entries(fields).filter(([, f]) => f.unique).map(([key]) => key);
  const compoundIndexes = options.indexes || [];

  let collectionPromise = null;
  function collection() {
    if (!collectionPromise) collectionPromise = Promise.resolve(mongoose.connection.collection(collectionName));
    return collectionPromise;
  }

  const ModelWrapper = {
    modelName: name,
    collectionName,
    fields,
    _associations: [],

    async ensureIndexes() {
      const col = await collection();
      await col.createIndex({ id: 1 }, { unique: true });
      for (const field of uniqueFields) {
        await col.createIndex({ [field]: 1 }, { unique: true, sparse: true });
      }
      for (const index of compoundIndexes) {
        const spec = {};
        (index.fields || []).forEach((f) => { spec[f] = 1; });
        if (Object.keys(spec).length) await col.createIndex(spec, { unique: Boolean(index.unique) });
      }
    },

    belongsTo(Target, opts = {}) {
      const foreignKey = opts.foreignKey;
      const as = opts.as || Target.modelName;
      ModelWrapper._associations.push({ type: 'belongsTo', target: Target, foreignKey, as });
    },

    hasMany(Target, opts = {}) {
      const foreignKey = opts.foreignKey;
      const as = opts.as || pluralize(Target.modelName);
      ModelWrapper._associations.push({
        type: 'hasMany', target: Target, foreignKey, as, cascade: opts.onDelete === 'CASCADE',
      });
    },

    findAssociation({ model, as }) {
      return ModelWrapper._associations.find((assoc) => (
        (as ? assoc.as === as : true) && (model ? assoc.target === model : true)
      ));
    },

    // If the caller restricts `attributes` on this model AND also asks for a
    // belongsTo include, the foreign key column living on THIS model must
    // survive the projection or there is nothing to look the parent up by.
    // (The mirror-image case -- a hasMany include's own foreign key getting
    // stripped from the *child* rows -- is handled separately in
    // _resolveIncludes, since that field lives on the other model.)
    _attributesNeededForIncludes(attributes, includeList) {
      if (!Array.isArray(attributes) || !includeList?.length) return attributes;
      const extra = [];
      for (const includeSpec of includeList) {
        const isPlainModel = typeof includeSpec.findByPk === 'function';
        const model = isPlainModel ? includeSpec : includeSpec.model;
        const assoc = ModelWrapper.findAssociation({ model, as: includeSpec.as });
        if (assoc?.type === 'belongsTo' && !attributes.includes(assoc.foreignKey)) extra.push(assoc.foreignKey);
      }
      return extra.length ? [...attributes, ...extra] : attributes;
    },

    async _resolveIncludes(rows, includeList) {
      if (!includeList || !includeList.length || !rows.length) return rows;
      for (const includeSpec of includeList) {
        const isPlainModel = typeof includeSpec.findByPk === 'function';
        const model = isPlainModel ? includeSpec : includeSpec.model;
        const as = includeSpec.as;
        const nested = includeSpec.include;
        const requiredAttrs = includeSpec.attributes;
        const extraWhere = includeSpec.where;

        const assoc = ModelWrapper.findAssociation({ model, as });
        if (!assoc) continue; // unknown include silently skipped, mirrors defensive coding elsewhere

        if (assoc.type === 'belongsTo') {
          const ids = [...new Set(rows.map((r) => r[assoc.foreignKey]).filter((v) => v !== null && v !== undefined))];
          if (!ids.length) { rows.forEach((r) => { r[assoc.as] = null; }); continue; }
          let related = ids.length ? await assoc.target.findAll({ where: { id: { [Op.in]: ids } }, include: nested, attributes: requiredAttrs }) : [];
          const byId = new Map(related.map((r) => [Number(r.id), r]));
          rows.forEach((r) => { r[assoc.as] = byId.get(Number(r[assoc.foreignKey])) || null; });
        } else {
          const ids = [...new Set(rows.map((r) => Number(r.id)))];
          const where = { [assoc.foreignKey]: { [Op.in]: ids }, ...(extraWhere || {}) };
          // The grouping step below needs the foreign key on each related row
          // to know which parent it belongs to, even if the caller's
          // `attributes` list didn't ask for it -- so make sure it's included
          // in the nested query regardless (Sequelize does the same).
          const nestedAttributes = Array.isArray(requiredAttrs) && !requiredAttrs.includes(assoc.foreignKey)
            ? [...requiredAttrs, assoc.foreignKey]
            : requiredAttrs;
          const related = ids.length ? await assoc.target.findAll({ where, include: nested, attributes: nestedAttributes }) : [];
          const byParent = new Map();
          related.forEach((r) => {
            const key = Number(r[assoc.foreignKey]);
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(r);
          });
          rows.forEach((r) => { r[assoc.as] = byParent.get(Number(r.id)) || []; });
        }
      }
      return rows;
    },

    _projectAttributes(rows, attributes) {
      if (!attributes) return rows;
      if (Array.isArray(attributes)) {
        const keep = new Set(['id', ...attributes]);
        return rows.map((row) => {
          const projected = {};
          for (const key of Object.keys(row)) if (keep.has(key)) projected[key] = row[key];
          return attachInstanceMethods(projected, ModelWrapper);
        });
      }
      if (attributes.exclude) {
        const drop = new Set(attributes.exclude);
        return rows.map((row) => {
          const projected = { ...row };
          drop.forEach((key) => delete projected[key]);
          return attachInstanceMethods(projected, ModelWrapper);
        });
      }
      return rows;
    },

    async findAll(options = {}) {
      const col = await collection();
      const query = translateWhere(options.where);
      let cursor = col.find(query, sessionOptions(options));
      if (options.order) {
        const sortSpec = {};
        options.order.forEach(([field, direction]) => {
          const key = typeof field === 'string' ? field : 'id';
          sortSpec[key] = String(direction || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
        });
        cursor = cursor.sort(sortSpec);
      }
      if (options.offset) cursor = cursor.skip(options.offset);
      if (options.limit) cursor = cursor.limit(options.limit);
      let rows = await cursor.toArray();
      rows = rows.map((r) => toPlainInstance(r, ModelWrapper));
      const attributes = ModelWrapper._attributesNeededForIncludes(options.attributes, options.include);
      rows = ModelWrapper._projectAttributes(rows, attributes);
      await ModelWrapper._resolveIncludes(rows, options.include);
      return rows;
    },

    async findAndCountAll(options = {}) {
      const col = await collection();
      const query = translateWhere(options.where);
      const count = await col.countDocuments(query, sessionOptions(options));
      const rows = await ModelWrapper.findAll(options);
      return { rows, count };
    },

    async findOne(options = {}) {
      const rows = await ModelWrapper.findAll({ ...options, limit: 1 });
      return rows[0] || null;
    },

    async findByPk(id, options = {}) {
      if (id === undefined || id === null || id === '') return null;
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return null;
      return ModelWrapper.findOne({ ...options, where: { id: numericId } });
    },

    async count(options = {}) {
      const col = await collection();
      return col.countDocuments(translateWhere(options.where), sessionOptions(options));
    },

    async sum(field, options = {}) {
      const col = await collection();
      // $sum already treats missing/null/non-numeric values as 0 when
      // summing a field path directly, so no $ifNull wrapper is needed.
      const pipeline = [
        { $match: translateWhere(options.where) },
        { $group: { _id: null, total: { $sum: `$${field}` } } },
      ];
      const [result] = await col.aggregate(pipeline, sessionOptions(options)).toArray();
      return result ? result.total : 0;
    },

    async max(field, options = {}) {
      const col = await collection();
      const [top] = await col.find(translateWhere(options.where), sessionOptions(options))
        .sort({ [field]: -1 }).limit(1).toArray();
      return top ? top[field] : null;
    },

    async min(field, options = {}) {
      const col = await collection();
      const [top] = await col.find(translateWhere(options.where), sessionOptions(options))
        .sort({ [field]: 1 }).limit(1).toArray();
      return top ? top[field] : null;
    },

    async create(data, options = {}) {
      const col = await collection();
      const withDefaults = applyDefaultsAndValidate(fields, data, { partial: false });

      // Retries if the allocated id collides with one already inserted (see
      // the note on nextSequence: some MongoDB-compatible servers do not
      // guarantee atomic increments under concurrency, so this belt-and-
      // braces retry keeps id allocation correct everywhere, not just on a
      // fully-compliant MongoDB server).
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const id = withDefaults.id || await nextSequence(collectionName, options.transaction?.session);
        const now = new Date();
        const doc = { ...withDefaults, id, createdAt: now, updatedAt: now };
        try {
          await col.insertOne(doc, sessionOptions(options));
          return toPlainInstance(doc, ModelWrapper);
        } catch (error) {
          const isIdCollision = error?.code === 11000 && !withDefaults.id && (!error.keyPattern || error.keyPattern.id);
          if (isIdCollision && attempt < 4) continue;
          if (error?.code === 11000) throw uniqueConstraintError(Object.keys(error.keyPattern || {}));
          throw error;
        }
      }
      throw new Error(`Could not insert a new ${name} after several attempts.`);
    },

    async bulkCreate(rows, options = {}) {
      if (!rows.length) return [];
      const results = [];
      for (const row of rows) {
        results.push(await ModelWrapper.create(row, options));
      }
      return results;
    },

    async _rawUpdateById(id, patch, options = {}) {
      const col = await collection();
      const clean = { ...patch };
      delete clean.id;
      delete clean._id;
      delete clean.createdAt;
      clean.updatedAt = new Date();
      try {
        await col.updateOne({ id: Number(id) }, { $set: clean }, sessionOptions(options));
      } catch (error) {
        if (error?.code === 11000) throw uniqueConstraintError(Object.keys(error.keyPattern || {}));
        throw error;
      }
    },

    async update(patch, options = {}) {
      const col = await collection();
      const query = translateWhere(options.where);
      const clean = { ...patch, updatedAt: new Date() };
      delete clean.id;
      try {
        const result = await col.updateMany(query, { $set: clean }, sessionOptions(options));
        return [result.modifiedCount];
      } catch (error) {
        if (error?.code === 11000) throw uniqueConstraintError(Object.keys(error.keyPattern || {}));
        throw error;
      }
    },

    async findOrCreate(options = {}) {
      const existing = await ModelWrapper.findOne({ where: options.where, transaction: options.transaction });
      if (existing) return [existing, false];
      try {
        const created = await ModelWrapper.create({ ...options.where, ...(options.defaults || {}) }, options);
        return [created, true];
      } catch (error) {
        // Two concurrent findOrCreate calls for the same `where` can both see
        // "not found" and both try to create -- the loser hits the real
        // unique index (correctly) instead of silently duplicating data.
        // Re-fetch and return the winner's row rather than failing the caller.
        if (error?.name === 'SequelizeUniqueConstraintError') {
          const winner = await ModelWrapper.findOne({ where: options.where, transaction: options.transaction });
          if (winner) return [winner, false];
        }
        throw error;
      }
    },

    async upsert(data, options = {}) {
      const col = await collection();
      const uniqueKey = uniqueFields[0];
      if (!uniqueKey || data[uniqueKey] === undefined) {
        return ModelWrapper.create(data, options);
      }
      const existing = await ModelWrapper.findOne({ where: { [uniqueKey]: data[uniqueKey] }, transaction: options.transaction });
      if (existing) {
        await ModelWrapper._rawUpdateById(existing.id, { ...existing.toJSON(), ...data }, options);
        return [await ModelWrapper.findByPk(existing.id, { transaction: options.transaction }), false];
      }
      const created = await ModelWrapper.create(data, options);
      return [created, true];
    },

    // Deletes children registered with onDelete:'CASCADE' first, then checks
    // remaining (non-cascade) hasMany relations for dependents and blocks the
    // delete with a Sequelize-shaped FK error if any exist -- mirroring what
    // real foreign-key constraints did in the original MySQL schema. Some
    // parent/child pairs only declare the association on one side (e.g. Hold
    // declares hasMany(HoldItem, cascade) without a reverse belongsTo), so
    // cascade targets are read directly off this model rather than by
    // scanning for a reverse declaration.
    async destroy(options = {}) {
      const ids = (await ModelWrapper.findAll({ where: options.where, attributes: ['id'] })).map((r) => r.id);
      if (!ids.length) return 0;

      const cascadeTargets = new Set(
        ModelWrapper._associations.filter((a) => a.type === 'hasMany' && a.cascade).map((a) => a.target)
      );

      // Pass 1 (validate before mutating anything): block the delete if any
      // model not covered by a cascade relation still references these ids.
      for (const dependent of registry.values()) {
        if (cascadeTargets.has(dependent)) continue;
        for (const assoc of dependent._associations) {
          if (assoc.type !== 'belongsTo' || assoc.target !== ModelWrapper) continue;
          const referencing = await dependent.count({ where: { [assoc.foreignKey]: { [Op.in]: ids } } });
          if (referencing) throw foreignKeyError(assoc.foreignKey);
        }
      }

      // Pass 2: cascade-delete children declared with onDelete: 'CASCADE'.
      for (const assoc of ModelWrapper._associations) {
        if (assoc.type === 'hasMany' && assoc.cascade) {
          await assoc.target.destroy({ where: { [assoc.foreignKey]: { [Op.in]: ids } } }, options);
        }
      }

      const col = await collection();
      const result = await col.deleteMany({ id: { $in: ids } }, sessionOptions(options));
      return result.deletedCount;
    },
  };

  registry.set(name, ModelWrapper);
  return ModelWrapper;
}

function sessionOptions(options = {}) {
  const session = options.transaction?.session;
  return session ? { session } : {};
}

/* ---------------------------------------------------------------------------
 * Transaction helper: mongoose session wrapped to look like a Sequelize
 * transaction object (`t.LOCK.UPDATE` etc. are accepted no-ops -- MongoDB's
 * transaction snapshot isolation plus automatic conflict retries below take
 * the place of SQL's SELECT ... FOR UPDATE row locks).
 * ------------------------------------------------------------------------ */
const LOCK = Object.freeze({ UPDATE: 'UPDATE', SHARE: 'SHARE' });

// Local dev/testing only: some MongoDB-compatible servers (e.g. FerretDB used
// in automated testing here) do not support multi-document transactions.
// Never enable this against a real deployment -- it removes the all-or-
// nothing guarantee that sale/stock/payment writes depend on.
const TRANSACTIONS_DISABLED = String(process.env.DISABLE_MONGO_TRANSACTIONS || '').toLowerCase() === 'true';

async function transaction(fn) {
  if (TRANSACTIONS_DISABLED) {
    return fn({ LOCK, session: null });
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await fn({ LOCK, session });
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      const transient = error?.errorLabels?.includes?.('TransientTransactionError');
      if (transient && attempt < maxAttempts) continue;
      throw error;
    } finally {
      session.endSession();
    }
  }
  throw new Error('Transaction failed after multiple attempts.');
}

module.exports = {
  defineModel,
  Op,
  DataTypes,
  QueryTypes,
  sequelize: { transaction },
  registry,
  nextSequence,
  ensureSequenceAtLeast,
  getRawCollection: async (name) => mongoose.connection.collection(name),
};
