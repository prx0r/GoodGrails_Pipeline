# Deployment Guide

## Using Your Cloudflare API Token

You have: `<REDACTED_LEAKED_TOKEN_ROTATE_NOW>`

### Step 1: Set Your API Token

```bash
# Set the environment variable (Windows Git Bash)
export CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>

# Verify it's set
echo $CLOUDFLARE_API_TOKEN
```

Alternatively, create a `.env` file:
```bash
CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>
```

### Step 2: Deploy Your Worker

```bash
# Deploy the schema to remote database
npx wrangler d1 execute bookstore-db --remote --file=schema.sql

# Deploy the Worker
npx wrangler deploy
```

### Step 3: Test in Production

```bash
# Replace YOUR-SUBDOMAIN with your actual subdomain
curl https://bookstore-api.YOUR-SUBDOMAIN.workers.dev/api/health

# Ingest a book
curl -X POST https://bookstore-api.YOUR-SUBDOMAIN.workers.dev/api/admin/books/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "isbn": "9780316769174",
    "condition": "good",
    "cost_price": 3.50
  }'
```

---

## R2 Bucket Configuration

### Option A: Public Domain (Simplest)

1. Go to: https://dash.cloudflare.com/954612afb5a97bb15dddcdc70176813d/r2/buckets/bookstore-assets
2. Click **Settings**
3. Scroll to **Public Access**
4. Click **Connect Domain** or **Enable Public Access**
5. If you have a domain, connect it (e.g., `cdn.yourdomain.com`)
6. If not, enable R2.dev subdomain

### Option B: Serve Through Worker (Already Implemented!)

The code we just added will serve images through your Worker:
- Upload creates: `/assets/covers/{book_id}.jpg`
- Access via: `https://your-worker.workers.dev/assets/covers/{book_id}.jpg`

**No additional R2 configuration needed!** This is already working.

---

## Complete Deployment Steps

### 1. Set API Token

```bash
export CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>
```

### 2. Apply Database Schema to Remote

```bash
npx wrangler d1 execute bookstore-db --remote --file=schema.sql
```

**Expected output:**
```
🌀 Executing on remote database bookstore-db
🚣 25 commands executed successfully
```

### 3. Deploy Worker

```bash
npx wrangler deploy
```

**Expected output:**
```
✨ Built successfully
✨ Uploaded successfully
✨ Deployment complete!
https://bookstore-api.XXXXX.workers.dev
```

### 4. Test Health Check

```bash
# Use the URL from step 3
curl https://bookstore-api.XXXXX.workers.dev/api/health
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "timestamp": "2025-10-21T13:00:00.000Z"
  }
}
```

### 5. Ingest Your First Production Book

```bash
curl -X POST https://bookstore-api.XXXXX.workers.dev/api/admin/books/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "isbn": "9780316769174",
    "condition": "good",
    "cost_price": 3.50
  }'
```

### 6. Approve It

```bash
# Get the book_id from the response above
curl -X PATCH https://bookstore-api.XXXXX.workers.dev/api/admin/books/{book_id}/approve \
  -H "Content-Type: application/json" \
  -d '{"final_price": 9.99}'
```

### 7. View Public Books

```bash
curl https://bookstore-api.XXXXX.workers.dev/api/books
```

---

## Set OpenAI API Key (Optional - Better AI Enrichment)

```bash
npx wrangler secret put OPENAI_API_KEY
# Paste your OpenAI key when prompted
```

Now books will get richer AI enrichment using GPT-4o-mini!

---

## Troubleshooting

### "wrangler: command not found"

Always use `npx wrangler` instead of just `wrangler`:
```bash
npx wrangler --version
```

### API Token Issues

If deployment fails with auth error:
```bash
# Login interactively
npx wrangler login

# Or use API token
export CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>
```

### Database Not Found

Make sure you're using the correct database ID in wrangler.toml:
```toml
database_id = "a6958759-920f-464b-9eb8-9d44257cfe3b"
```

### R2 Upload Fails

With the new code we added, images will be served through the Worker itself.
Test with:
```bash
curl https://bookstore-api.XXXXX.workers.dev/assets/covers/test.jpg
```

---

## After Deployment

### Your Live URLs

- **API Base:** `https://bookstore-api.XXXXX.workers.dev`
- **Health:** `https://bookstore-api.XXXXX.workers.dev/api/health`
- **Books:** `https://bookstore-api.XXXXX.workers.dev/api/books`
- **Search:** `https://bookstore-api.XXXXX.workers.dev/api/search?q=mystery`
- **Images:** `https://bookstore-api.XXXXX.workers.dev/assets/covers/{filename}`

### Monitor Your Worker

```bash
# Watch live logs
npx wrangler tail

# Then make requests and see logs in real-time
```

### Check Database

```bash
# Count books in production
npx wrangler d1 execute bookstore-db --remote \
  --command "SELECT COUNT(*) FROM books"

# See all books
npx wrangler d1 execute bookstore-db --remote \
  --command "SELECT title, author, status FROM books"
```

---

## What's Different in Production vs Local

| Feature | Local (wrangler dev) | Production (deployed) |
|---------|---------------------|----------------------|
| Database | `.wrangler/state/v3/d1` | Cloudflare D1 (remote) |
| URL | `http://localhost:8787` | `https://bookstore-api.XXXXX.workers.dev` |
| R2 | Local file system | Cloudflare R2 (remote) |
| Logs | Console output | `wrangler tail` |
| Restart | Auto on file change | Manual deploy |

---

## Ready to Deploy?

Run these commands in order:

```bash
# 1. Set API token
export CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>

# 2. Deploy schema
npx wrangler d1 execute bookstore-db --remote --file=schema.sql

# 3. Deploy Worker
npx wrangler deploy

# 4. Test health check (use URL from step 3)
curl https://bookstore-api.XXXXX.workers.dev/api/health
```

That's it! Your book ingestion pipeline will be live on Cloudflare's global edge network! 🚀
