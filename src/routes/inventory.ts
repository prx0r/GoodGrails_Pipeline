import { Env } from '../types';
import catalogue from '../data/catalogue.json';
import { SeedCatalogue, Marketplace } from '../types/domain';
import { InventoryService } from '../services/inventory';
import { SyncService } from '../services/sync';
import { buildListingDraft } from '../services/listingCopy';
import {
  ADAPTERS,
  buildAbeBooksXml,
  buildAlibrisFeed,
  buildAmazonManualSheet,
  buildBiblioFeed,
  ListingPayload,
  marketplaceStatuses
} from '../services/marketplaces';
import { requireAdmin } from '../services/auth';
import {
  errorResponse,
  handleError,
  parseJSON,
  successResponse
} from '../utils/helpers';

function guard(request: Request, env: Env): Response | null {
  return requireAdmin(request, env);
}

function rowToPayload(copy: any, description: string): ListingPayload {
  return {
    sku: copy.sku,
    title: copy.work_title || copy.title || '',
    author: copy.work_author || copy.author || null,
    isbn: copy.isbn13 || copy.isbn10 || null,
    publisher: copy.publisher || null,
    publicationYear: copy.publication_year || null,
    binding: copy.edition_binding || copy.binding || null,
    edition: copy.printing || copy.edition_note || null,
    condition: copy.condition || null,
    description,
    priceMinor: copy.approved_price_minor ?? copy.suggested_price_minor ?? 0,
    currency: copy.currency || 'GBP',
    quantity: 1,
    photos: []
  };
}

async function allCopiesWithDetail(env: Env): Promise<any[]> {
  const inv = new InventoryService(env);
  const { copies } = await inv.listCopies({ limit: 500 });
  return copies;
}

function draftFor(copy: any) {
  return buildListingDraft({
    sku: copy.sku,
    title: copy.work_title || copy.title || '',
    author: copy.work_author || copy.author,
    isbn: copy.isbn13 || copy.isbn10,
    publisher: copy.publisher,
    publicationYear: copy.publication_year,
    binding: copy.edition_binding || copy.binding,
    edition: copy.printing || copy.edition_note,
    condition: copy.condition,
    jacketCondition: copy.jacket_condition,
    signed: copy.signed,
    notes: copy.notes,
    verificationStatus: copy.verification_status,
    priceMinor: copy.approved_price_minor ?? copy.suggested_price_minor
  });
}

// ==================== OVERVIEW ====================

export async function overview(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const inv = new InventoryService(env);
    const [stats, jobs] = await Promise.all([inv.stats(), new SyncService(env).pendingJobs()]);
    return successResponse({
      stats,
      jobs,
      marketplaces: marketplaceStatuses(env),
      catalogue: {
        records: (catalogue as SeedCatalogue).books.length,
        generated: (catalogue as SeedCatalogue).generated,
        source: (catalogue as SeedCatalogue).source
      }
    });
  } catch (error) {
    return handleError(error);
  }
}

// ==================== INVENTORY ====================

export async function listInventory(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const inv = new InventoryService(env);
    const result = await inv.listCopies({
      q: url.searchParams.get('q') || undefined,
      status: url.searchParams.get('status') || undefined,
      marketplace: url.searchParams.get('marketplace') || undefined,
      limit: Number(url.searchParams.get('limit') || 200),
      offset: Number(url.searchParams.get('offset') || 0)
    });
    return successResponse(result);
  } catch (error) {
    return handleError(error);
  }
}

export async function getInventoryCopy(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const inv = new InventoryService(env);
    const copy = await inv.getCopy(id);
    if (!copy) return errorResponse('Copy not found', 404);
    return successResponse({ copy, draft: draftFor(copy) });
  } catch (error) {
    return handleError(error);
  }
}

