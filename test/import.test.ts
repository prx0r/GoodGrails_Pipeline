import { afterEach, describe, expect, it } from 'vitest';
import catalogue from '../src/data/catalogue.json';
import { SeedCatalogue } from '../src/types/domain';
import { InventoryService } from '../src/services/inventory';
import { FakeD1, createTestEnv } from './fakeD1';

const seed = catalogue as unknown as SeedCatalogue;
let db: FakeD1 | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function env() {
  const e = createTestEnv();
  db = e.DB as FakeD1;
  return e;
}

describe('64-copy catalogue import', () => {
  it('imports exactly 64 physical copies', async () => {
    const e = env();
    const inv = new InventoryService(e);
    const report = await inv.importCatalogue(seed);
    expect(report.totalRecords).toBe(64);
    expect(report.copiesImported).toBe(64);

    const count = await e.DB.prepare('SELECT COUNT(*) AS c FROM copies').first<{ c: number }>();
    expect(count!.c).toBe(64);
  });

  it('is idempotent — re-import creates zero duplicates', async () => {
    const e = env();
    const inv = new InventoryService(e);
    await inv.importCatalogue(seed);
    const second = await inv.importCatalogue(seed);
    expect(second.copiesImported).toBe(0);
    expect(second.copiesSkipped).toBe(64);
    const count = await e.DB.prepare('SELECT COUNT(*) AS c FROM copies').first<{ c: number }>();
    expect(count!.c).toBe(64);
  });

  it('allows two physical copies that share an ISBN', async () => {
    const e = env();
    const inv = new InventoryService(e);
    await inv.importCatalogue({
      generated: 'test', source: 'test', books: [
        { sku: 'T-1', title: 'The Bardo Guidebook', author: 'A', isbn: '9781559391234' },
        { sku: 'T-2', title: 'The Bardo Guidebook', author: 'A', isbn: '9781559391234' }
      ]
    });
    const count = await e.DB.prepare("SELECT COUNT(*) AS c FROM copies WHERE sku LIKE 'T-%'").first<{ c: number }>();
    expect(count!.c).toBe(2);
  });

  it('inventories books without an ISBN', async () => {
    const e = env();
    const inv = new InventoryService(e);
    await inv.importCatalogue({ generated: 'test', source: 'test', books: [
      { sku: 'N-1', title: 'No ISBN Book' }
    ] });
    const copy = await inv.getCopyBySku('N-1');
    expect(copy).not.toBeNull();
    const edition = await e.DB.prepare('SELECT isbn10, isbn13 FROM editions WHERE id = ?').bind((copy as any).edition_id).first<any>();
    expect(edition.isbn10).toBeNull();
    expect(edition.isbn13).toBeNull();
  });

  it('preserves historical cost and target separately from the recommendation', async () => {
    const e = env();
    const inv = new InventoryService(e);
    await inv.importCatalogue(seed);
    const copy = await inv.getCopyBySku('BOOK-046') as any;
    const detail = await inv.getCopy(copy.id);
    expect(detail.acquisition_cost_minor).toBe(3400);
    expect(detail.historical_target_minor).toBe(16500);
    expect(detail.recommendation.balanced_minor).not.toBe(16500);
  });

  it('flags invalid ISBNs instead of trusting them', async () => {
    const e = env();
    const inv = new InventoryService(e);
    const report = await inv.importCatalogue({
      generated: 'test', source: 'test', books: [
        { sku: 'BAD-1', title: 'Bad checksum', isbn: '9781591021026' }
      ]
    });
    expect(report.flaggedIsbns.length).toBe(1);
    expect(report.flaggedIsbns[0].reason).toContain('checksum');
  });

  it('keeps multivolume sets as one sellable unit', async () => {
    const e = env();
    const inv = new InventoryService(e);
    await inv.importCatalogue(seed);
    const row = await inv.getCopyBySku('BOOK-004') as any;
    const copy = await inv.getCopy(row.id);
    expect(copy.work_title).toContain('Volumes 1-3');
  });
});
