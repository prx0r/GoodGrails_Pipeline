# GoodGrails Seller

A phone-first, single-copy-of-truth seller app for a 64-copy specialist book
collection (academic philosophy, Buddhist studies, theology, Sanskrit/Trika,
consciousness). Built on Cloudflare Workers + D1 + R2 + KV.

> **Status: Phase 0–2 complete, Phase 3–4 mock/export-ready.** Nothing claims to
> be live. Publishing requires real seller credentials and an explicit owner
> approval.

## What works now

| Area | Status |
|---|---|
| Secure admin API (bearer token, fail-closed) | ✅ implemented |
| D1 domain schema (works/editions/copies/media/comps/prices/listings/orders/jobs) | ✅ implemented |
| Idempotent import of the supplied 64-copy catalogue | ✅ implemented + tested |
| Mobile dashboard: inventory, detail, verification, photos, drafts, exports, orders | ✅ implemented |
| Price recommendations from evidence (sold vs asking kept separate) | ✅ implemented + tested |
| Actual-copy photo upload to R2 | ✅ implemented |
| Biblio / Alibris / Amazon-manual / AbeBooks XML exports | ✅ implemented + tested |
| Cross-channel sale → reserve once → queue withdrawals | ✅ implemented + tested |
| eBay Sell Inventory API adapter | 🟡 implemented with mocks; needs seller credentials |
| AbeBooks authenticated XML transport | 🟡 XML built/tested; transport gated on account |
| Biblio authenticated upload/FTP | 🟡 feed built; upload gated |
| Amazon SP-API | ⛔ intentionally not built (Individual plan = manual) |
| Alibris feed/order access | 🟡 CSV export; authorised feed not verified |
| Vinted | ⛔ manual only |

## Quick start (local)

```bash
npm install
printf 'ADMIN_TOKEN=dev-token\n' > .dev.vars
npm run db:migrate:local
npx wrangler dev            # http://127.0.0.1:8787
```

Open http://127.0.0.1:8787, paste `dev-token`, then click **Import 64-book
catalogue**. Re-importing is safe: it never duplicates copies.

```bash
npm run typecheck
npm test                    # 35 tests
```

### Deploy

```bash
npx wrangler d1 execute bookstore-db --remote --file=migrations/0001_multichannel.sql
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## API surface

Public: `GET /api/health`, `/api/books`, `/api/books/:id`, `/api/search`,
`GET /media/*`.

Private (`Authorization: Bearer $ADMIN_TOKEN`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/overview` | stats, jobs, marketplace status |
| GET | `/api/admin/inventory` | search/filter copies |
| POST | `/api/admin/inventory` | add a manual copy |
| GET | `/api/admin/inventory/:id` | copy + comps + draft |
| PATCH | `/api/admin/inventory/:id` | condition/status/verification/notes |
| POST | `/api/admin/inventory/:id/price` | approve a price |
| POST | `/api/admin/inventory/:id/comps` | add market evidence |
| POST | `/api/admin/inventory/:id/media?kind=front` | upload actual-copy photo |
| POST | `/api/admin/inventory/:id/listing` | create a draft listing |
| POST | `/api/admin/import` | idempotent catalogue import |
| GET | `/api/admin/export/{biblio,alibris,amazon}.csv` | channel exports |
| GET | `/api/admin/export/abebooks.xml` | AbeBooks full-record XML |
| POST | `/api/admin/orders` | record marketplace order |
| POST | `/api/admin/orders/manual` | record in-person sale |
| PATCH | `/api/admin/orders/:id` | packing/dispatched/delivered/cancelled/returned |

## Security

- Admin routes were previously unauthenticated; they now require `ADMIN_TOKEN`.
- If the secret is missing, the admin API **fails closed** (503).
- The old repo contained a plaintext Cloudflare API token: **revoke and rotate
  it now** (Cloudflare dashboard → API Tokens).
- Never commit `.dev.vars`, buyer PII, Oxfam emails or residential addresses.
- See [docs/SECURITY.md](docs/SECURITY.md).

## Design rules (from the handoff)

- One physical copy = one stable SKU. ISBN is not a copy identity.
- Money is integer minor units + currency.
- Asking prices are never recorded as sold prices.
- Unknown edition/condition stays unknown; a visible verification queue.
- Two copies may share an ISBN. Sets are one sellable unit.
- Publishing always passes a human approval gate.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Import](docs/IMPORT.md)
- [Pricing](docs/PRICING.md)
- [Marketplaces](docs/MARKETPLACES.md)
- [Sync & recovery](docs/SYNC-AND-RECOVERY.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/OPERATIONS.md)
