const { MongoOrm } = require('../database/mongoOrm');
require('dotenv').config();

// One MongoDB client is shared by all models and requests. The adapter keeps
// the existing integer ids and snake_case API fields for frontend compatibility.
module.exports = new MongoOrm();
