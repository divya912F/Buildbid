// Creates the database/tables and loads demo data on first run.
//   node scripts/init-db.js          -> create if missing
//   node scripts/init-db.js --reset  -> drop everything and re-seed
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const db = require('../src/db');

const TABLES = ['notifications', 'reviews', 'tender_bookmarks', 'tenders', 'supplier_products', 'hire_requests', 'project_updates',
  'expenses', 'milestones', 'historical_projects', 'bids', 'projects', 'estimates', 'material_rates', 'regions', 'profiles', 'users'];

async function createMysqlDatabaseIfMissing() {
  if (config.db.client !== 'mysql') return;
  const mysql = require('mysql2/promise');
  const c = config.db;
  const conn = await mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${c.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
}

function schemaSql() {
  let sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  if (config.db.client !== 'mysql') sql = sql.replace(/INT AUTO_INCREMENT PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  return sql;
}

async function ensureDatabase({ reset = false } = {}) {
  await createMysqlDatabaseIfMissing();
  await db.connect();
  if (reset) {
    const drops = TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n');
    // One exec call = one connection, so the FK-check toggle applies to the drops.
    await db.exec(db.kind === 'mysql' ? `SET FOREIGN_KEY_CHECKS = 0;\n${drops}\nSET FOREIGN_KEY_CHECKS = 1;` : drops);
  }
  await db.exec(schemaSql());
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  if (Number(n) === 0) {
    console.log('Loading demo data…');
    await require('../db/seed').seed();
    console.log('Demo data loaded. Log in with any demo account, password: demo123');
  }
}

module.exports = { ensureDatabase };

if (require.main === module) {
  ensureDatabase({ reset: process.argv.includes('--reset') })
    .then(() => { console.log(`Database ready (${db.kind}).`); return db.close(); })
    .catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });
}
