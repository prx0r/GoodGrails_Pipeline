# Deployment

## Prerequisites

- Node 18+ (built and tested with Node 26 locally)
- A Cloudflare account with Workers, D1 and R2 enabled
- `wrangler` (installed as a dev dependency)

## 1. Install and typecheck

```bash
npm install
npm run typecheck
npm test
```

## 2. Configure resources

`wrangler.toml` already references:

- D1 `bookstore-db` (binding `DB`)
- R2 `bookstore-assets` (binding `ASSETS`)
- KV namespace (binding `CONFIG`)

If any resource does not exist, create it and paste its id into `wrangler.toml`:

```bash
npx wrangler d1 create bookstore-db
npx wrangler r2 bucket create bookstore-assets
npx wrangler kv namespace create CONFIG
```

## 3. Apply schema (additive, non-destructive)

```bash
# local
npm run db:migrate:local

# production
npm run db:migrate:remote
```

The migration only creates new tables. Legacy tables are untouched.

## 4. Secrets

```bash
npx wrangler secret put ADMIN_TOKEN
# optional, only when enabling a channel:
npx wrangler secret put EBAY_CLIENT_ID
npx wrangler secret put EBAY_CLIENT_SECRET
npx wrangler secret put EBAY_REFRESH_TOKEN
```

## 5. Deploy

```bash
npm run deploy
```

Open the Worker URL, sign in with the admin token, click **Import 64-book
catalogue**.

## GitHub Actions

- `.github/workflows/ci.yml` runs typecheck + tests on every push/PR.
- `.github/workflows/deploy.yml` deploys `main` (existing behaviour).
- `.github/workflows/deploy-schema.yml` applies the migration on manual
  dispatch.

Required repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Rollback

The migration is additive, so rolling back code is safe. To roll back schema,
drop only the new tables (never the legacy ones):

```sql
DROP TABLE IF EXISTS sync_jobs;
-- ... see migrations/0001_multichannel.sql for the full list
```

## Cost sketch

- Workers free tier: 100k requests/day.
- D1 free tier: 5 GB storage, 5M reads/day.
- R2: ~$0.015/GB-month storage; egress free via the Worker.
- 64 books and a handful of photos sit comfortably inside free tiers.
