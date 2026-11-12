# ChatGPT plugin / connector brief — GoodGrails seller MCP

Status: **live**. The MCP is served over Streamable HTTP and exposed through a
Cloudflare tunnel; ChatGPT (developer mode) can connect and drive the whole
bookfinder chain.

## Live endpoint

Add this as a custom connector in ChatGPT (Settings → Connectors → Advanced →
Developer mode → Create):

```
https://certain-tools-trial-uncle.trycloudflare.com/mcp?token=Zehxo9MR4rXh0o2lS1G6Y7Nmn7Mw5F
```

- Transport: **Streamable HTTP** (`POST` JSON-RPC, JSON responses, SSE supported).
- Authentication: the `token` query parameter is the shared secret. The server
  also accepts `Authorization: Bearer <token>` for standard MCP clients
  (Claude Desktop, opencode, Cursor, `mcp-remote`).
- A bare `GET /mcp` without the token returns **401**; that means the server is
  up and enforcing auth.

### Quick self-test

```bash
BASE='https://certain-tools-trial-uncle.trycloudflare.com/mcp?token=Zehxo9MR4rXh0o2lS1G6Y7Nmn7Mw5F'
curl -s -X POST "$BASE" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## What it runs on

| Piece | Where |
|---|---|
| Control plane | Cloudflare Worker `https://goodgrails-seller.tradesprior.workers.dev` (D1 + R2 + KV) |
| MCP server | `mcp/http.mjs` on `127.0.0.1:8931`, systemd `goodgrails-mcp.service` |
| Public edge | Cloudflare quick tunnel `goodgrails-mcp-tunnel.service` |
| Source of truth | `prx0r/GoodGrails_Pipeline` |

Both units are `Restart=always` and `enabled` at boot, so the MCP survives the
chat closing and a hub reboot.

## The 18 tools

Inspection: `seller_status`, `seller_list_inventory`, `seller_get_copy`,
`seller_marketplaces`, `seller_list_jobs`, `seller_list_orders`.
Verification: `seller_update_copy`, `seller_add_comps`, `seller_upload_photo`.
Pricing (owner gate): `seller_approve_price`.
Listing: `seller_create_listing`, `seller_get_draft`.
Sales/fulfilment: `seller_record_order`, `seller_record_manual_sale`,
`seller_update_order`.
Bootstrap/export: `seller_import_catalogue`, `seller_export`.

Rules the tools enforce: integer pence GBP; asking ≠ sold; publishing needs an
approved price; unknown condition/edition stays unknown.

### The chain, as a prompt

> Run `seller_status`. Then list copies with `status=needs_verification`.
> For BOOK-001: fetch it, add sold comps, propose (do not approve) a price,
> and show me the listing draft for eBay and AbeBooks. Do not record a sale.

## Where to change things (file map)

```
GoodGrails_Pipeline/
├── mcp/seller-server.mjs   ← THE tool surface. Add a tool = one
│                             server.registerTool("seller_x", {inputSchema}, fn).
│                             Shared by stdio + HTTP; do it here, once.
├── mcp/http.mjs            ← remote front-end (port, token, CORS)
├── mcp/server.mjs          ← stdio front-end (local agents)
├── src/mcp/remote.ts       ← in-Worker /mcp (stable endpoint for when the
│                             Worker can be redeployed; mirrors the same tools)
├── src/routes/inventory.ts ← the actual D1/R2 operations each tool calls
├── src/services/           ← pricing, sync, marketplaces, listing copy
├── docs/REMOTE-MCP-PLAN.md ← architecture + 10 todos
└── test/mcp.test.ts        ← endpoint smoke tests
```

To add a tool end to end:
1. Add the handler + `server.registerTool(...)` in `mcp/seller-server.mjs`.
2. (Optional, for the Worker endpoint) mirror it in `src/mcp/remote.ts`.
3. Restart `goodgrails-mcp.service` — no redeploy needed for the tunnel path.
4. Add a case to `test/mcp.test.ts` if it is security-sensitive.

## Monitoring schedule to script

Run these as cron/systemd timers; each is a single MCP `tools/call`:

| Cadence | Check | Alert on |
|---|---|---|
| Daily | `seller_status` | `health.status != healthy`, copies != 64 |
| Daily | `seller_list_jobs` | any job older than 24h |
| 6-hourly | `seller_list_inventory` + `seller_list_orders` | a `sold` copy still `listed` on another channel |
| Weekly | verify `seller_export` still builds each feed | non-200 / empty feed |
| Weekly | tunnel hostname still resolves | quick-tunnel URL changed |

Quick-tunnel URL lookup after a restart:

```bash
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /var/log/goodgrails-tunnel.log | tail -1
```

## Apps SDK / plugin manifest notes

ChatGPT now builds plugins on the Apps SDK. This MCP maps cleanly:

- `mcp` server entry → the URL above, transport `streamable_http`.
- Tool schemas come from `tools/list`; names are already `seller_*` and
  self-describing. No UI widgets are required — these are action tools.
- If you add a widget (e.g. an inventory gallery), declare a `resource` tool and
  reference it from the action tool's `_meta`.
- Keep the connector read-first: model tools that mutate (`approve_price`,
  `record_order`, `update_order`, `import_catalogue`) behind explicit user
  confirmation in the connector's tool policy.

## Auth plan

Now: a single shared `MCP_TOKEN` in the URL (or bearer). Good enough for a
private link; rotate by editing `/root/.config/goodgrails/mcp.env` and
`systemctl restart goodgrails-mcp`.

Next (hardening): put the tunnel behind **Cloudflare Access** (email allowlist)
or a **named tunnel** with a stable hostname, and/or implement OAuth 2.1 on the
Worker `/mcp` route (design in `docs/REMOTE-MCP-PLAN.md`, todo 10). Do this
before sharing the URL widely.

## Honest caveats

- **Quick-tunnel hostname rotates on restart.** The systemd unit reconnects, but
  the URL changes; re-grab it from the log and update the ChatGPT connector. A
  named tunnel (needs a Cloudflare-managed domain) fixes this permanently.
- **One shared secret, no per-user identity.** Anyone with the URL can call the
  tools, including `seller_approve_price` and `seller_record_order`. Treat the
  URL as a password.
- **The stable long-term endpoint is the Worker `/mcp`** (`feat/remote-mcp`
  branch already implements it); deploying it needs a rotated
  `CLOUDFLARE_API_TOKEN` plus `MCP_PATH_SECRET`. Until then the tunnel is the
  live path.
- **No live marketplace calls are made by this MCP.** It records orders,
  drafts and feed exports against D1/R2; it does not publish to eBay/AbeBooks
  (those adapters are credential-gated).
