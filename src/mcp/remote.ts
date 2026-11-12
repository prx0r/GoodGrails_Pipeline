/**
 * Remote MCP server for the GoodGrails seller, mounted inside the Worker.
 *
 * Exposes the same operations as mcp/server.mjs (the stdio bridge) but over
 * Streamable HTTP so remote agents — ChatGPT connectors/plugins, Claude, other
 * MCP clients — can drive the whole chain: verify → photograph → price →
 * list → order → export.
 *
 * Design:
 *  - Stateless: a fresh McpServer + transport per request. The tool set is
 *    static, so no session state is required (sessionIdGenerator: undefined).
 *  - Reuses the existing route handlers directly (no self-HTTP round trip).
 *    Handlers already guard themselves, so we synthesise a Request carrying
 *    the Worker's own ADMIN_TOKEN.
 *  - Auth is enforced at the edge before any MCP processing:
 *      Authorization: Bearer <ADMIN_TOKEN>   (standard MCP clients)
 *      /mcp/s/<MCP_PATH_SECRET>              (no-auth connectors such as the
 *                                             ChatGPT custom connector UI)
 *    If neither ADMIN_TOKEN nor MCP_PATH_SECRET is configured we fail closed.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { Env } from '../types';
import * as inv from '../routes/inventory';
import { getBearerToken, constantTimeEqual } from '../services/auth';

type Handler = (request: Request, env: Env, id: string) => Promise<Response>;

type CallOpts = {
  method?: string;
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  id?: string;
};

const CONDITION = z.enum(['new', 'fine', 'very_good', 'good', 'fair', 'poor']);
const STATUS = z.enum(['needs_verification', 'ready', 'listed', 'reserved', 'sold', 'withdrawn']);
const VERIFICATION = z.enum(['unverified', 'bibliographic_verified', 'photo_verified', 'physical_verified']);
const MARKETPLACE = z.enum(['ebay', 'abebooks', 'biblio', 'alibris', 'amazon', 'direct']);
const EVIDENCE = z.enum(['sold', 'auction_hammer', 'active_ask', 'withdrawn_ask', 'new_retail']);

/** Call an existing route handler with a synthesised, authenticated Request. */
async function call(env: Env, handler: Handler, opts: CallOpts): Promise<any> {
  const url = new URL(`https://mcp.internal${opts.path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${(env.ADMIN_TOKEN || '').trim()}`
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const request = new Request(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const response = opts.id !== undefined
    ? await handler(request, env, opts.id)
    : await handler(request, env, '' as string);
  const text = await response.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!response.ok) {
    throw new Error(json?.error || json?.message || `HTTP ${response.status}`);
  }
  return json.data !== undefined ? json.data : json;
}

async function resolveCopyId(env: Env, idOrSku: string): Promise<string> {
  try {
    const d = await call(env, inv.getInventoryCopy, {
      path: `/api/admin/inventory/${encodeURIComponent(idOrSku)}`
    });
    if (d?.copy?.id) return d.copy.id;
  } catch { /* fall through to search */ }
  const d = await call(env, inv.listInventory, {
    path: '/api/admin/inventory',
    query: { q: idOrSku, limit: 50 }
  });
  const copies: any[] = d.copies || [];
  const hit =
    copies.find(c => String(c.sku).toLowerCase() === idOrSku.toLowerCase()) ||
    copies.find(c => String(c.id) === idOrSku);
  if (hit) return hit.id;
  throw new Error(`Copy not found: ${idOrSku}`);
}

function ok(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

/** Build a fully-populated MCP server bound to this request's env. */
function buildServer(env: Env): McpServer {
  const server = new McpServer(
    { name: 'goodgrails-seller-remote', version: '1.0.0' },
    {
      instructions:
        'Operate the GoodGrails 64-book catalogue end to end: inventory, verification, photos, pricing, comps, listings, orders and exports. Money is always integer pence (GBP). Never treat an asking price as a sold price. Publishing requires an owner-approved price; never invent one.'
    }
  );

  server.registerTool(
    'seller_status',
    {
      title: 'Seller status',
      description: 'Check that the seller database/API is reachable and show catalogue stats.',
      inputSchema: {}
    },
    async () => {
      try {
        const overview = await call(env, inv.overview, { path: '/api/admin/overview' });
        return ok({ api: 'worker-internal', stats: overview.stats, jobs: overview.jobs?.length ?? 0 });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_list_inventory',
    {
      title: 'List inventory',
      description: 'Search and filter the 64 physical copies by text (title/author/SKU/ISBN), status or marketplace.',
      inputSchema: {
        q: z.string().optional().describe('Free-text search'),
        status: STATUS.optional(),
        marketplace: MARKETPLACE.optional(),
        limit: z.number().int().min(1).max(500).optional()
      }
    },
    async ({ q, status, marketplace, limit }) => {
      try {
        return ok(await call(env, inv.listInventory, {
          path: '/api/admin/inventory',
          query: { q, status, marketplace, limit }
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_get_copy',
    {
      title: 'Get copy',
      description: 'Full detail for one physical copy: bibliographic data, condition, costs, comps, recommendation and listing drafts.',
      inputSchema: { id: z.string().describe('Copy id or SKU (e.g. BOOK-002)') }
    },
    async ({ id }) => {
      try {
        return ok(await call(env, inv.getInventoryCopy, {
          path: `/api/admin/inventory/${encodeURIComponent(await resolveCopyId(env, id))}`
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_update_copy',
    {
      title: 'Update copy',
      description: 'Update condition, jacket, signed flag, shelf location, verification status, overall status or notes for a copy.',
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
      try {
        const copyId = await resolveCopyId(env, id);
        return ok(await call(env, inv.updateInventoryCopy, {
          method: 'PATCH',
          path: `/api/admin/inventory/${encodeURIComponent(copyId)}`,
          body: patch,
          id: copyId
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_add_copy',
    {
      title: 'Add copy',
      description: 'Manually add a physical copy that is not in the seed catalogue.',
      inputSchema: {
        title: z.string(),
        author: z.string().optional(),
        isbn: z.string().optional(),
        condition: CONDITION.optional(),
        binding: z.string().optional(),
        acquisition_cost_minor: z.number().int().min(0).optional().describe('Pence'),
        notes: z.string().optional()
      }
    },
    async (input) => {
      try {
        return ok(await call(env, inv.createInventoryCopy, {
          method: 'POST', path: '/api/admin/inventory', body: input
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_approve_price',
    {
      title: 'Approve price',
      description: 'Set the owner-approved asking price (integer pence) for a copy. This is a human/owner gate.',
      inputSchema: {
        id: z.string(),
        price_minor: z.number().int().positive().describe('Pence, e.g. 17999 = £179.99')
      }
    },
    async ({ id, price_minor }) => {
      try {
        const copyId = await resolveCopyId(env, id);
        return ok(await call(env, inv.approvePrice, {
          method: 'POST',
          path: `/api/admin/inventory/${encodeURIComponent(copyId)}/price`,
          body: { approved_minor: price_minor },
          id: copyId
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_add_comps',
    {
      title: 'Add market comps',
      description: 'Add comparable market evidence. evidence_type must be sold, auction_hammer, active_ask, withdrawn_ask or new_retail — never label an asking price as sold.',
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
      try {
        const copyId = await resolveCopyId(env, id);
        return ok(await call(env, inv.addComps, {
          method: 'POST',
          path: `/api/admin/inventory/${encodeURIComponent(copyId)}/comps`,
          body: { comps },
          id: copyId
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_upload_photo',
    {
      title: 'Upload actual-copy photo',
      description: 'Attach a photograph of the actual physical copy (front/back/spine/…). Base64 image. Marks the copy photo_verified.',
      inputSchema: {
        id: z.string(),
        kind: z.string().optional().describe('front | back | spine | copyright | other'),
        content_type: z.string().default('image/jpeg'),
        image_base64: z.string().describe('Base64-encoded image bytes (max 12MB decoded)')
      }
    },
    async ({ id, kind, content_type, image_base64 }) => {
      try {
        const copyId = await resolveCopyId(env, id);
        const bin = atob(image_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = new URL(`https://mcp.internal/api/admin/inventory/${encodeURIComponent(copyId)}/media`);
        url.searchParams.set('kind', kind || 'front');
        const request = new Request(url.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${(env.ADMIN_TOKEN || '').trim()}`,
            'Content-Type': content_type
          },
          body: bytes
        });
        const response = await inv.uploadMedia(request, env, copyId);
        const text = await response.text();
        const json = JSON.parse(text);
        if (!response.ok) throw new Error(json?.error || `HTTP ${response.status}`);
        return ok(json.data ?? json);
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_create_listing',
    {
      title: 'Create listing draft',
      description: 'Create a draft listing for a copy on a marketplace. Requires an approved price.',
      inputSchema: { id: z.string(), marketplace: MARKETPLACE, price_minor: z.number().int().positive().optional() }
    },
    async ({ id, ...body }) => {
      try {
        const copyId = await resolveCopyId(env, id);
        return ok(await call(env, inv.createListing, {
          method: 'POST',
          path: `/api/admin/inventory/${encodeURIComponent(copyId)}/listing`,
          body,
          id: copyId
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_get_draft',
    { title: 'Get listing drafts', description: 'Per-platform listing copy for a copy.', inputSchema: { id: z.string() } },
    async ({ id }) => {
      try {
        const copyId = await resolveCopyId(env, id);
        return ok(await call(env, inv.getDraft, {
          path: `/api/admin/inventory/${encodeURIComponent(copyId)}/draft`,
          id: copyId
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_list_orders',
    { title: 'List orders', description: 'Recent orders across all channels, with fulfilment state.', inputSchema: {} },
    async () => {
      try { return ok(await call(env, inv.listOrders, { path: '/api/admin/orders' })); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_record_order',
    {
      title: 'Record marketplace order',
      description: 'Record an order from a marketplace. Reserves the copy once and queues delisting on other channels. Idempotent by marketplace + external_order_id.',
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
      try { return ok(await call(env, inv.recordOrder, { method: 'POST', path: '/api/admin/orders', body })); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_record_manual_sale',
    {
      title: 'Record manual sale',
      description: 'Record an offline/manual sale (e.g. Amazon Individual, in person) and mark the copy sold.',
      inputSchema: { sku: z.string(), price_minor: z.number().int().positive() }
    },
    async (body) => {
      try { return ok(await call(env, inv.recordManualSale, { method: 'POST', path: '/api/admin/orders/manual', body })); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_update_order',
    {
      title: 'Update fulfilment',
      description: 'Advance an order: packing, dispatched, delivered, cancelled or returned. Tracking optional.',
      inputSchema: {
        id: z.string(),
        state: z.enum(['packing', 'dispatched', 'delivered', 'cancelled', 'returned']),
        tracking: z.string().optional()
      }
    },
    async ({ id, ...body }) => {
      try {
        return ok(await call(env, inv.updateOrder, {
          method: 'PATCH', path: `/api/admin/orders/${encodeURIComponent(id)}`, body, id
        }));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_list_jobs',
    { title: 'List sync jobs', description: 'Pending cross-channel jobs (delist/reserve reconciliation).', inputSchema: {} },
    async () => {
      try { return ok(await call(env, inv.listJobs, { path: '/api/admin/jobs' })); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_marketplaces',
    { title: 'Marketplace status', description: 'Which channel adapters are live, credential-gated or manual.', inputSchema: {} },
    async () => {
      try { return ok(await call(env, inv.listMarketplaces, { path: '/api/admin/marketplaces' })); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_import_catalogue',
    { title: 'Import 64-book catalogue', description: 'Idempotently import the bundled 64-copy seed catalogue.', inputSchema: {} },
    async () => {
      try { return ok(await call(env, inv.importSeed, { method: 'POST', path: '/api/admin/import' })); }
      catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'seller_export',
    {
      title: 'Export feed',
      description: 'Generate a channel feed (biblio/alibris/amazon CSV or abebooks XML). Returns the feed text.',
      inputSchema: {
        kind: z.enum(['biblio', 'alibris', 'amazon', 'abebooks']),
        action: z.enum(['add', 'delete']).optional().describe('AbeBooks only')
      }
    },
    async ({ kind, action }) => {
      try {
        const handler = kind === 'biblio' ? inv.exportBiblio
          : kind === 'alibris' ? inv.exportAlibris
          : kind === 'amazon' ? inv.exportAmazon
          : inv.exportAbeBooks;
        const path = kind === 'abebooks'
          ? `/api/admin/export/abebooks.xml${action === 'delete' ? '?action=delete' : ''}`
          : `/api/admin/export/${kind}.csv`;
        const data = await call(env, handler, { path });
        const text = typeof data === 'string' ? data : (data?.raw ?? JSON.stringify(data));
        return ok(text.length > 8000 ? `${text.slice(0, 8000)}\n…[truncated ${text.length - 8000} chars]` : text);
      } catch (e) { return fail(e); }
    }
  );

  return server;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, X-MCP-Secret',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400'
};

function unauthorized(message: string, status = 401): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

/** Edge authorisation: bearer token or the secret path segment. */
function authorize(request: Request, env: Env, pathSecret?: string): Response | null {
  const token = (env.ADMIN_TOKEN || '').trim();
  const pathKey = (env.MCP_PATH_SECRET || '').trim();
  if (!token && !pathKey) {
    return unauthorized('MCP is not configured. Set ADMIN_TOKEN or MCP_PATH_SECRET.', 503);
  }
  if (pathSecret && pathKey && constantTimeEqual(pathSecret, pathKey)) return null;

  const supplied = getBearerToken(request);
  const headerSecret = request.headers.get('X-MCP-Secret');
  if (token && supplied && constantTimeEqual(supplied, token)) return null;
  if (pathKey && headerSecret && constantTimeEqual(headerSecret, pathKey)) return null;

  if (supplied || headerSecret) return unauthorized('Invalid credentials', 403);
  return unauthorized('Authentication required', 401);
}

/**
 * Entry point for /mcp and /mcp/s/<secret>. Stateless: build a server and
 * transport per request, hand the raw Request to the transport.
 */
export async function handleMcpRequest(
  request: Request,
  env: Env,
  pathSecret?: string
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const denied = authorize(request, env, pathSecret);
  if (denied) return denied;

  try {
    const server = buildServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    for (const [k, v] of Object.entries(CORS)) response.headers.set(k, v);
    return response;
  } catch (error) {
    console.error('MCP error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'MCP error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
}
