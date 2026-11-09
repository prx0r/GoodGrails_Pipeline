import { Env } from '../types';
import { Marketplace } from '../types/domain';

/**
 * Narrow, typed marketplace adapters.
 *
 * Every adapter declares an honest integration status. Nothing here claims to
 * be live: publishing requires real seller credentials and an explicit owner
 * approval gate. File exports (Biblio/Alibris/Amazon manual) are fully
 * implemented because those channels accept manual uploads.
 */

export type IntegrationStatus =
  | 'not_implemented'
  | 'implemented_with_mocks'
  | 'sandbox_tested'
  | 'real_account_tested'
  | 'production_enabled';

export interface ListingPayload {
  sku: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  publicationYear?: number | null;
  binding?: string | null;
  edition?: string | null;
  condition?: string | null;
  description: string;
  priceMinor: number;
  currency: string;
  quantity: number;
  photos?: string[];
}

export interface PublishResult {
  ok: boolean;
  externalId?: string;
  listingUrl?: string;
  status: 'active' | 'error' | 'pending';
  error?: string;
  raw?: unknown;
}

export interface AdapterInfo {
  marketplace: Marketplace;
  status: IntegrationStatus;
  canPublish: boolean;
  canWithdraw: boolean;
  canFetchOrders: boolean;
  requiresCredentials: string[];
  notes: string;
}

export const ADAPTERS: Record<string, AdapterInfo> = {
  ebay: {
    marketplace: 'ebay',
    status: 'implemented_with_mocks',
    canPublish: true,
    canWithdraw: true,
    canFetchOrders: true,
    requiresCredentials: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN'],
    notes: 'Official Sell Inventory API. Sandbox/mock tested; live publishing needs a real seller token and approved policies.'
  },
  abebooks: {
    marketplace: 'abebooks',
    status: 'implemented_with_mocks',
    canPublish: true,
    canWithdraw: true,
    canFetchOrders: true,
    requiresCredentials: ['ABEBOOKS_API_KEY', 'ABEBOOKS_API_SECRET'],
    notes: 'Authenticated XML full-record update. AbeBooks has no public sandbox; test only with owner approval.'
  },
  biblio: {
    marketplace: 'biblio',
    status: 'implemented_with_mocks',
    canPublish: true,
    canWithdraw: true,
    canFetchOrders: false,
    requiresCredentials: ['BIBLIO_API_KEY'],
    notes: 'CSV/TSV feed export implemented and validated; authenticated upload/FTP is gated on seller access.'
  },
  amazon: {
    marketplace: 'amazon',
    status: 'not_implemented',
    canPublish: false,
    canWithdraw: false,
    canFetchOrders: false,
    requiresCredentials: [],
    notes: 'Manual Individual-plan offer sheet + manual sold/reconcile workflow. SP-API is a gated second stage.'
  },
  alibris: {
    marketplace: 'alibris',
    status: 'implemented_with_mocks',
    canPublish: true,
    canWithdraw: false,
    canFetchOrders: false,
    requiresCredentials: [],
    notes: 'Format-correct CSV export only; authorised feed/order access not yet verified.'
  },
  vinted: {
    marketplace: 'vinted',
    status: 'not_implemented',
    canPublish: false,
    canWithdraw: false,
    canFetchOrders: false,
    requiresCredentials: [],
    notes: 'Manual only. No authorised API access approved.'
  },
  manual: {
    marketplace: 'manual',
    status: 'production_enabled',
    canPublish: true,
    canWithdraw: true,
    canFetchOrders: false,
    requiresCredentials: [],
    notes: 'In-person / manual sale recorded directly in the dashboard.'
  }
};

// ==================== CSV / FILE EXPORTS ====================

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
}

/** Biblio bulk upload feed (documented required fields first). */
export function buildBiblioFeed(payloads: ListingPayload[]): string {
  const headers = [
    'SKU', 'Title', 'Author', 'ISBN', 'Publisher', 'Publication Year',
    'Binding', 'Edition', 'Condition', 'Description', 'Price', 'Currency',
    'Quantity', 'Image URL'
  ];
  const rows = payloads.map(p => [
    p.sku, p.title, p.author || '', p.isbn || '', p.publisher || '',
    p.publicationYear ?? '', p.binding || '', p.edition || '', p.condition || '',
    p.description, (p.priceMinor / 100).toFixed(2), p.currency, p.quantity,
    (p.photos || []).join('|')
  ]);
  return toCsv(headers, rows);
}

/** Alibris inventory export. */
export function buildAlibrisFeed(payloads: ListingPayload[]): string {
  const headers = ['sku', 'title', 'author', 'isbn', 'binding', 'condition', 'price', 'currency', 'quantity', 'description'];
  const rows = payloads.map(p => [
    p.sku, p.title, p.author || '', p.isbn || '', p.binding || '',
    p.condition || '', (p.priceMinor / 100).toFixed(2), p.currency, p.quantity, p.description
  ]);
  return toCsv(headers, rows);
}

/** Amazon Individual-plan manual offer sheet (paste into Seller Central). */
export function buildAmazonManualSheet(payloads: ListingPayload[]): string {
  const headers = ['SKU', 'ASIN/ISBN', 'Title', 'Condition', 'Condition Note', 'Price GBP', 'Quantity', 'Action'];
  const rows = payloads.map(p => [
    p.sku, p.isbn || '', p.title, p.condition || '',
    p.description, (p.priceMinor / 100).toFixed(2), 1, 'Create offer manually'
  ]);
  return toCsv(headers, rows);
}

