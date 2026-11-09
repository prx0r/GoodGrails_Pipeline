#!/bin/bash

# Deployment script for Bookstore API
# Run this after setting CLOUDFLARE_API_TOKEN

echo "========================================="
echo "Deploying Bookstore API to Cloudflare"
echo "========================================="
echo ""

# Check if API token is set
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "⚠️  CLOUDFLARE_API_TOKEN not set"
  echo ""
  echo "Please run:"
  echo "export CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>"
  echo ""
  exit 1
fi

echo "✅ API token found"
echo ""

# Step 1: Deploy database schema to remote
echo "📊 Step 1/3: Deploying database schema to remote D1..."
npx wrangler d1 execute bookstore-db --remote --file=schema.sql

if [ $? -ne 0 ]; then
  echo "❌ Schema deployment failed"
  exit 1
fi

echo ""
echo "✅ Database schema deployed"
echo ""

# Step 2: Deploy Worker
echo "🚀 Step 2/3: Deploying Worker..."
npx wrangler deploy

if [ $? -ne 0 ]; then
  echo "❌ Worker deployment failed"
  exit 1
fi

echo ""
echo "✅ Worker deployed"
echo ""

# Step 3: Test health check
echo "🔍 Step 3/3: Testing deployment..."
echo ""
echo "Please test your deployment manually:"
echo ""
echo "1. Health check:"
echo "   curl https://bookstore-api.YOUR-SUBDOMAIN.workers.dev/api/health"
echo ""
echo "2. Ingest a book:"
echo "   curl -X POST https://bookstore-api.YOUR-SUBDOMAIN.workers.dev/api/admin/books/ingest \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"isbn\": \"9780316769174\", \"condition\": \"good\", \"cost_price\": 3.50}'"
echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
