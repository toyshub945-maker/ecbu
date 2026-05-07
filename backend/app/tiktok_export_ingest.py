"""Parse TikTok Product Analytics Export into structured rows.

File format:
  Row 0 : "Analysis date: DD/MM/YYYY~DD/MM/YYYY"
  Row 1 : Column headers (44 columns)
  Row 2+: Product data rows
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

import pandas as pd


COLUMN_MAP: dict[str, str] = {
    "Product Name":                                    "product_name",
    "Product ID":                                      "tiktok_product_id",
    "GMV range":                                       "gmv_range",
    "Listing status":                                  "listing_status",
    "VoC diagnosis":                                   "voc_diagnosis",
    "GMV":                                             "gmv",
    "Seller LIVE-attributed GMV":                      "seller_live_gmv",
    "Seller video-attributed GMV":                     "seller_video_gmv",
    "Creator-attributed GMV":                          "creator_gmv",
    "Creator LIVE-attributed GMV":                     "creator_live_gmv",
    "Affiliate video-attributed GMV":                  "affiliate_video_gmv",
    "Seller product card GMV":                         "product_card_gmv",
    "Orders":                                          "orders",
    "SKU orders":                                      "sku_orders",
    "Items sold":                                      "items_sold",
    "Est. customers":                                  "est_customers",
    "AOV (SKU orders)":                                "aov",
    "Product impressions":                             "impressions",
    "Product clicks":                                  "clicks",
    "CTR":                                             "ctr",
    "Add-to-cart count":                               "add_to_cart",
    "Add-to-cart rate":                                "atc_rate",
    "CTOR (SKU order)":                                "ctor",
    "Unique product impressions":                      "unique_impressions",
    "Unique clicks":                                   "unique_clicks",
    "Unique CTR":                                      "unique_ctr",
    "Add-to-cart users":                               "unique_atc_users",
    "Unique ATC rate":                                 "unique_atc_rate",
    "Unique CTOR (SKU order)":                         "unique_ctor",
    "GMV with tax":                                    "gmv_with_tax",
    "Tax":                                             "tax",
    "Gross merchandise value (with TikTok co-funding)": "gmv_with_cofunding",
    "Shipping fees":                                   "shipping_fees",
    "Refunds":                                         "refunds",
    "Items refunded":                                  "items_refunded",
    "Refund customers":                                "refund_customers",
    "Shop tab product impressions":                    "shop_tab_impressions",
    "Shop tab product clicks":                         "shop_tab_clicks",
    "Unique Shop tab product clicks":                  "shop_tab_unique_clicks",
    "Est. Shop tab customers":                         "shop_tab_customers",
    "Shop tab CTR":                                    "shop_tab_ctr",
    "Shop tab CTOR (SKU)":                             "shop_tab_ctor",
    "Shop tab GMV":                                    "shop_tab_gmv",
    "Shop tab items sold":                             "shop_tab_items_sold",
}

# These fields store raw strings (not numeric)
STRING_FIELDS = {"product_name", "tiktok_product_id", "gmv_range", "listing_status", "voc_diagnosis"}

# Percentage fields — TikTok exports them as decimals (0.05 = 5%)
# or sometimes as "5%" strings — normalise to decimal
PERCENT_FIELDS = {"ctr", "atc_rate", "ctor", "unique_ctr", "unique_atc_rate", "unique_ctor",
                  "shop_tab_ctr", "shop_tab_ctor"}

# Integer fields
INT_FIELDS = {"orders", "sku_orders", "items_sold", "est_customers", "add_to_cart",
              "unique_impressions", "unique_clicks", "unique_atc_users", "impressions", "clicks",
              "items_refunded", "refund_customers", "shop_tab_impressions", "shop_tab_clicks",
              "shop_tab_unique_clicks", "shop_tab_customers", "shop_tab_items_sold"}


def _parse_date_range(header_val: Any) -> tuple[date, date] | None:
    """Extract (start, end) from "Analysis date: 07/04/2026~06/05/2026"."""
    if not header_val:
        return None
    s = str(header_val)
    # DD/MM/YYYY~DD/MM/YYYY
    m = re.search(
        r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\s*[~\-–]\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", s
    )
    if m:
        try:
            start = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            end   = date(int(m.group(6)), int(m.group(5)), int(m.group(4)))
            return start, end
        except ValueError:
            pass
    return None


def _coerce(key: str, val: Any) -> Any:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if key in STRING_FIELDS:
        s = str(val).strip()
        return s if s else None

    # Numeric
    if isinstance(val, str):
        s = val.strip().replace(",", "").replace("$", "")
        if s.endswith("%"):
            try:
                return float(s[:-1]) / 100
            except ValueError:
                return None
        if s == "-" or s == "":
            return None
        try:
            val = float(s)
        except ValueError:
            return None

    try:
        n = float(val)
    except (TypeError, ValueError):
        return None

    if pd.isna(n):
        return None

    if key in PERCENT_FIELDS and n > 1.0:
        # exported as 5.2 meaning 5.2%, normalise to 0.052
        n = n / 100

    if key in INT_FIELDS:
        return int(round(n))
    return n


def parse_tiktok_export(file_path: str) -> dict:
    """Return dict with keys: period_start, period_end, rows (list of dicts)."""
    df_raw = pd.read_excel(file_path, engine="openpyxl", header=None)

    if df_raw.empty:
        return {"error": "File is empty"}

    # Row 0 — date header
    date_range = _parse_date_range(df_raw.iloc[0, 0])
    if not date_range:
        return {"error": f"Cannot parse date range from row 0: {df_raw.iloc[0, 0]}"}
    period_start, period_end = date_range

    # Find header row — the row that contains "Product ID" (may be row 1 or row 2 depending on export version)
    header_row_idx = None
    for i in range(1, min(5, len(df_raw))):
        row_vals = [str(v).strip() for v in df_raw.iloc[i] if pd.notna(v)]
        if "Product ID" in row_vals:
            header_row_idx = i
            break
    if header_row_idx is None:
        return {"error": "Cannot find header row with 'Product ID' column"}

    headers = [str(h).strip() if pd.notna(h) else "" for h in df_raw.iloc[header_row_idx]]

    # Build column index mapping header → db_key
    col_to_key: dict[int, str] = {}
    for col_idx, header in enumerate(headers):
        if header in COLUMN_MAP:
            col_to_key[col_idx] = COLUMN_MAP[header]

    rows = []
    for _, row in df_raw.iloc[header_row_idx + 1:].iterrows():
        # Skip fully empty rows
        if row.isna().all():
            continue

        record: dict[str, Any] = {}
        for col_idx, db_key in col_to_key.items():
            if col_idx < len(row):
                record[db_key] = _coerce(db_key, row.iloc[col_idx])
            else:
                record[db_key] = None

        # Must have a Product ID to be useful
        pid = record.get("tiktok_product_id")
        if not pid:
            continue

        rows.append(record)

    return {
        "period_start": period_start.isoformat(),
        "period_end":   period_end.isoformat(),
        "rows":         rows,
    }
