const mongoose = require('mongoose');
require('dotenv').config();

// A MongoDB connection string, e.g.:
//   mongodb://127.0.0.1:27017/electro_pos                              (local)
//   mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/electro_pos     (Atlas)
// MongoDB Atlas's free tier is always deployed as a replica set, which is
// required for the multi-document transactions this app relies on for sale/
// stock/payment consistency -- see README for setup instructions.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/electro_pos';

mongoose.set('strictQuery', false);

async function connect() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { mongoose, connect, disconnect, MONGODB_URI };
