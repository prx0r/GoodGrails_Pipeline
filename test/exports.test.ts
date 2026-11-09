import { describe, expect, it } from 'vitest';
import {
  buildAbeBooksXml,
  buildAlibrisFeed,
  buildAmazonManualSheet,
  buildBiblioFeed,
  ListingPayload
} from '../src/services/marketplaces';
import { buildListingDraft } from '../src/services/listingCopy';

const payload: ListingPayload = {
  sku: 'BOOK-002',
  title: 'Poems of Truth',
  author: 'Michael Dillon',
  isbn: '9780000000002',
  publisher: 'Linden Press',
  publicationYear: 1957,
  binding: 'Hardcover',
  edition: 'First edition',
  condition: 'Good (owner-stated)',
  description: 'Poems of Truth by Michael Dillon. 1957 first edition.',
  priceMinor: 69500,
  currency: 'GBP',
  quantity: 1
};

describe('marketplace exports', () => {
  it('Biblio CSV has the required leading columns', () => {
    const csv = buildBiblioFeed([payload]);
    const headers = csv.split('\r\n')[0].split(',');
    expect(headers.slice(0, 5)).toEqual(['SKU', 'Title', 'Author', 'ISBN', 'Publisher']);
    expect(csv).toContain('695.00');
  });

  it('escapes commas and quotes in CSV', () => {
    const csv = buildBiblioFeed([{ ...payload, title: 'A, "quoted" title' }]);
    expect(csv).toContain('"A, ""quoted"" title"');
  });

  it('AbeBooks XML is well-formed and a full replacement record', () => {
    const xml = buildAbeBooksXml([payload]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<vendorBookID>BOOK-002</vendorBookID>');
    expect(xml).toContain('<action>add</action>');
    expect(xml).toContain('<price>695.00</price>');
  });

  it('AbeBooks delete payload uses action delete', () => {
    const xml = buildAbeBooksXml([payload], 'delete');
    expect(xml).toContain('<action>delete</action>');
    expect(xml).not.toContain('<price>');
  });

  it('Amazon manual sheet is explicitly manual', () => {
    const csv = buildAmazonManualSheet([payload]);
    expect(csv).toContain('Create offer manually');
  });

  it('Alibris export includes price and quantity', () => {
    const csv = buildAlibrisFeed([payload]);
    expect(csv).toContain('695.00');
    expect(csv.split('\r\n')[0]).toContain('quantity');
  });
});

describe('listing drafts', () => {
  it('warns instead of inventing claims on an unverified copy', () => {
    const d = buildListingDraft({
      sku: 'BOOK-002', title: 'Poems of Truth', author: 'Michael Dillon',
      condition: 'Good', verificationStatus: 'unverified'
    });
    expect(d.warnings.join(' ')).toContain('verification incomplete');
    expect(d.description).not.toMatch(/signed|first printing|rare/i);
  });

  it('does not assert a signature unless recorded', () => {
    const d = buildListingDraft({
      sku: 'X', title: 'Book', condition: 'Good', verificationStatus: 'photo_verified'
    });
    expect(d.description).not.toContain('Signed');
  });

  it('keeps the eBay title within 80 characters', () => {
    const d = buildListingDraft({
      sku: 'X',
      title: 'A Very Long Academic Title Concerning Kashmir Shaivism And Related Tantric Traditions',
      author: 'Someone',
      edition: 'First edition',
      condition: 'Very good',
      verificationStatus: 'fully_verified'
    });
    expect(d.ebayTitle.length).toBeLessThanOrEqual(80);
  });
});
