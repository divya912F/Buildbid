# BuildBid
**AI-enabled construction planning, cost estimation & contractor bidding platform**
Team **InfraNexus** · Smart India Hackathon 2026 · Theme: Smart Automation · Category: Software

BuildBid replaces the fragmented "search engineer → search contractor → collect quotes → guess if they're fair → manage on WhatsApp" process with one connected workflow:

**PLAN → ESTIMATE → FIND → BID → COMPARE → MANAGE**

---

## Quick start (2 minutes)

Requires **Node.js 22.13 or newer** (LTS 22 or 24 recommended) (`node -v`).

```bash
cd buildbid
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

### Option A — demo mode (no MySQL needed)
In `.env` set `DB_CLIENT=sqlite`, then:
```bash
npm start
```
Open **http://localhost:3000**. The database file and demo data are created automatically in `data/`.

### Option B — MySQL (production setup from the deck)
1. Install MySQL 8 (or MariaDB 10.5+) and make sure it's running.
2. In `.env` keep `DB_CLIENT=mysql` and set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
3. `npm start` — the database, tables and demo data are created on first run.

Reset everything to fresh demo data at any time: `npm run db:reset`

### Demo accounts (password `demo123` for all)
| Role | Email | What to try |
|---|---|---|
| Customer | `priya@demo.in` | Compare 4 quotations (one is flagged high-risk), award the contract |
| Customer | `rahul@demo.in` | Project workspace for a villa under construction |
| Contractor | `ravi@demo.in` | Find projects, submit itemised quotations, save tenders |
| Professional | `anita@demo.in` | Structural engineer profile & enquiries |
| Supplier | `om@demo.in` | Manage material listings and prices |
| Admin | `admin@buildbid.in` | Verify professionals, update regional rates |

The home page also has one-click demo login buttons.

### Smoke test
With the server running on fresh demo data: `npm test` (28 end-to-end API checks).

---

## Suggested 5-minute demo for judges
1. **Estimate** (logged out): Noida, 1,200 sq ft × 2 floors, Standard → total, range, confidence, phase split, material quantities, and how the AI blend was computed. Print to PDF.
2. Click **Get quotations from contractors** → log in as Priya → post the project.
3. Log in as **Priya** → Dashboard → *G+1 family home* → **Compare 4 quotes**. Point out the −34% quote flagged *High risk* and the recommendation. Award to Ravi.
4. **Workspace** opens with an auto-generated milestone plan. Log in as **Rahul** → *Duplex villa* workspace to show progress, expenses vs budget, site updates and alerts. Mark complete → the actual cost is fed back into the AI model (`/api/model` sample count goes up).
5. Show **Professionals**, **Materials** (supplier prices vs reference rates) and **Tenders**.

---

## Features → deck mapping
| Deck item | Where it lives |
|---|---|
| Approximate construction cost estimation | `#/estimate` · `src/estimator.js` |
| Current/local material & labour rate integration | `regions`, `material_rates` tables · Admin → Update rates · supplier prices cross-check |
| Multiple contractor quotations / bidding | `#/projects`, `POST /api/projects/:id/bids` |
| Quotation comparison & analysis | `#/projects/:id/compare` · `src/analysis.js` |
| Professional discovery & hiring | `#/professionals`, enquiries (`hire_requests`) |
| Material suppliers & inventory | `#/materials`, supplier dashboard |
| Project management tools | `#/workspace/:id` — milestones, expenses, updates, alerts |
| Government & institutional tender discovery | `#/tenders`, bookmarks |
| Verification, ratings & feedback | Admin verification, reviews on completion |
| Continuous AI model improvement | Completed projects → `historical_projects` → model retrains |

## How the AI works
**Cost estimation** (`src/estimator.js`) combines two models:
1. **Quantity take-off** — standard Indian thumb-rule quantities per sq ft (cement 0.4 bag, steel 4 kg, sand 1.8 cft, aggregate 1.35 cft, bricks 8 nos, …) adjusted for height, building type, basement and quality, multiplied by the region's stored material and labour rates.
2. **Data model** — ridge regression on historical projects (features: ln(area), floors, quality, regional cost index, commercial flag) predicting cost per sq ft.
The final figure blends both (data weight grows with the number of past projects, capped at 40%). The ± range widens when the models disagree or the model error is high, producing a High/Medium/Low confidence label. Every number is broken down so users can see *why*.

