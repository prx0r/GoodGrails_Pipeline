# Marketplaces

Status labels are honest:

`not_implemented` · `implemented_with_mocks` · `sandbox_tested` ·
`real_account_tested` · `production_enabled`

Current status is also visible in the dashboard's **Channels** tab.

## eBay UK — Sell Inventory API

- Adapter: `EbayClient` in `src/services/marketplaces.ts`.
- Implements OAuth refresh, `inventory_item` PUT, offer creation, publish and
  withdraw against `api.ebay.com` / `api.sandbox.ebay.com`.
- Status: **implemented_with_mocks**. Needs `EBAY_CLIENT_ID`,
  `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN` and seller policies/location.
- Live publish must be tested with a real sandbox response first; never claim
  production success without one.

## AbeBooks — authenticated XML

- `buildAbeBooksXml()` builds a full-record `InventoryUpdate` document with
  `vendorBookID = SKU`; updates are replacements, not sparse patches.
- Status: **implemented_with_mocks**. AbeBooks has no public sandbox and the
  endpoint may use a non-standard HTTPS port. Isolate transport if Workers
  cannot reach it; keep D1 authoritative.

## Biblio — file feed

- `buildBiblioFeed()` produces CSV with required fields first (SKU, Title,
  Author, ISBN, Publisher, Publication Year, Binding, Edition, Condition,
  Description, Price, Currency, Quantity, Image URL).
- Status: **implemented_with_mocks**. Authenticated upload/FTP is gated on
  seller access. Order sync is manual unless the account exposes an API.

## Amazon UK — manual Individual

- `buildAmazonManualSheet()` exports a paste-ready offer sheet.
- Dashboard supports recording a manual Amazon sale, which reserves the copy
  and queues withdrawals elsewhere.
- **Individual plan cannot be auto-delisted.** The UI must not imply otherwise.
- SP-API is intentionally **not_implemented** until account eligibility and
  economics justify it.

## Alibris

- `buildAlibrisFeed()` CSV export. Authorised feed/order access not verified.

## Vinted

- Manual only. No unauthorised automation.

## Fees

Fee/commission assumptions are not hardcoded. Record actual fees on each order
(`fees_minor`, `shipping_minor`, `net_minor`) so the ledger reflects reality.
