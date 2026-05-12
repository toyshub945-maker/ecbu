"""Feishu Bitable → local products sync.
Adapted from the affiliate team app with updated credentials.
"""
from __future__ import annotations
import time
from typing import Any

import requests

from . import config, db

FEISHU_BASE = "https://open.feishu.cn/open-apis"

FEISHU_FIELD_MAP: dict[str, tuple[str, Any]] = {
    "Product no":             ("product_no",       str),
    "SourceID":               ("source_id",        str),
    "URL":                    ("image_url",        None),
    "warehouse product name": ("warehouse_name",   str),
    "SKU":                    ("sku",              str),
    "Product Status":         ("status",           str),
    "Stores available":       ("stores_available", str),
    "Upload Status":          ("upload_status",    str),
    "TK 1 - Product ID":      ("tk1_product_id",   str),
    "TK 2 - Product ID":      ("tk2_product_id",   str),
    "TK 3 - Product ID":      ("tk3_product_id",   str),
    "TK 4 - Product ID":      ("tk4_product_id",   str),
    "TK 1 - seller SKU":      ("tk1_seller_sku",   str),
    "TK 2 - seller SKU":      ("tk2_seller_sku",   str),
    "TK 3 - seller SKU":      ("tk3_seller_sku",   str),
    "TK 4 - seller SKU":      ("tk4_seller_sku",   str),
    "Cost":                   ("cost",             float),
    "TT1 Price":              ("tt1_price",        float),
    "TT2 Price":              ("tt2_price",        float),
    "TT3 Price":              ("tt3_price",        float),
    "TT4 Price":              ("tt4_price",        float),
}

# Normalised lookup: collapse any run of spaces to a single space so that
# "TK 1 -  seller SKU" (two spaces) and "TK 1 - seller SKU" (one space) both hit the same entry.
_FIELD_MAP_NORM: dict[str, tuple[str, Any]] = {
    " ".join(k.split()): v for k, v in FEISHU_FIELD_MAP.items()
}

_TOKEN_CACHE: dict[str, Any] = {"token": None, "expires_at": 0}


