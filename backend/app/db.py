import sqlite3
from contextlib import contextmanager
from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member',
    store_code    TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    product_no       TEXT PRIMARY KEY,
    source_id        TEXT,
    image_url        TEXT,
    warehouse_name   TEXT,
    sku              TEXT,
    status           TEXT,
    stores_available TEXT,
    upload_status    TEXT,
    tk1_product_id   TEXT,
    tk2_product_id   TEXT,
    tk3_product_id   TEXT,
    tk4_product_id   TEXT,
    tk1_seller_sku   TEXT,
    tk2_seller_sku   TEXT,
    tk3_seller_sku   TEXT,
    tk4_seller_sku   TEXT,
    cost             REAL,
    tt1_price        REAL,
    tt2_price        REAL,
    tt3_price        REAL,
    tt4_price        REAL,
    tt1_price_max    REAL,
    tt2_price_max    REAL,
    tt3_price_max    REAL,
    tt4_price_max    REAL,
    sort_order       INTEGER DEFAULT 0,
    synced_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_periods (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    store_code   TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    label        TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_code, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS product_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_no  TEXT NOT NULL,
    period_id   INTEGER NOT NULL REFERENCES weekly_periods(id) ON DELETE CASCADE,
    store_code  TEXT NOT NULL,
    task_type   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'todo',
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes       TEXT,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_no, period_id, store_code, task_type)
);

CREATE TABLE IF NOT EXISTS product_analytics (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    product_no               TEXT NOT NULL,
    period_id                INTEGER NOT NULL REFERENCES weekly_periods(id) ON DELETE CASCADE,
    store_code               TEXT NOT NULL,
    impressions              INTEGER,
    page_views               INTEGER,
    ctr                      REAL,
    avg_visitors             REAL,
    avg_customers            REAL,
    cvr                      REAL,
    video_impressions        INTEGER,
    product_card_impressions INTEGER,
    live_impressions         INTEGER,
    items_sold               INTEGER,
    ctor                     REAL,
    new_creators             INTEGER,
    new_videos               INTEGER,
    new_live                 INTEGER,
    free_sample_cost         REAL,
    content_gmv              REAL,
    ads_spend                REAL,
    gmv                      REAL,
    roi                      REAL,
    selling_price            TEXT,
    cost_rmb                 REAL,
    profit_margin            REAL,
    UNIQUE(product_no, period_id, store_code)
);

CREATE TABLE IF NOT EXISTS product_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_no TEXT NOT NULL,
    period_id  INTEGER NOT NULL REFERENCES weekly_periods(id) ON DELETE CASCADE,
    store_code TEXT NOT NULL,
    analysis   TEXT,
    action     TEXT,
    results    TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_no, period_id, store_code)
);

CREATE INDEX IF NOT EXISTS idx_tasks_period   ON product_tasks(period_id, store_code);
CREATE INDEX IF NOT EXISTS idx_tasks_product  ON product_tasks(product_no);
CREATE INDEX IF NOT EXISTS idx_analytics_period ON product_analytics(period_id, store_code);
CREATE INDEX IF NOT EXISTS idx_notes_period   ON product_notes(period_id, store_code);

-- Products manually pinned to a store board (overrides stores_available filter)
CREATE TABLE IF NOT EXISTS board_pins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_code  TEXT NOT NULL,
    product_no  TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_code, product_no)
);

-- Raw order file uploads (for tracking purposes)
CREATE TABLE IF NOT EXISTS order_file_uploads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    store_code   TEXT NOT NULL,
    filename     TEXT,
    upload_type  TEXT NOT NULL DEFAULT 'orders',
    period_label TEXT,
    row_count    INTEGER,
    imported_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Return & Refund Rate ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rr_uploads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_type  TEXT NOT NULL,
    store_code   TEXT NOT NULL,
    filename     TEXT,
    period_label TEXT,
    row_count    INTEGER DEFAULT 0,
    imported_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rr_order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id  INTEGER NOT NULL REFERENCES rr_uploads(id) ON DELETE CASCADE,
    store_code TEXT NOT NULL,
    msku       TEXT NOT NULL,
    order_qty  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rr_return_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id  INTEGER NOT NULL REFERENCES rr_uploads(id) ON DELETE CASCADE,
    store_code TEXT NOT NULL,
    msku       TEXT NOT NULL,
    return_qty INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rr_orders_msku  ON rr_order_items(store_code, msku);
CREATE INDEX IF NOT EXISTS idx_rr_returns_msku ON rr_return_items(store_code, msku);

-- Warehouse Management ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_inventory (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id         TEXT,
    sheet_name       TEXT NOT NULL,
    feishu_row_index INTEGER,
    warehouse_name   TEXT NOT NULL,
    sku              TEXT NOT NULL,
    stock_quantity  INTEGER DEFAULT 0,
    product_no      TEXT,
    picture        TEXT,
    availability   TEXT,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sheet_id, feishu_row_index)
);

-- Add new columns if they don't exist (for existing databases)
-- Using PRAGMA to check and add columns safely

