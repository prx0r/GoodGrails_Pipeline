# Sync and recovery

## Copy lifecycle

```
DRAFT → NEEDS_VERIFICATION → READY → PUBLISHING → ACTIVE
                                               ↘ RESERVED → SOLD
                                               ↘ WITHDRAWN
                                               ↘ RETURNED → NEEDS_VERIFICATION
```

Venue-specific state lives in `listings.status`; the physical copy's state lives
in `copies.status`. They are updated together by `SyncService`.

## When a sale arrives

`POST /api/admin/orders` (or `/orders/manual`):

1. Deduplicate by `(marketplace, external_order_id)` — a repeat is ignored.
2. Resolve the copy by SKU/copy id.
3. Atomically reserve: `UPDATE copies SET status='reserved' WHERE id=? AND
   status NOT IN ('sold','reserved','withdrawn')`.
4. If zero rows changed → **simultaneous-order alert**; job set to
   `needs_attention`; nothing is dispatched.
5. Queue `withdraw` jobs for every active/paused listing on other channels,
   keyed idempotently by `withdraw:<copy>:<market>:<order>`.
6. Log an `inventory_events` row.

## Retries

`sync_jobs` is the queue. A job has an idempotency key and attempt counter.
Retry with bounded exponential backoff; never create a second listing for the
same copy/channel (`listings` has `UNIQUE(copy_id, marketplace)`).

## Honesty about atomicity

Cross-marketplace transactions are not atomic. A copy can be simultaneously
purchased on two venues between polling cycles. The system detects this when
the second order arrives and raises a conflict — it cannot prevent the remote
sale. Monitor `needs_attention` jobs.

## Amazon Individual

There is no automatic delisting/monitoring. When an Amazon sale happens:

1. Record it with **Record a manual sale** using the Amazon SKU.
2. Follow the dashboard's reconciliation checklist for other channels.

## Returns

A returned order sets the copy to `needs_verification`, never straight back to
`active`. Re-inspect and re-photograph before relisting.

## Recovery

- Re-run `POST /api/admin/import` safely at any time.
- Inspect `GET /api/admin/jobs`.
- `inventory_events` is the audit trail: who changed what, when.
- D1 time-travel / backups: use `wrangler d1 export` before destructive work.