export async function createInventoryCopy(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<any>(request);
    if (!body.title) return errorResponse('title is required', 400);
    const inv = new InventoryService(env);
    const copy = await inv.createManualCopy({
      title: body.title,
      author: body.author,
      isbn: body.isbn,
      condition: body.condition,
      binding: body.binding,
      acquisition_cost_minor: body.acquisition_cost_minor,
      notes: body.notes
    });
    return successResponse({ copy }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function updateInventoryCopy(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<any>(request);
    const inv = new InventoryService(env);
    const copy = await inv.updateCopy(id, body);
    if (!copy) return errorResponse('Copy not found', 404);
    return successResponse({ copy, draft: draftFor(copy) });
  } catch (error) {
    return handleError(error);
  }
}

export async function approvePrice(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<{ approved_minor?: number }>(request);
    if (!body.approved_minor || body.approved_minor <= 0) {
      return errorResponse('approved_minor (integer pence) is required', 400);
    }
    const inv = new InventoryService(env);
    const rec = await inv.approvePrice(id, body.approved_minor);
    if (!rec) return errorResponse('No price recommendation for this copy', 404);
    return successResponse({ recommendation: rec });
  } catch (error) {
    return handleError(error);
  }
}

export async function addComps(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<{ comps?: any[] }>(request);
    if (!Array.isArray(body.comps) || body.comps.length === 0) {
      return errorResponse('comps array is required', 400);
    }
    for (const c of body.comps) {
      if (!['sold', 'auction_hammer', 'active_ask', 'withdrawn_ask', 'new_retail'].includes(c.evidence_type)) {
        return errorResponse(`Invalid evidence_type: ${c.evidence_type}`, 400);
      }
      if (!c.source || !Number.isInteger(c.price_minor) || c.price_minor <= 0) {
        return errorResponse('Each comp needs source and positive integer price_minor', 400);
      }
    }
    const inv = new InventoryService(env);
    const inserted = await inv.addComps(id, body.comps as any);
    const copy = await inv.getCopy(id);
    return successResponse({ inserted, copy });
  } catch (error) {
    return handleError(error);
  }
}

