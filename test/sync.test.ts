import { afterEach, describe, expect, it } from 'vitest';
import catalogue from '../src/data/catalogue.json';
import { SeedCatalogue } from '../src/types/domain';
import { InventoryService } from '../src/services/inventory';
import { SyncService } from '../src/services/sync';
import { FakeD1, createTestEnv } from './fakeD1';

const seed = catalogue as unknown as SeedCatalogue;
let db: FakeD1 | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

async function setup() {
  const e = createTestEnv();
  db = e.DB as FakeD1;
  const inv = new InventoryService(e);
  await inv.importCatalogue(seed);
  const copy = await inv.getCopyBySku('BOOK-001') as any;
  await inv.upsertListing({ copyId: copy.id, marketplace: 'ebay', priceMinor: 999, status: 'active' });
  await inv.upsertListing({ copyId: copy.id, marketplace: 'abebooks', priceMinor: 1099, status: 'active' });
  return { e, inv, copy };
}

describe('cross-marketplace synchronisation', () => {
  it('reserves the copy once and queues withdrawal elsewhere', async () => {
    const { e, copy } = await setup();
    const sync = new SyncService(e);
    const res = await sync.recordOrder({
      marketplace: 'ebay',
      externalOrderId: 'EBAY-1',
      sku: 'BOOK-001',
      priceMinor: 999
    });
    expect(res.reserved).toBe(true);
    expect(res.queuedWithdrawals).toBe(1);
    const copyRow = await e.DB.prepare('SELECT status FROM copies WHERE id = ?').bind(copy.id).first<any>();
    expect(copyRow.status).toBe('reserved');
    const job = await e.DB.prepare("SELECT * FROM sync_jobs WHERE action = 'withdraw'").first<any>();
    expect(job.marketplace).toBe('abebooks');
  });

  it('ignores duplicate order events', async () => {
    const { e } = await setup();
    const sync = new SyncService(e);
    await sync.recordOrder({ marketplace: 'ebay', externalOrderId: 'EBAY-1', sku: 'BOOK-001', priceMinor: 999 });
    const second = await sync.recordOrder({ marketplace: 'ebay', externalOrderId: 'EBAY-1', sku: 'BOOK-001', priceMinor: 999 });
    expect(second.duplicate).toBe(true);
    const orders = await e.DB.prepare('SELECT COUNT(*) AS c FROM marketplace_orders').first<{ c: number }>();
    expect(orders!.c).toBe(1);
  });

  it('alerts on simultaneous sales of the same copy', async () => {
    const { e } = await setup();
    const sync = new SyncService(e);
    await sync.recordOrder({ marketplace: 'ebay', externalOrderId: 'EBAY-1', sku: 'BOOK-001', priceMinor: 999 });
    const conflict = await sync.recordOrder({ marketplace: 'abebooks', externalOrderId: 'ABE-1', sku: 'BOOK-001', priceMinor: 999 });
    expect(conflict.conflict).toBe(true);
    expect(conflict.message).toContain('ALERT');
    const soldCount = await e.DB.prepare("SELECT COUNT(*) AS c FROM copies WHERE status = 'sold'").first<{ c: number }>();
    expect(soldCount!.c).toBe(0);
  });

  it('does not silently relist a returned copy', async () => {
    const { e, copy } = await setup();
    const sync = new SyncService(e);
    const order = await sync.recordOrder({ marketplace: 'ebay', externalOrderId: 'EBAY-1', sku: 'BOOK-001', priceMinor: 999 });
    await sync.updateFulfillment(order.orderId!, 'returned');
    const row = await e.DB.prepare('SELECT status FROM copies WHERE id = ?').bind(copy.id).first<any>();
    expect(row.status).toBe('needs_verification');
  });

  it('records a manual sale and locks the copy', async () => {
    const { e, copy } = await setup();
    const sync = new SyncService(e);
    const res = await sync.recordManualSale('BOOK-001', 1200);
    expect(res.reserved).toBe(true);
    const row = await e.DB.prepare('SELECT status FROM copies WHERE id = ?').bind(copy.id).first<any>();
    expect(row.status).toBe('reserved');
  });
});
