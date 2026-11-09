@echo off
echo =========================================
echo Deploying Bookstore API to Cloudflare
echo =========================================
echo.

REM Check if API token is set
if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo WARNING: CLOUDFLARE_API_TOKEN not set
  echo.
  echo Please run:
  echo set CLOUDFLARE_API_TOKEN=<REDACTED_LEAKED_TOKEN_ROTATE_NOW>
  echo.
  pause
  exit /b 1
)

echo API token found
echo.

REM Step 1: Deploy database schema
echo Step 1/3: Deploying database schema...
call npx wrangler d1 execute bookstore-db --remote --file=schema.sql

if %errorlevel% neq 0 (
  echo Schema deployment failed
  pause
  exit /b 1
)

echo.
echo Database schema deployed
echo.

REM Step 2: Deploy Worker
echo Step 2/3: Deploying Worker...
call npx wrangler deploy

if %errorlevel% neq 0 (
  echo Worker deployment failed
  pause
  exit /b 1
)

echo.
echo Worker deployed
echo.

echo =========================================
echo Deployment Complete!
echo =========================================
echo.
echo Test your deployment at:
echo https://bookstore-api.YOUR-SUBDOMAIN.workers.dev/api/health
echo.
pause
