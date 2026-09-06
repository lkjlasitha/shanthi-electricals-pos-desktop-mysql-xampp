# Database migration: MySQL → MongoDB (September 2026)

## What changed
The backend now runs on **MongoDB** instead of MySQL/MariaDB. This was a
full rewrite of the data layer. The REST API itself, every screen in the
app, and all your existing features (including the letterhead/wire-pricing
work from before) behave identically -- only what's underneath changed.

## Setup: you need a MongoDB database
The app needs a MongoDB connection string in `backend/.env`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/electro_pos
```

**We recommend MongoDB Atlas** (Atlas is MongoDB's official hosted
service, and its free tier is genuinely free, not a trial):
1. Create a free account at https://www.mongodb.com/cloud/atlas/register
2. Create a free (M0) cluster.
3. Under Database Access, create a database user with a password.
4. Under Network Access, allow the IP address(es) your server will connect
   from (or "Allow access from anywhere" for a quick start).
5. Click "Connect" → "Drivers" and copy the connection string. It looks
   like `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/`. Add
   `electro_pos` as the database name at the end, and paste the whole thing
   into `backend/.env` as `MONGODB_URI`.

**Why Atlas specifically, and not any MongoDB server:** this app uses
multi-document transactions to keep a sale, its stock deduction, and its
payment record all succeed or fail together -- the same guarantee the old
MySQL version had. MongoDB only supports that when running as a **replica
set**. A plain, freshly-installed `mongod` is *not* a replica set and will
error when you try to check out a sale. Atlas's free tier always is a
replica set, so it works with zero extra configuration. If you'd rather
self-host, you can still do so -- just initialize your MongoDB server as a
(even single-node) replica set first.

## First-time setup
```
cd backend
npm install
cp .env.example .env      # then edit MONGODB_URI and JWT_SECRET
npm run seed               # creates default roles/units/categories + your admin login
npm start
```

## What to know if you're restoring an old MySQL-era backup
Backup files exported from before this migration (`.xlsx` format v1) are
**not** compatible with the new MongoDB-backed restore -- the underlying
data model changed too much (integer auto-increment sequencing works
differently under the hood, even though the numbers you see are the same).
If you have an old backup you need restored, let us know and we can help
migrate it by hand. New backups taken from this version onward (format v2)
export and restore normally from Settings → Backup.

## Known follow-up item: the desktop (Electron) app installer
The Electron desktop build has its own separate first-run setup wizard that
auto-detects/installs MySQL (via XAMPP) for a fully offline desktop
install (`electron/services/mysqlSetup.cjs`, `xamppDetector.cjs`,
`databaseConfig.cjs`). That subsystem has **not** been converted yet -- it's
a genuinely separate piece of work (designing how a non-technical shop
owner points a desktop app at a MongoDB database, likely Atlas, without a
terminal) rather than a mechanical code change, and needs its own UX design
pass. The web/server deployment (what most of this migration targeted) is
fully working. Let us know if you'd like the desktop installer tackled next.

## For the technically curious: how the migration was done
Rather than rewrite the ~3,000 lines of business logic spread across the
controllers (checkout, stock deduction, payments, returns -- the parts most
likely to introduce a costly bug if touched carelessly), we built a
translation layer (`backend/src/config/sequelizeCompat.js`) that lets the
existing controllers keep using the same query style they always did
(`Model.findAll({ where, include })`, `Op.gte`/`Op.like`/etc.,
`sequelize.transaction(...)`), while everything underneath now talks to
MongoDB. This kept the business logic itself untouched and let us test the
migration against a real MongoDB-compatible server rather than guessing
from reading code -- which caught and fixed several real bugs along the way
(a couple of them were subtle enough that a code-only review likely would
have missed them), on top of a couple of genuine limitations in the
lightweight MongoDB-compatible server used for local testing. Reporting,
the dashboard, and backup/restore -- the parts that used raw SQL and
therefore couldn't reuse the same trick -- were rewritten by hand and
tested the same way.
