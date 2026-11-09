# Operations

## Daily loop

1. Open the dashboard on your phone.
2. Pick a copy from **Inventory**.
3. Verify edition/printing/jacket/signature on the actual book.
4. Upload photos: front, back, spine, title page, copyright page, defects,
   signature if any.
5. Set **Verification** to `photo_verified` (or `fully_verified`).
6. Review the price recommendation; approve a final price.
7. Review the listing draft and checklist.
8. Export the channel file (Biblio/Alibris/Amazon/AbeBooks) or publish through
   a connected channel.
9. When a sale arrives, record it. The copy is reserved and other channels are
   queued for withdrawal.
10. Pack from the recorded shelf location, add tracking, mark dispatched.
11. After delivery, the copy stays `sold`; proceeds are in the order ledger.

## Verification gates

- `unverified` → no publishing.
- `bibliographic_verified` → edition/ISBN checked, but no photos.
- `photo_verified` → actual-copy photos exist.
- `fully_verified` → bibliography, photos and condition all checked.

## What "manual" means

Amazon Individual and Vinted cannot be automatically delisted or monitored.
The dashboard records manual sales and manual fulfilment; it does not pretend
those channels are synchronised.

## Reconciliation checklist (manual channels)

- [ ] Record the manual sale with the correct SKU.
- [ ] Confirm the copy is `reserved`/`sold` in Inventory.
- [ ] Check the **Jobs** list for queued withdrawals.
- [ ] Manually delist any channel without an adapter.
- [ ] Update tracking where the channel requires it.

## Backups

```bash
npx wrangler d1 export bookstore-db --remote --output backup-$(date +%F).sql
```

Store backups outside the repository. They may contain buyer references.

## Monitoring

- `GET /api/health` — database connectivity.
- Dashboard Overview — verification queue and pending jobs.
- `wrangler tail` for Worker logs (never log tokens or buyer PII).
