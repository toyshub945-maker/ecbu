"""Warehouse Management - Core Logic"""
import time
from typing import Any
import requests
from . import config, db
from .feishu import _get_tenant_token, _extract_text, fetch_all_warehouse_from_wiki

FEISHU_BASE = "https://open.feishu.cn/open-apis"

WAREHOUSE_SHEET_NAMES = [
    "Sheet1", "Sheet2", "Sheet3", "Sheet4", "Sheet5",
    "Sheet6", "Sheet7", "Sheet8", "Sheet9", "Sheet10",
    "Sheet11", "Sheet12", "Sheet13", "Sheet14"
]


def _get_warehouse_table_token() -> str:
    """Get the table token for warehouse app."""
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    url = f"{FEISHU_BASE}/bitable/v1/apps/{config.FEISHU_APP_TOKEN}/tables"
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    data = r.json()
    
    if data.get("code") != 0:
        raise RuntimeError(f"Failed to list tables: {data}")
    
    tables = data["data"].get("items", [])
    for table in tables:
        if table.get("table_id") == config.FEISHU_WAREHOUSE_TABLE_ID:
            return table.get("default_view_id", table.get("table_id"))
    
    return config.FEISHU_WAREHOUSE_TABLE_ID


def _fetch_warehouse_records(sheet_name: str | None = None) -> list[dict]:
    """Fetch records from warehouse table (legacy bitable)."""
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    url = (f"{FEISHU_BASE}/bitable/v1/apps/{config.FEISHU_APP_TOKEN}"
           f"/tables/{config.FEISHU_WAREHOUSE_TABLE_ID}/records")
    
    all_records = []
    page_token = None
    
    while True:
        params = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        
        r = requests.get(url, headers=headers, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu records fetch failed: {data}")
        
        items = data["data"].get("items", [])
        
        if sheet_name:
            items = [item for item in items if item.get("fields", {}).get("Sheet") == sheet_name]
        
        all_records.extend(items)
        
        if not data["data"].get("has_more"):
            break
        page_token = data["data"].get("page_token")
    
    return all_records


def sync_from_feishu() -> dict:
    """Sync all warehouse data from Feishu wiki to local database."""
    records = fetch_all_warehouse_from_wiki()
    
    if not records:
        return {"total": 0, "inserted": 0, "updated": 0, "error": "No records found in Feishu wiki"}
    
    def detect_keys(fields):
        if not fields:
            return {
                "product_no": None, "picture": None, "sku": None, 
                "stock": None, "availability": None, "warehouse": None, "sheet": None
            }
        field_names = list(fields.keys())
        keys = {
            "product_no": None, "picture": None, "sku": None, 
            "stock": None, "availability": None, "warehouse": None, "sheet": None
        }
        for name in field_names:
            n = str(name).lower()
            if not keys["product_no"] and ("product" in n and "no" in n): keys["product_no"] = name
            if not keys["picture"] and ("picture" in n or "image" in n): keys["picture"] = name
            if not keys["sku"] and ("sku" in n and "seller" not in n): keys["sku"] = name
            
            # Prioritize specific stock volume columns
            if not keys["stock"]:
                if any(k in n for k in ["available products volume", "actual stock", "available stock", "inventory volume", "available"]):
                    keys["stock"] = name
            
            if not keys["availability"] and any(k in n for k in ["availability", "status"]): keys["availability"] = name
            if not keys["warehouse"] and ("warehouse" in n and "sku" not in n): keys["warehouse"] = name
            if not keys["sheet"] and ("sheet" in n or "tab" in n): keys["sheet"] = name
            
        # Fallback for stock if no specific match
        if not keys["stock"]:
            for name in field_names:
                n = str(name).lower()
                if any(k in n for k in ["available", "volume", "stock", "qty"]) and n != "availability":
                    keys["stock"] = name
                    break
        return keys

    sheet_column_maps = {} # Cache per sheet_id

    
    # Get sheet ID to title mapping from the spreadsheet
    sheet_id_to_title = {}
    try:
        wiki_token = config.FEISHU_WIKI_TOKEN
        spreadsheet_token, _ = resolve_wiki_to_spreadsheet_token(wiki_token)
        
        headers = {"Authorization": f"Bearer {_get_tenant_token()}"}
        sheets_url = f"https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query"
        r = requests.get(sheets_url, headers=headers, timeout=30)
        if r.status_code == 200:
            sheets = r.json().get("data", {}).get("sheets", [])
            for s in sheets:
                sheet_id_to_title[s.get("sheet_id")] = s.get("title")
    except Exception as e:
        print(f"Warning: Failed to fetch sheet titles: {e}")
        # Fallback to IDs or manual mapping if needed
    
    inserted = 0
    
    try:
        with db.db_cursor() as cur:
            for rec in records:
                fields = rec.get("fields", {})
                sheet_id = rec.get("_sheet_id", "Sheet1")
                
                if sheet_id not in sheet_column_maps:
                    sheet_column_maps[sheet_id] = detect_keys(fields)
                    print(f"Sheet {sheet_id} detected keys: {sheet_column_maps[sheet_id]}")
                
                keys = sheet_column_maps[sheet_id]
                
                sheet_name = sheet_id_to_title.get(sheet_id, sheet_id)
                feishu_row_index = rec.get("_row_index")
                
                warehouse_key = keys["warehouse"]
                warehouse_name = _extract_text(fields.get(warehouse_key)) if warehouse_key else "Warehouse"
                if not warehouse_name:
                    warehouse_name = sheet_name
                
                product_no_key = keys["product_no"]
                product_no = _extract_text(fields.get(product_no_key)) if product_no_key else ""
                
                picture_key = keys["picture"]
                picture = fields.get(picture_key) if picture_key else ""
                
                availability_key = keys["availability"]
                availability = _extract_text(fields.get(availability_key)) if availability_key else "In Stock"
                
                sku_key = keys["sku"]
                sku = _extract_text(fields.get(sku_key))
                if not sku:
                    continue
                
                stock_key = keys["stock"]
                stock = fields.get(stock_key) if stock_key else 0
                
                if isinstance(stock, (int, float)):
                    stock = int(stock)
                else:
                    try:
                        stock = int(float(str(stock)))
                    except (ValueError, TypeError):
                        stock = 0
                
                cur.execute("""
                    INSERT INTO warehouse_inventory (sheet_id, sheet_name, feishu_row_index, warehouse_name, sku, stock_quantity, product_no, picture, availability, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(sheet_id, feishu_row_index) DO UPDATE SET
                        sheet_name=excluded.sheet_name,
                        warehouse_name=excluded.warehouse_name,
                        sku=excluded.sku,
                        stock_quantity=excluded.stock_quantity,
                        product_no=excluded.product_no,
                        picture=excluded.picture,
                        availability=excluded.availability,
                        updated_at=CURRENT_TIMESTAMP
                """, (sheet_id, sheet_name, feishu_row_index, warehouse_name, sku, stock, product_no, picture, availability))
                
                inserted += 1
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e
    
    return {"total": len(records), "inserted": inserted, "updated": len(records) - inserted}


def get_inventory_all() -> list[dict]:
    """Get all warehouse inventory."""
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT * FROM warehouse_inventory 
            ORDER BY sheet_name, sku
        """)
        return [dict(r) for r in cur.fetchall()]


def get_inventory_by_sheet(sheet_name: str) -> list[dict]:
    """Get inventory for specific sheet/warehouse."""
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT * FROM warehouse_inventory 
            WHERE sheet_name = ?
            ORDER BY sku
        """, (sheet_name,))
        return [dict(r) for r in cur.fetchall()]


