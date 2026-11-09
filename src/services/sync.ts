import { Env } from '../types';
import { Marketplace } from '../types/domain';
import { InventoryService, stableId } from './inventory';

/**
 * Cross-marketplace one-copy synchronisation.
 *
 * A copy may be listed on several venues but can only sell once. Orders are
 * deduplicated by (marketplace, external_order_id); the first order reserves
 * the copy and queues quantity-zero/withdraw jobs for every *other* active
 * listing. Remote transactions are not atomic, so unresolved reads are
 * surfaced as needs_attention rather than pretending success.
 */

export interface RecordOrderInput {
  marketplace: Marketplace;
  externalOrderId: string;
  sku?: string;
  copyId?: string;
  priceMinor: number;
  currency?: string;
  feesMinor?: number | null;
  shippingMinor?: number | null;
  buyerRef?: string | null;
  tracking?: string | null;
  orderedAt?: string;
}

export interface RecordOrderResult {
  duplicate: boolean;
  orderId: string | null;
  copyId: string | null;
  reserved: boolean;
  conflict: boolean;
  queuedWithdrawals: number;
  message: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class SyncService {
  private inventory: InventoryService;
  constructor(private env: Env) {
    this.inventory = new InventoryService(env);
  }

  async recordOrder(input: RecordOrderInput): Promise<RecordOrderResult> {
    const existing = await this.env.DB
      .prepare('SELECT * FROM marketplace_orders WHERE marketplace = ? AND external_order_id = ?')
      .bind(input.marketplace, input.externalOrderId)
      .first<any>();
    if (existing) {
      return {
        duplicate: true,
        orderId: existing.id,
        copyId: existing.copy_id,
        reserved: false,
        conflict: false,
        queuedWithdrawals: 0,
        message: 'Duplicate order event ignored'
      };
    }

    let copyId = input.copyId || null;
    if (!copyId && input.sku) {
      const copy = await this.inventory.getCopyBySku(input.sku);
      copyId = copy?.id ?? null;
    }

    const orderId = stableId('ord', `${input.marketplace}:${input.externalOrderId}`);
    const ts = nowIso();
    const net =
      input.priceMinor - (input.feesMinor ?? 0) - (input.shippingMinor ?? 0);

    await this.env.DB
      .prepare(`INSERT INTO marketplace_orders (
        id, marketplace, external_order_id, copy_id, sku, price_minor, currency,
        fees_minor, shipping_minor, net_minor, buyer_ref, fulfillment_state,
        tracking, ordered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?)`)
      .bind(
        orderId, input.marketplace, input.externalOrderId, copyId, input.sku ?? null,
        input.priceMinor, input.currency || 'GBP', input.feesMinor ?? null,
        input.shippingMinor ?? null, net, input.buyerRef ?? null,
        input.tracking ?? null, input.orderedAt || ts, ts, ts
      )
      .run();

    if (!copyId) {
      return {
        duplicate: false,
        orderId,
        copyId: null,
        reserved: false,
        conflict: false,
        queuedWithdrawals: 0,
        message: 'Order recorded but SKU could not be matched to a copy — reconcile manually'
      };
    }

    const reservation = await this.env.DB
      .prepare(`UPDATE copies SET status = 'reserved', updated_at = ?
        WHERE id = ? AND status NOT IN ('sold','reserved','withdrawn')`)
      .bind(ts, copyId)
      .run();

    const changes = (reservation as any)?.meta?.changes ?? 0;
    const copy = await this.inventory.getCopy(copyId);
    const conflict = changes === 0;

    if (conflict) {
      await this.env.DB
        .prepare(`UPDATE sync_jobs SET state = 'needs_attention', last_error = ?, updated_at = ?
          WHERE copy_id = ?`)
        .bind('SIMULTANEOUS ORDER: copy already reserved/sold', ts, copyId)
        .run();
      await this.inventory.logEvent(copyId, 'simultaneous_order', copy?.status ?? null, null, input.marketplace, {
        orderId: input.externalOrderId
      });
      return {
        duplicate: false,
        orderId,
        copyId,
        reserved: false,
        conflict: true,
        queuedWithdrawals: 0,
        message: `ALERT: ${copy?.sku ?? copyId} was already reserved/sold. Resolve the oversell before dispatch.`
      };
    }

    await this.env.DB
      .prepare(`UPDATE marketplace_orders SET fulfillment_state = 'reserved', updated_at = ? WHERE id = ?`)
      .bind(ts, orderId)
      .run();
    await this.inventory.logEvent(copyId, 'order_reserved', copy?.status ?? null, 'reserved', input.marketplace, {
      orderId: input.externalOrderId
    });

    const queued = await this.queueWithdrawals(copyId, input.marketplace, input.externalOrderId);

    return {
      duplicate: false,
      orderId,
      copyId,
      reserved: true,
      conflict: false,
      queuedWithdrawals: queued,
      message: `Reserved ${copy?.sku ?? copyId}; queued ${queued} withdrawal(s)`
    };
  }

  /** Queue withdraw jobs for every active listing on other marketplaces. */
  async queueWithdrawals(copyId: string, soldMarketplace: Marketplace, orderRef: string): Promise<number> {
    const others = await this.env.DB
      .prepare(`SELECT * FROM listings WHERE copy_id = ? AND marketplace != ? AND status IN ('active','publishing','paused')`)
      .bind(copyId, soldMarketplace)
      .all<any>();

    let queued = 0;
    for (const listing of others.results || []) {
      const key = `withdraw:${copyId}:${listing.marketplace}:${orderRef}`;
      const res = await this.env.DB
        .prepare(`INSERT OR IGNORE INTO sync_jobs (
          id, copy_id, action, marketplace, idempotency_key, state, payload, created_at, updated_at
        ) VALUES (?, ?, 'withdraw', ?, ?, 'queued', ?, ?, ?)`)
        .bind(
          stableId('job', key), copyId, listing.marketplace, key,
          JSON.stringify({ listingId: listing.id, externalId: listing.external_id }),
          nowIso(), nowIso()
        )
        .run();
      if (((res as any)?.meta?.changes ?? 0) > 0) queued++;
    }
    return queued;
  }

  /** Mark a copy sold and record the sale proceeds. */
  async markSold(copyId: string, actor = 'owner'): Promise<void> {
    const ts = nowIso();
    await this.env.DB
      .prepare(`UPDATE copies SET status = 'sold', updated_at = ? WHERE id = ?`)
      .bind(ts, copyId)
      .run();
    await this.env.DB
      .prepare(`UPDATE listings SET status = 'withdrawn', updated_at = ? WHERE copy_id = ?`)
      .bind(ts, copyId)
      .run();
    await this.inventory.logEvent(copyId, 'marked_sold', null, 'sold', actor, null);
  }

  /** A manual/in-person sale still locks the copy across all channels. */
  async recordManualSale(sku: string, priceMinor: number): Promise<RecordOrderResult> {
    return this.recordOrder({
      marketplace: 'manual',
      externalOrderId: `manual-${Date.now()}`,
      sku,
      priceMinor,
      currency: 'GBP'
    });
  }

  async updateFulfillment(
    orderId: string,
    state: 'packing' | 'dispatched' | 'delivered' | 'cancelled' | 'returned',
    tracking?: string
  ): Promise<void> {
    const ts = nowIso();
    await this.env.DB
      .prepare(`UPDATE marketplace_orders SET fulfillment_state = ?, tracking = COALESCE(?, tracking), updated_at = ? WHERE id = ?`)
      .bind(state, tracking ?? null, ts, orderId)
      .run();
    if (state === 'returned') {
      const order = await this.env.DB
        .prepare('SELECT copy_id FROM marketplace_orders WHERE id = ?')
        .bind(orderId)
        .first<{ copy_id: string }>();
      if (order?.copy_id) {
        // Never silently relist an uninspected return.
        await this.env.DB
          .prepare(`UPDATE copies SET status = 'needs_verification', updated_at = ? WHERE id = ?`)
          .bind(ts, order.copy_id)
          .run();
        await this.inventory.logEvent(order.copy_id, 'returned_needs_inspection', 'reserved', 'needs_verification', 'owner', { orderId });
      }
    }
  }

  async pendingJobs(): Promise<any[]> {
    const rows = await this.env.DB
      .prepare(`SELECT * FROM sync_jobs WHERE state IN ('queued','failed','needs_attention') ORDER BY created_at`)
      .all<any>();
    return rows.results || [];
  }
}
