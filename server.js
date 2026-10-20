// BuildBid — AI-enabled construction planning, cost estimation & contractor bidding platform.
// Team InfraNexus · Smart India Hackathon 2026
const path = require('path');
const express = require('express');
const config = require('./src/config');
const db = require('./src/db');
const { optionalAuth } = require('./src/auth');
const { ensureDatabase } = require('./scripts/init-db');

const app = express();
app.use(express.json({ limit: '1mb' }));

const api = express.Router();
api.use(optionalAuth);
api.get('/health', (req, res) => res.json({ ok: true, db: db.kind }));
api.use(require('./src/routes/core'));
api.use(require('./src/routes/projects'));
api.use(require('./src/routes/marketplace'));
api.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
});

(async () => {
  try {
    await ensureDatabase();
    app.listen(config.port, () => {
      console.log(`\n  BuildBid running → http://localhost:${config.port}   (database: ${db.kind})\n`);
    });
  } catch (e) {
    console.error('\nCould not start BuildBid:', e.message);
    if (config.db.client === 'mysql') console.error('Check the DB_* settings in .env and that MySQL is running, or set DB_CLIENT=sqlite for a zero-setup demo.\n');
    process.exit(1);
  }
})();