def update_inventory(id: int, stock_quantity: int) -> dict:
    """Update inventory record and push to Feishu."""
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT sheet_name, sku FROM warehouse_inventory WHERE id = ?
        """, (id,))
        row = cur.fetchone()
        if not row:
            raise ValueError("Record not found")
        
        sheet_name = row[0]
        sku = row[1]
        
        cur.execute("""
            UPDATE warehouse_inventory 
            SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        """, (stock_quantity, id))
    
    success = push_to_feishu_single(sheet_name, sku, stock_quantity)
    
    if success:
        # Also update local DB for "All Sheets" view consistency
        with db.db_cursor() as cur:
            cur.execute("""
                UPDATE warehouse_inventory 
                SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            """, (stock_quantity, id))
            
    return {"ok": True, "id": id, "feishu_updated": success}


def delete_inventory(id: int) -> dict:
    """Delete inventory record."""
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM warehouse_inventory WHERE id = ?", (id,))
    return {"ok": True, "id": id}


def add_inventory(sheet_name: str, warehouse_name: str, sku: str, stock_quantity: int) -> dict:
    """Add new inventory record."""
    with db.db_cursor() as cur:
        cur.execute("""
            INSERT INTO warehouse_inventory (sheet_name, warehouse_name, sku, stock_quantity)
            VALUES (?, ?, ?, ?)
        """, (sheet_name, warehouse_name, sku, stock_quantity))
        new_id = cur.lastrowid
    
    success = push_to_feishu_single(sheet_name, sku, stock_quantity)
    
    return {"ok": True, "id": new_id, "feishu_updated": success}


def push_to_feishu_single(sheet_name: str, sku: str, stock_quantity: int) -> bool:
    """Push single record update to Feishu."""
    try:
        token = _get_tenant_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        url = (f"{FEISHU_BASE}/bitable/v1/apps/{config.FEISHU_APP_TOKEN}"
               f"/tables/{config.FEISHU_WAREHOUSE_TABLE_ID}/records")
        
        records = _fetch_warehouse_records()
        
        record_id = None
        for rec in records:
            fields = rec.get("fields", {})
            if _extract_text(fields.get("SKU")) == sku:
                record_id = rec.get("record_id")
                break
        
        if record_id:
            url = f"{url}/{record_id}"
            method = "put"
            data = {
                "fields": {
                    "Available Products Volume": stock_quantity
                }
            }
        else:
            method = "post"
            data = {
                "fields": {
                    "Sheet": sheet_name,
                    "SKU": sku,
                    "Available Products Volume": stock_quantity
                }
            }
        
        if method == "put":
            r = requests.put(url, headers=headers, json=data, timeout=30)
        else:
            r = requests.post(url, headers=headers, json=data, timeout=30)
        
        return r.status_code in (200, 201)
    except Exception as e:
        print(f"Feishu push failed: {e}")
        return False


def get_summary() -> dict:
    """Get warehouse summary stats."""
    with db.db_cursor() as cur:
        cur.execute("SELECT COUNT(DISTINCT sku) as total_skus FROM warehouse_inventory")
        total_skus = cur.fetchone()[0] or 0
        
        cur.execute("SELECT SUM(stock_quantity) as total_stock FROM warehouse_inventory")
        total_stock = cur.fetchone()[0] or 0
        
        cur.execute("SELECT sheet_name, COUNT(*) as sku_count, SUM(stock_quantity) as stock FROM warehouse_inventory GROUP BY sheet_name")
        by_sheet = [dict(r) for r in cur.fetchall()]
        
        cur.execute("SELECT MAX(updated_at) as last_sync FROM warehouse_inventory")
        last_sync = cur.fetchone()[0]
        # Append 'Z' to indicate UTC so the browser converts to local time (Sri Lanka)
        if last_sync and 'Z' not in str(last_sync):
            # Convert "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ"
            last_sync = str(last_sync).replace(" ", "T") + "Z"
    
    return {
        "total_skus": total_skus,
        "total_stock": total_stock,
        "by_sheet": by_sheet,
        "last_sync": last_sync
    }


def search_inventory(query: str) -> list[dict]:
    """Search inventory by SKU."""
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT * FROM warehouse_inventory 
            WHERE sku LIKE ? OR warehouse_name LIKE ?
            ORDER BY sku
            LIMIT 100
        """, (f"%{query}%", f"%{query}%"))
        return [dict(r) for r in cur.fetchall()]