CREATE TABLE IF NOT EXISTS warehouse_products (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    product_no       TEXT UNIQUE,
    sku              TEXT NOT NULL,
    warehouse_name   TEXT,
    image_url        TEXT,
    image_token      TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wh_inventory_sheet ON warehouse_inventory(sheet_name);
CREATE INDEX IF NOT EXISTS idx_wh_inventory_sku ON warehouse_inventory(sku);
CREATE INDEX IF NOT EXISTS idx_wh_products_sku ON warehouse_products(sku);
CREATE INDEX IF NOT EXISTS idx_wh_products_product_no ON warehouse_products(product_no);

CREATE TABLE IF NOT EXISTS ads_campaigns (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    store_name          TEXT NOT NULL,
    product_number      TEXT,
    date                DATE NOT NULL,
    status              TEXT DEFAULT 'Active',
    roi                 REAL,
    cost_per_order      REAL,
    ad_cost_rate        REAL,
    ad_spend            REAL,
    revenue             REAL,
    campaign_budget     REAL,
    budget_adjustment  TEXT,
    extra_budget_id     TEXT,
    ads_open_date       DATE,
    total_funds         REAL,
    profit              REAL,
    color_flag          TEXT,
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ads_store ON ads_campaigns(store_name);
CREATE INDEX IF NOT EXISTS idx_ads_date ON ads_campaigns(date);
CREATE INDEX IF NOT EXISTS idx_ads_product ON ads_campaigns(product_number);

-- TikTok Product Analytics Export ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tiktok_export_analytics (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    product_no             TEXT NOT NULL,
    store_code             TEXT NOT NULL,
    period_start           DATE NOT NULL,
    period_end             DATE NOT NULL,
    tiktok_product_id      TEXT,
    product_name           TEXT,
    listing_status         TEXT,
    gmv_range              TEXT,
    voc_diagnosis          TEXT,
    gmv                    REAL,
    orders                 INTEGER,
    sku_orders             INTEGER,
    items_sold             INTEGER,
    est_customers          INTEGER,
    aov                    REAL,
    impressions            INTEGER,
    clicks                 INTEGER,
    ctr                    REAL,
    add_to_cart            INTEGER,
    atc_rate               REAL,
    ctor                   REAL,
    unique_impressions      INTEGER,
    unique_clicks           INTEGER,
    unique_ctr             REAL,
    unique_atc_users        INTEGER,
    unique_atc_rate        REAL,
    unique_ctor            REAL,
    gmv_with_tax           REAL,
    tax                    REAL,
    gmv_with_cofunding     REAL,
    shipping_fees          REAL,
    refunds                REAL,
    items_refunded         INTEGER,
    refund_customers       INTEGER,
    seller_live_gmv        REAL,
    seller_video_gmv       REAL,
    creator_gmv            REAL,
    creator_live_gmv       REAL,
    affiliate_video_gmv    REAL,
    product_card_gmv       REAL,
    shop_tab_impressions   INTEGER,
    shop_tab_clicks        INTEGER,
    shop_tab_unique_clicks INTEGER,
    shop_tab_customers     INTEGER,
    shop_tab_ctr           REAL,
    shop_tab_ctor          REAL,
    shop_tab_gmv           REAL,
    shop_tab_items_sold    INTEGER,
    imported_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_no, store_code, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_tkexp_store_period ON tiktok_export_analytics(store_code, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_tkexp_product ON tiktok_export_analytics(product_no);

-- Monthly Targets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_targets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    target_gmv  REAL,
    target_orders INTEGER,
    target_products INTEGER,
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month)
);
"""


def get_connection(db_path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path or config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_cursor(db_path: str | None = None):
    conn = get_connection(db_path)
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: str | None = None) -> None:
    with db_cursor(db_path) as cur:
        cur.executescript(SCHEMA)
        # Migrations: safely add columns that may be missing from older databases
        migrations = [
            "ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0",
            "ALTER TABLE products ADD COLUMN cost REAL",
            "ALTER TABLE products ADD COLUMN tt1_price REAL",
            "ALTER TABLE products ADD COLUMN tt2_price REAL",
            "ALTER TABLE products ADD COLUMN tt3_price REAL",
            "ALTER TABLE products ADD COLUMN tt4_price REAL",
            "ALTER TABLE products ADD COLUMN tt1_price_max REAL",
            "ALTER TABLE products ADD COLUMN tt2_price_max REAL",
            "ALTER TABLE products ADD COLUMN tt3_price_max REAL",
            "ALTER TABLE products ADD COLUMN tt4_price_max REAL",
            # Warehouse inventory new columns
            "ALTER TABLE warehouse_inventory ADD COLUMN product_no TEXT",
            "ALTER TABLE warehouse_inventory ADD COLUMN picture TEXT",
            "ALTER TABLE warehouse_inventory ADD COLUMN availability TEXT",
            "ALTER TABLE warehouse_inventory ADD COLUMN sheet_id TEXT",
            "ALTER TABLE warehouse_inventory ADD COLUMN feishu_row_index INTEGER",
            # tiktok_export_analytics is new — created by IF NOT EXISTS above
        ]
        for sql in migrations:
            try:
                cur.execute(sql)
            except Exception:
                pass  # Column already exists
