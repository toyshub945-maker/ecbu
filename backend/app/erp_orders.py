"""ERP Order Upload — parse TikTok/Shein ERP order exports and store SKU-level order counts."""
from __future__ import annotations

import io
from collections import defaultdict
from typing import Optional

import pandas as pd
from . import db

# ── TikTok Store → TT code mapping ────────────────────────────────────────────
# Matches store name substring (case-insensitive) to TT code
STORE_TT_MAP = [
    ("CELNEPHO",      "TT1"),
    ("CYNLLIO",       "TT2"),
    ("VIMISAOI",      "TT3"),
    ("mikarka shoes", "TT4"),
]

# ── Shein store keywords ───────────────────────────────────────────────────────
# Any store name containing these keywords is classified as "shein"
SHEIN_KEYWORDS = ["shein", "sheglam", "romwe"]


def _store_to_platform(store_name: str | None) -> str:
    """
    Returns one of: 'tt1', 'tt2', 'tt3', 'tt4', 'shein', 'other'
    """
    if not store_name:
        return "other"
    sl = store_name.lower()
    for keyword, tt in STORE_TT_MAP:
        if keyword.lower() in sl:
            return tt.lower()   # 'tt1', 'tt2', 'tt3', 'tt4'
    for kw in SHEIN_KEYWORDS:
        if kw in sl:
            return "shein"
    return "other"


def parse_erp_excel(file_content: bytes) -> list[dict]:
    """
    Parse an ERP OrderManagement Excel export using pandas (fast path).

    Expected columns (row 1 headers):
      System Order Number | Store | SKU | Product Name | MSKU | TikTok Warehouse
      All columns except SKU are optional.

    Returns a list of dicts, one per unique SKU:
      sku, base_sku, msku,
      tt1_orders, tt2_orders, tt3_orders, tt4_orders,
      shein_orders, other_orders, total_orders
    """
    # Read with dtype=str to avoid scientific-notation issues on large IDs
    df = pd.read_excel(io.BytesIO(file_content), dtype=str)

    # Normalise column names to lowercase stripped strings
    df.columns = [str(c).strip().lower() for c in df.columns]

    # Locate required / optional columns
    def _find_col(*candidates: str) -> str | None:
        for c in candidates:
            if c in df.columns:
                return c
        return None

    order_col = _find_col("system order number", "order number", "ordernumber")
    store_col = _find_col("store")
    sku_col   = _find_col("sku")
    msku_col  = _find_col("msku", "seller sku", "sellersku")

    if sku_col is None:
        raise ValueError("Cannot find 'SKU' column in the uploaded file")

    # Drop rows with no order number (cancelled / blank lines)
    if order_col:
        df = df[df[order_col].notna() & (df[order_col].str.strip() != "") & (df[order_col] != "nan")]

    # Drop rows with no SKU
    df = df[df[sku_col].notna() & (df[sku_col].str.strip() != "") & (df[sku_col] != "nan")]
    df = df.copy()
    df["_sku"] = df[sku_col].str.strip()

    # Map store → platform label using vectorised apply
    if store_col:
        df["_platform"] = df[store_col].apply(
            lambda x: _store_to_platform(str(x) if pd.notna(x) and str(x) not in ("nan", "") else None)
        )
    else:
        df["_platform"] = "other"

    # Collect first non-empty MSKU per SKU
    sku_msku: dict[str, str] = {}
    if msku_col:
        msku_df = df[df[msku_col].notna() & (df[msku_col] != "nan") & (df[msku_col].str.strip() != "")][
            ["_sku", msku_col]
        ].drop_duplicates("_sku")
        sku_msku = dict(zip(msku_df["_sku"], msku_df[msku_col].str.strip()))

    # Aggregate counts per (sku, platform)
    counts = df.groupby(["_sku", "_platform"]).size().reset_index(name="_n")
    pivot = (
        counts.pivot(index="_sku", columns="_platform", values="_n")
        .fillna(0)
        .astype(int)
    )

    results = []
    for sku, row in pivot.iterrows():
        base_sku = sku.split("-")[0] if "-" in sku else sku
        total    = int(row.sum())
        results.append({
            "sku":          sku,
            "base_sku":     base_sku,
            "msku":         sku_msku.get(sku),
            "tt1_orders":   int(row.get("tt1", 0)),
            "tt2_orders":   int(row.get("tt2", 0)),
            "tt3_orders":   int(row.get("tt3", 0)),
            "tt4_orders":   int(row.get("tt4", 0)),
            "shein_orders": int(row.get("shein", 0)),
            "other_orders": int(row.get("other", 0)),
            "total_orders": total,
        })

    return results