def add_product(product_no: str, sku: str, warehouse_name: str = None, image_url: str = None) -> dict:
    """Add new warehouse product."""
    with db.db_cursor() as cur:
        cur.execute("""
            INSERT INTO warehouse_products (product_no, sku, warehouse_name, image_url)
            VALUES (?, ?, ?, ?)
        """, (product_no, sku, warehouse_name, image_url))
        new_id = cur.lastrowid
    return {"ok": True, "id": new_id}


def get_products() -> list[dict]:
    """Get all warehouse products."""
    with db.db_cursor() as cur:
        cur.execute("SELECT * FROM warehouse_products ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]


def delete_product(id: int) -> dict:
    """Delete warehouse product."""
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM warehouse_products WHERE id = ?", (id,))
    return {"ok": True, "id": id}


def upload_image_to_feishu(file_content: bytes, filename: str) -> dict:
    """Upload image to Feishu and return token/URL."""
    try:
        token = _get_tenant_token()
        
        upload_url = f"{FEISHU_BASE}/drive/v1/files/upload"
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        files = {
            "file": (filename, file_content, "image/jpeg")
        }
        data = {
            "parent_node": "root",
            "file_name": filename
        }
        
        r = requests.post(upload_url, headers=headers, files=files, data=data, timeout=60)
        result = r.json()
        
        if result.get("code") == 0:
            file_token = result["data"]["file_token"]
            return {
                "ok": True,
                "file_token": file_token,
                "image_url": f"https://open.feishu.cn/file/{file_token}"
            }
        else:
            return {"ok": False, "error": result.get("msg", "Upload failed")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def resolve_wiki_to_spreadsheet_token(wiki_token: str) -> tuple[str, str]:
    """Resolve wiki token to spreadsheet token.
    
    Returns: (spreadsheet_token, obj_type)
    """
    headers = {"Authorization": f"Bearer {_get_tenant_token()}"}
    
    url = "https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node"
    r = requests.get(url, headers=headers, params={"token": wiki_token}, timeout=30)
    
    if r.status_code != 200:
        raise RuntimeError(f"Failed to resolve wiki token: {r.status_code}")
    
    d = r.json()
    obj_token = d.get("data", {}).get("node", {}).get("obj_token")
    obj_type = d.get("data", {}).get("node", {}).get("obj_type")
    
    if not obj_token:
        raise RuntimeError("Could not resolve spreadsheet token from wiki")
    
    return obj_token, obj_type


def get_sheet_info_from_spreadsheet(spreadsheet_token: str, sheet_id: str) -> dict:
    """Get sheet info (title, index) from spreadsheet."""
    headers = {"Authorization": f"Bearer {_get_tenant_token()}"}
    
    sheets_url = f"https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query"
    r = requests.get(sheets_url, headers=headers, timeout=30)
    
    if r.status_code != 200:
        raise RuntimeError(f"Failed to get sheet info: {r.status_code}")
    
    sheets = r.json().get("data", {}).get("sheets", [])
    
    for s in sheets:
        if s.get("sheet_id") == sheet_id:
            return {
                "sheet_id": s.get("sheet_id"),
                "title": s.get("title"),
                "index": s.get("index", 0)
            }
    
    raise RuntimeError(f"Sheet {sheet_id} not found")


def write_to_feishu_sheet(sheet_id: str, row_index: int, column: str, value: any) -> dict:
    """Write single cell value to Feishu Wiki sheet using Sheets v2 API.
    
    Args:
        sheet_id: The wiki sheet ID (e.g., "FDZV3b")
        row_index: 0-based row index (0 = row 1, which is header)
        column: Column letter (e.g., "D", "E") or column name
        value: The value to write
    
    Flow:
    1. Get spreadsheet_token from wiki token via /wiki/v2/spaces/get_node
    2. Find sheet info via /sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query
    3. PUT via /open-apis/sheets/v2/spreadsheets/{spreadsheet_token}/values
    """
    from .feishu import _get_tenant_token
    
    wiki_token = config.FEISHU_WIKI_TOKEN
    spreadsheet_token, _ = resolve_wiki_to_spreadsheet_token(wiki_token)
    
    sheet_info = get_sheet_info_from_spreadsheet(spreadsheet_token, sheet_id)
    sheet_title = sheet_info.get("title", sheet_id)
    
    headers = {
        "Authorization": f"Bearer {_get_tenant_token()}",
        "Content-Type": "application/json"
    }
    
    value_range = f"{sheet_title}!{column}{row_index + 1}:{column}{row_index + 1}"
    
    payload = {
        "valueRange": {
            "range": value_range,
            "values": [[value]]
        }
    }
    
    url = f"https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{spreadsheet_token}/values"
    
    try:
        r = requests.put(url, headers=headers, json=payload, timeout=30)
        result = r.json()
        
        if result.get("code") == 0:
            return {"ok": True, "spreadsheet_token": spreadsheet_token, "range": value_range}
        else:
            return {"ok": False, "error": result.get("msg", "Write failed")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def write_inventory_cell(db_id: int, column: str, value: any) -> dict:
    """Write inventory cell and update local cache."""
    with db.db_cursor() as cur:
        cur.execute("SELECT sheet_id, feishu_row_index FROM warehouse_inventory WHERE id = ?", (db_id,))
        row = cur.fetchone()
        if not row:
            return {"ok": False, "error": f"Record {db_id} not found in local database"}
        
        sheet_id = row["sheet_id"]
        feishu_row_index = row["feishu_row_index"]
    
    if feishu_row_index is None:
        return {"ok": False, "error": "Feishu row index unknown. Please sync first."}

    # Update Feishu
    result = write_to_feishu_sheet(sheet_id, feishu_row_index, column, value)
    
    if result.get("ok"):
        # Update local DB
        with db.db_cursor() as cur:
            if column == "D": # Available Products Volume
                cur.execute("UPDATE warehouse_inventory SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (value, db_id))
            elif column == "E": # Availability
                cur.execute("UPDATE warehouse_inventory SET availability = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (value, db_id))
                
        return {"ok": True, "db_id": db_id, "sheet_id": sheet_id, "feishu_row": feishu_row_index}
    
    return result


def get_inventory_data_for_automation() -> list[dict]:
    """Fetch all warehouse inventory records from local database for use in automations."""
    with db.db_cursor() as cur:
        cur.execute("SELECT sku, stock_quantity, warehouse_name FROM warehouse_inventory")
        return [dict(r) for r in cur.fetchall()]