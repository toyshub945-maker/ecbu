"""ERP Order Upload — parse TikTok/Shein ERP order exports and store SKU-level order counts."""
from __future__ import annotations

import io
from collections import defaultdict
from typing import Optional

import openpyxl
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
    Parse an ERP OrderManagement Excel export.

    Expected columns (row 1 headers):
      System Order Number | Store | SKU | Product Name | MSKU | TikTok Warehouse
      All columns except SKU are optional.

    Returns a list of dicts, one per unique SKU:
      sku, base_sku, msku,
      tt1_orders, tt2_orders, tt3_orders, tt4_orders,
      shein_orders, other_orders, total_orders
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
    ws = wb.active

    # Detect column positions from header row
    header = {str(cell.value).strip().lower(): cell.column - 1
              for cell in ws[1] if cell.value}

    order_col = header.get("system order number",
                  header.get("order number",
                  header.get("ordernumber", None)))
    store_col = header.get("store", None)
    sku_col   = header.get("sku", None)
    msku_col  = header.get("msku",
                  header.get("seller sku",
                  header.get("sellersku", None)))

    if sku_col is None:
        raise ValueError("Cannot find 'SKU' column in the uploaded file")

    # Aggregate counts: sku → {platform: n, ...}
    sku_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"tt1": 0, "tt2": 0, "tt3": 0, "tt4": 0, "shein": 0, "other": 0}
    )
    # Track the MSKU for each SKU (last non-empty value wins; one SKU → one MSKU)
    sku_msku: dict[str, str] = {}

    for row_vals in ws.iter_rows(min_row=2, values_only=True):
        # Skip rows with no order number (cancelled / blank)
        if order_col is not None:
            order_val = row_vals[order_col] if order_col < len(row_vals) else None
            if not order_val:
                continue

        sku_val = row_vals[sku_col] if sku_col < len(row_vals) else None
        if not sku_val or str(sku_val).strip() in ("", "nan", "None"):
            continue
        sku = str(sku_val).strip()

        store_val = row_vals[store_col] if (store_col is not None and store_col < len(row_vals)) else None
        platform  = _store_to_platform(str(store_val) if store_val else None)
        sku_counts[sku][platform] += 1

        # Capture MSKU (prefer first non-empty)
        if msku_col is not None and sku not in sku_msku:
            msku_val = row_vals[msku_col] if msku_col < len(row_vals) else None
            if msku_val and str(msku_val).strip() not in ("", "nan", "None"):
                sku_msku[sku] = str(msku_val).strip()

    # Build result list
    results = []
    for sku, counts in sku_counts.items():
        base_sku = sku.split("-")[0] if "-" in sku else sku
        total    = sum(counts.values())
        results.append({
            "sku":           sku,
            "base_sku":      base_sku,
            "msku":          sku_msku.get(sku),
            "tt1_orders":    counts["tt1"],
            "tt2_orders":    counts["tt2"],
            "tt3_orders":    counts["tt3"],
            "tt4_orders":    counts["tt4"],
            "shein_orders":  counts["shein"],
            "other_orders":  counts["other"],
            "total_orders":  total,   # ALL platforms combined
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

        # Insert per-SKU rows
        for r in rows:
            prod_no = product_sku_map.get(r["base_sku"])
            cur.execute("""
                INSERT INTO erp_sku_orders
                    (upload_id, sku, base_sku, msku, product_no,
                     tt1_orders, tt2_orders, tt3_orders, tt4_orders,
                     shein_orders, other_orders, total_orders)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                upload_id, r["sku"], r["base_sku"], r.get("msku"), prod_no,
                r["tt1_orders"], r["tt2_orders"], r["tt3_orders"], r["tt4_orders"],
                r.get("shein_orders", 0), r["other_orders"], r["total_orders"],
            ))

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
