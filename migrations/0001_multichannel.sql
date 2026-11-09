-- Multichannel specialist-bookseller domain model
-- Money is always stored as integer minor units (pence for GBP) + ISO currency.
-- Legacy tables from the original GoodGrails schema are intentionally left in
-- place so this migration is additive and cannot destroy existing data.

PRAGMA foreign_keys = ON;

-- ==================== WORKS ====================
-- An intellectual work, independent of any edition or physical copy.
CREATE TABLE IF NOT EXISTS works (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    author      TEXT,
    sort_title  TEXT,
    subjects    TEXT,                 -- JSON array
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_works_title ON works(title);

-- ==================== EDITIONS ====================
-- A specific published edition. ISBN-10/13 are TEXT so leading zeros survive.
CREATE TABLE IF NOT EXISTS editions (
    id                TEXT PRIMARY KEY,
    work_id           TEXT NOT NULL REFERENCES works(id),
    isbn10            TEXT,
    isbn13            TEXT,
    title             TEXT NOT NULL,
    subtitle          TEXT,
    author            TEXT,
    publisher         TEXT,
    imprint           TEXT,
    publication_year  INTEGER,
    printing          TEXT,
    format            TEXT,           -- hardcover / paperback / set ...
    binding           TEXT,
    language          TEXT,
    series            TEXT,
    volumes           INTEGER,
    pages             INTEGER,
    metadata_source   TEXT,
    metadata_fetched_at TEXT,
    bibliographic_verified INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editions_work ON editions(work_id);
CREATE INDEX IF NOT EXISTS idx_editions_isbn13 ON editions(isbn13);
CREATE INDEX IF NOT EXISTS idx_editions_isbn10 ON editions(isbn10);

-- ==================== COPIES ====================
-- One owned physical copy (or complete multivolume set) = one SKU.
CREATE TABLE IF NOT EXISTS copies (
    id                    TEXT PRIMARY KEY,
    sku                   TEXT NOT NULL UNIQUE,
    work_id               TEXT REFERENCES works(id),
    edition_id            TEXT REFERENCES editions(id),
    condition             TEXT,
    jacket_condition      TEXT,
    signed                TEXT,
    inscriptions          TEXT,
    annotations           TEXT,
    shelf_location        TEXT,
    acquisition_source    TEXT,
    acquisition_cost_minor INTEGER,
    acquisition_currency  TEXT NOT NULL DEFAULT 'GBP',
    historical_target_minor INTEGER,
    currency              TEXT NOT NULL DEFAULT 'GBP',
    status                TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','needs_verification','ready','publishing','active','reserved','sold','withdrawn','returned')),
    verification_status   TEXT NOT NULL DEFAULT 'unverified'
        CHECK(verification_status IN ('unverified','bibliographic_verified','photo_verified','fully_verified')),
    notes                 TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_copies_status ON copies(status);
CREATE INDEX IF NOT EXISTS idx_copies_work ON copies(work_id);
CREATE INDEX IF NOT EXISTS idx_copies_edition ON copies(edition_id);
-- NOTE: no UNIQUE constraint on ISBN/edition: two copies can share an ISBN.

-- ==================== MEDIA ASSETS ====================
CREATE TABLE IF NOT EXISTS media_assets (
    id            TEXT PRIMARY KEY,
    copy_id       TEXT NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL
        CHECK(kind IN ('front','back','spine','title_page','copyright_page','jacket','signature','defect','other')),
    r2_key        TEXT NOT NULL,
    content_type  TEXT,
    bytes         INTEGER,
    width         INTEGER,
    height        INTEGER,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    provenance    TEXT,
    permission_note TEXT,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_copy ON media_assets(copy_id);

-- ==================== MARKET COMPS ====================
CREATE TABLE IF NOT EXISTS market_comps (
    id            TEXT PRIMARY KEY,
    copy_id       TEXT REFERENCES copies(id) ON DELETE SET NULL,
    edition_id    TEXT REFERENCES editions(id) ON DELETE SET NULL,
    source        TEXT NOT NULL,
    source_url    TEXT,
    evidence_type TEXT NOT NULL
        CHECK(evidence_type IN ('sold','auction_hammer','active_ask','withdrawn_ask','new_retail')),
    price_minor   INTEGER NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'GBP',
    shipping_minor INTEGER,
    condition     TEXT,
    edition_match TEXT,
    seller_location TEXT,
    confidence    TEXT,
    observed_at   TEXT NOT NULL,
    notes         TEXT,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comps_copy ON market_comps(copy_id);
CREATE INDEX IF NOT EXISTS idx_comps_type ON market_comps(evidence_type);

-- ==================== PRICE RECOMMENDATIONS ====================
CREATE TABLE IF NOT EXISTS price_recommendations (
    id               TEXT PRIMARY KEY,
    copy_id          TEXT NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
    rule_version     TEXT NOT NULL,
    quick_minor      INTEGER,
    balanced_minor   INTEGER,
    patient_minor    INTEGER,
    offer_floor_minor INTEGER,
    currency         TEXT NOT NULL DEFAULT 'GBP',
    confidence       TEXT,
    source_ids       TEXT,            -- JSON array of market_comps ids
    approved_minor   INTEGER,
    approved_by      TEXT,
    approved_at      TEXT,
    created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_copy ON price_recommendations(copy_id);

-- ==================== LISTINGS ====================
CREATE TABLE IF NOT EXISTS listings (
    id             TEXT PRIMARY KEY,
    copy_id        TEXT NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
    marketplace    TEXT NOT NULL
        CHECK(marketplace IN ('ebay','abebooks','biblio','amazon','alibris','vinted','manual')),
    external_id    TEXT,
    listing_url    TEXT,
    price_minor    INTEGER,
    currency       TEXT NOT NULL DEFAULT 'GBP',
    status         TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','publishing','active','paused','withdrawn','sold','error')),
    sync_state     TEXT,
    last_synced_at TEXT,
    last_error     TEXT,
    payload        TEXT,              -- last request payload (redacted)
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    UNIQUE(copy_id, marketplace)
);
CREATE INDEX IF NOT EXISTS idx_listings_copy ON listings(copy_id);
CREATE INDEX IF NOT EXISTS idx_listings_market ON listings(marketplace, status);

-- ==================== MARKETPLACE ORDERS ====================
CREATE TABLE IF NOT EXISTS marketplace_orders (
    id                TEXT PRIMARY KEY,
    marketplace       TEXT NOT NULL,
    external_order_id TEXT NOT NULL,
    copy_id           TEXT REFERENCES copies(id),
    sku               TEXT,
    price_minor       INTEGER NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'GBP',
    fees_minor        INTEGER,
    shipping_minor    INTEGER,
    net_minor         INTEGER,
    buyer_ref         TEXT,           -- opaque reference only, never buyer PII in logs
    fulfillment_state TEXT NOT NULL DEFAULT 'received'
        CHECK(fulfillment_state IN ('received','reserved','packing','dispatched','delivered','cancelled','returned')),
    tracking          TEXT,
    ordered_at        TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE(marketplace, external_order_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_copy ON marketplace_orders(copy_id);
CREATE INDEX IF NOT EXISTS idx_orders_state ON marketplace_orders(fulfillment_state);

-- ==================== INVENTORY EVENTS ====================
CREATE TABLE IF NOT EXISTS inventory_events (
    id         TEXT PRIMARY KEY,
    copy_id    TEXT REFERENCES copies(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status  TEXT,
    actor      TEXT,
    details    TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_copy ON inventory_events(copy_id);

-- ==================== SYNC JOBS ====================
CREATE TABLE IF NOT EXISTS sync_jobs (
    id              TEXT PRIMARY KEY,
    copy_id         TEXT REFERENCES copies(id) ON DELETE CASCADE,
    action          TEXT NOT NULL
        CHECK(action IN ('publish','update','withdraw','reconcile','order_pull')),
    marketplace     TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    state           TEXT NOT NULL DEFAULT 'queued'
        CHECK(state IN ('queued','running','done','failed','needs_attention')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    payload         TEXT,
    next_attempt_at TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON sync_jobs(state, marketplace);

-- ==================== USERS / ROLES ====================
CREATE TABLE IF NOT EXISTS app_users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT,
    role       TEXT NOT NULL DEFAULT 'owner'
        CHECK(role IN ('owner','admin','dispatcher','viewer')),
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

-- ==================== AUDIT LOG (multichannel) ====================
CREATE TABLE IF NOT EXISTS multichannel_audit_log (
    id          TEXT PRIMARY KEY,
    actor       TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    details     TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mc_audit_entity ON multichannel_audit_log(entity_type, entity_id);
