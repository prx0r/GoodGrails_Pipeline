import { Env } from '../types';
import {
  Copy,
  CopyStatus,
  EvidenceType,
  Marketplace,
  PriceRecommendation,
  SeedBook,
  SeedCatalogue,
  VerificationStatus
} from '../types/domain';
import { parseIsbn } from './isbn';
import { applyCondition, normalizeEvidenceType, recommendPrice } from './pricing';

/** Small deterministic hash so repeated imports produce identical ids. */
export function stableId(prefix: string, value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}_${h.toString(16).padStart(8, '0')}`;
}

export function normalizeKey(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const COPY_STATUSES: CopyStatus[] = [
  'draft', 'needs_verification', 'ready', 'publishing', 'active', 'reserved', 'sold', 'withdrawn', 'returned'
];
const EVIDENCE_TYPES: EvidenceType[] = ['sold', 'auction_hammer', 'active_ask', 'withdrawn_ask', 'new_retail'];

function nowIso(): string {
  return new Date().toISOString();
}

function mapStatus(seed: SeedBook): CopyStatus {
  const raw = normalizeKey(seed.inventory_status);
  if (seed.photo_status && /needed/.test(seed.photo_status)) return 'needs_verification';
  if (/sold/.test(raw)) return 'sold';
  if (/listed|live|active/.test(raw)) return 'active';
  return 'needs_verification';
}

export interface ImportReport {
  totalRecords: number;
  copiesImported: number;
  copiesSkipped: number;
  worksCreated: number;
  editionsCreated: number;
  recommendationsCreated: number;
  compsCreated: number;
  flaggedIsbns: Array<{ sku: string; isbn: string; reason: string }>;
}

export class InventoryService {
  constructor(private env: Env) {}

  // ==================== IMPORT ====================

  /**
   * Idempotent import. A copy is identified by its stable SKU; re-running this
   * never creates a second physical copy and never overwrites edits made after
   * the first import.
   */
  async importCatalogue(catalogue: SeedCatalogue): Promise<ImportReport> {
    const report: ImportReport = {
      totalRecords: catalogue.books.length,
      copiesImported: 0,
      copiesSkipped: 0,
      worksCreated: 0,
      editionsCreated: 0,
      recommendationsCreated: 0,
      compsCreated: 0,
      flaggedIsbns: []
    };

    for (const seed of catalogue.books) {
      const sku = (seed.sku || '').trim();
      if (!sku) continue;

      const existing = await this.getCopyBySku(sku);
      if (existing) {
        report.copiesSkipped++;
        continue;
      }

      const workKey = normalizeKey(`${seed.title} ${seed.author || ''}`);
      const workId = stableId('work', workKey);
      const workExists = await this.env.DB
        .prepare('SELECT id FROM works WHERE id = ?')
        .bind(workId)
        .first<{ id: string }>();
      if (!workExists) {
        const ts = nowIso();
        await this.env.DB
          .prepare('INSERT INTO works (id, title, author, sort_title, subjects, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(workId, seed.title, seed.author || null, seed.title, null, ts, ts)
          .run();
        report.worksCreated++;
      }

      const isbn = parseIsbn(seed.isbn);
      if (seed.isbn && !isbn.valid) {
        report.flaggedIsbns.push({
          sku,
          isbn: String(seed.isbn),
          reason: isbn.reason || 'invalid'
        });
      }

      const editionKey = normalizeKey(
        `${workKey} ${isbn.normalized || ''} ${seed.binding || ''} ${seed.edition || ''}`
      );
      const editionId = stableId('ed', editionKey);
      const editionExists = await this.env.DB
        .prepare('SELECT id FROM editions WHERE id = ?')
        .bind(editionId)
        .first<{ id: string }>();
      if (!editionExists) {
        const ts = nowIso();
        await this.env.DB
          .prepare(`INSERT INTO editions (
              id, work_id, isbn10, isbn13, title, author, binding, format,
              printing, bibliographic_verified, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
          .bind(
            editionId,
            workId,
            isbn.format === 'isbn10' && isbn.valid ? isbn.normalized : null,
            isbn.format === 'isbn13' && isbn.valid ? isbn.normalized : null,
            seed.title,
            seed.author || null,
            seed.binding || null,
            seed.binding || null,
            seed.edition || null,
            ts,
            ts
          )
          .run();
        report.editionsCreated++;
      }

      const copyId = stableId('copy', sku);
      const ts = nowIso();
      await this.env.DB
        .prepare(`INSERT INTO copies (
            id, sku, work_id, edition_id, condition, jacket_condition, signed,
            acquisition_source, acquisition_cost_minor, acquisition_currency,
            historical_target_minor, currency, status, verification_status,
            notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          copyId,
          sku,
          workId,
          editionId,
          seed.condition || null,
          seed.jacket_condition || null,
          seed.signed || null,
          seed.acquisition_source || null,
          seed.acquisition_cost_minor ?? null,
          seed.currency || 'GBP',
          seed.historical_target_minor ?? null,
          seed.currency || 'GBP',
          mapStatus(seed),
          'unverified',
          seed.notes || null,
          ts,
          ts
        )
        .run();
      report.copiesImported++;

      const range = applyCondition(
        recommendPrice(
          (seed.evidence || []).map(e => ({
            evidence_type: normalizeEvidenceType(e.evidence_type),
            price_minor: e.price_minor ?? 0,
            condition: e.condition
          })).filter(e => e.price_minor > 0),
          seed.price
        ),
        seed.condition
      );

      await this.env.DB
        .prepare(`INSERT INTO price_recommendations (
            id, copy_id, rule_version, quick_minor, balanced_minor, patient_minor,
            offer_floor_minor, currency, confidence, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          stableId('price', `${sku}:v1`),
          copyId,
          'v1-market-evidence',
          range.quick_minor,
          range.balanced_minor,
          range.patient_minor,
          range.offer_floor_minor,
          seed.currency || 'GBP',
          range.confidence,
          ts
        )
        .run();
      report.recommendationsCreated++;

      for (const e of seed.evidence || []) {
        const evidenceType = normalizeEvidenceType(e.evidence_type);
        if (!e.price_minor) continue;
        const compId = stableId(
          'comp',
          `${sku}|${e.url || ''}|${evidenceType}|${e.price_minor}`
        );
        await this.env.DB
          .prepare(`INSERT OR IGNORE INTO market_comps (
              id, copy_id, edition_id, source, source_url, evidence_type,
              price_minor, currency, condition, edition_match, observed_at, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            compId,
            copyId,
            editionId,
            e.source || 'unknown',
            e.url || null,
            evidenceType,
            e.price_minor,
            seed.currency || 'GBP',
            e.condition || null,
            e.edition_match || null,
            e.observed_at || new Date().toISOString().slice(0, 10),
            e.notes || null,
            ts
          )
          .run();
        report.compsCreated++;
      }

      await this.logEvent(copyId, 'imported', null, mapStatus(seed), 'import', { sku });
    }

    return report;
  }

  // ==================== COPIES ====================

  async getCopyBySku(sku: string): Promise<Copy | null> {
    const row = await this.env.DB
      .prepare('SELECT * FROM copies WHERE sku = ?')
      .bind(sku)
      .first<any>();
    return row ? row : null;
  }

  async getCopy(id: string): Promise<any | null> {
    const row = await this.env.DB
      .prepare(`
        SELECT c.*, w.title AS work_title, w.author AS work_author,
               e.title AS edition_title,                e.isbn10, e.isbn13, e.publisher,
               e.binding AS edition_binding, e.publication_year, e.printing,
               e.printing AS edition_note,
               (SELECT approved_minor FROM price_recommendations p WHERE p.copy_id = c.id AND p.approved_minor IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS approved_price_minor,
               (SELECT balanced_minor FROM price_recommendations p WHERE p.copy_id = c.id ORDER BY created_at DESC LIMIT 1) AS suggested_price_minor
        FROM copies c
        LEFT JOIN works w ON w.id = c.work_id
        LEFT JOIN editions e ON e.id = c.edition_id
        WHERE c.id = ?
      `)
      .bind(id)
      .first<any>();
    if (!row) return null;

    const [media, comps, recommendations, listings, events] = await Promise.all([
      this.env.DB.prepare('SELECT * FROM media_assets WHERE copy_id = ? ORDER BY sort_order, created_at').bind(id).all<any>(),
      this.env.DB.prepare('SELECT * FROM market_comps WHERE copy_id = ? ORDER BY observed_at DESC').bind(id).all<any>(),
      this.env.DB.prepare('SELECT * FROM price_recommendations WHERE copy_id = ? ORDER BY created_at DESC LIMIT 1').bind(id).all<any>(),
      this.env.DB.prepare('SELECT * FROM listings WHERE copy_id = ? ORDER BY marketplace').bind(id).all<any>(),
      this.env.DB.prepare('SELECT * FROM inventory_events WHERE copy_id = ? ORDER BY created_at DESC LIMIT 50').bind(id).all<any>()
    ]);

    return {
      ...row,
      media: media.results || [],
      comps: comps.results || [],
      recommendation: (recommendations.results || [])[0] || null,
      listings: listings.results || [],
      events: events.results || []
    };
  }

  async listCopies(filters: {
    q?: string;
    status?: string;
    marketplace?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ copies: any[]; total: number }> {
    const where: string[] = [];
    const params: any[] = [];
    if (filters.q) {
      where.push('(c.sku LIKE ? OR w.title LIKE ? OR w.author LIKE ? OR e.isbn13 LIKE ? OR e.isbn10 LIKE ?)');
      const q = `%${filters.q}%`;
      params.push(q, q, q, q, q);
    }
    if (filters.status && COPY_STATUSES.includes(filters.status as CopyStatus)) {
      where.push('c.status = ?');
      params.push(filters.status);
    }
    if (filters.marketplace) {
      where.push('EXISTS (SELECT 1 FROM listings l WHERE l.copy_id = c.id AND l.marketplace = ?)');
      params.push(filters.marketplace);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const totalRow = await this.env.DB
      .prepare(`SELECT COUNT(*) AS count FROM copies c
        LEFT JOIN works w ON w.id = c.work_id
        LEFT JOIN editions e ON e.id = c.edition_id ${clause}`)
      .bind(...params)
      .first<{ count: number }>();

    const rows = await this.env.DB
      .prepare(`
        SELECT c.*, w.title AS work_title, w.author AS work_author,
               e.isbn10, e.isbn13, e.publisher, e.publication_year,
               e.binding AS edition_binding, e.printing AS edition_note,
               (SELECT COUNT(*) FROM media_assets m WHERE m.copy_id = c.id) AS photo_count,
               (SELECT approved_minor FROM price_recommendations p WHERE p.copy_id = c.id ORDER BY created_at DESC LIMIT 1) AS approved_price_minor,
               (SELECT balanced_minor FROM price_recommendations p WHERE p.copy_id = c.id ORDER BY created_at DESC LIMIT 1) AS suggested_price_minor,
               (SELECT group_concat(l.marketplace) FROM listings l WHERE l.copy_id = c.id AND l.status = 'active') AS active_marketplaces
        FROM copies c
        LEFT JOIN works w ON w.id = c.work_id
        LEFT JOIN editions e ON e.id = c.edition_id
        ${clause}
        ORDER BY c.sku
        LIMIT ? OFFSET ?
      `)
      .bind(...params, limit, offset)
      .all<any>();

    return { copies: rows.results || [], total: totalRow?.count ?? 0 };
  }

  async createManualCopy(input: {
    title: string;
    author?: string;
    isbn?: string;
    condition?: string;
    binding?: string;
    acquisition_cost_minor?: number;
    notes?: string;
  }): Promise<any> {
    const countRow = await this.env.DB
      .prepare("SELECT COUNT(*) AS count FROM copies WHERE sku LIKE 'BOOK-%'")
      .first<{ count: number }>();
    let next = (countRow?.count ?? 0) + 1;
    let sku = `BOOK-${String(next).padStart(3, '0')}`;
    while (await this.getCopyBySku(sku)) {
      sku = `BOOK-${String(++next).padStart(3, '0')}`;
    }
    const catalogue: SeedCatalogue = {
      generated: nowIso(),
      source: 'manual',
      books: [{
        sku,
        title: input.title,
        author: input.author,
        isbn: input.isbn,
        condition: input.condition,
        binding: input.binding,
        acquisition_source: 'manual',
        acquisition_cost_minor: input.acquisition_cost_minor,
        currency: 'GBP',
        inventory_status: 'Check physical copy',
        photo_status: 'Photos needed',
        notes: input.notes
      }]
    };
    await this.importCatalogue(catalogue);
    const copy = await this.getCopyBySku(sku);
    return this.getCopy(copy!.id);
  }

  async updateCopy(id: string, updates: Record<string, any>, actor = 'owner'): Promise<any | null> {
    const current = await this.getCopy(id);
    if (!current) return null;

    const allowed = [
      'condition', 'jacket_condition', 'signed', 'inscriptions', 'annotations',
      'shelf_location', 'status', 'verification_status', 'notes'
    ];
    const fields: string[] = [];
    const values: any[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        let value = updates[key];
        if (key === 'status' && !COPY_STATUSES.includes(value)) {
          throw new Error(`Invalid copy status: ${value}`);
        }
        if (key === 'verification_status' && ![
          'unverified', 'bibliographic_verified', 'photo_verified', 'fully_verified'
        ].includes(value)) {
          throw new Error(`Invalid verification status: ${value}`);
        }
        if (key === 'signed' && typeof value === 'boolean') value = value ? 'yes' : 'no';
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (!fields.length) return current;
    fields.push('updated_at = ?');
    values.push(nowIso(), id);
    await this.env.DB.prepare(`UPDATE copies SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

    if (updates.status && updates.status !== current.status) {
      await this.logEvent(id, 'status_changed', current.status, updates.status, actor, null);
    }
    return this.getCopy(id);
  }

  // ==================== RECOMMENDATION ====================

  async approvePrice(
    copyId: string,
    approvedMinor: number,
    actor = 'owner'
  ): Promise<PriceRecommendation | null> {
    const current = await this.env.DB
      .prepare('SELECT * FROM price_recommendations WHERE copy_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(copyId)
      .first<any>();
    if (!current) return null;
    const ts = nowIso();
    await this.env.DB
      .prepare('UPDATE price_recommendations SET approved_minor = ?, approved_by = ?, approved_at = ? WHERE id = ?')
      .bind(approvedMinor, actor, ts, current.id)
      .run();
    await this.logEvent(copyId, 'price_approved', null, null, actor, { approved_minor: approvedMinor });
    return { ...current, approved_minor: approvedMinor, approved_by: actor, approved_at: ts };
  }

  async addComps(copyId: string, comps: Array<{
    source: string;
    source_url?: string;
    evidence_type: EvidenceType;
    price_minor: number;
    condition?: string;
    edition_match?: string;
    observed_at?: string;
    notes?: string;
  }>): Promise<number> {
    let inserted = 0;
    for (const c of comps) {
      if (!EVIDENCE_TYPES.includes(c.evidence_type)) continue;
      const id = stableId('comp', `${copyId}|${c.source_url || ''}|${c.evidence_type}|${c.price_minor}`);
      await this.env.DB
        .prepare(`INSERT OR IGNORE INTO market_comps (
          id, copy_id, source, source_url, evidence_type, price_minor, currency,
          condition, edition_match, observed_at, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?)`)
        .bind(
          id, copyId, c.source, c.source_url || null, c.evidence_type,
          c.price_minor, c.condition || null, c.edition_match || null,
          c.observed_at || new Date().toISOString().slice(0, 10),
          c.notes || null, nowIso()
        )
        .run();
      inserted++;
    }
    return inserted;
  }

  // ==================== LISTINGS ====================

  async upsertListing(input: {
    copyId: string;
    marketplace: Marketplace;
    priceMinor?: number | null;
    status?: string;
    externalId?: string | null;
    listingUrl?: string | null;
    syncState?: string | null;
    lastError?: string | null;
  }): Promise<any> {
    const existing = await this.env.DB
      .prepare('SELECT * FROM listings WHERE copy_id = ? AND marketplace = ?')
      .bind(input.copyId, input.marketplace)
      .first<any>();
    const ts = nowIso();
    if (existing) {
      await this.env.DB
        .prepare(`UPDATE listings SET price_minor = COALESCE(?, price_minor),
          status = COALESCE(?, status), external_id = COALESCE(?, external_id),
          listing_url = COALESCE(?, listing_url), sync_state = ?, last_error = ?,
          last_synced_at = ?, updated_at = ? WHERE id = ?`)
        .bind(
          input.priceMinor ?? null, input.status ?? null, input.externalId ?? null,
          input.listingUrl ?? null, input.syncState ?? null, input.lastError ?? null,
          ts, ts, existing.id
        )
        .run();
      return existing.id;
    }
    const id = stableId('listing', `${input.copyId}:${input.marketplace}`);
    await this.env.DB
      .prepare(`INSERT INTO listings (
        id, copy_id, marketplace, external_id, listing_url, price_minor, currency,
        status, sync_state, last_synced_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, input.copyId, input.marketplace, input.externalId ?? null,
        input.listingUrl ?? null, input.priceMinor ?? null, input.status ?? 'draft',
        input.syncState ?? null, ts, input.lastError ?? null, ts, ts
      )
      .run();
    return id;
  }

  // ==================== STATS ====================

  async stats(): Promise<any> {
    const [copies, byStatus, value, listings, orders, verification] = await Promise.all([
      this.env.DB.prepare('SELECT COUNT(*) AS count FROM copies').first<any>(),
      this.env.DB.prepare('SELECT status, COUNT(*) AS count FROM copies GROUP BY status').all<any>(),
      this.env.DB.prepare(`SELECT
          COALESCE(SUM(acquisition_cost_minor), 0) AS acquisition_minor,
          COALESCE(SUM(COALESCE(
            (SELECT approved_minor FROM price_recommendations p WHERE p.copy_id = c.id AND p.approved_minor IS NOT NULL ORDER BY created_at DESC LIMIT 1),
            (SELECT balanced_minor FROM price_recommendations p WHERE p.copy_id = c.id ORDER BY created_at DESC LIMIT 1)
          )), 0) AS potential_minor
        FROM copies c WHERE c.status NOT IN ('sold','withdrawn')`).first<any>(),
      this.env.DB.prepare(`SELECT marketplace, status, COUNT(*) AS count FROM listings GROUP BY marketplace, status`).all<any>(),
      this.env.DB.prepare('SELECT fulfillment_state, COUNT(*) AS count FROM marketplace_orders GROUP BY fulfillment_state').all<any>(),
      this.env.DB.prepare(`SELECT verification_status, COUNT(*) AS count FROM copies GROUP BY verification_status`).all<any>()
    ]);
    return {
      copies: copies?.count ?? 0,
      by_status: byStatus.results || [],
      value,
      listings: listings.results || [],
      orders: orders.results || [],
      verification: verification.results || []
    };
  }

  // ==================== EVENTS ====================

  async logEvent(
    copyId: string | null,
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    actor: string,
    details: unknown
  ): Promise<void> {
    await this.env.DB
      .prepare(`INSERT INTO inventory_events (id, copy_id, event_type, from_status, to_status, actor, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        stableId('evt', `${copyId}:${eventType}:${nowIso()}:${Math.random()}`),
        copyId,
        eventType,
        fromStatus,
        toStatus,
        actor,
        details ? JSON.stringify(details) : null,
        nowIso()
      )
      .run();
  }
}

export type { Copy, CopyStatus, VerificationStatus };
