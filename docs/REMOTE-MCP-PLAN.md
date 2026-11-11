# Remote MCP plan — let ChatGPT (and any agent) run the whole bookfinder chain

Status: **scaffold implemented on branch `feat/remote-mcp`; deployment + connector
setup pending owner credentials.** See `HANDOVER-CHATGPT.md` for the turnkey
brief.

## Goal

Give a remote agent (ChatGPT connector/plugin, Claude, opencode, Hermes) a single
MCP endpoint that can drive the entire GoodGrails chain on the live 64-copy
catalogue:

```
verify (bibliographic/physical) → photograph → price (owner gate)
   → create listing drafts → order/reserve → delist other channels → export feeds
```

Today the MCP is a **stdio** process (`mcp/server.mjs`) that must run on a laptop
and is registered per-machine in `opencode.jsonc`. ChatGPT cannot reach a stdio
process. The fix is to expose the same tools over **Streamable HTTP** at a public
HTTPS URL.

## Architecture decision

**Host the MCP inside the existing Cloudflare Worker, mounted at `/mcp`.**

Why not a separate remote server:

| Option | Verdict |
|---|---|
| MCP inside the Worker (`/mcp`) | ✅ one deploy, same D1/R2/KV, same auth, zero extra hosting, `WebStandardStreamableHTTPServerTransport` is built for Workers |
| Separate Node server on a VPS | ❌ extra box, extra secret, extra failure mode, still calls the Worker API |
| Chatgpt-only bespoke API | ❌ reinvents MCP; loses Claude/opencode reuse |

The Worker is already live and healthy (`https://goodgrails-seller.tradesprior.workers.dev`),
so the MCP endpoint ships with the same `wrangler deploy`.

### Two MCP front-ends, one tool surface

- `mcp/server.mjs` — stdio bridge for local agents (kept; fetches the admin API).
- `src/mcp/remote.ts` — in-Worker Streamable HTTP; calls the route handlers
  **directly** (no self-HTTP), so it is faster and needs no loopback.

Both expose the same ~20 tools plus `seller_upload_photo` (added for the chain —
the stdio bridge could not upload photos).

## Transport

- `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined,
  enableJsonResponse: true })` — **stateless**, a fresh `McpServer` per request.
- Stateless is deliberate: the Worker has no durable per-session memory, and the
  tool set is static. Verified in `test/mcp.test.ts`: `initialize` and
  `tools/list` both succeed on independent requests.
- Methods served: `POST` (JSON-RPC), `GET` (SSE/keep-alive), `DELETE` (session
  close), `OPTIONS` (CORS).

## Authentication

ChatGPT's custom-connector UI supports **OAuth 2.1** or **no authentication**; it
does not let you paste a static bearer header. So the endpoint accepts either:

1. `Authorization: Bearer <ADMIN_TOKEN>` — standard MCP clients (Claude Desktop,
   opencode, `mcp-remote`, Cursor).
2. `/mcp/s/<MCP_PATH_SECRET>` — an unguessable path for the ChatGPT "no auth"
   connector. Also accepted as `X-MCP-Secret` header.

Rules:

- If **neither** `ADMIN_TOKEN` nor `MCP_PATH_SECRET` is set → `503` (fail closed).
- Missing credential → `401`; wrong credential → `403`.
- Comparisons are constant-time (`constantTimeEqual`).
- `/mcp` is **never** public without one of the above.

### Optional hardening (todo 10): OAuth 2.1

If the owner wants first-class OAuth instead of a secret path, add discovery +
authorize + token + dynamic client registration endpoints in the Worker, issuing
short-lived tokens derived from `ADMIN_TOKEN` (the `hmacHex` helper already
exists in `src/services/auth.ts`). The secret-path route stays as a fallback.

## The chain as MCP tools

| Step | Tool(s) |
|---|---|
| Inspect | `seller_status`, `seller_list_inventory`, `seller_get_copy` |
| Verify | `seller_update_copy` (verification_status), `seller_add_comps` |
| Photograph | `seller_upload_photo` → marks `photo_verified` |
| Price (owner gate) | `seller_approve_price` |
| List | `seller_create_listing`, `seller_get_draft` |
| Sell | `seller_record_order`, `seller_record_manual_sale` |
| Fulfil | `seller_update_order`, `seller_list_orders` |
| Reconcile | `seller_list_jobs`, `seller_marketplaces` |
| Export | `seller_export` (biblio/alibris/amazon CSV, abebooks XML) |
| Bootstrap | `seller_import_catalogue` |

Hard rules the tools enforce: money is integer pence; an asking price is never
recorded as a sale; publishing needs an approved price; condition/edition stay
unknown until verified.

## Deploy

```bash
cd GoodGrails_Pipeline
npx wrangler secret put ADMIN_TOKEN        # if rotating
npx wrangler secret put MCP_PATH_SECRET    # new; any long random string
npm run typecheck && npm test
npx wrangler deploy
```

Then:

```bash
curl -s https://goodgrails-seller.tradesprior.workers.dev/mcp/s/<secret> \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## ChatGPT connector setup (owner, in the ChatGPT UI)

1. Settings → Connectors → Advanced → **Developer mode** on.
2. **Create** → name `GoodGrails Seller`, URL
   `https://goodgrails-seller.tradesprior.workers.dev/mcp/s/<secret>`.
3. Authentication: **No authentication** (the secret is the URL); or OAuth once
   todo 10 is done.
4. Add the connector to a chat, then ask: *"Run seller_status, then list the
   copies that need verification."*

## Acceptance criteria

- [ ] `/mcp` returns `401` unauthenticated, `200` with the bearer token.
- [ ] `/mcp/s/<secret>` initialises and lists all ~21 tools.
- [ ] `tools/call seller_status` returns live D1 stats.
- [ ] `tools/call seller_list_inventory` returns the 64 copies.
- [ ] A full dry-run chain on one copy (comps → approve price → create listing →
      draft → export) succeeds **without** touching a live marketplace.
- [ ] No secret is ever committed; `.dev.vars` stays gitignored.

## Risks / open questions

- **Credentials:** the old repo leaked a Cloudflare API token. It must be
  revoked and a fresh one used for deploy. Do not reuse the leaked value.
- **Public exposure:** the secret path is bearer-equivalent. Treat the URL like a
  password; rotate by changing `MCP_PATH_SECRET`.
- **Stateless reconnect:** long SSE sessions are not held open; clients that
  expect persistent sessions should use JSON responses (enabled).
- **ChatGPT tool count:** ChatGPT may cap the number of tools per connector;
  if ~21 is too many, split read-only vs mutating, or fold `seller_export`
  variants into one parameterised tool (already one tool with `kind`).

## 10 todos

1. Recon + architecture decision (done).
2. Implement `src/mcp/remote.ts` (done).
3. Mount `/mcp` + `/mcp/s/:secret` with auth (done).
4. Add `MCP_PATH_SECRET` to `Env` + wrangler secret docs (done).
5. Add `seller_upload_photo` for the full chain (done).
6. Add `test/mcp.test.ts` smoke tests (done — 5 tests).
7. Update `README.md` + `docs/REMOTE-MCP-PLAN.md` (this file) (done).
8. Write `HANDOVER-CHATGPT.md` (done).
9. Commit + push `feat/remote-mcp` + open PR (pending).
10. Deploy live + rotate secrets + connect the ChatGPT connector (needs owner
    Cloudflare creds; OAuth hardening optional).
