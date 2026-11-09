#!/usr/bin/env node
/**
 * GoodGrails seller MCP server.
 *
 * Thin, authenticated bridge to the Worker admin API so an agent (opencode,
 * Hermes, Claude…) can inspect and operate the book inventory in natural
 * language.
 *
 * Env:
 *   SELLER_API_URL      default http://127.0.0.1:8787
 *   SELLER_ADMIN_TOKEN  optional; falls back to .dev.vars, then "dev-token"
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = (process.env.SELLER_API_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

async function resolveToken() {
  if (process.env.SELLER_ADMIN_TOKEN) return process.env.SELLER_ADMIN_TOKEN;
  try {
    const text = await readFile(resolve(ROOT, ".dev.vars"), "utf8");
    const m = text.match(/^ADMIN_TOKEN\s*=\s*"?([^"\n]+)"?/m);
    if (m) return m[1].trim();
  } catch {}
  return "dev-token";
}

const token = await resolveToken();

async function api(path, { method = "GET", body, raw = false } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const text = await res.text();
  if (raw) {
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    return text;
  }
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.data !== undefined ? json.data : json;
}

async function resolveCopyId(idOrSku) {
  try {
    const d = await api(`/api/admin/inventory/${encodeURIComponent(idOrSku)}`);
    if (d?.copy?.id) return d.copy.id;
  } catch {}
  const d = await api(`/api/admin/inventory?q=${encodeURIComponent(idOrSku)}&limit=50`);
  const hit = (d.copies || []).find(c => String(c.sku).toLowerCase() === String(idOrSku).toLowerCase())
    || (d.copies || []).find(c => String(c.id) === String(idOrSku));
  if (hit) return hit.id;
  throw new Error(`Copy not found: ${idOrSku}`);
}

function ok(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function fail(error) {
  return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
}

const CONDITION = z.enum(["new", "fine", "very_good", "good", "fair", "poor"]);
const STATUS = z.enum(["needs_verification", "ready", "listed", "reserved", "sold", "withdrawn"]);
const VERIFICATION = z.enum(["unverified", "bibliographic_verified", "photo_verified", "physical_verified"]);
const MARKETPLACE = z.enum(["ebay", "abebooks", "biblio", "alibris", "amazon", "direct"]);
const EVIDENCE = z.enum(["sold", "auction_hammer", "active_ask", "withdrawn_ask", "new_retail"]);

const server = new McpServer(
  { name: "goodgrails-seller", version: "1.0.0" },
  { instructions: "Operate the GoodGrails 64-book catalogue: inventory, verification, photos, pricing, listings, orders and exports. Money is always integer pence (GBP). Never treat an asking price as a sold price." }
);

server.registerTool(
  "seller_status",
  { title: "Seller status", description: "Check that the seller API is reachable and authenticated, and show catalogue stats.", inputSchema: {} },
  async () => {
    try {
      const health = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
      const overview = await api("/api/admin/overview");
      return ok({ api: API, health: health.data ?? health, stats: overview.stats, jobs: overview.jobs?.length ?? 0 });
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_list_inventory",
  {
    title: "List inventory",
    description: "Search and filter the 64 physical copies by text (title/author/SKU/ISBN), status or marketplace.",
    inputSchema: {
      q: z.string().optional().describe("Free-text search"),
      status: STATUS.optional(),
      marketplace: MARKETPLACE.optional(),
      limit: z.number().int().min(1).max(500).optional()
    }
  },
  async ({ q, status, marketplace, limit }) => {
    try {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (status) p.set("status", status);
      if (marketplace) p.set("marketplace", marketplace);
      if (limit) p.set("limit", String(limit));
      return ok(await api(`/api/admin/inventory?${p}`));
    } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_get_copy",
  {
    title: "Get copy",
    description: "Full detail for one physical copy: bibliographic data, condition, costs, comps, recommendation and listing drafts.",
    inputSchema: { id: z.string().describe("Copy id or SKU (e.g. BOOK-002)") }
  },
  async ({ id }) => {
    try { return ok(await api(`/api/admin/inventory/${encodeURIComponent(await resolveCopyId(id))}`)); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_update_copy",
  {
    title: "Update copy",
    description: "Update condition, jacket, signed flag, shelf location, verification status, overall status or notes for a copy.",
    inputSchema: {
      id: z.string(),
      condition: CONDITION.optional(),
      jacket_condition: CONDITION.optional(),
      signed: z.boolean().optional(),
      shelf_location: z.string().optional(),
      verification_status: VERIFICATION.optional(),
      status: STATUS.optional(),
      notes: z.string().optional()
    }
  },
  async ({ id, ...patch }) => {
    try { return ok(await api(`/api/admin/inventory/${encodeURIComponent(await resolveCopyId(id))}`, { method: "PATCH", body: patch })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_add_copy",
  {
    title: "Add copy",
    description: "Manually add a physical copy that is not in the seed catalogue.",
    inputSchema: {
      title: z.string(),
      author: z.string().optional(),
      isbn: z.string().optional(),
      condition: CONDITION.optional(),
      binding: z.string().optional(),
      acquisition_cost_minor: z.number().int().min(0).optional().describe("Pence"),
      notes: z.string().optional()
    }
  },
  async (input) => {
    try { return ok(await api("/api/admin/inventory", { method: "POST", body: input })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_approve_price",
  {
    title: "Approve price",
    description: "Set the owner-approved asking price (integer pence) for a copy.",
    inputSchema: {
      id: z.string(),
      price_minor: z.number().int().positive().describe("Pence, e.g. 17999 = £179.99")
    }
  },
  async ({ id, price_minor }) => {
    try { return ok(await api(`/api/admin/inventory/${encodeURIComponent(await resolveCopyId(id))}/price`, { method: "POST", body: { approved_minor: price_minor } })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_add_comps",
  {
    title: "Add market comps",
    description: "Add comparable market evidence. evidence_type must be sold, auction_hammer, active_ask, withdrawn_ask or new_retail — never label an asking price as sold.",
    inputSchema: {
      id: z.string(),
      comps: z.array(z.object({
        evidence_type: EVIDENCE,
        price_minor: z.number().int().positive(),
        source: z.string(),
        observed_at: z.string().optional(),
        url: z.string().optional(),
        notes: z.string().optional()
      })).min(1)
    }
  },
  async ({ id, comps }) => {
    try { return ok(await api(`/api/admin/inventory/${encodeURIComponent(await resolveCopyId(id))}/comps`, { method: "POST", body: { comps } })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_create_listing",
  {
    title: "Create listing draft",
    description: "Create a draft listing for a copy on a marketplace. Requires an approved price.",
    inputSchema: { id: z.string(), marketplace: MARKETPLACE, price_minor: z.number().int().positive().optional() }
  },
  async ({ id, ...body }) => {
    try { return ok(await api(`/api/admin/inventory/${encodeURIComponent(await resolveCopyId(id))}/listing`, { method: "POST", body })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_get_draft",
  { title: "Get listing drafts", description: "Per-platform listing copy for a copy.", inputSchema: { id: z.string() } },
  async ({ id }) => {
    try { return ok(await api(`/api/admin/inventory/${encodeURIComponent(await resolveCopyId(id))}/draft`)); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_list_orders",
  { title: "List orders", description: "Recent orders across all channels, with fulfilment state.", inputSchema: {} },
  async () => {
    try { return ok(await api("/api/admin/orders")); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_record_order",
  {
    title: "Record marketplace order",
    description: "Record an order from a marketplace. Reserves the copy once and queues delisting on other channels. Idempotent by marketplace + external_order_id.",
    inputSchema: {
      marketplace: MARKETPLACE,
      external_order_id: z.string(),
      sku: z.string().optional(),
      copy_id: z.string().optional(),
      price_minor: z.number().int().positive(),
      fees_minor: z.number().int().min(0).optional(),
      shipping_minor: z.number().int().min(0).optional(),
      buyer_ref: z.string().optional(),
      ordered_at: z.string().optional()
    }
  },
  async (body) => {
    try { return ok(await api("/api/admin/orders", { method: "POST", body })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_record_manual_sale",
  {
    title: "Record manual sale",
    description: "Record an offline/manual sale (e.g. Amazon Individual, in person) and mark the copy sold.",
    inputSchema: { sku: z.string(), price_minor: z.number().int().positive() }
  },
  async (body) => {
    try { return ok(await api("/api/admin/orders/manual", { method: "POST", body })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_update_order",
  {
    title: "Update fulfilment",
    description: "Advance an order: packing, dispatched, delivered, cancelled or returned. Tracking optional.",
    inputSchema: {
      id: z.string(),
      state: z.enum(["packing", "dispatched", "delivered", "cancelled", "returned"]),
      tracking: z.string().optional()
    }
  },
  async ({ id, ...body }) => {
    try { return ok(await api(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", body })); }
    catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_list_jobs",
  { title: "List sync jobs", description: "Pending cross-channel jobs (delist/reserve reconciliation).", inputSchema: {} },
  async () => {
    try { return ok(await api("/api/admin/jobs")); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_marketplaces",
  { title: "Marketplace status", description: "Which channel adapters are live, credential-gated or manual.", inputSchema: {} },
  async () => {
    try { return ok(await api("/api/admin/marketplaces")); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_import_catalogue",
  { title: "Import 64-book catalogue", description: "Idempotently import the bundled 64-copy seed catalogue.", inputSchema: {} },
  async () => {
    try { return ok(await api("/api/admin/import", { method: "POST" })); } catch (e) { return fail(e); }
  }
);

server.registerTool(
  "seller_export",
  {
    title: "Export feed",
    description: "Generate a channel feed (biblio/alibris/amazon CSV or abebooks XML). Optionally save to a path.",
    inputSchema: {
      kind: z.enum(["biblio", "alibris", "amazon", "abebooks"]),
      action: z.enum(["add", "delete"]).optional().describe("AbeBooks only"),
      save_path: z.string().optional()
    }
  },
  async ({ kind, action, save_path }) => {
    try {
      const file = kind === "abebooks" ? "abebooks.xml" : `${kind}.csv`;
      const qs = kind === "abebooks" && action === "delete" ? "?action=delete" : "";
      const text = await api(`/api/admin/export/${file}${qs}`, { raw: true });
      if (save_path) {
        await writeFile(resolve(ROOT, save_path), text);
        return ok(`Wrote ${text.length} bytes to ${save_path}`);
      }
      const preview = text.length > 8000 ? `${text.slice(0, 8000)}\n…[truncated ${text.length - 8000} bytes]` : text;
      return ok(preview);
    } catch (e) { return fail(e); }
  }
);

await server.connect(new StdioServerTransport());
