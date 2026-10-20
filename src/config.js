// Minimal .env loader (no dependency needed) + typed config.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const env = process.env;

module.exports = {
  port: Number(env.PORT || 3000),
  authSecret: env.AUTH_SECRET || 'dev-only-secret-change-me',
  db: {
    client: (env.DB_CLIENT || 'sqlite').toLowerCase(),
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'buildbid',
    sqliteFile: path.resolve(__dirname, '..', env.SQLITE_FILE || './data/buildbid.sqlite'),
  },
};