def save_erp_upload(filename: str, period_label: str, rows: list[dict]) -> dict:
    """Persist parsed ERP rows to the DB. Returns the new upload record."""
    with db.db_cursor() as cur:
        # Resolve product_no for each base_sku from products table
        cur.execute("SELECT product_no, sku FROM products")
        product_sku_map = {str(r["sku"]): str(r["product_no"]) for r in cur.fetchall()}

        # Insert upload record
        cur.execute(
            "INSERT INTO erp_order_uploads (filename, period_label, row_count, sku_count) VALUES (?,?,?,?)",
            (filename, period_label, sum(r["total_orders"] for r in rows), len(rows)),
        )
        upload_id = cur.lastrowid

        # Batch-insert all per-SKU rows in one shot (much faster than individual INSERTs)
        params = [
            (
                upload_id, r["sku"], r["base_sku"], r.get("msku"),
                product_sku_map.get(r["base_sku"]),
                r["tt1_orders"], r["tt2_orders"], r["tt3_orders"], r["tt4_orders"],
                r.get("shein_orders", 0), r["other_orders"], r["total_orders"],
            )
            for r in rows
        ]
        cur.executemany("""
            INSERT INTO erp_sku_orders
                (upload_id, sku, base_sku, msku, product_no,
                 tt1_orders, tt2_orders, tt3_orders, tt4_orders,
                 shein_orders, other_orders, total_orders)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, params)

    return get_upload(upload_id)


def get_upload(upload_id: int) -> dict:
    with db.db_cursor() as cur:
        cur.execute("SELECT * FROM erp_order_uploads WHERE id=?", (upload_id,))
        row = cur.fetchone()
        return dict(row) if row else {}


def list_uploads() -> list[dict]:
    with db.db_cursor() as cur:
        cur.execute("SELECT * FROM erp_order_uploads ORDER BY imported_at DESC")
        return [dict(r) for r in cur.fetchall()]


def delete_upload(upload_id: int) -> dict:
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM erp_order_uploads WHERE id=?", (upload_id,))
        return {"deleted": cur.rowcount}


def _select_sku_rows(cur, extra_where: str, params: list) -> list[dict]:
    """Shared SELECT for both get_skus_for_product and get_sku_summary."""
    cur.execute(f"""
        SELECT sku, base_sku,
               MAX(msku) as msku,
               product_no,
               SUM(tt1_orders)   as tt1_orders,
               SUM(tt2_orders)   as tt2_orders,
               SUM(tt3_orders)   as tt3_orders,
               SUM(tt4_orders)   as tt4_orders,
               SUM(shein_orders) as shein_orders,
               SUM(other_orders) as other_orders,
               SUM(total_orders) as total_orders
        FROM erp_sku_orders
        {extra_where}
        GROUP BY sku
        ORDER BY total_orders DESC
    """, params)
    return [dict(r) for r in cur.fetchall()]


def get_skus_for_product(product_no: str, upload_ids: list[int] | None = None) -> list[dict]:
    """
    Return aggregated SKU order counts for a specific product_no.
    Enriches results with warehouse stock, pricing, and R&R data.
    """
    with db.db_cursor() as cur:
        if upload_ids:
            placeholders = ",".join("?" * len(upload_ids))
            rows = _select_sku_rows(
                cur,
                f"WHERE product_no=? AND upload_id IN ({placeholders})",
                [product_no] + upload_ids,
            )
        else:
            rows = _select_sku_rows(cur, "WHERE product_no=?", [product_no])

    for r in rows:
        r["current_stock"] = 0
        r["selling_price"] = 0.0
        r["profit_margin"] = 0.0
        r["rr_rate"] = 0.0

    from .stock_prediction import _enrich_from_db
    _enrich_from_db(rows)
    return rows


def get_sku_summary(upload_ids: list[int] | None = None) -> dict:
    """
    Return aggregated SKU order counts across selected uploads (or all if upload_ids is None).

    total_orders = TT1 + TT2 + TT3 + TT4 + Shein + Other  (all platforms combined)

    Returns {
      grand_total, sku_count, product_count,
      skus: [{ sku, base_sku, msku, product_no,
               tt1_orders … shein_orders, other_orders, total_orders,
               sku_quota_rate, current_stock, selling_price, profit_margin, rr_rate }]
    }
    """
    with db.db_cursor() as cur:
        if upload_ids:
            placeholders = ",".join("?" * len(upload_ids))
            rows = _select_sku_rows(
                cur, f"WHERE upload_id IN ({placeholders})", upload_ids
            )
        else:
            rows = _select_sku_rows(cur, "", [])

    grand_total = sum(r["total_orders"] for r in rows)
    for r in rows:
        r["sku_quota_rate"] = round(r["total_orders"] / grand_total, 8) if grand_total > 0 else 0.0
        r["current_stock"] = 0
        r["selling_price"] = 0.0
        r["profit_margin"] = 0.0
        r["rr_rate"] = 0.0

    from .stock_prediction import _enrich_from_db
    _enrich_from_db(rows)

    return {
        "grand_total":   grand_total,
        "sku_count":     len(rows),
        "product_count": len({r["product_no"] or r["base_sku"] for r in rows}),
        "skus":          rows,
    }
