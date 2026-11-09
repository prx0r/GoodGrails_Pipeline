# Security

## Immediate action required

The historical repository contained a **plaintext Cloudflare API token**.
Treat it as compromised:

1. Cloudflare dashboard → Manage Account → API Tokens.
2. Delete/roll the exposed token.
3. Issue a new least-privilege token.
4. Store it only as a GitHub Actions secret / Wrangler secret.
5. Scan git history before making the repository public again.

## Admin authentication

- Every `/api/admin/*` route requires `Authorization: Bearer $ADMIN_TOKEN`.
- If `ADMIN_TOKEN` is unset the API fails closed with 503.
- Legacy `/api/admin/books/*` routes — previously open — are now wrapped by the
  same guard.
- The dashboard stores the token in `localStorage` on the operator's device
  only; it is never written to D1 or logs.

## Secrets

Set with `wrangler secret put <NAME>`; never commit:

- Required: `ADMIN_TOKEN`
- Optional marketplace: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
  `EBAY_REFRESH_TOKEN`, `ABEBOOKS_API_KEY`, `ABEBOOKS_API_SECRET`,
  `BIBLIO_API_KEY`

`.dev.vars` is gitignored; only `.dev.vars.example` is committed.

## Data that must never be public

- Oxfam order emails and purchase/shipping details
- Buyer names/addresses (store only an opaque `buyer_ref`)
- Marketplace tokens
- Residential addresses

The committed `src/data/catalogue.json` is sanitised: it contains bibliographic
fields, costs and public market evidence, but no emails, addresses or order
numbers.

## Application hardening

- Parameterised D1 queries throughout (no string interpolation of values).
- XML/CSV escaping implemented and tested.
- Uploads: `image/*` only, 12 MB cap, random R2 keys.
- Response headers: `X-Frame-Options: DENY`, `nosniff`, CSP on the dashboard.
- CORS on the legacy public API remains read-only; admin endpoints are not
  intended for cross-origin use.

## Recommended next hardening

- Cloudflare Access in front of `/` and `/api/admin/*`, or WebAuthn/passkeys.
- Rate limiting via Cloudflare WAF.
- Role-scoped tokens for the restricted UK dispatcher (schema supports roles;
  token scoping is not yet wired).
- Turn on Wrangler 4 and remove legacy `node_compat`.