// ==================== ABEBOOKS XML ====================

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * AbeBooks Inventory Update API uses full-record replacements. This builds the
 * document; transport (non-standard HTTPS port) is isolated so it can run from
 * a compatible service if Workers cannot reach it.
 */
export function buildAbeBooksXml(payloads: ListingPayload[], action: 'add' | 'delete' = 'add'): string {
  const books = payloads.map(p => {
    if (action === 'delete') {
      return `  <Book>\n    <vendorBookID>${xmlEscape(p.sku)}</vendorBookID>\n    <action>delete</action>\n  </Book>`;
    }
    return [
      '  <Book>',
      `    <vendorBookID>${xmlEscape(p.sku)}</vendorBookID>`,
      '    <action>add</action>',
      `    <title>${xmlEscape(p.title)}</title>`,
      p.author ? `    <author>${xmlEscape(p.author)}</author>` : '',
      p.isbn ? `    <isbn>${xmlEscape(p.isbn)}</isbn>` : '',
      p.publisher ? `    <publisher>${xmlEscape(p.publisher)}</publisher>` : '',
      p.publicationYear ? `    <pubyear>${xmlEscape(p.publicationYear)}</pubyear>` : '',
      p.binding ? `    <binding>${xmlEscape(p.binding)}</binding>` : '',
      p.edition ? `    <edition>${xmlEscape(p.edition)}</edition>` : '',
      `    <condition>${xmlEscape(p.condition || 'Good')}</condition>`,
      `    <price>${(p.priceMinor / 100).toFixed(2)}</price>`,
      `    <currency>${xmlEscape(p.currency)}</currency>`,
      `    <quantity>${p.quantity}</quantity>`,
      `    <description>${xmlEscape(p.description)}</description>`,
      '  </Book>'
    ].filter(Boolean).join('\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<InventoryUpdate>\n${books.join('\n')}\n</InventoryUpdate>\n`;
}

// ==================== EBAY ====================

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  environment: 'sandbox' | 'production';
  fetchImpl?: typeof fetch;
}

export class EbayClient {
  private base: string;
  private fetchImpl: typeof fetch;
  constructor(private config: EbayConfig) {
    this.base = config.environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com';
    this.fetchImpl = config.fetchImpl || fetch;
  }

  async getAccessToken(): Promise<string> {
    const basic = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
    const res = await this.fetchImpl(`${this.base}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
        scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory'
      }).toString()
    });
    if (!res.ok) throw new Error(`eBay token error: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return data.access_token;
  }

  async putInventoryItem(token: string, p: ListingPayload): Promise<void> {
    const body = {
      product: {
        title: p.title,
        description: p.description,
        aspects: {},
        imageUrls: p.photos || []
      },
      condition: mapEbayCondition(p.condition),
      availability: {
        shipToLocationAvailability: { quantity: p.quantity }
      }
    };
    const res = await this.fetchImpl(
      `${this.base}/sell/inventory/v1/inventory_item/${encodeURIComponent(p.sku)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-GB'
        },
        body: JSON.stringify(body)
      }
    );
    if (!res.ok) throw new Error(`eBay inventory error: ${res.status} ${await res.text()}`);
  }

  async createOffer(token: string, p: ListingPayload, marketplaceId = 'EBAY_GB'): Promise<string> {
    const body = {
      sku: p.sku,
      marketplaceId,
      format: 'FIXED_PRICE',
      availableQuantity: p.quantity,
      categoryId: '261186', // Books & Magazines > Books
      listingDescription: p.description,
      pricingSummary: {
        price: { value: (p.priceMinor / 100).toFixed(2), currency: p.currency }
      }
    };
    const res = await this.fetchImpl(`${this.base}/sell/inventory/v1/offer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-GB'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`eBay offer error: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return data.offerId;
  }

  async publishOffer(token: string, offerId: string): Promise<{ listingId: string }> {
    const res = await this.fetchImpl(
      `${this.base}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Language': 'en-GB' }
      }
    );
    if (!res.ok) throw new Error(`eBay publish error: ${res.status} ${await res.text()}`);
    return (await res.json()) as { listingId: string };
  }

  async withdraw(token: string, offerId: string): Promise<void> {
    const res = await this.fetchImpl(
      `${this.base}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`eBay withdraw error: ${res.status} ${await res.text()}`);
  }
}

function mapEbayCondition(condition?: string | null): string {
  const c = (condition || '').toLowerCase();
  if (c.includes('like new') || c.includes('fine')) return 'LIKE_NEW';
  if (c.includes('very good')) return 'VERY_GOOD';
  if (c.includes('acceptable') || c.includes('poor')) return 'ACCEPTABLE';
  return 'GOOD';
}

// ==================== STATUS ====================

export function marketplaceStatuses(env: Env): AdapterInfo[] {
  return Object.values(ADAPTERS).map(info => {
    const missing = info.requiresCredentials.filter(key => !(env as any)[key]);
    return {
      ...info,
      // Never upgrade a claimed status merely because a secret exists.
      notes: missing.length
        ? `${info.notes} Missing: ${missing.join(', ')}.`
        : info.notes
    };
  });
}
