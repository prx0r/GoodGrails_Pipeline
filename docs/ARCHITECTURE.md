# Architecture

## Shape

```
Phone / browser
      │ HTTPS (bearer token)
      ▼
Cloudflare Worker (src/index.ts)
  ├── /                    dashboard (single-page, no build step)
  ├── /api/admin/*         authenticated seller API
  ├── /api/books, /search  public catalogue (legacy, read-only)
  ├── /media/*             actual-copy photos from R2
  ▼
D1 (authoritative inventory)   R2 (photos)   KV (optional config)
```

The Worker is the only writer. D1 is the single source of truth; R2 is
byte storage only. No external service holds a competing inventory.

## Domain model

| Table | Meaning |
|---|---|
| `works` | intellectual work, independent of edition |
| `editions` | ISBN/format/printing of a work |
| `copies` | one owned physical copy or complete set = one stable SKU |
| `media_assets` | photographs of that physical copy |
| `market_comps` | observed market evidence with type/URL/date |
| `price_recommendations` | rule output + human-approved price |
| `listings` | per-copy, per-marketplace listing state |
| `marketplace_orders` | external orders, deduplicated |
| `inventory_events` | immutable audit trail |
| `sync_jobs` | queued withdraw/publish/reconcile actions |
| `app_users` | owner/admin/dispatcher/viewer roles |

Legacy tables (`books`, `orders`, `monthly_donations`, ...) are left untouched
for compatibility. New code never depends on them.

## Invariants

1. One physical copy = one SKU (unique), independent of ISBN.
2. ISBN-10/13 are TEXT; leading zeros preserved; checksums validated.
3. Two copies may share an ISBN.
4. Books without ISBN are valid stock.
5. Multivolume sets are one copy/SKU.
6. Money is integer minor units + currency.
7. Asking prices are never stored as sold evidence.
8. Unknown edition/condition remains `unverified`, never guessed.
9. Every state transition is logged; imports are idempotent by SKU.
10. Publishing requires a human-approved price + verification gate.

## Read/write paths

- `InventoryService` — import, copies, recommendations, comps, listings, stats.
- `SyncService` — order dedupe, reservation, withdrawal fan-out, fulfilment.
- `marketplaces.ts` — typed adapters + file exports.
- `listingCopy.ts` — drafts from verified data only.
- `pricing.ts` — pure, testable recommendation maths.
- `auth.ts` — bearer-token admin guard (fail-closed).

## Deliberate non-goals

Blockchain donations, Stripe storefront, ERP, separate shopfront and FBA are
not on the critical path. They remain legacy code, not dependencies.