def _get_tenant_token() -> str:
    now = time.time()
    if _TOKEN_CACHE["token"] and now < _TOKEN_CACHE["expires_at"] - 60:
        return _TOKEN_CACHE["token"]
    r = requests.post(
        f"{FEISHU_BASE}/auth/v3/tenant_access_token/internal",
        json={"app_id": config.FEISHU_APP_ID, "app_secret": config.FEISHU_APP_SECRET},
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Feishu auth failed: {data}")
    _TOKEN_CACHE["token"] = data["tenant_access_token"]
    _TOKEN_CACHE["expires_at"] = now + int(data.get("expire", 7200))
    return _TOKEN_CACHE["token"]


def _fetch_all_records() -> list[dict]:
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = (f"{FEISHU_BASE}/bitable/v1/apps/{config.FEISHU_APP_TOKEN}"
           f"/tables/{config.FEISHU_TABLE_ID}/records")
    all_records: list[dict] = []
    page_token = None
    while True:
        params: dict = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        r = requests.get(url, headers=headers, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu records fetch failed: {data}")
        all_records.extend(data["data"].get("items", []))
        if not data["data"].get("has_more"):
            break
        page_token = data["data"].get("page_token")
    return all_records


def _extract_image_url(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        return value.get("link") or value.get("url")
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, dict):
            return first.get("url") or first.get("tmp_url") or first.get("link")
    return None


def _extract_text(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list) and value:
        parts = []
        for seg in value:
            if isinstance(seg, dict) and "text" in seg:
                parts.append(seg["text"])
            elif isinstance(seg, str):
                parts.append(seg)
        return " ".join(parts).strip() or None
    return str(value)


def _extract_price(value: Any) -> float | None:
    """Parse a single price like '$17.83' or '-' to float, or None if missing."""
    if value is None:
        return None
    s = str(value).strip().replace("$", "").replace(",", "").split("-")[0].split("–")[0].split("~")[0].strip()
    if s in ("", "N/A", "n/a"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _extract_price_range(value: Any) -> tuple[float | None, float | None]:
    """Parse '$13.90 - $42.49' → (13.90, 42.49); single price → (price, None)."""
    if value is None:
        return None, None
    s = str(value).strip()
    # Try range separators: ' - ', '–', '~'
    for sep in (" - ", "–", " ~ "):
        if sep in s:
            parts = s.split(sep, 1)
            low  = _parse_single_price(parts[0])
            high = _parse_single_price(parts[1])
            # Return (min, max) sorted
            if low is not None and high is not None:
                return (min(low, high), max(low, high))
            return low, high
    price = _parse_single_price(s)
    return price, None


def _parse_single_price(s: str) -> float | None:
    s = s.strip().replace("$", "").replace(",", "")
    if s in ("-", "", "N/A", "n/a"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


_PRICE_RANGE_COLS = {
    "tt1_price": "tt1_price_max",
    "tt2_price": "tt2_price_max",
    "tt3_price": "tt3_price_max",
    "tt4_price": "tt4_price_max",
}


def _normalize_record(fields: dict) -> dict:
    # Initialise all known columns (including _max variants) to None
    out: dict[str, Any] = {col: None for _, (col, _) in FEISHU_FIELD_MAP.items()}
    for max_col in _PRICE_RANGE_COLS.values():
        out[max_col] = None

    # Normalise incoming field names (collapse multiple spaces)
    norm_fields = {" ".join(k.split()): v for k, v in fields.items()}
    for norm_name, (db_col, cast) in _FIELD_MAP_NORM.items():
        if norm_name not in norm_fields:
            continue
        raw = norm_fields[norm_name]
        if db_col == "image_url":
            val = _extract_image_url(raw)
            if val:
                out["image_url"] = val
        elif cast is float and db_col in _PRICE_RANGE_COLS:
            # Parse range prices (e.g. "$13.90 - $42.49")
            low, high = _extract_price_range(raw)
            out[db_col] = low
            out[_PRICE_RANGE_COLS[db_col]] = high
        elif cast is float:
            out[db_col] = _extract_price(raw)
        else:
            out[db_col] = _extract_text(raw)
    return out


def sync() -> dict:
    records = _fetch_all_records()
    inserted = updated = skipped = 0
    with db.db_cursor() as cur:
        for rec in records:
            fields = rec.get("fields", {})
            norm = _normalize_record(fields)
            if not norm["product_no"]:
                skipped += 1
                continue
            cur.execute("SELECT 1 FROM products WHERE product_no = ?", (norm["product_no"],))
            exists = cur.fetchone() is not None
            cur.execute("""
                INSERT INTO products (product_no, source_id, image_url, warehouse_name,
                    sku, status, stores_available, upload_status,
                    tk1_product_id, tk2_product_id, tk3_product_id, tk4_product_id,
                    tk1_seller_sku, tk2_seller_sku, tk3_seller_sku, tk4_seller_sku,
                    cost, tt1_price, tt2_price, tt3_price, tt4_price,
                    tt1_price_max, tt2_price_max, tt3_price_max, tt4_price_max,
                    synced_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
                ON CONFLICT(product_no) DO UPDATE SET
                    source_id=excluded.source_id, image_url=excluded.image_url,
                    warehouse_name=excluded.warehouse_name, sku=excluded.sku,
                    status=excluded.status, stores_available=excluded.stores_available,
                    upload_status=excluded.upload_status,
                    tk1_product_id=excluded.tk1_product_id, tk2_product_id=excluded.tk2_product_id,
                    tk3_product_id=excluded.tk3_product_id, tk4_product_id=excluded.tk4_product_id,
                    tk1_seller_sku=excluded.tk1_seller_sku, tk2_seller_sku=excluded.tk2_seller_sku,
                    tk3_seller_sku=excluded.tk3_seller_sku, tk4_seller_sku=excluded.tk4_seller_sku,
                    cost=excluded.cost,
                    tt1_price=excluded.tt1_price, tt2_price=excluded.tt2_price,
                    tt3_price=excluded.tt3_price, tt4_price=excluded.tt4_price,
                    tt1_price_max=excluded.tt1_price_max, tt2_price_max=excluded.tt2_price_max,
                    tt3_price_max=excluded.tt3_price_max, tt4_price_max=excluded.tt4_price_max,
                    synced_at=CURRENT_TIMESTAMP
            """, (
                norm["product_no"], norm["source_id"], norm["image_url"], norm["warehouse_name"],
                norm["sku"], norm["status"], norm["stores_available"], norm["upload_status"],
                norm["tk1_product_id"], norm["tk2_product_id"], norm["tk3_product_id"], norm["tk4_product_id"],
                norm["tk1_seller_sku"], norm["tk2_seller_sku"], norm["tk3_seller_sku"], norm["tk4_seller_sku"],
                norm["cost"], norm["tt1_price"], norm["tt2_price"], norm["tt3_price"], norm["tt4_price"],
                norm["tt1_price_max"], norm["tt2_price_max"], norm["tt3_price_max"], norm["tt4_price_max"],
            ))
            if exists:
                updated += 1
            else:
                inserted += 1
    return {"total_fetched": len(records), "inserted": inserted, "updated": updated, "skipped": skipped}


# ─── Warehouse Inventory (14-sheet logic) ─────────────────────────────────────

def _fetch_warehouse_records() -> list[dict]:
    """Fetch all records from warehouse table."""
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = (f"{FEISHU_BASE}/bitable/v1/apps/{config.FEISHU_APP_TOKEN}"
           f"/tables/{config.FEISHU_WAREHOUSE_TABLE_ID}/records")
    all_records: list[dict] = []
    page_token = None
    while True:
        params: dict = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        r = requests.get(url, headers=headers, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu warehouse fetch failed: {data}")
        all_records.extend(data["data"].get("items", []))
        if not data["data"].get("has_more"):
            break
        page_token = data["data"].get("page_token")
    return all_records


def fetch_warehouse_inventory(sku_warehouse_group: dict | None = None) -> dict:
    """
    Fetch warehouse inventory from local database (synced from Feishu wiki).
    Returns a multi-format dict compatible with both TikTok and Shein automations.
    Format: {sku: {"stock": total_qty, "Warehouse Group 1": qty, ...}}
    """
    from .warehouse import get_inventory_data_for_automation
    records = get_inventory_data_for_automation()
    
    warehouse_groups = {
        "Warehouse 6":          ["YQN Los Angeles Warehouse #7", "Warehouse 6", "Warehouse6", "仓 6"],
        "MPR_NJ_US":            ["MPR_NJ_US", "MPR", "运去哪 MPR", "MPR US"],
        "美西谷仓":             ["谷仓 美西仓库", "美西谷仓", "美西仓库", "芝加哥2仓", "易可美", "谷仓"],
        "昭临 US01 / 06 / 07":  ["US_JB001", "美西1号仓", "US_JB06", "US_JB07", "美西6号仓", "昭临", "JB01", "JB07"],
        "COPE":                 ["运去哪 COPE_CA_US", "COPE_CA_US", "COPE", "运去哪COPE"],
        "RDW":                  ["YQN Los Angeles Warehouse #1", "RDW", "运去哪RDW", "RDW LA"],
    }
    
    inventory_agg: dict = {}
    
    for row in records:
        sku = str(row["sku"]).strip().upper()
        if sku.endswith(".0"): sku = sku[:-2]
        if not sku or sku == "NAN":
            continue

            
        qty = row["stock_quantity"] or 0
        wh_name = str(row["warehouse_name"]).strip()
        
        # Determine TikTok group
        assigned_group = None
        
        # 1. Check ERP mapping first if provided
        if sku_warehouse_group and sku in sku_warehouse_group:
            assigned_group = sku_warehouse_group[sku]
        
        # 2. Fallback to keyword matching on warehouse_name
        if not assigned_group:
            for group_name, keywords in warehouse_groups.items():
                if any(k.lower() in wh_name.lower() for k in keywords):
                    assigned_group = group_name
                    break
        
        # 3. Final default
        if not assigned_group:
            assigned_group = "COPE"
        
        if sku not in inventory_agg:
            # Initialize with 0 for all TikTok groups and a "stock" field for Shein
            inventory_agg[sku] = {g: 0 for g in warehouse_groups}
            inventory_agg[sku]["stock"] = 0
            
        inventory_agg[sku][assigned_group] += qty
        inventory_agg[sku]["stock"] += qty
        
    return inventory_agg


# ─── Wiki-based Warehouse Sync ─────────────────────────────────────────────────
# Optimised: resolve the spreadsheet token ONCE, then fetch all sheets in parallel.

# Module-level cache so the expensive wiki/spreadsheet resolution is done at most
# once per process lifetime (valid for hours; re-runs on backend restart).
_WIKI_CACHE: dict[str, Any] = {
    "spreadsheet_token": None,
    "sheets": [],           # list of {sheet_id, title}
    "fetched_at": 0.0,
}
_WIKI_CACHE_TTL = 3600  # seconds – re-resolve once per hour


def _resolve_spreadsheet(force: bool = False) -> tuple[str, list[dict]]:
    """
    Return (spreadsheet_token, sheets_list) using cached values if possible.
    Performs at most 2 HTTP requests (wiki resolve + sheet list).
    """
    now = time.time()
    if (
        not force
        and _WIKI_CACHE["spreadsheet_token"]
        and now - _WIKI_CACHE["fetched_at"] < _WIKI_CACHE_TTL
    ):
        return _WIKI_CACHE["spreadsheet_token"], _WIKI_CACHE["sheets"]

    headers = {"Authorization": f"Bearer {_get_tenant_token()}"}

    # Step 1 – resolve wiki node → spreadsheet token
    r = requests.get(
        "https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node",
        headers=headers,
        params={"token": config.FEISHU_WIKI_TOKEN},
        timeout=15,
    )
    d = r.json() if r.status_code == 200 else {}
    obj_token = d.get("data", {}).get("node", {}).get("obj_token")
    spreadsheet_token = obj_token or config.FEISHU_WIKI_TOKEN

    # Step 2 – get sheet list
    r2 = requests.get(
        f"https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query",
        headers=headers,
        timeout=15,
    )
    sheets = r2.json().get("data", {}).get("sheets", []) if r2.status_code == 200 else []

    _WIKI_CACHE["spreadsheet_token"] = spreadsheet_token
    _WIKI_CACHE["sheets"] = sheets
    _WIKI_CACHE["fetched_at"] = now
    return spreadsheet_token, sheets


def _fetch_single_sheet(sheet_id: str, spreadsheet_token: str, sheets: list[dict]) -> list[dict]:
    """
    Fetch one sheet's rows.  Called in parallel by fetch_all_warehouse_from_wiki.
    Returns list of {fields: {col: val}, _row_index: int, _sheet_id: str}.
    """
    headers = {"Authorization": f"Bearer {_get_tenant_token()}"}

    # Resolve sheet identifier (prefer sheet_id match, fall back to title match)
    sheet_identifier = sheet_id
    for s in sheets:
        if s.get("sheet_id") == sheet_id or s.get("title") == sheet_id:
            sheet_identifier = s.get("sheet_id")
            break

    values_url = (
        f"https://open.feishu.cn/open-apis/sheets/v2/spreadsheets"
        f"/{spreadsheet_token}/values/{sheet_identifier}!A1:Z5000"
    )
    try:
        r = requests.get(values_url, headers=headers, timeout=30)
        if r.status_code == 200:
            data = r.json()
            if data.get("code") == 0:
                rows = data.get("data", {}).get("valueRange", {}).get("values", [])
                if rows and len(rows) > 1:
                    headers_row = [str(v or "").strip() for v in rows[0]]
                    result = []
                    for ri, row in enumerate(rows[1:]):
                        record: dict[str, Any] = {"fields": {}, "_row_index": ri + 1, "_sheet_id": sheet_id}
                        for i, h in enumerate(headers_row):
                            if i < len(row):
                                record["fields"][h] = row[i]
                        result.append(record)
                    return result
    except Exception as e:
        print(f"Sheet {sheet_id} fetch error: {e}")
    return []


def fetch_wiki_sheet_data(sheet_id: str) -> list[dict]:
    """Fetch a single wiki sheet (convenience wrapper used by external callers)."""
    spreadsheet_token, sheets = _resolve_spreadsheet()
    return _fetch_single_sheet(sheet_id, spreadsheet_token, sheets)


def fetch_all_warehouse_from_wiki() -> list[dict]:
    """
    Fetch ALL configured warehouse sheets in parallel.

    Key optimisations vs the old sequential approach:
      • spreadsheet token + sheet list resolved ONCE (cached for 1 hour)
      • all 15 sheet data calls run concurrently via ThreadPoolExecutor
      • total time ≈ max(single_sheet_time) instead of sum(all_sheet_times)
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    spreadsheet_token, sheets = _resolve_spreadsheet()

    sheet_ids = config.WAREHOUSE_SHEET_IDS
    all_records: list[dict] = []

    def _fetch(sid: str) -> list[dict]:
        try:
            return _fetch_single_sheet(sid, spreadsheet_token, sheets)
        except Exception as e:
            print(f"Failed to fetch sheet {sid}: {e}")
            return []

    # Up to 8 concurrent requests – keeps Feishu API happy while still being fast
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch, sid): sid for sid in sheet_ids}
        for future in as_completed(futures):
            all_records.extend(future.result())

    return all_records
