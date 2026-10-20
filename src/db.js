// Database layer. One small API over two drivers:
//   - MySQL (production, via mysql2)            DB_CLIENT=mysql
//   - SQLite (zero-setup demo, Node built-in)   DB_CLIENT=sqlite
// All SQL in the app is written in the portable subset both understand.
const fs = require('fs');
const path = require('path');
const config = require('./config');

let driver = null;

function normParams(params = []) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

async function connect() {
  if (driver) return driver;
  const c = config.db;
  if (c.client === 'mysql') {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({
      host: c.host, port: c.port, user: c.user, password: c.password, database: c.database,
      waitForConnections: true, connectionLimit: 10, decimalNumbers: true, dateStrings: true,
      multipleStatements: false,
    });
    driver = {
      kind: 'mysql',
      async all(sql, params) { const [rows] = await pool.query(sql, normParams(params)); return rows; },
      async run(sql, params) {
        const [r] = await pool.query(sql, normParams(params));
        return { insertId: r.insertId, changes: r.affectedRows };
      },
      async exec(sql) { const conn = await pool.getConnection(); try { for (const s of splitSql(sql)) await conn.query(s); } finally { conn.release(); } },
      async close() { await pool.end(); },
    };
  } else {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(c.sqliteFile), { recursive: true });
    const db = new DatabaseSync(c.sqliteFile);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    driver = {
      kind: 'sqlite',
      async all(sql, params) { return db.prepare(sql).all(...normParams(params)); },
      async run(sql, params) {
        const r = db.prepare(sql).run(...normParams(params));
        return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) };
      },
      async exec(sql) { db.exec(sql); },
      async close() { db.close(); },
    };
  }
  return driver;
}

function splitSql(sql) {
  return sql.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
}

const db = {
  connect,
  get kind() { return driver && driver.kind; },
  async all(sql, params) { return (await connect()).all(sql, params); },
  async get(sql, params) { const rows = await (await connect()).all(sql, params); return rows[0] || null; },
  async run(sql, params) { return (await connect()).run(sql, params); },
  async exec(sql) { return (await connect()).exec(sql); },
  async close() { if (driver) { await driver.close(); driver = null; } },
};

module.exports = db;
