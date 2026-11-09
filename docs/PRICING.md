# Pricing

Pricing is evidence-based and conservative. It never converts a provisional
asking price into a verified sold price.

## Three prices per copy

- **Quick cash** — undercuts the signal for a fast sale.
- **Balanced** — the default recommended ask.
- **Patient / collector** — waits for the right buyer.
- **Offer floor** — minimum sensible accepted offer.

All values are integer pence, GBP.

## Rules (`src/services/pricing.ts`, version `v1-market-evidence`)

1. If realised evidence exists (`sold` / `auction_hammer`):
   - balanced = median
   - quick = 0.85 × median
   - patient = 1.25 × median
   - confidence = high with ≥2 observations, else medium
2. Else if active asks exist:
   - balanced = 0.80 × median ask
   - quick = 0.60 × median ask
   - patient = 1.05 × median ask
   - confidence = medium with ≥3 asks, else low
   - rationale explicitly says "not verified sales"
3. Else fall back to the supplied provisional research and mark confidence low.
4. If a new-retail reference exists and the balanced price exceeds it, cap the
   price below that reference.
5. Apply a visible condition multiplier (Fine ×1.20 … Poor ×0.70).

## Special cases

- **Poems of Truth** (Michael Dillon, 1957) — an auction hammer (~£150) and
  specialist asks (~£2,000–£2,950) diverge hugely. Keep them separate; seek
  expert appraisal. Do not mechanically publish either figure.
- **The Buddhist Unconscious** — the £34 acquisition cost and £165 historical
  target are preserved; the newer ~£85 provisional ask is a separate field.
- **Multivolume sets** — compare only against complete-set listings.
- **The Stanzas on Vibration** — distinguish the 1992 SUNY hardback from the
  cheaper paperback.

## Approval

A recommendation is advisory until `POST /api/admin/inventory/:id/price`
records `approved_minor`, `approved_by`, `approved_at`. Listings cannot be
created from an unapproved price.
