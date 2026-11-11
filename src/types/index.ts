// Environment bindings for Cloudflare Worker
export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  CONFIG: KVNamespace;
  AI: any; // Workers AI binding
  VECTORIZE_INDEX?: VectorizeIndex;
  BLOCKCHAIN_QUEUE?: Queue;

  // Secrets
  OPENAI_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  JWT_SECRET?: string;

  // Multichannel seller secrets (all optional until a channel is enabled)
  ADMIN_TOKEN?: string;
  /** Secret path token for remote MCP connectors that cannot send a bearer header. */
  MCP_PATH_SECRET?: string;
  EBAY_CLIENT_ID?: string;
  EBAY_CLIENT_SECRET?: string;
  EBAY_REFRESH_TOKEN?: string;
  EBAY_ENVIRONMENT?: string; // 'sandbox' | 'production'
  ABEBOOKS_API_KEY?: string;
  ABEBOOKS_API_SECRET?: string;
  BIBLIO_API_KEY?: string;

  // Environment variables
  FRONTEND_URL: string;
  ADMIN_URL: string;
  ENVIRONMENT: string;
}

export * from './domain';

// Book types
export interface Book {
  id: string;
  isbn: string;
  title: string;
  author: string;
  description?: string;
  cover_url?: string;
  condition: BookCondition;
  cost_price: number; // in pence
  sell_price: number; // in pence
  in_stock: boolean;
  metadata?: BookMetadata;
  vibe_tags?: string;
  ai_enrichment?: AIEnrichment;
  review_summary?: string;
  vector_id?: string;
  status: BookStatus;
  created_at: string;
  updated_at: string;
  sold_at?: string;
}

export type BookCondition = 'like_new' | 'very_good' | 'good' | 'acceptable';
export type BookStatus = 'draft' | 'pending_review' | 'live' | 'sold' | 'removed';

export interface BookMetadata {
  publisher?: string;
  publish_date?: string;
  page_count?: number;
  language?: string;
  categories?: string[];
  isbn_10?: string;
  isbn_13?: string;
  goodreads_url?: string;
  average_rating?: number;
  ratings_count?: number;
}

export interface AIEnrichment {
  emotional_tone?: string[];
  shock_factor?: number; // 1-10
  pace?: string;
  atmosphere?: string[];
  vibe_keywords?: string;
  themes?: string[];
  similar_to?: string[];
}

// API request/response types
export interface IngestBookRequest {
  isbn: string;
  condition: BookCondition;
  cost_price: number; // in pounds (will convert to pence)
  custom_title?: string;
  custom_author?: string;
}

export interface IngestBookResponse {
  success: boolean;
  book_id: string;
  book: Book;
  metadata: ExternalMetadata;
  suggested_price?: number;
  errors?: string[];
}

export interface ExternalMetadata {
  open_library?: OpenLibraryData | null;
  google_books?: GoogleBooksData | null;
  reviews?: Review[];
  market_prices?: MarketPrice[];
}

export interface OpenLibraryData {
  title?: string;
  authors?: Array<{ name: string }>;
  description?: string;
  cover_url?: string;
  publish_date?: string;
  publishers?: string[];
  number_of_pages?: number;
  subjects?: string[];
}

export interface GoogleBooksData {
  title?: string;
  authors?: string[];
  description?: string;
  cover_url?: string;
  publishedDate?: string;
  publisher?: string;
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  ratingsCount?: number;
}

export interface Review {
  source: string;
  rating?: number;
  text: string;
  author?: string;
  date?: string;
}

export interface MarketPrice {
  source: string;
  condition: string;
  price: number; // in pence
  currency: string;
  url?: string;
}

// Order types
export interface Order {
  id: string;
  book_id: string;
  customer_email?: string;
  book_price: number; // in pence
  profit_amount: number; // in pence
  charity_name: string;
  stripe_payment_id: string;
  payment_status: 'pending' | 'succeeded' | 'failed';
  base_tx_hash?: string;
  blockchain_status?: 'pending' | 'confirmed' | 'failed';
  month_batch: string; // YYYY-MM
  donation_status: 'pending' | 'sent' | 'confirmed';
  created_at: string;
  paid_at?: string;
}

// Response helpers
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}
