// Domain types for the multichannel specialist-bookseller model.
// Money is integer minor units (pence for GBP) plus an ISO-4217 currency.

export type Currency = 'GBP' | 'USD' | 'EUR';

export type CopyStatus =
  | 'draft'
  | 'needs_verification'
  | 'ready'
  | 'publishing'
  | 'active'
  | 'reserved'
  | 'sold'
  | 'withdrawn'
  | 'returned';

export type VerificationStatus =
  | 'unverified'
  | 'bibliographic_verified'
  | 'photo_verified'
  | 'fully_verified';

export type EvidenceType =
  | 'sold'
  | 'auction_hammer'
  | 'active_ask'
  | 'withdrawn_ask'
  | 'new_retail';

export type Marketplace =
  | 'ebay'
  | 'abebooks'
  | 'biblio'
  | 'amazon'
  | 'alibris'
  | 'vinted'
  | 'manual';

export type ListingStatus =
  | 'draft'
  | 'publishing'
  | 'active'
  | 'paused'
  | 'withdrawn'
  | 'sold'
  | 'error';

export type SyncAction = 'publish' | 'update' | 'withdraw' | 'reconcile' | 'order_pull';
export type SyncState = 'queued' | 'running' | 'done' | 'failed' | 'needs_attention';

export interface Work {
  id: string;
  title: string;
  author?: string | null;
  sort_title?: string | null;
  subjects?: string[] | null;
}

export interface Edition {
  id: string;
  work_id: string;
  isbn10?: string | null;
  isbn13?: string | null;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  publisher?: string | null;
  imprint?: string | null;
  publication_year?: number | null;
  printing?: string | null;
  format?: string | null;
  binding?: string | null;
  language?: string | null;
  series?: string | null;
  volumes?: number | null;
  pages?: number | null;
  bibliographic_verified?: boolean;
}

export interface Copy {
  id: string;
  sku: string;
  work_id?: string | null;
  edition_id?: string | null;
  condition?: string | null;
  jacket_condition?: string | null;
  signed?: string | null;
  inscriptions?: string | null;
  annotations?: string | null;
  shelf_location?: string | null;
  acquisition_source?: string | null;
  acquisition_cost_minor?: number | null;
  acquisition_currency: Currency;
  historical_target_minor?: number | null;
  currency: Currency;
  status: CopyStatus;
  verification_status: VerificationStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  copy_id: string;
  kind: string;
  r2_key: string;
  content_type?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  sort_order: number;
  provenance?: string | null;
}

export interface MarketComp {
  id: string;
  copy_id?: string | null;
  edition_id?: string | null;
  source: string;
  source_url?: string | null;
  evidence_type: EvidenceType;
  price_minor: number;
  currency: Currency;
  shipping_minor?: number | null;
  condition?: string | null;
  edition_match?: string | null;
  confidence?: string | null;
  observed_at: string;
  notes?: string | null;
}

export interface PriceRecommendation {
  id: string;
  copy_id: string;
  rule_version: string;
  quick_minor?: number | null;
  balanced_minor?: number | null;
  patient_minor?: number | null;
  offer_floor_minor?: number | null;
  currency: Currency;
  confidence?: string | null;
  source_ids?: string[] | null;
  approved_minor?: number | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface Listing {
  id: string;
  copy_id: string;
  marketplace: Marketplace;
  external_id?: string | null;
  listing_url?: string | null;
  price_minor?: number | null;
  currency: Currency;
  status: ListingStatus;
  sync_state?: string | null;
  last_synced_at?: string | null;
  last_error?: string | null;
}

export interface MarketplaceOrder {
  id: string;
  marketplace: Marketplace;
  external_order_id: string;
  copy_id?: string | null;
  sku?: string | null;
  price_minor: number;
  currency: Currency;
  fees_minor?: number | null;
  shipping_minor?: number | null;
  net_minor?: number | null;
  buyer_ref?: string | null;
  fulfillment_state:
    | 'received'
    | 'reserved'
    | 'packing'
    | 'dispatched'
    | 'delivered'
    | 'cancelled'
    | 'returned';
  tracking?: string | null;
  ordered_at: string;
  created_at: string;
  updated_at: string;
}

/** Seed format produced from the supplied handoff catalogue. */
export interface SeedBook {
  sku: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  binding?: string | null;
  edition?: string | null;
  condition?: string | null;
  jacket_condition?: string | null;
  signed?: string | null;
  acquisition_source?: string | null;
  acquisition_cost_minor?: number | null;
  currency?: string;
  historical_target_minor?: number | null;
  valuation_confidence?: string | null;
  inventory_status?: string | null;
  photo_status?: string | null;
  notes?: string | null;
  ebay_sold_url?: string | null;
  abebooks_url?: string | null;
  price?: {
    balanced_minor?: number | null;
    quick_minor?: number | null;
    patient_minor?: number | null;
    offer_floor_minor?: number | null;
    confidence?: string | null;
    primary_channel?: string | null;
    listing_readiness?: string | null;
    rationale?: string | null;
    primary_source_url?: string | null;
  };
  evidence?: Array<{
    source?: string | null;
    url?: string | null;
    evidence_type?: string | null;
    price_minor?: number | null;
    condition?: string | null;
    edition_match?: string | null;
    notes?: string | null;
    observed_at?: string | null;
  }>;
}

export interface SeedCatalogue {
  generated: string;
  source: string;
  books: SeedBook[];
}
