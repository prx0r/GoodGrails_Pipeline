# Import

The handoff catalogue is committed as `src/data/catalogue.json` (64 records,
sanitised: no email bodies, no shipping addresses, no buyer data). It is built
from:

- `oxfam_recovered_64_book_catalogue.xlsx` — master 64-copy inventory
- `uk_64_books_listing_prices_2026-11-09.csv` — provisional price research
- `uk_64_books_market_evidence_2026-11-09.csv` — 45 evidence observations

`books.csv` (58 historical rows) is **not** appended: its records are already
included in the 64-copy catalogue. Importing both would create 122 copies.

## Running the import

Dashboard → **Import 64-book catalogue**, or:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://<worker>/api/admin/import
```

## Idempotency

A copy is keyed by its stable SKU (`BOOK-001` … `BOOK-064`). Re-running the
import:

- never inserts a duplicate copy,
- never overwrites edits made after the first import,
- returns `copiesImported: 0, copiesSkipped: 64`.

Verified by `test/import.test.ts`.

## What is imported

For each record:

- `works` — deduplicated by normalised title + author (two Bardo Guidebooks
  share one work),
- `editions` — keyed by work + ISBN + binding + edition note,
- `copies` — SKU, cost, historical target, condition as recorded,
- `price_recommendations` — generated from evidence + supplied research,
- `market_comps` — evidence rows with canonical type mapping.

## Evidence type mapping

Free-text handoff labels are normalised:

| Handoff label | Canonical |
|---|---|
| "2024 auction sold hammer" | `auction_hammer` |
| "…sold…" | `sold` |
| "Current asking" | `active_ask` |
| "withdrawn asking" | `withdrawn_ask` |
| "New retail" | `new_retail` |

An ask is never upgraded to a sale.

## Verification queue

All 64 copies start `needs_verification` / `unverified`. This is intentional:
the owner must confirm edition, printing, jacket, signature and condition on
the physical copy before publishing.
