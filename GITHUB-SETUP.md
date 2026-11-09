# GitHub Setup & Auto-Deploy Guide

## 🎯 Goal

Push code to GitHub → Automatically deploys to Cloudflare Workers

---

## Step 1: Initialize Git (if not done)

```bash
cd ~/Documents/1aMachineLearning/Python/ggrails

# Initialize git
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit: Complete book ingestion pipeline"
```

---

## Step 2: Push to GitHub

```bash
# Add remote (your existing repo)
git remote add origin https://github.com/exploor/GoodGrails_Pipeline.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 3: Configure GitHub Secrets

1. Go to: https://github.com/exploor/GoodGrails_Pipeline/settings/secrets/actions

2. Click **New repository secret**

3. Add these TWO secrets:

   **Secret 1:**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: `<REDACTED_LEAKED_TOKEN_ROTATE_NOW>`

   **Secret 2:**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: `954612afb5a97bb15dddcdc70176813d`

---

## Step 4: Deploy Database Schema (One-Time)

Before the first deployment, run the schema deployment manually:

1. Go to: https://github.com/exploor/GoodGrails_Pipeline/actions

2. Click **"Deploy Database Schema"** workflow

3. Click **"Run workflow"**

4. Select **"production"**

5. Click **"Run workflow"** button

This creates all tables in your remote D1 database.

---

## Step 5: Trigger Auto-Deploy

Now any push to `main` or `master` will auto-deploy!

```bash
# Make a change (e.g., edit README)
echo "# Live deployment" >> README.md

# Commit and push
git add .
git commit -m "Test auto-deploy"
git push

# GitHub Actions will automatically deploy to Cloudflare!
```

---

## Step 6: Monitor Deployment

1. Go to: https://github.com/exploor/GoodGrails_Pipeline/actions

2. Click the latest workflow run

3. Watch the deployment progress

4. When complete, you'll see: ✅ Deploy

5. Your Worker is live at: `https://bookstore-api-XXXXX.workers.dev`

---

## How It Works

```
You push to GitHub
    ↓
GitHub Actions triggers
    ↓
Installs dependencies (npm ci)
    ↓
Runs: npx wrangler deploy
    ↓
Deploys to Cloudflare Workers
    ↓
Your API is live!
```

---

## Workflow Files Created

- `.github/workflows/deploy.yml` - Auto-deploys on push
- `.github/workflows/deploy-schema.yml` - Manual schema deployment

---

## Testing Your Deployment

After GitHub Actions completes:

```bash
# Get your Worker URL from GitHub Actions logs
# Then test:

curl https://bookstore-api-XXXXX.workers.dev/api/health

# Should return:
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "timestamp": "..."
  }
}
```

---

## Manual Deployment (Alternative)

If you prefer to deploy manually without GitHub Actions:

```bash
export CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>
npx wrangler deploy
```

---

## Important Notes

### ⚠️ Cannot Use Render/Vercel/Railway

This is a **Cloudflare Worker**, not a Node.js app. It requires:
- Cloudflare Workers runtime
- D1 Database (Cloudflare only)
- R2 Storage (Cloudflare only)

**It MUST be deployed to Cloudflare.**

### ✅ Why Cloudflare?

- **FREE tier** (100k requests/day)
- **Global edge network** (fast everywhere)
- **Built-in D1, R2, KV**
- **Serverless** (no server management)
- **Zero cold starts**

---

## Troubleshooting

### Deployment Fails

Check GitHub Actions logs:
1. Go to Actions tab
2. Click failed run
3. Check error message

Common issues:
- API token not set correctly
- Account ID wrong
- Database not created

### Database Errors

Run schema deployment manually:
```bash
npx wrangler d1 execute bookstore-db --remote --file=schema.sql
```

### Worker Not Found

Make sure wrangler.toml has correct account ID:
```toml
account_id = "954612afb5a97bb15dddcdc70176813d"
```

---

## Next Steps After Deployment

1. ✅ Test API endpoints
2. ✅ Ingest 10-20 books
3. ✅ Set `OPENAI_API_KEY` secret for better AI
4. ✅ Build frontend (Next.js on Vercel/Cloudflare Pages)
5. ✅ Add Stripe integration

---

## Continuous Deployment Workflow

```bash
# 1. Make changes locally
vim src/services/metadata.ts

# 2. Test locally
npm run dev

# 3. Commit and push
git add .
git commit -m "Improved metadata fetching"
git push

# 4. GitHub Actions auto-deploys
# 5. Your changes are live in ~2 minutes!
```

---

## Summary

**What you get:**
- ✅ Push to GitHub → Auto-deploy to Cloudflare
- ✅ No manual deployment steps
- ✅ Deployment history in GitHub Actions
- ✅ Rollback by reverting commits

**What you need:**
1. Push code to GitHub
2. Add 2 secrets (API token + Account ID)
3. Run schema deployment once
4. Done! Every push auto-deploys

**Ready to push?**

```bash
git add .
git commit -m "Complete book ingestion pipeline with auto-deploy"
git push -u origin main
```

🚀 Your code will be live on Cloudflare's edge network in minutes!