**Quotation analysis** (`src/analysis.js`) checks every quote against the estimate (deviation %, line items adding up, material share, timeline realism, verification) to raise risk flags, then scores it: price 40%, rating 25%, timeline 20%, trust/verification 15%. Suspiciously low quotes are penalised rather than rewarded.

**Project decision support** compares money spent with value of work done and flags overspend, overdue milestones and over-budget phases.

## Visual design: from blueprint to building
Every project is drawn as a building on a blueprint sheet (`public/js/building.js`, plain SVG, no images or libraries). The drawing is generated from the project's real numbers: floors, area per floor, basement, quality and building type.
- **Estimator:** a dashed blueprint updates as you type, and the result shows the finished building with dimension lines (G+1, height, sq ft per floor).
- **Project pages and lists:** open projects appear as blueprints, awarded or in-progress ones as part-built, completed ones as finished.
- **Workspace:** the drawing follows actual milestone progress. Footings, then the concrete frame with rebar and scaffolding, brickwork courses, windows, then plaster and paint, with a tower crane until handover.
- Palette: blueprint navy, drafting blue, safety yellow (crane and main "build" buttons only), concrete grey. Type: Archivo, with the expanded width for headings. Floors rise once when a drawing first appears, and this is turned off for users who prefer reduced motion.

The Archivo font loads from Google Fonts. If the demo machine is offline, the app falls back to the system font automatically.

## Tech stack
- **Frontend:** HTML, CSS, vanilla JavaScript (single-page app, no build step) — `public/`
- **Backend:** Node.js + Express REST API — `server.js`, `src/routes/`
- **Database:** MySQL (SQLite demo mode via Node's built-in `node:sqlite`) — `db/schema.sql`
- **Auth:** scrypt password hashing + HMAC-signed tokens (Node `crypto`, no extra dependencies)

```
buildbid/
├── server.js              Express app
├── src/
│   ├── estimator.js       AI cost estimation engine
│   ├── analysis.js        Quotation comparison & risk scoring
│   ├── milestones.js      Milestone plan generator
│   ├── db.js              MySQL / SQLite driver
│   ├── auth.js            Passwords & tokens
│   └── routes/            core.js, projects.js, marketplace.js
├── db/schema.sql, db/seed.js
├── scripts/init-db.js, scripts/smoke-test.js
└── public/                index.html, css/, js/, img/
```

## API overview (all under `/api`)
`POST /auth/register` · `POST /auth/login` · `GET|PUT /me` · `GET /regions` · `GET /regions/:id/rates` · `POST /estimates` · `GET /model` ·
`GET|POST /projects` · `GET /projects/:id` · `POST /projects/:id/bids` · `GET /projects/:id/compare` · `POST /projects/:id/award` ·
`GET /projects/:id/workspace` · `PUT /milestones/:id` · `POST /projects/:id/expenses` · `POST /projects/:id/updates` · `POST /projects/:id/complete` ·
`GET /professionals` · `POST /hire-requests` · `GET|POST /materials` · `GET /tenders` · `POST /tenders/:id/bookmark` · `GET /dashboard` · `GET /notifications`

## Important notes on data
- **Rates are indicative 2026 seed values** for 14 cities. Before real use, load the latest **CPWD DSR** / **State PWD SOR** figures and market surveys via Admin → Update rates (or directly into `material_rates`).
- **Historical projects are synthetic** (generated around the take-off model with noise) so the regression has something to learn from on day one. Real completed projects are added automatically and should replace them over time.
- **People, companies, projects and tenders in the demo data are fictional.** Tender entries are marked *Sample*; a production version would ingest notices from CPPP, GeM and state e-procurement portals.

## Roadmap
Live tender ingestion from official portals · document uploads (drawings, BOQ, bills) · BOQ import from engineer drawings · payments/escrow by milestone · Hindi & regional language UI · mobile app · image-based progress verification.