export async function uploadMedia(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const inv = new InventoryService(env);
    const copy = await inv.getCopy(id);
    if (!copy) return errorResponse('Copy not found', 404);

    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') || 'front';
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) return errorResponse('Only image uploads are accepted', 415);

    const data = await request.arrayBuffer();
    if (data.byteLength === 0) return errorResponse('Empty upload', 400);
    if (data.byteLength > 12 * 1024 * 1024) return errorResponse('Image exceeds 12MB', 413);

    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const key = `copies/${id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await env.ASSETS.put(key, data, { httpMetadata: { contentType } });

    await env.DB
      .prepare(`INSERT INTO media_assets (id, copy_id, kind, r2_key, content_type, bytes, sort_order, provenance, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'operator upload of actual physical copy', ?)`)
      .bind(crypto.randomUUID(), id, kind, key, contentType, data.byteLength, new Date().toISOString())
      .run();

    if (copy.verification_status === 'unverified' || copy.verification_status === 'bibliographic_verified') {
      await inv.updateCopy(id, { verification_status: 'photo_verified' });
    }
    return successResponse({ key, url: `/media/${key}` }, 201);
  } catch (error) {
    return handleError(error);
  }
}

// ==================== IMPORT ====================

export async function importSeed(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const inv = new InventoryService(env);
    const report = await inv.importCatalogue(catalogue as SeedCatalogue);
    return successResponse({ report });
  } catch (error) {
    return handleError(error);
  }
}

// ==================== DRAFTS / EXPORTS ====================

export async function getDraft(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const inv = new InventoryService(env);
    const copy = await inv.getCopy(id);
    if (!copy) return errorResponse('Copy not found', 404);
    return successResponse({
      copy,
      draft: draftFor(copy),
      platforms: {
        ebay: draftFor(copy),
        abebooks: draftFor(copy).description,
        biblio: draftFor(copy).description,
        amazon: draftFor(copy).amazonConditionNote
      }
    });
  } catch (error) {
    return handleError(error);
  }
}

async function buildExportPayloads(env: Env): Promise<ListingPayload[]> {
  const copies = await allCopiesWithDetail(env);
  // Publishing always passes the human price-approval gate. Suggested prices
  // alone must never reach a live channel feed.
  const publishable = copies.filter(c =>
    c.approved_price_minor != null || c.status === 'listed' || c.status === 'ready'
  );
  return publishable.map(c => rowToPayload(c, draftFor(c).description));
}

export async function exportBiblio(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const csv = buildBiblioFeed(await buildExportPayloads(env));
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="biblio-feed.csv"' }
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function exportAlibris(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const csv = buildAlibrisFeed(await buildExportPayloads(env));
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="alibris-feed.csv"' }
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function exportAmazon(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const csv = buildAmazonManualSheet(await buildExportPayloads(env));
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="amazon-manual-offers.csv"' }
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function exportAbeBooks(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') === 'delete' ? 'delete' : 'add';
    const xml = buildAbeBooksXml(await buildExportPayloads(env), action);
    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="abebooks-inventory.xml"' }
    });
  } catch (error) {
    return handleError(error);
  }
}

// ==================== LISTINGS ====================

export async function listMarketplaces(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  return successResponse({ adapters: marketplaceStatuses(env), raw: Object.values(ADAPTERS) });
}

export async function createListing(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<{ marketplace: Marketplace; price_minor?: number }>(request);
    if (!body.marketplace) return errorResponse('marketplace is required', 400);
    if (!ADAPTERS[body.marketplace]) return errorResponse('Unknown marketplace', 400);
    const inv = new InventoryService(env);
    const copy = await inv.getCopy(id);
    if (!copy) return errorResponse('Copy not found', 404);
    if (copy.status === 'sold') return errorResponse('Copy is sold', 409);
    const price = body.price_minor ?? copy.approved_price_minor ?? copy.recommendation?.approved_minor;
    if (!price) {
      return errorResponse('Approve a price before creating a listing', 409);
    }
    const listingId = await inv.upsertListing({
      copyId: id,
      marketplace: body.marketplace,
      priceMinor: price,
      status: 'draft',
      syncState: 'awaiting_owner_publish_approval'
    });
    await inv.updateCopy(id, { status: 'ready' });
    return successResponse({ listingId }, 201);
  } catch (error) {
    return handleError(error);
  }
}

// ==================== ORDERS / JOBS ====================

export async function listOrders(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const rows = await env.DB
      .prepare(`SELECT o.*, c.sku, w.title, w.author
        FROM marketplace_orders o
        LEFT JOIN copies c ON c.id = o.copy_id
        LEFT JOIN works w ON w.id = c.work_id
        ORDER BY o.ordered_at DESC LIMIT 200`)
      .all<any>();
    return successResponse({ orders: rows.results || [] });
  } catch (error) {
    return handleError(error);
  }
}

export async function recordOrder(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<any>(request);
    if (!body.marketplace || !body.external_order_id || !Number.isInteger(body.price_minor)) {
      return errorResponse('marketplace, external_order_id and integer price_minor are required', 400);
    }
    const result = await new SyncService(env).recordOrder({
      marketplace: body.marketplace,
      externalOrderId: body.external_order_id,
      sku: body.sku,
      copyId: body.copy_id,
      priceMinor: body.price_minor,
      feesMinor: body.fees_minor,
      shippingMinor: body.shipping_minor,
      buyerRef: body.buyer_ref,
      orderedAt: body.ordered_at
    });
    return successResponse({ result }, result.conflict ? 409 : 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function recordManualSale(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<{ sku?: string; price_minor?: number }>(request);
    if (!body.sku || !Number.isInteger(body.price_minor)) {
      return errorResponse('sku and integer price_minor are required', 400);
    }
    const result = await new SyncService(env).recordManualSale(body.sku, body.price_minor!);
    return successResponse({ result }, result.conflict ? 409 : 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function updateOrder(request: Request, env: Env, id: string): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const body = await parseJSON<any>(request);
    const allowed = ['packing', 'dispatched', 'delivered', 'cancelled', 'returned'];
    if (!allowed.includes(body.state)) return errorResponse(`state must be one of ${allowed.join(', ')}`, 400);
    await new SyncService(env).updateFulfillment(id, body.state, body.tracking);
    return successResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function listJobs(request: Request, env: Env): Promise<Response> {
  const denied = guard(request, env); if (denied) return denied;
  try {
    const jobs = await new SyncService(env).pendingJobs();
    return successResponse({ jobs });
  } catch (error) {
    return handleError(error);
  }
}
