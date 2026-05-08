from __future__ import annotations

import os
import shutil
import tempfile
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import auth, config, db, feishu
from .analytics_ingest import parse_workflow_excel
from .tiktok_export_ingest import parse_tiktok_export
from .process_tiktok import run_automation
from .process_shein import process_uploaded_files as process_shein_files, process_shein_files_with_data
from .feishu import fetch_warehouse_inventory
from . import warehouse
from . import ads

db.init_db()
auth.ensure_admin_exists()

app = FastAPI(title="Workflow Dashboard", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat() + "Z"}


# ─── Auth ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = auth.authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth.create_access_token(user["id"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "store_code": user["store_code"],
        },
    }


@app.get("/api/auth/me")
def me(current_user: dict | None = None):
    return current_user


# ─── Users ───────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "member"
    store_code: Optional[str] = None


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    store_code: Optional[str] = None


@app.get("/api/users")
def list_users(current_user: dict | None = None):
    with db.db_cursor() as cur:
        cur.execute("SELECT id, name, email, role, store_code, created_at FROM users ORDER BY name")
        return {"users": [dict(r) for r in cur.fetchall()]}


@app.post("/api/users", status_code=201)
def create_user(req: CreateUserRequest, _: dict = Depends(auth.require_admin)):
    try:
        with db.db_cursor() as cur:
            cur.execute(
                "INSERT INTO users (name, email, password_hash, role, store_code) VALUES (?,?,?,?,?)",
                (req.name, req.email, auth.hash_password(req.password), req.role, req.store_code),
            )
            user_id = cur.lastrowid
        return {"id": user_id, "name": req.name, "email": req.email, "role": req.role, "store_code": req.store_code}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(400, "Email already exists")
        raise HTTPException(500, str(e))


@app.put("/api/users/{user_id}")
def update_user(user_id: int, req: UpdateUserRequest, _: dict = Depends(auth.require_admin)):
    with db.db_cursor() as cur:
        if req.name:
            cur.execute("UPDATE users SET name=? WHERE id=?", (req.name, user_id))
        if req.email:
            cur.execute("UPDATE users SET email=? WHERE id=?", (req.email, user_id))
        if req.password:
            cur.execute("UPDATE users SET password_hash=? WHERE id=?", (auth.hash_password(req.password), user_id))
        if req.role:
            cur.execute("UPDATE users SET role=? WHERE id=?", (req.role, user_id))
        if req.store_code is not None:
            cur.execute("UPDATE users SET store_code=? WHERE id=?", (req.store_code or None, user_id))
    return {"ok": True}


@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(auth.require_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(400, "Cannot delete yourself")
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM users WHERE id=?", (user_id,))
    return {"ok": True}


# ─── Stores ──────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/stores")
def list_stores():
    return {"stores": config.STORES}


# ─── Feishu ──────────────────────────────────────────────────────────────────

@app.post("/api/feishu/sync")
def feishu_sync(_: dict = Depends(auth.get_current_user)):
    if not config.FEISHU_APP_SECRET:
        raise HTTPException(400, "FEISHU_APP_SECRET not configured in .env")
    try:
        result = feishu.sync()
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(500, f"Feishu sync failed: {e}")


@app.get("/api/pricing")
def get_pricing(
    store_code: Optional[str] = None,
    q: str = "",
    _: dict = Depends(auth.get_current_user),
):
    """
    Return products with price, cost, and calculated profit margins.
    Profit formula (per store):
      cost_usd  = cost_rmb / 7 + 1.5 (first mile) + 9.5 (last mile)
      cost_pct  = cost_usd / selling_price
      with_ads    = 1 - cost_pct - 0.03(warehouse) - 0.08(tiktok fee)
                      - 0.10(refund) - 0.13(affiliate) - 0.05(ads)
      without_ads = with_ads + 0.05
    """
    EXCHANGE_RATE   = 7.0
    FIRST_MILE      = 1.5
    LAST_MILE       = 9.5
    WAREHOUSE       = 0.03
    TIKTOK_FEE      = 0.08
    REFUND          = 0.10
    AFFILIATE       = 0.13
    ADS             = 0.05
    FIXED_FEES      = WAREHOUSE + TIKTOK_FEE + REFUND + AFFILIATE

    STORE_PRICE_COL = {
        "TK1": ("tt1_price", "tt1_price_max"),
        "TK2": ("tt2_price", "tt2_price_max"),
        "TK3": ("tt3_price", "tt3_price_max"),
        "TK4": ("tt4_price", "tt4_price_max"),
    }

    with db.db_cursor() as cur:
        cur.execute(
            "SELECT product_no, warehouse_name, image_url, cost, "
            "tt1_price, tt2_price, tt3_price, tt4_price, "
            "tt1_price_max, tt2_price_max, tt3_price_max, tt4_price_max "
            "FROM products WHERE cost IS NOT NULL"
        )
        rows = [dict(r) for r in cur.fetchall()]

    def calc(cost_rmb, price_usd):
        if not price_usd or price_usd <= 0:
            return None, None
        cost_usd = cost_rmb / EXCHANGE_RATE + FIRST_MILE + LAST_MILE
        cost_pct = cost_usd / price_usd
        with_ads    = round((1 - cost_pct - FIXED_FEES - ADS)  * 100, 1)
        without_ads = round((1 - cost_pct - FIXED_FEES)        * 100, 1)
        return with_ads, without_ads

    results = []
    for p in rows:
        if q:
            ql = q.lower()
            if ql not in (p["product_no"] or "").lower() and ql not in (p["warehouse_name"] or "").lower():
                continue

        stores: dict = {}
        for code, (col, col_max) in STORE_PRICE_COL.items():
            price     = p.get(col)
            price_max = p.get(col_max)
            if price:
                wa, woa = calc(p["cost"], price)
                entry: dict = {
                    "price": price,
                    "profit_with_ads": wa,
                    "profit_without_ads": woa,
                }
                if price_max and price_max != price:
                    wa_max, woa_max = calc(p["cost"], price_max)
                    entry["price_max"]             = price_max
                    entry["profit_with_ads_max"]   = wa_max
                    entry["profit_without_ads_max"] = woa_max
                stores[code] = entry

        if store_code and store_code not in stores:
            continue
        if not stores:
            continue

        results.append({
            "product_no":     p["product_no"],
            "warehouse_name": p["warehouse_name"],
            "image_url":      p["image_url"],
            "cost_rmb":       p["cost"],
            "stores":         stores,
        })

    results.sort(key=lambda r: r["warehouse_name"] or r["product_no"])
    return {"products": results, "total": len(results)}


@app.get("/api/feishu/status")
def feishu_status(_: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("SELECT COUNT(*), MAX(synced_at) FROM products")
        count, last = cur.fetchone()
    return {"product_count": count or 0, "last_synced_at": last}


# ─── Periods ─────────────────────────────────────────────────────────────────

class PeriodRequest(BaseModel):
    store_code: str
    period_start: str
    period_end: str
    label: Optional[str] = None


@app.get("/api/periods")
def list_periods(store_code: Optional[str] = None, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        if store_code:
            cur.execute(
                "SELECT * FROM weekly_periods WHERE store_code=? ORDER BY period_start DESC",
                (store_code,),
            )
        else:
            cur.execute("SELECT * FROM weekly_periods ORDER BY store_code, period_start DESC")
        return {"periods": [dict(r) for r in cur.fetchall()]}


@app.post("/api/periods", status_code=201)
def create_period(req: PeriodRequest, _: dict = Depends(auth.get_current_user)):
    if req.store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {req.store_code}")
    label = req.label or f"{req.period_start} – {req.period_end}"
    try:
        with db.db_cursor() as cur:
            cur.execute(
                "INSERT INTO weekly_periods (store_code, period_start, period_end, label) VALUES (?,?,?,?)",
                (req.store_code, req.period_start, req.period_end, label),
            )
            return {"id": cur.lastrowid, "store_code": req.store_code,
                    "period_start": req.period_start, "period_end": req.period_end, "label": label}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(409, "Period already exists for this store and dates")
        raise HTTPException(500, str(e))


@app.delete("/api/periods/{period_id}")
def delete_period(period_id: int, _: dict = Depends(auth.require_admin)):
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM weekly_periods WHERE id=?", (period_id,))
    return {"ok": True}


class BoardSelectionRequest(BaseModel):
    period_id: int
    store_code: str
    product_nos: list[str]
    selected: bool


@app.post("/api/board/select")
def update_board_selection(req: BoardSelectionRequest, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        for pno in req.product_nos:
            if req.selected:
                for t in config.TASK_TYPES:
                    cur.execute("""
                        INSERT OR IGNORE INTO product_tasks (product_no, period_id, store_code, task_type, status)
                        VALUES (?,?,?,?,?)
                    """, (pno, req.period_id, req.store_code, t, "todo"))
            else:
                cur.execute("DELETE FROM product_tasks WHERE product_no=? AND period_id=? AND store_code=?", 
                           (pno, req.period_id, req.store_code))
    return {"ok": True}


@app.get("/api/board/stats/{store_code}/{period_id}")
def get_board_stats(store_code: str, period_id: int, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT u.id, u.name, u.role, COUNT(t.id) as done_count
            FROM users u
            LEFT JOIN product_tasks t ON u.id = t.assigned_to AND t.period_id = ? AND t.status = 'done'
            WHERE u.store_code = ? OR u.store_code IS NULL
            GROUP BY u.id, u.name, u.role
            HAVING done_count > 0 OR u.store_code = ?
            ORDER BY done_count DESC
        """, (period_id, store_code, store_code))
        stats = [dict(r) for r in cur.fetchall()]
        return {"stats": stats}


# ─── Board Progress (period-over-period comparison) ──────────────────────────

@app.get("/api/board/progress/{store_code}")
def get_board_progress(store_code: str, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("""
            WITH ranked AS (
                SELECT *,
                    ROW_NUMBER() OVER (PARTITION BY product_no ORDER BY imported_at DESC) AS rn
                FROM tiktok_export_analytics
                WHERE store_code = ?
            )
            SELECT
                c.product_no,
                c.period_start, c.period_end,
                c.gmv, c.orders, c.items_sold, c.impressions,
                c.ctr, c.ctor, c.add_to_cart, c.refunds, c.aov,
                c.listing_status, c.voc_diagnosis,
                p.period_start  AS prev_period_start,
                p.period_end    AS prev_period_end,
                p.gmv           AS prev_gmv,
                p.orders        AS prev_orders,
                p.items_sold    AS prev_items_sold,
                p.impressions   AS prev_impressions,
                p.ctr           AS prev_ctr,
                p.ctor          AS prev_ctor,
                p.add_to_cart   AS prev_add_to_cart,
                p.refunds       AS prev_refunds,
                p.aov           AS prev_aov,
                pr.warehouse_name, pr.image_url
            FROM ranked c
            LEFT JOIN ranked p ON c.product_no = p.product_no AND p.rn = 2
            LEFT JOIN products pr ON c.product_no = pr.product_no
            WHERE c.rn = 1
            ORDER BY c.gmv DESC
        """, [store_code])
        rows = [dict(r) for r in cur.fetchall()]
    return {"rows": rows}


# ─── Board (combined view) ────────────────────────────────────────────────────

@app.get("/api/board")
def get_board(store_code: str, period_id: int, current_user: dict | None = None):
    if store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {store_code}")

    with db.db_cursor() as cur:
        # Validate period exists
        cur.execute("SELECT * FROM weekly_periods WHERE id=? AND store_code=?", (period_id, store_code))
        period = cur.fetchone()
        if not period:
            raise HTTPException(404, "Period not found")

        # Load excluded product nos for this store
        cur.execute("SELECT product_no FROM board_exclusions WHERE store_code=?", (store_code,))
        excluded_nos = {r[0] for r in cur.fetchall()}

        # Load products for this store (Feishu-filtered + manually pinned, minus exclusions)
        cur.execute("""
            SELECT * FROM (
                SELECT DISTINCT p.* FROM products p
                WHERE (
                    p.stores_available IS NULL
                    OR UPPER(p.stores_available) LIKE '%ALL%'
                    OR p.stores_available LIKE ?
                    OR p.stores_available LIKE ?
                    OR p.stores_available = 'MANUAL'
                )
                UNION
                SELECT p.* FROM products p
                JOIN board_pins bp ON p.product_no = bp.product_no AND bp.store_code = ?
            ) ORDER BY sort_order ASC, CAST(product_no AS INTEGER) ASC
        """, (f"%TK{store_code[-1]}%", f"%TK {store_code[-1]}%", store_code))
        all_products = [dict(r) for r in cur.fetchall()]

        # Filter to this store (keeps pinned products even if stores_available doesn't match)
        # Also remove any explicitly excluded products
        cur.execute("SELECT product_no FROM board_pins WHERE store_code=?", (store_code,))
        pinned_nos = {r[0] for r in cur.fetchall()}

        products = [
            p for p in all_products
            if p["product_no"] not in excluded_nos
            and (p["product_no"] in pinned_nos or _product_in_store(p["stores_available"], store_code))
        ]
        if not products and all_products:
            products = [p for p in all_products if p["product_no"] not in excluded_nos]

        product_nos = [p["product_no"] for p in products]
        if not product_nos:
            return {"period": dict(period), "products": [], "users": []}

        placeholders = ",".join("?" * len(product_nos))

        # Load tasks
        cur.execute(
            f"""SELECT t.*, u.name as assigned_name FROM product_tasks t
                LEFT JOIN users u ON t.assigned_to = u.id
                WHERE t.period_id=? AND t.store_code=? AND t.product_no IN ({placeholders})""",
            [period_id, store_code] + product_nos,
        )
        tasks_rows = cur.fetchall()

        # Load analytics
        cur.execute(
            f"SELECT * FROM product_analytics WHERE period_id=? AND store_code=? AND product_no IN ({placeholders})",
            [period_id, store_code] + product_nos,
        )
        analytics_rows = cur.fetchall()

        # Load notes
        cur.execute(
            f"SELECT * FROM product_notes WHERE period_id=? AND store_code=? AND product_no IN ({placeholders})",
            [period_id, store_code] + product_nos,
        )
        notes_rows = cur.fetchall()

        # Load TikTok export analytics that match the selected period's date range.
        # Strategy 1: exact date match (upload covers exactly this week)
        cur.execute(
            f"""SELECT t.* FROM tiktok_export_analytics t
                WHERE t.store_code=?
                AND t.period_start = ?
                AND t.period_end   = ?
                AND t.product_no IN ({placeholders})""",
            [store_code, period["period_start"], period["period_end"]] + product_nos,
        )
        tk_export_rows = cur.fetchall()

        # Strategy 2: if no exact match, use uploads whose date range overlaps the period
        # (handles slight date mismatches, e.g. upload covers Mon-Sun vs Mon-Sun+1)
        if not tk_export_rows:
            cur.execute(
                f"""SELECT t.* FROM tiktok_export_analytics t
                    INNER JOIN (
                        SELECT product_no, MAX(imported_at) as max_ia
                        FROM tiktok_export_analytics
                        WHERE store_code=?
                          AND period_start <= ?
                          AND period_end   >= ?
                        GROUP BY product_no
                    ) latest ON t.product_no = latest.product_no
                           AND t.imported_at = latest.max_ia
                    WHERE t.store_code=? AND t.product_no IN ({placeholders})""",
                [store_code, period["period_end"], period["period_start"],
                 store_code] + product_nos,
            )
            tk_export_rows = cur.fetchall()

        # Load users for assignment dropdowns
        cur.execute("SELECT id, name, role, store_code FROM users WHERE store_code=? OR store_code IS NULL ORDER BY name", (store_code,))
        users = [dict(r) for r in cur.fetchall()]

    # Group by product_no
    tasks_by_product: dict[str, dict] = {}
    for t in tasks_rows:
        t = dict(t)
        pno = t["product_no"]
        if pno not in tasks_by_product:
            tasks_by_product[pno] = {}
        tasks_by_product[pno][t["task_type"]] = {
            "status": t["status"],
            "assigned_to": t["assigned_to"],
            "assigned_name": t["assigned_name"],
            "notes": t["notes"],
        }

    analytics_by_product = {dict(r)["product_no"]: dict(r) for r in analytics_rows}
    notes_by_product = {dict(r)["product_no"]: dict(r) for r in notes_rows}
    tk_export_by_product = {dict(r)["product_no"]: dict(r) for r in tk_export_rows}

    result_products = []
    for p in products:
        pno = p["product_no"]
        if pno not in tasks_by_product:
            continue
            
        result_products.append({
            **p,
            "tasks": tasks_by_product.get(pno, {}),
            "analytics": analytics_by_product.get(pno, {}),
            "notes": notes_by_product.get(pno, {}),
            "tk_export": tk_export_by_product.get(pno),
        })
        
    result_products.sort(key=lambda x: (x.get("sort_order", 0) or 0, int(x["product_no"]) if str(x["product_no"]).isdigit() else 9999))

    return {
        "period": dict(period),
        "products": result_products,
        "all_store_products": products,
        "users": users,
        "task_types": config.TASK_TYPES,
        "task_labels": config.TASK_LABELS,
    }


def _product_in_store(stores_available: str | None, store_code: str) -> bool:
    if not stores_available:
        return True
    s = stores_available.upper()
    if "ALL" in s or s == "MANUAL":
        return True
    if store_code == "SHEIN":
        return "SHEIN" in s
    num = store_code[-1]  # "1" from "TK1"
    # Match TK1, TK 1, TT1, TT 1
    return (f"TK {num}" in s or f"TK{num}" in s or 
            f"TT {num}" in s or f"TT{num}" in s)


# ─── Tasks ───────────────────────────────────────────────────────────────────

class BulkAssignRequest(BaseModel):
    product_nos: list[str]
    period_id: int
    store_code: str
    assigned_to: Optional[int] = None


@app.put("/api/tasks/bulk-assign")
def bulk_assign_tasks(req: BulkAssignRequest, _: dict = Depends(auth.get_current_user)):
    if not req.product_nos:
        return {"ok": True, "updated": 0}
    ph = ",".join("?" * len(req.product_nos))
    with db.db_cursor() as cur:
        if req.assigned_to is not None:
            cur.execute(
                f"UPDATE product_tasks SET assigned_to=? WHERE period_id=? AND store_code=? AND product_no IN ({ph})",
                [req.assigned_to, req.period_id, req.store_code] + req.product_nos,
            )
        else:
            cur.execute(
                f"UPDATE product_tasks SET assigned_to=NULL WHERE period_id=? AND store_code=? AND product_no IN ({ph})",
                [req.period_id, req.store_code] + req.product_nos,
            )
        updated = cur.rowcount
    return {"ok": True, "updated": updated}


class TaskUpsertRequest(BaseModel):
    product_no: str
    period_id: int
    store_code: str
    task_type: str
    status: str
    assigned_to: Optional[int] = None
    notes: Optional[str] = None


@app.put("/api/tasks")
def upsert_task(req: TaskUpsertRequest, _: dict = Depends(auth.get_current_user)):
    if req.task_type not in config.TASK_TYPES:
        raise HTTPException(400, f"Unknown task_type: {req.task_type}")
    valid_statuses = {"todo", "in_progress", "done", "na"}
    if req.status not in valid_statuses:
        raise HTTPException(400, f"status must be one of {valid_statuses}")
    with db.db_cursor() as cur:
        cur.execute("""
            INSERT INTO product_tasks (product_no, period_id, store_code, task_type, status, assigned_to, notes, updated_at)
            VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(product_no, period_id, store_code, task_type) DO UPDATE SET
                status=excluded.status,
                assigned_to=excluded.assigned_to,
                notes=excluded.notes,
                updated_at=CURRENT_TIMESTAMP
        """, (req.product_no, req.period_id, req.store_code, req.task_type,
               req.status, req.assigned_to, req.notes))
    return {"ok": True}


# ─── Notes ───────────────────────────────────────────────────────────────────

class NotesUpsertRequest(BaseModel):
    product_no: str
    period_id: int
    store_code: str
    analysis: Optional[str] = None
    action: Optional[str] = None
    results: Optional[str] = None


@app.put("/api/notes")
def upsert_notes(req: NotesUpsertRequest, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("""
            INSERT INTO product_notes (product_no, period_id, store_code, analysis, action, results, updated_at)
            VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(product_no, period_id, store_code) DO UPDATE SET
                analysis=excluded.analysis,
                action=excluded.action,
                results=excluded.results,
                updated_at=CURRENT_TIMESTAMP
        """, (req.product_no, req.period_id, req.store_code, req.analysis, req.action, req.results))
    return {"ok": True}


# ─── Analytics import ────────────────────────────────────────────────────────

@app.post("/api/analytics/import")
async def import_analytics(
    file: UploadFile = File(...),
    store_code: str = Form(...),
    _: dict = Depends(auth.get_current_user),
):
    if store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {store_code}")

    suffix = Path(file.filename or "file.xlsx").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        parsed = parse_workflow_excel(tmp.name, store_code)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    if "error" in parsed:
        raise HTTPException(400, parsed["error"])

    imported = 0
    periods_created = 0
    errors: list[str] = []

    with db.db_cursor() as cur:
        for entry in parsed.get("entries", []):
            pno = entry["product_no"]
            ps  = entry["period_start"]
            pe  = entry["period_end"]

            # Ensure period exists
            cur.execute(
                "SELECT id FROM weekly_periods WHERE store_code=? AND period_start=? AND period_end=?",
                (store_code, ps, pe),
            )
            row = cur.fetchone()
            if row:
                period_id = row[0]
            else:
                label = f"{ps} – {pe}"
                cur.execute(
                    "INSERT INTO weekly_periods (store_code, period_start, period_end, label) VALUES (?,?,?,?)",
                    (store_code, ps, pe, label),
                )
                period_id = cur.lastrowid
                periods_created += 1

            # Upsert tasks
            for task_type, status in entry.get("tasks", {}).items():
                if task_type not in config.TASK_TYPES:
                    continue
                cur.execute("""
                    INSERT INTO product_tasks (product_no, period_id, store_code, task_type, status, updated_at)
                    VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
                    ON CONFLICT(product_no, period_id, store_code, task_type) DO UPDATE SET
                        status=excluded.status, updated_at=CURRENT_TIMESTAMP
                """, (pno, period_id, store_code, task_type, status))

            # Upsert analytics
            a = entry.get("analytics", {})
            if any(v is not None for v in a.values()):
                cur.execute("""
                    INSERT INTO product_analytics
                        (product_no, period_id, store_code, impressions, page_views, ctr,
                         avg_visitors, avg_customers, cvr, video_impressions,
                         product_card_impressions, live_impressions, items_sold, ctor,
                         new_creators, new_videos, new_live, free_sample_cost,
                         content_gmv, ads_spend, roi, gmv, selling_price, cost_rmb, profit_margin)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(product_no, period_id, store_code) DO UPDATE SET
                        impressions=excluded.impressions, page_views=excluded.page_views,
                        ctr=excluded.ctr, avg_visitors=excluded.avg_visitors,
                        avg_customers=excluded.avg_customers, cvr=excluded.cvr,
                        video_impressions=excluded.video_impressions,
                        product_card_impressions=excluded.product_card_impressions,
                        live_impressions=excluded.live_impressions, items_sold=excluded.items_sold,
                        ctor=excluded.ctor, new_creators=excluded.new_creators,
                        new_videos=excluded.new_videos, new_live=excluded.new_live,
                        free_sample_cost=excluded.free_sample_cost,
                        content_gmv=excluded.content_gmv, ads_spend=excluded.ads_spend,
                        roi=excluded.roi, gmv=excluded.gmv, selling_price=excluded.selling_price,
                        cost_rmb=excluded.cost_rmb, profit_margin=excluded.profit_margin
                """, (
                    pno, period_id, store_code,
                    a.get("impressions"), a.get("page_views"), a.get("ctr"),
                    a.get("avg_visitors"), a.get("avg_customers"), a.get("cvr"),
                    a.get("video_impressions"), a.get("product_card_impressions"), a.get("live_impressions"),
                    a.get("items_sold"), a.get("ctor"),
                    a.get("new_creators"), a.get("new_videos"), a.get("new_live"),
                    a.get("free_sample_cost"), a.get("content_gmv"), a.get("ads_spend"),
                    a.get("roi"), a.get("gmv"), a.get("selling_price"), a.get("cost_rmb"),
                    a.get("profit_margin"),
                ))

            # Upsert notes
            n = entry.get("notes", {})
            if any(v for v in n.values()):
                cur.execute("""
                    INSERT INTO product_notes (product_no, period_id, store_code, analysis, action, results, updated_at)
                    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
                    ON CONFLICT(product_no, period_id, store_code) DO UPDATE SET
                        analysis=excluded.analysis, action=excluded.action,
                        results=excluded.results, updated_at=CURRENT_TIMESTAMP
                """, (pno, period_id, store_code, n.get("analysis"), n.get("action"), n.get("results")))

            imported += 1

    return {
        "ok": True,
        "imported": imported,
        "periods_created": periods_created,
        "sheet_used": parsed.get("sheet_used"),
        "errors": errors,
    }


# ─── TikTok Export Analytics ─────────────────────────────────────────────────

@app.post("/api/analytics/import-tiktok-export")
async def import_tiktok_export(
    file: UploadFile = File(...),
    store_code: str = Form(...),
    _: dict = Depends(auth.get_current_user),
):
    if store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {store_code}")

    suffix = Path(file.filename or "file.xlsx").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        parsed = parse_tiktok_export(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    if "error" in parsed:
        raise HTTPException(400, parsed["error"])

    period_start = parsed["period_start"]
    period_end   = parsed["period_end"]
    tk_num = store_code[-1]  # "1" for TK1
    pid_col = f"tk{tk_num}_product_id"

    imported = 0
    unmatched = 0

    with db.db_cursor() as cur:
        # Build Product ID → product_no lookup for this store
        cur.execute(f"SELECT product_no, {pid_col} FROM products WHERE {pid_col} IS NOT NULL AND {pid_col} != ''")
        pid_map: dict[str, str] = {}
        for r in cur.fetchall():
            pid_map[str(r[1]).strip()] = str(r[0]).strip()  # tiktok_product_id → product_no

        for row in parsed["rows"]:
            tiktok_pid = str(row.get("tiktok_product_id") or "").strip()
            product_no = pid_map.get(tiktok_pid)
            if not product_no:
                unmatched += 1
                continue

            cur.execute("""
                INSERT INTO tiktok_export_analytics (
                    product_no, store_code, period_start, period_end,
                    tiktok_product_id, product_name, listing_status, gmv_range, voc_diagnosis,
                    gmv, orders, sku_orders, items_sold, est_customers, aov,
                    impressions, clicks, ctr, add_to_cart, atc_rate, ctor,
                    unique_impressions, unique_clicks, unique_ctr,
                    unique_atc_users, unique_atc_rate, unique_ctor,
                    gmv_with_tax, tax, gmv_with_cofunding, shipping_fees,
                    refunds, items_refunded, refund_customers,
                    seller_live_gmv, seller_video_gmv, creator_gmv, creator_live_gmv,
                    affiliate_video_gmv, product_card_gmv,
                    shop_tab_impressions, shop_tab_clicks, shop_tab_unique_clicks,
                    shop_tab_customers, shop_tab_ctr, shop_tab_ctor, shop_tab_gmv, shop_tab_items_sold
                ) VALUES (
                    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
                )
                ON CONFLICT(product_no, store_code, period_start, period_end) DO UPDATE SET
                    tiktok_product_id=excluded.tiktok_product_id,
                    product_name=excluded.product_name,
                    listing_status=excluded.listing_status,
                    gmv_range=excluded.gmv_range,
                    voc_diagnosis=excluded.voc_diagnosis,
                    gmv=excluded.gmv, orders=excluded.orders, sku_orders=excluded.sku_orders,
                    items_sold=excluded.items_sold, est_customers=excluded.est_customers, aov=excluded.aov,
                    impressions=excluded.impressions, clicks=excluded.clicks, ctr=excluded.ctr,
                    add_to_cart=excluded.add_to_cart, atc_rate=excluded.atc_rate, ctor=excluded.ctor,
                    unique_impressions=excluded.unique_impressions, unique_clicks=excluded.unique_clicks,
                    unique_ctr=excluded.unique_ctr, unique_atc_users=excluded.unique_atc_users,
                    unique_atc_rate=excluded.unique_atc_rate, unique_ctor=excluded.unique_ctor,
                    gmv_with_tax=excluded.gmv_with_tax, tax=excluded.tax,
                    gmv_with_cofunding=excluded.gmv_with_cofunding, shipping_fees=excluded.shipping_fees,
                    refunds=excluded.refunds, items_refunded=excluded.items_refunded,
                    refund_customers=excluded.refund_customers,
                    seller_live_gmv=excluded.seller_live_gmv, seller_video_gmv=excluded.seller_video_gmv,
                    creator_gmv=excluded.creator_gmv, creator_live_gmv=excluded.creator_live_gmv,
                    affiliate_video_gmv=excluded.affiliate_video_gmv, product_card_gmv=excluded.product_card_gmv,
                    shop_tab_impressions=excluded.shop_tab_impressions, shop_tab_clicks=excluded.shop_tab_clicks,
                    shop_tab_unique_clicks=excluded.shop_tab_unique_clicks,
                    shop_tab_customers=excluded.shop_tab_customers,
                    shop_tab_ctr=excluded.shop_tab_ctr, shop_tab_ctor=excluded.shop_tab_ctor,
                    shop_tab_gmv=excluded.shop_tab_gmv, shop_tab_items_sold=excluded.shop_tab_items_sold,
                    imported_at=CURRENT_TIMESTAMP
            """, (
                product_no, store_code, period_start, period_end,
                row.get("tiktok_product_id"), row.get("product_name"),
                row.get("listing_status"), row.get("gmv_range"), row.get("voc_diagnosis"),
                row.get("gmv"), row.get("orders"), row.get("sku_orders"),
                row.get("items_sold"), row.get("est_customers"), row.get("aov"),
                row.get("impressions"), row.get("clicks"), row.get("ctr"),
                row.get("add_to_cart"), row.get("atc_rate"), row.get("ctor"),
                row.get("unique_impressions"), row.get("unique_clicks"), row.get("unique_ctr"),
                row.get("unique_atc_users"), row.get("unique_atc_rate"), row.get("unique_ctor"),
                row.get("gmv_with_tax"), row.get("tax"), row.get("gmv_with_cofunding"),
                row.get("shipping_fees"), row.get("refunds"), row.get("items_refunded"),
                row.get("refund_customers"),
                row.get("seller_live_gmv"), row.get("seller_video_gmv"),
                row.get("creator_gmv"), row.get("creator_live_gmv"),
                row.get("affiliate_video_gmv"), row.get("product_card_gmv"),
                row.get("shop_tab_impressions"), row.get("shop_tab_clicks"),
                row.get("shop_tab_unique_clicks"), row.get("shop_tab_customers"),
                row.get("shop_tab_ctr"), row.get("shop_tab_ctor"),
                row.get("shop_tab_gmv"), row.get("shop_tab_items_sold"),
            ))
            imported += 1

    return {
        "ok": True,
        "imported": imported,
        "unmatched": unmatched,
        "period_start": period_start,
        "period_end": period_end,
    }


@app.get("/api/analytics/tiktok-export/{store_code}")
def get_tiktok_export_list(store_code: str, _: dict = Depends(auth.get_current_user)):
    """Return list of imported periods for a store."""
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT period_start, period_end, COUNT(*) as product_count,
                   SUM(gmv) as total_gmv, MAX(imported_at) as imported_at
            FROM tiktok_export_analytics
            WHERE store_code=?
            GROUP BY period_start, period_end
            ORDER BY period_start DESC
        """, (store_code,))
        return {"periods": [dict(r) for r in cur.fetchall()]}


@app.get("/api/analytics/tiktok-export/{store_code}/{period_start}/{period_end}")
def get_tiktok_export_data(
    store_code: str, period_start: str, period_end: str,
    _: dict = Depends(auth.get_current_user),
):
    """Return all product rows for a given period."""
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT * FROM tiktok_export_analytics
            WHERE store_code=? AND period_start=? AND period_end=?
            ORDER BY COALESCE(gmv, 0) DESC
        """, (store_code, period_start, period_end))
        return {"rows": [dict(r) for r in cur.fetchall()]}


@app.delete("/api/analytics/tiktok-export/{store_code}/{period_start}/{period_end}")
def delete_tiktok_export(
    store_code: str, period_start: str, period_end: str,
    _: dict = Depends(auth.get_current_user),
):
    """Delete all analytics rows for a given period."""
    with db.db_cursor() as cur:
        cur.execute("""
            DELETE FROM tiktok_export_analytics
            WHERE store_code=? AND period_start=? AND period_end=?
        """, (store_code, period_start, period_end))
    return {"ok": True}


# ─── Dashboard summary ────────────────────────────────────────────────────────

@app.get("/api/dashboard/summary")
def dashboard_summary(
    period_id: Optional[int] = None,
    _: dict = Depends(auth.get_current_user),
):
    with db.db_cursor() as cur:
        # Product count
        cur.execute("SELECT COUNT(*) FROM products")
        total_products = cur.fetchone()[0]

        # Feishu last sync
        cur.execute("SELECT MAX(synced_at) FROM products")
        last_sync = cur.fetchone()[0]

        # Task summary
        if period_id:
            cur.execute(
                "SELECT status, COUNT(*) as cnt FROM product_tasks WHERE period_id=? GROUP BY status",
                (period_id,),
            )
        else:
            cur.execute("SELECT status, COUNT(*) as cnt FROM product_tasks GROUP BY status")
        task_counts = {r["status"]: r["cnt"] for r in cur.fetchall()}

        # Per-user task done count
        if period_id:
            cur.execute("""
                SELECT u.name, u.store_code, COUNT(*) as done_count
                FROM product_tasks t JOIN users u ON t.assigned_to = u.id
                WHERE t.status='done' AND t.period_id=?
                GROUP BY u.id ORDER BY done_count DESC
            """, (period_id,))
        else:
            cur.execute("""
                SELECT u.name, u.store_code, COUNT(*) as done_count
                FROM product_tasks t JOIN users u ON t.assigned_to = u.id
                WHERE t.status='done'
                GROUP BY u.id ORDER BY done_count DESC
            """)
        team_progress = [dict(r) for r in cur.fetchall()]

        # GMV by store
        if period_id:
            cur.execute("""
                SELECT store_code, SUM(gmv) as total_gmv, COUNT(*) as product_count
                FROM product_analytics WHERE period_id=? GROUP BY store_code
            """, (period_id,))
        else:
            cur.execute("""
                SELECT store_code, SUM(gmv) as total_gmv, COUNT(*) as product_count
                FROM product_analytics GROUP BY store_code
            """)
        store_gmv = [dict(r) for r in cur.fetchall()]

        # Recent periods
        cur.execute("SELECT * FROM weekly_periods ORDER BY period_start DESC LIMIT 12")
        recent_periods = [dict(r) for r in cur.fetchall()]

    return {
        "total_products": total_products,
        "last_sync": last_sync,
        "task_counts": task_counts,
        "team_progress": team_progress,
        "store_gmv": store_gmv,
        "recent_periods": recent_periods,
    }


# ─── Monthly Targets ─────────────────────────────────────────────────────────

class TargetUpsert(BaseModel):
    year: int
    month: int
    target_gmv: Optional[float] = None
    target_orders: Optional[int] = None
    target_products: Optional[int] = None
    notes: Optional[str] = None

@app.get("/api/targets")
def get_targets(_: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("SELECT * FROM monthly_targets ORDER BY year DESC, month DESC LIMIT 24")
        rows = [dict(r) for r in cur.fetchall()]
    return {"targets": rows}

@app.put("/api/targets")
def upsert_target(req: TargetUpsert, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("""
            INSERT INTO monthly_targets (year, month, target_gmv, target_orders, target_products, notes, updated_at)
            VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(year, month) DO UPDATE SET
                target_gmv=excluded.target_gmv,
                target_orders=excluded.target_orders,
                target_products=excluded.target_products,
                notes=excluded.notes,
                updated_at=CURRENT_TIMESTAMP
        """, (req.year, req.month, req.target_gmv, req.target_orders, req.target_products, req.notes))
    return {"ok": True}

@app.get("/api/dashboard/enhanced")
def dashboard_enhanced(_: dict = Depends(auth.get_current_user)):
    """Enhanced dashboard — monthly GMV/orders from TikTok export + targets."""
    from datetime import date
    today = date.today()
    cur_year, cur_month = today.year, today.month
    # Previous month
    if cur_month == 1:
        prev_year, prev_month = cur_year - 1, 12
    else:
        prev_year, prev_month = cur_year, cur_month - 1

    cur_prefix  = f"{cur_year}-{cur_month:02d}"
    prev_prefix = f"{prev_year}-{prev_month:02d}"

    with db.db_cursor() as cur:
        # This month aggregates from tiktok_export_analytics
        cur.execute("""
            SELECT
                SUM(COALESCE(gmv,0))     AS gmv,
                SUM(COALESCE(orders,0))  AS orders,
                SUM(COALESCE(impressions,0)) AS impressions,
                COUNT(DISTINCT product_no) AS product_count
            FROM tiktok_export_analytics
            WHERE period_start LIKE ?
        """, (f"{cur_prefix}%",))
        cur_row = dict(cur.fetchone() or {})

        cur.execute("""
            SELECT SUM(COALESCE(gmv,0)) AS gmv, SUM(COALESCE(orders,0)) AS orders
            FROM tiktok_export_analytics WHERE period_start LIKE ?
        """, (f"{prev_prefix}%",))
        prev_row = dict(cur.fetchone() or {})

        # Per-store this month
        cur.execute("""
            SELECT store_code,
                   SUM(COALESCE(gmv,0)) AS gmv,
                   SUM(COALESCE(orders,0)) AS orders,
                   COUNT(DISTINCT product_no) AS products
            FROM tiktok_export_analytics WHERE period_start LIKE ?
            GROUP BY store_code
        """, (f"{cur_prefix}%",))
        store_month = [dict(r) for r in cur.fetchall()]

        # Monthly trend — last 6 months (one row per month, sum all stores)
        cur.execute("""
            SELECT strftime('%Y-%m', period_start) AS ym,
                   SUM(COALESCE(gmv,0)) AS gmv,
                   SUM(COALESCE(orders,0)) AS orders,
                   SUM(COALESCE(impressions,0)) AS impressions
            FROM tiktok_export_analytics
            GROUP BY ym ORDER BY ym DESC LIMIT 6
        """)
        trend_rows = [dict(r) for r in cur.fetchall()]
        trend_rows.reverse()

        # Current month target
        cur.execute("SELECT * FROM monthly_targets WHERE year=? AND month=?", (cur_year, cur_month))
        target_row = cur.fetchone()
        target = dict(target_row) if target_row else None

        # Task counts
        cur.execute("SELECT status, COUNT(*) AS cnt FROM product_tasks GROUP BY status")
        task_counts = {r["status"]: r["cnt"] for r in cur.fetchall()}

        # Team progress
        cur.execute("""
            SELECT u.name, u.store_code, COUNT(*) AS done_count
            FROM product_tasks t JOIN users u ON t.assigned_to=u.id
            WHERE t.status='done' GROUP BY u.id ORDER BY done_count DESC LIMIT 8
        """)
        team_progress = [dict(r) for r in cur.fetchall()]

        # Total products
        cur.execute("SELECT COUNT(*) FROM products")
        total_products = cur.fetchone()[0]

    def delta(cur_v, prev_v):
        if not prev_v: return None
        return round((cur_v - prev_v) / abs(prev_v) * 100, 1)

    cur_gmv    = cur_row.get("gmv") or 0
    cur_orders = cur_row.get("orders") or 0
    prev_gmv   = prev_row.get("gmv") or 0
    prev_orders = prev_row.get("orders") or 0

    # Is it first week of the month?
    first_week_notice = today.day <= 7 and target is None

    return {
        "month": {"year": cur_year, "month": cur_month, "label": today.strftime("%B %Y")},
        "current": {"gmv": round(cur_gmv, 2), "orders": int(cur_orders),
                    "impressions": int(cur_row.get("impressions") or 0),
                    "product_count": int(cur_row.get("product_count") or 0)},
        "previous": {"gmv": round(prev_gmv, 2), "orders": int(prev_orders)},
        "delta": {"gmv": delta(cur_gmv, prev_gmv), "orders": delta(cur_orders, prev_orders)},
        "store_month": store_month,
        "trend": trend_rows,
        "target": target,
        "task_counts": task_counts,
        "team_progress": team_progress,
        "total_products": total_products,
        "first_week_notice": first_week_notice,
    }


# ─── Product search + manual create ──────────────────────────────────────────

@app.get("/api/products/all")
def get_all_products(store_code: Optional[str] = None, _: dict = Depends(auth.get_current_user)):
    """Return all products, optionally filtered to a store."""
    with db.db_cursor() as cur:
        if store_code:
            if store_code == "SHEIN":
                cur.execute("""
                    SELECT product_no, warehouse_name, image_url, stores_available, sku
                    FROM products
                    WHERE stores_available IS NULL
                       OR UPPER(stores_available) LIKE '%ALL%'
                       OR UPPER(stores_available) LIKE '%SHEIN%'
                       OR stores_available = 'MANUAL'
                    ORDER BY CAST(product_no AS INTEGER) ASC, product_no ASC
                """)
            else:
                tk = store_code[-1]
                cur.execute("""
                    SELECT * FROM (
                        SELECT product_no, warehouse_name, image_url, stores_available, sku
                        FROM products
                        WHERE stores_available IS NULL
                           OR UPPER(stores_available) LIKE '%ALL%'
                           OR stores_available LIKE ?
                           OR stores_available LIKE ?
                           OR stores_available LIKE ?
                           OR stores_available LIKE ?
                           OR stores_available = 'MANUAL'
                        UNION
                        SELECT p.product_no, p.warehouse_name, p.image_url, p.stores_available, p.sku
                        FROM products p
                        JOIN board_pins bp ON p.product_no = bp.product_no AND bp.store_code = ?
                    )
                    ORDER BY CAST(product_no AS INTEGER) ASC, product_no ASC
                """, (f"%TK{tk}%", f"%TK {tk}%", f"%TT{tk}%", f"%TT {tk}%", store_code))
        else:
            cur.execute("""
                SELECT product_no, warehouse_name, image_url, stores_available, sku
                FROM products ORDER BY CAST(product_no AS INTEGER) ASC, product_no ASC
            """)
        return {"products": [dict(r) for r in cur.fetchall()]}


@app.get("/api/products/search")
def search_products(q: str = "", limit: int = 20, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        if q:
            cur.execute("""
                SELECT product_no, warehouse_name, image_url, stores_available, sku
                FROM products
                WHERE product_no LIKE ? OR warehouse_name LIKE ? OR sku LIKE ?
                ORDER BY product_no LIMIT ?
            """, (f"%{q}%", f"%{q}%", f"%{q}%", limit))
        else:
            cur.execute("""
                SELECT product_no, warehouse_name, image_url, stores_available, sku
                FROM products ORDER BY product_no LIMIT ?
            """, (limit,))
        return {"products": [dict(r) for r in cur.fetchall()]}


class CreateProductRequest(BaseModel):
    product_no: str
    warehouse_name: Optional[str] = None
    image_url: Optional[str] = None
    sku: Optional[str] = None


@app.post("/api/products", status_code=201)
def create_product(req: CreateProductRequest, _: dict = Depends(auth.get_current_user)):
    if not req.product_no.strip():
        raise HTTPException(400, "product_no is required")
    try:
        with db.db_cursor() as cur:
            cur.execute("""
                INSERT INTO products (product_no, warehouse_name, image_url, sku, stores_available)
                VALUES (?,?,?,?,?)
                ON CONFLICT(product_no) DO UPDATE SET
                    warehouse_name=COALESCE(excluded.warehouse_name, warehouse_name),
                    image_url=COALESCE(excluded.image_url, image_url),
                    sku=COALESCE(excluded.sku, sku)
            """, (req.product_no.strip(), req.warehouse_name, req.image_url, req.sku, "MANUAL"))
        return {"ok": True, "product_no": req.product_no.strip()}
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Board pins ───────────────────────────────────────────────────────────────

class PinRequest(BaseModel):
    store_code: str
    product_no: str


@app.post("/api/board/pin", status_code=201)
def pin_product(req: PinRequest, _: dict = Depends(auth.get_current_user)):
    if req.store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {req.store_code}")
    with db.db_cursor() as cur:
        cur.execute(
            "INSERT OR IGNORE INTO board_pins (store_code, product_no) VALUES (?,?)",
            (req.store_code, req.product_no),
        )
    return {"ok": True}


@app.delete("/api/board/pin/{store_code}/{product_no}")
def unpin_product(store_code: str, product_no: str, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM board_pins WHERE store_code=? AND product_no=?", (store_code, product_no))
    return {"ok": True}


class BoardOrderRequest(BaseModel):
    product_nos: list[str]


@app.put("/api/board/order")
def update_board_order(req: BoardOrderRequest, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        for idx, pno in enumerate(req.product_nos):
            cur.execute("UPDATE products SET sort_order=? WHERE product_no=?", (idx, pno))
    return {"ok": True}


@app.get("/api/board/pins/{store_code}")
def list_pins(store_code: str, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("SELECT product_no FROM board_pins WHERE store_code=?", (store_code,))
        return {"pins": [r[0] for r in cur.fetchall()]}


# ─── Board exclusions (persistent hide / delete from board) ───────────────────

class ExcludeRequest(BaseModel):
    store_code: str
    product_no: str


@app.post("/api/board/exclude", status_code=201)
def exclude_product(req: ExcludeRequest, _: dict = Depends(auth.get_current_user)):
    """Permanently hide a product from a store's board across all periods."""
    with db.db_cursor() as cur:
        cur.execute(
            "INSERT OR IGNORE INTO board_exclusions (store_code, product_no) VALUES (?,?)",
            (req.store_code, req.product_no),
        )
        # Also remove any pin so it doesn't sneak back in
        cur.execute(
            "DELETE FROM board_pins WHERE store_code=? AND product_no=?",
            (req.store_code, req.product_no),
        )
    return {"ok": True}


@app.delete("/api/board/exclude/{store_code}/{product_no}")
def restore_product(store_code: str, product_no: str, _: dict = Depends(auth.get_current_user)):
    """Restore a previously hidden product back to the board."""
    with db.db_cursor() as cur:
        cur.execute(
            "DELETE FROM board_exclusions WHERE store_code=? AND product_no=?",
            (store_code, product_no),
        )
    return {"ok": True}


@app.get("/api/board/exclusions/{store_code}")
def list_exclusions(store_code: str, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("SELECT product_no FROM board_exclusions WHERE store_code=?", (store_code,))
        return {"exclusions": [r[0] for r in cur.fetchall()]}


# ─── Analytics manual update ─────────────────────────────────────────────────

class AnalyticsUpdateRequest(BaseModel):
    product_no: str
    period_id: int
    store_code: str
    impressions: Optional[float] = None
    page_views: Optional[float] = None
    ctr: Optional[float] = None
    avg_visitors: Optional[float] = None
    avg_customers: Optional[float] = None
    cvr: Optional[float] = None
    video_impressions: Optional[float] = None
    product_card_impressions: Optional[float] = None
    live_impressions: Optional[float] = None
    items_sold: Optional[float] = None
    ctor: Optional[float] = None
    new_creators: Optional[float] = None
    new_videos: Optional[float] = None
    new_live: Optional[float] = None
    free_sample_cost: Optional[float] = None
    content_gmv: Optional[float] = None
    ads_spend: Optional[float] = None
    gmv: Optional[float] = None
    roi: Optional[float] = None
    selling_price: Optional[str] = None
    cost_rmb: Optional[float] = None
    profit_margin: Optional[float] = None


@app.put("/api/analytics")
def update_analytics(req: AnalyticsUpdateRequest, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("""
            INSERT INTO product_analytics
                (product_no, period_id, store_code, impressions, page_views, ctr,
                 avg_visitors, avg_customers, cvr, video_impressions,
                 product_card_impressions, live_impressions, items_sold, ctor,
                 new_creators, new_videos, new_live, free_sample_cost,
                 content_gmv, ads_spend, roi, gmv, selling_price, cost_rmb, profit_margin)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(product_no, period_id, store_code) DO UPDATE SET
                impressions=COALESCE(excluded.impressions, impressions),
                page_views=COALESCE(excluded.page_views, page_views),
                ctr=COALESCE(excluded.ctr, ctr),
                avg_visitors=COALESCE(excluded.avg_visitors, avg_visitors),
                avg_customers=COALESCE(excluded.avg_customers, avg_customers),
                cvr=COALESCE(excluded.cvr, cvr),
                video_impressions=COALESCE(excluded.video_impressions, video_impressions),
                product_card_impressions=COALESCE(excluded.product_card_impressions, product_card_impressions),
                live_impressions=COALESCE(excluded.live_impressions, live_impressions),
                items_sold=COALESCE(excluded.items_sold, items_sold),
                ctor=COALESCE(excluded.ctor, ctor),
                new_creators=COALESCE(excluded.new_creators, new_creators),
                new_videos=COALESCE(excluded.new_videos, new_videos),
                new_live=COALESCE(excluded.new_live, new_live),
                free_sample_cost=COALESCE(excluded.free_sample_cost, free_sample_cost),
                content_gmv=COALESCE(excluded.content_gmv, content_gmv),
                ads_spend=COALESCE(excluded.ads_spend, ads_spend),
                roi=COALESCE(excluded.roi, roi),
                gmv=COALESCE(excluded.gmv, gmv),
                selling_price=COALESCE(excluded.selling_price, selling_price),
                cost_rmb=COALESCE(excluded.cost_rmb, cost_rmb),
                profit_margin=COALESCE(excluded.profit_margin, profit_margin)
        """, (
            req.product_no, req.period_id, req.store_code,
            req.impressions, req.page_views, req.ctr,
            req.avg_visitors, req.avg_customers, req.cvr,
            req.video_impressions, req.product_card_impressions, req.live_impressions,
            req.items_sold, req.ctor,
            req.new_creators, req.new_videos, req.new_live,
            req.free_sample_cost, req.content_gmv, req.ads_spend,
            req.roi, req.gmv, req.selling_price, req.cost_rmb, req.profit_margin,
        ))
    return {"ok": True}


@app.get("/api/analytics/history/{store_code}/{product_no}")
def get_analytics_history(store_code: str, product_no: str, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT a.*, p.period_start, p.period_end, p.label 
            FROM product_analytics a
            JOIN weekly_periods p ON a.period_id = p.id
            WHERE a.store_code=? AND a.product_no=?
            ORDER BY p.period_start ASC
        """, (store_code, product_no))
        rows = [dict(r) for r in cur.fetchall()]
        return {"history": rows}


# ─── Orders upload (raw file tracking) ───────────────────────────────────────

@app.post("/api/orders/upload-raw")
async def upload_orders_raw(
    file: UploadFile = File(...),
    store_code: str = Form(...),
    period_label: str = Form(""),
    upload_type: str = Form("orders"),
    _: dict = Depends(auth.get_current_user),
):
    if store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {store_code}")

    suffix = Path(file.filename or "file.xlsx").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    row_count = 0
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        # Count rows in the first sheet
        try:
            import openpyxl
            wb = openpyxl.load_workbook(tmp.name, read_only=True, data_only=True)
            ws = wb.active
            row_count = max(0, (ws.max_row or 1) - 1)  # subtract header
            wb.close()
        except Exception:
            row_count = 0
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    with db.db_cursor() as cur:
        cur.execute("""
            INSERT INTO order_file_uploads (store_code, filename, upload_type, period_label, row_count)
            VALUES (?,?,?,?,?)
        """, (store_code, file.filename, upload_type, period_label or None, row_count))
        upload_id = cur.lastrowid

    return {"ok": True, "id": upload_id, "row_count": row_count, "filename": file.filename}


@app.get("/api/orders/history")
def orders_history(store_code: Optional[str] = None, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        if store_code:
            cur.execute(
                "SELECT * FROM order_file_uploads WHERE store_code=? ORDER BY imported_at DESC LIMIT 50",
                (store_code,),
            )
        else:
            cur.execute("SELECT * FROM order_file_uploads ORDER BY imported_at DESC LIMIT 50")
        return {"uploads": [dict(r) for r in cur.fetchall()]}


@app.delete("/api/orders/history/{upload_id}")
def delete_order_history(upload_id: int, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM order_file_uploads WHERE id=?", (upload_id,))
    return {"ok": True}


# ─── Return & Refund Rate ────────────────────────────────────────────────────

def _parse_rr_file(filepath: str, qty_col_hints: list) -> list:
    """
    Parse an Excel (.xlsx/.xls) or CSV file and return list of {msku, qty} dicts.
    Matches TikTok order/return export formats.
    - Skips description rows (row 2 in TikTok XLSX exports)
    - Prefers 'Seller SKU' over plain 'SKU ID' for the MSKU column
    - Strips variant suffixes (-Color-Size) to get base SKU
    """
    suffix = Path(filepath).suffix.lower()
    # Ordered most-specific first so longer hints win over "sku" matching "SKU ID"
    msku_hints = [
        "seller sku", "sellersku", "seller-sku",
        "msku",
        "product no", "product_no", "product number",
        "item_id",
        "商品编码", "货号", "商品编号",
        "sku",          # kept last — short hint, matches too broadly
    ]
    rows: list = []

    def _norm(v: str) -> str:
        return v.strip().lower().replace(" ", "").replace("_", "").replace("-", "")

    def _find_col(headers: list, hints: list) -> int | None:
        # Sort hints longest-first so "sellersku" wins over "sku"
        normed = sorted([_norm(h) for h in hints], key=len, reverse=True)
        normed_headers = [_norm(str(h)) for h in headers]
        # Exact match pass
        for hint in normed:
            for i, h in enumerate(normed_headers):
                if h == hint:
                    return i
        # Substring pass (only hints with 4+ chars to avoid false positives)
        for hint in normed:
            if len(hint) < 4:
                continue
            for i, h in enumerate(normed_headers):
                if hint in h:
                    return i
        return None

    def _to_int(v) -> int:
        try:
            return max(0, int(float(str(v).replace(",", "").strip() or "0")))
        except (ValueError, TypeError):
            return 0

    if suffix in (".xlsx", ".xls", ".xlsm"):
        try:
            import openpyxl
            # Must NOT use read_only=True — TikTok exports report max_column=1 in read_only mode
            wb = openpyxl.load_workbook(filepath, data_only=True)
            ws = wb.active
            msku_col = qty_col = header_row = None

            for ri, row in enumerate(ws.iter_rows(max_row=15)):
                vals = [str(c.value or "").strip() for c in row]
                mc = _find_col(vals, msku_hints)
                qc = _find_col(vals, qty_col_hints)
                if mc is not None and qc is not None:
                    msku_col, qty_col, header_row = mc, qc, ri
                    break

            if header_row is not None:
                for ri, row in enumerate(ws.iter_rows()):
                    if ri <= header_row:
                        continue
                    vals = [c.value for c in row]
                    try:
                        msku = str(vals[msku_col] or "").strip()
                        qty = _to_int(vals[qty_col])
                        if msku and qty > 0:
                            rows.append({"msku": msku, "qty": qty})
                    except (IndexError, TypeError):
                        continue
            wb.close()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, f"Failed to parse Excel file: {exc}")

    elif suffix == ".csv":
        import csv
        try:
            with open(filepath, "r", encoding="utf-8-sig", errors="replace") as f:
                reader = csv.reader(f)
                msku_col = qty_col = None
                for ri, row in enumerate(reader):
                    if msku_col is None:
                        mc = _find_col(row, msku_hints)
                        qc = _find_col(row, qty_col_hints)
                        if mc is not None and qc is not None:
                            msku_col, qty_col = mc, qc
                        elif ri > 10:
                            break
                        continue
                    try:
                        msku = row[msku_col].strip()
                        qty = _to_int(row[qty_col])
                        if msku and qty > 0:
                            rows.append({"msku": msku, "qty": qty})
                    except IndexError:
                        continue
        except Exception as exc:
            raise HTTPException(400, f"Failed to parse CSV file: {exc}")
    else:
        raise HTTPException(400, "Unsupported file type. Please upload .xlsx, .xls, or .csv")

    return rows


def _parse_order_file(filepath: str):
    """
    Parse a TikTok All-Orders export. Returns:
      {"order_rows": [{msku, qty}], "return_rows": [{msku, qty}], "date_range": (min, max)}
    If the file has a 'Sku Quantity of return' column, return data is extracted from the
    same file so both figures cover the same time window — preventing period-mismatch errors.
    """
    suffix = Path(filepath).suffix.lower()

    def _norm(v: str) -> str:
        return str(v).strip().lower().replace(" ", "").replace("_", "").replace("-", "")

    def _find_col(headers, hints):
        normed = sorted([_norm(h) for h in hints], key=len, reverse=True)
        nh = [_norm(str(h)) for h in headers]
        for hint in normed:
            for i, h in enumerate(nh):
                if h == hint:
                    return i
        for hint in normed:
            if len(hint) < 4:
                continue
            for i, h in enumerate(nh):
                if hint in h:
                    return i
        return None

    def _to_int(v) -> int:
        try:
            return max(0, int(float(str(v).replace(",", "").strip() or "0")))
        except (ValueError, TypeError):
            return 0

    msku_hints = ["seller sku", "sellersku", "seller-sku", "msku", "product no",
                  "product_no", "product number", "item_id", "商品编码", "货号", "商品编号", "sku"]
    qty_hints  = ["units ordered", "unit ordered", "paid units", "order quantity", "order qty",
                  "units sold", "quantity", "qty", "units", "订单数量", "销量", "数量", "件数"]
    ret_hints  = ["sku quantity of return", "skuquantityofreturn", "return quantity embedded",
                  "sku return", "returned qty"]
    date_hints = ["created time", "createdtime", "order created", "paid time", "创建时间"]

    order_rows: list = []
    return_rows: list = []
    dates: list = []

    if suffix in (".xlsx", ".xls", ".xlsm"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(filepath, data_only=True)
            ws = wb.active
            header_row = msku_col = qty_col = ret_col = date_col = None

            for ri, row in enumerate(ws.iter_rows(max_row=15)):
                vals = [str(c.value or "").strip() for c in row]
                mc = _find_col(vals, msku_hints)
                qc = _find_col(vals, qty_hints)
                if mc is not None and qc is not None:
                    header_row, msku_col, qty_col = ri, mc, qc
                    ret_col  = _find_col(vals, ret_hints)
                    date_col = _find_col(vals, date_hints)
                    break

            if header_row is not None:
                for ri, row in enumerate(ws.iter_rows()):
                    if ri <= header_row:
                        continue
                    vals = [c.value for c in row]
                    try:
                        msku = str(vals[msku_col] or "").strip()
                        qty  = _to_int(vals[qty_col])
                        if not msku or qty == 0:
                            continue
                        order_rows.append({"msku": msku, "qty": qty})
                        if ret_col is not None:
                            rq = _to_int(vals[ret_col])
                            if rq > 0:
                                return_rows.append({"msku": msku, "qty": rq})
                        if date_col is not None and vals[date_col]:
                            dates.append(str(vals[date_col])[:10])
                    except (IndexError, TypeError):
                        continue
            wb.close()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, f"Failed to parse Excel file: {exc}")
    elif suffix == ".csv":
        import csv
        try:
            with open(filepath, "r", encoding="utf-8-sig", errors="replace") as f:
                reader = csv.reader(f)
                msku_col = qty_col = ret_col = date_col = None
                for ri, row in enumerate(reader):
                    if msku_col is None:
                        mc = _find_col(row, msku_hints)
                        qc = _find_col(row, qty_hints)
                        if mc is not None and qc is not None:
                            msku_col, qty_col = mc, qc
                            ret_col  = _find_col(row, ret_hints)
                            date_col = _find_col(row, date_hints)
                        elif ri > 10:
                            break
                        continue
                    try:
                        msku = row[msku_col].strip()
                        qty  = _to_int(row[qty_col])
                        if not msku or qty == 0:
                            continue
                        order_rows.append({"msku": msku, "qty": qty})
                        if ret_col is not None:
                            rq = _to_int(row[ret_col])
                            if rq > 0:
                                return_rows.append({"msku": msku, "qty": rq})
                        if date_col is not None and len(row) > date_col and row[date_col].strip():
                            dates.append(row[date_col].strip()[:10])
                    except IndexError:
                        continue
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, f"Failed to parse CSV file: {exc}")
    else:
        raise HTTPException(400, "Unsupported file type. Upload .xlsx, .xls, or .csv")

    date_range = (min(dates), max(dates)) if dates else (None, None)
    return {"order_rows": order_rows, "return_rows": return_rows, "date_range": date_range}


@app.post("/api/rr/upload-orders")
async def upload_rr_orders(
    file: UploadFile = File(...),
    store_code: str = Form(...),
    period_label: str = Form(""),
    _: dict = Depends(auth.get_current_user),
):
    if store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {store_code}")

    suffix = Path(file.filename or "file.xlsx").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        parsed = _parse_order_file(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    order_rows  = parsed["order_rows"]
    return_rows = parsed["return_rows"]
    date_range  = parsed["date_range"]

    if not order_rows:
        raise HTTPException(
            400,
            "Could not detect MSKU and order quantity columns. "
            "Ensure the file has columns for Seller SKU and Quantity (or Chinese equivalents)."
        )

    # Build period_label from date range if not provided
    resolved_label = period_label.strip()
    if not resolved_label and date_range[0]:
        resolved_label = f"{date_range[0]} – {date_range[1]}"

    with db.db_cursor() as cur:
        cur.execute(
            "INSERT INTO rr_uploads (upload_type, store_code, filename, period_label, row_count) VALUES (?,?,?,?,?)",
            ("orders", store_code, file.filename, resolved_label or None, len(order_rows)),
        )
        upload_id = cur.lastrowid
        cur.executemany(
            "INSERT INTO rr_order_items (upload_id, store_code, msku, order_qty) VALUES (?,?,?,?)",
            [(upload_id, store_code, r["msku"], r["qty"]) for r in order_rows],
        )
        # If the order file contained embedded return data, store it too
        if return_rows:
            cur.execute(
                "INSERT INTO rr_uploads (upload_type, store_code, filename, period_label, row_count) VALUES (?,?,?,?,?)",
                ("returns", store_code, f"[embedded] {file.filename}", resolved_label or None, len(return_rows)),
            )
            ret_upload_id = cur.lastrowid
            cur.executemany(
                "INSERT INTO rr_return_items (upload_id, store_code, msku, return_qty) VALUES (?,?,?,?)",
                [(ret_upload_id, store_code, r["msku"], r["qty"]) for r in return_rows],
            )

    msg = f"Imported {len(order_rows)} order rows"
    if return_rows:
        msg += f" + {len(return_rows)} embedded return rows (same time window)"
    return {"ok": True, "rows": len(order_rows), "return_rows": len(return_rows),
            "upload_id": upload_id, "date_range": date_range, "msg": msg}


@app.post("/api/rr/upload-returns")
async def upload_rr_returns(
    file: UploadFile = File(...),
    store_code: str = Form(...),
    period_label: str = Form(""),
    _: dict = Depends(auth.get_current_user),
):
    if store_code not in config.STORE_NAME_BY_CODE:
        raise HTTPException(400, f"Unknown store_code: {store_code}")

    suffix = Path(file.filename or "file.xlsx").suffix
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        qty_hints = [
            "return quantity", "refund quantity", "return qty", "refund qty",
            "returns", "refunds", "returned", "quantity returned",
            "退货数量", "退款件数", "退货件数", "退款数量",
        ]
        rows = _parse_rr_file(tmp.name, qty_hints)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    if not rows:
        raise HTTPException(
            400,
            "Could not detect MSKU and return/refund quantity columns. "
            "Ensure the file has columns for MSKU/SKU and Return Qty / Refund Qty (or Chinese equivalents)."
        )

    with db.db_cursor() as cur:
        cur.execute(
            "INSERT INTO rr_uploads (upload_type, store_code, filename, period_label, row_count) VALUES (?,?,?,?,?)",
            ("returns", store_code, file.filename, period_label or None, len(rows)),
        )
        upload_id = cur.lastrowid
        cur.executemany(
            "INSERT INTO rr_return_items (upload_id, store_code, msku, return_qty) VALUES (?,?,?,?)",
            [(upload_id, store_code, r["msku"], r["qty"]) for r in rows],
        )

    return {"ok": True, "rows": len(rows), "upload_id": upload_id}


@app.get("/api/rr/products")
def get_rr_products(
    store_code: Optional[str] = None,
    q: str = "",
    _: dict = Depends(auth.get_current_user),
):
    # ── 1. Load raw variant-level data ─────────────────────────────────────────
    with db.db_cursor() as cur:
        cur.execute("SELECT store_code, msku, SUM(order_qty) as total FROM rr_order_items GROUP BY store_code, msku")
        order_rows = cur.fetchall()
        cur.execute("SELECT store_code, msku, SUM(return_qty) as total FROM rr_return_items GROUP BY store_code, msku")
        return_rows = cur.fetchall()

    # variant_orders/returns: {msku: {store_code: qty}}
    variant_orders: dict = {}
    for r in order_rows:
        variant_orders.setdefault(r["msku"], {})[r["store_code"]] = r["total"]

    variant_returns: dict = {}
    for r in return_rows:
        variant_returns.setdefault(r["msku"], {})[r["store_code"]] = r["total"]

    # ── 2. Load all products, build matching maps ───────────────────────────────
    with db.db_cursor() as cur:
        cur.execute(
            "SELECT product_no, warehouse_name, image_url, sku, "
            "tk1_seller_sku, tk2_seller_sku, tk3_seller_sku, tk4_seller_sku "
            "FROM products"
        )
        all_products = [dict(r) for r in cur.fetchall()]

    exact_map: dict = {}
    prefix_map: list = []
    for p in all_products:
        for key in [p["sku"], p["product_no"]]:
            if key:
                exact_map[str(key).strip().upper()] = p
        for sk_field in [p["tk1_seller_sku"], p["tk2_seller_sku"],
                         p["tk3_seller_sku"], p["tk4_seller_sku"]]:
            if sk_field:
                for sk in str(sk_field).split(","):
                    sk = sk.strip()
                    if sk:
                        exact_map[sk.upper()] = p
                        prefix_map.append((sk.upper(), p))

    def _find_product(msku: str):
        ku = msku.upper()

        # 1. Direct / exact match (seller SKU, product_no, sku)
        if ku in exact_map:
            return exact_map[ku]

        # 2. Prefix match — seller SKU is a prefix of the variant MSKU
        #    e.g. LKTT1001-Black-7 matches seller SKU "LKTT1001"
        for prefix, prod in prefix_map:
            if ku.startswith(prefix + "-") or ku.startswith(prefix + "_"):
                return prod

        return None

    # ── 3. Aggregate variant data → product level ──────────────────────────────
    # by_product: {product_key: {store_code: {orders, returns}, ..., "_info": product_dict}}
    by_product: dict = {}

    all_msks = set(variant_orders.keys()) | set(variant_returns.keys())
    for msku in all_msks:
        info = _find_product(msku)
        # Key: use product_no if matched, else the raw msku (unrecognised SKU)
        key = info["product_no"] if info else msku

        entry = by_product.setdefault(key, {"_info": info or {}, "_stores": {}})
        stores = entry["_stores"]

        for sc, qty in variant_orders.get(msku, {}).items():
            stores.setdefault(sc, {"orders": 0, "returns": 0})["orders"] += qty

        for sc, qty in variant_returns.get(msku, {}).items():
            stores.setdefault(sc, {"orders": 0, "returns": 0})["returns"] += qty

    # Statuses considered inactive — skip these from R&R view
    INACTIVE_STATUSES = {
        "disposal", "sold out", "cancelled", "cancel", "clearance",
        "january clearence", "february clearence", "march clearence",
        "april clearence", "no restock, copy right issue",
    }

    # ── 4. Build result rows (apply store filter / best-store logic) ────────────
    results = []
    for key, entry in by_product.items():
        info = entry["_info"]
        stores = entry["_stores"]

        # ── Only include products that exist in the Feishu-synced products table
        if not info or not info.get("product_no"):
            continue

        # ── Skip products with inactive Feishu statuses
        product_status = (info.get("status") or "").strip().lower()
        if product_status in INACTIVE_STATUSES:
            continue

        if store_code:
            sc_data = stores.get(store_code, {"orders": 0, "returns": 0})
            o_qty = sc_data["orders"]
            r_qty = sc_data["returns"]
            best = store_code
        else:
            # Use the store with the most orders; fall back to most returns
            if stores:
                best = max(stores, key=lambda s: stores[s]["orders"])
                o_qty = stores[best]["orders"]
                r_qty = stores[best]["returns"]
            else:
                continue

        if o_qty == 0 and r_qty == 0:
            continue

        rr_rate = round((r_qty / o_qty * 100) if o_qty > 0 else 0.0, 2)

        results.append({
            "msku": key,
            "product_no": info.get("product_no") or key,
            "warehouse_name": info.get("warehouse_name"),
            "image_url": info.get("image_url"),
            "store_code": best,
            "order_qty": o_qty,
            "return_qty": r_qty,
            "rr_rate": rr_rate,
            "all_stores": {
                s: {"order_qty": d["orders"], "return_qty": d["returns"]}
                for s, d in stores.items()
            },
        })

    # ── 5. Search filter ────────────────────────────────────────────────────────
    if q:
        ql = q.lower()
        results = [
            r for r in results
            if ql in (r["msku"] or "").lower()
            or ql in (r["warehouse_name"] or "").lower()
            or ql in (r["product_no"] or "").lower()
        ]

    results.sort(key=lambda r: r["rr_rate"], reverse=True)
    return {"products": results, "total": len(results)}


@app.get("/api/rr/uploads")
def get_rr_uploads(
    store_code: Optional[str] = None,
    _: dict = Depends(auth.get_current_user),
):
    with db.db_cursor() as cur:
        if store_code:
            cur.execute(
                "SELECT * FROM rr_uploads WHERE store_code=? ORDER BY imported_at DESC LIMIT 100",
                (store_code,),
            )
        else:
            cur.execute("SELECT * FROM rr_uploads ORDER BY imported_at DESC LIMIT 100")
        return {"uploads": [dict(r) for r in cur.fetchall()]}


@app.delete("/api/rr/uploads/{upload_id}")
def delete_rr_upload(upload_id: int, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM rr_uploads WHERE id=?", (upload_id,))
    return {"ok": True}


# ─── Weekly Report ───────────────────────────────────────────────────────────

@app.get("/api/report/{store_code}")
def get_store_report(store_code: str, _: dict = Depends(auth.get_current_user)):
    with db.db_cursor() as cur:
        # Last 10 periods, oldest first
        cur.execute(
            "SELECT * FROM weekly_periods WHERE store_code=? ORDER BY period_start DESC LIMIT 10",
            (store_code,)
        )
        periods_raw = [dict(r) for r in cur.fetchall()]
        periods_raw.reverse()

        if not periods_raw:
            return {"periods": [], "user_period_stats": [], "top_products": [], "users": []}

        period_ids = [p["id"] for p in periods_raw]
        ph = ",".join("?" * len(period_ids))

        # Per-user per-period done / assigned counts
        cur.execute(f"""
            SELECT t.period_id, u.id as user_id, u.name, u.role,
                   SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_count,
                   COUNT(*) as total_assigned
            FROM product_tasks t
            JOIN users u ON t.assigned_to = u.id
            WHERE t.store_code=? AND t.period_id IN ({ph})
            GROUP BY t.period_id, u.id
            ORDER BY t.period_id, done_count DESC
        """, [store_code] + period_ids)
        user_period_stats = [dict(r) for r in cur.fetchall()]

        # Per-period totals
        cur.execute(f"""
            SELECT period_id,
                   COUNT(*) as total_tasks,
                   SUM(CASE WHEN status='done'        THEN 1 ELSE 0 END) as done_tasks,
                   SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
                   COUNT(DISTINCT product_no) as product_count
            FROM product_tasks
            WHERE store_code=? AND period_id IN ({ph})
            GROUP BY period_id
        """, [store_code] + period_ids)
        period_totals = {r["period_id"]: dict(r) for r in cur.fetchall()}

        # All users visible on this store
        cur.execute(
            "SELECT id, name, role, store_code FROM users WHERE store_code=? OR store_code IS NULL ORDER BY name",
            (store_code,)
        )
        users = [dict(r) for r in cur.fetchall()]

        # Latest period: product-level completion breakdown
        top_products = [dict(r) for r in cur.fetchall()]

        # Recent optimization notes
        cur.execute("""
            SELECT n.*, p.warehouse_name, p.image_url, wp.label as period_label
            FROM product_notes n
            LEFT JOIN products p ON n.product_no = p.product_no
            LEFT JOIN weekly_periods wp ON n.period_id = wp.id
            WHERE n.store_code=?
            ORDER BY wp.period_start DESC, n.updated_at DESC
            LIMIT 20
        """, (store_code,))
        recent_notes = [dict(r) for r in cur.fetchall()]

    periods = []
    for p in periods_raw:
        t = period_totals.get(p["id"], {"total_tasks": 0, "done_tasks": 0, "in_progress_tasks": 0, "product_count": 0})
        periods.append({**p, **t})

    return {
        "periods": periods,
        "user_period_stats": user_period_stats,
        "top_products": top_products,
        "recent_notes": recent_notes,
        "users": users,
    }


# ─── TikTok Stock Update ───────────────────────────────────────────────────────

TIKTOK_INVENTORY_CACHE = {
    "stock": None,
    "size": 0,
    "sample_hash": None
}


@app.post("/api/inventory/process-tiktok")
async def process_tiktok_stock(
    msku_mapping: UploadFile = File(...),
    inventory: UploadFile | None = File(default=None),
    template: UploadFile = File(...),
    shop_name: str = Form(...)
):
    global TIKTOK_INVENTORY_CACHE
    from fastapi.responses import FileResponse
    try:
        temp_dir = tempfile.mkdtemp()

        msku_path = os.path.join(temp_dir, "msku.xlsx")
        template_path = os.path.join(temp_dir, "template.xlsx")
        output_path = os.path.join(temp_dir, "updated_template.xlsx")

        def save_upload(upload_file, dest_path):
            with open(dest_path, "wb") as buffer:
                shutil.copyfileobj(upload_file.file, buffer)

        save_upload(msku_mapping, msku_path)
        save_upload(template, template_path)

        current_stock = None

        if inventory is not None:
            inventory_path = os.path.join(temp_dir, "inventory.xlsx")
            save_upload(inventory, inventory_path)

            inv_size = os.path.getsize(inventory_path)
            with open(inventory_path, "rb") as f:
                inv_sample = f.read(4096)

            if TIKTOK_INVENTORY_CACHE["stock"] is not None and TIKTOK_INVENTORY_CACHE["size"] == inv_size and TIKTOK_INVENTORY_CACHE["sample_hash"] == inv_sample:
                print(">>> SMART CACHE HIT: Reusing inventory data from memory.")
                current_stock = TIKTOK_INVENTORY_CACHE["stock"]
            else:
                print(">>> CACHE MISS: Reading large inventory file...")
        else:
            print(">>> No inventory file provided. Will fetch from Feishu/DB during automation.")
            inventory_path = ""
            current_stock = None

        result_stock = run_automation(
            msku_path,
            inventory_path if inventory_path else "",
            template_path,
            output_path,
            shop_name,
            precomputed_stock=current_stock
        )

        if inventory is not None and current_stock is None:
            TIKTOK_INVENTORY_CACHE = {
                "stock": result_stock,
                "size": inv_size,
                "sample_hash": inv_sample
            }

        return FileResponse(
            path=output_path,
            filename="updated_tiktok_template.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()

        TIKTOK_INVENTORY_CACHE = {"stock": None, "size": 0, "sample_hash": None}
        print(">>> CACHE CLEARED due to error.")

        raise HTTPException(status_code=500, detail=f"Backend Error: {str(e)}")


# ─── SHEIN Stock Update ───────────────────────────────────────────────────────

@app.post("/api/inventory/process-shein")
async def process_shein_stock(
    mskuFile: UploadFile = File(...),
    templateFile: UploadFile = File(...),
    exportFile: UploadFile = File(...),
    warehouseFile: UploadFile | None = File(default=None)
):
    from fastapi.responses import FileResponse
    try:
        temp_dir = tempfile.mkdtemp()

        msku_path = os.path.join(temp_dir, f"msku_{mskuFile.filename}")
        template_path = os.path.join(temp_dir, f"template_{templateFile.filename}")
        export_path = os.path.join(temp_dir, f"export_{exportFile.filename}")
        output_path = os.path.join(temp_dir, "updated_stock_import.xlsx")

        def save_upload(upload_file, dest_path):
            with open(dest_path, "wb") as buffer:
                shutil.copyfileobj(upload_file.file, buffer)

        save_upload(mskuFile, msku_path)
        save_upload(templateFile, template_path)
        save_upload(exportFile, export_path)

        warehouse_path = ""
        if warehouseFile is not None:
            warehouse_path = os.path.join(temp_dir, f"warehouse_{warehouseFile.filename}")
            save_upload(warehouseFile, warehouse_path)
            logs = process_shein_files(msku_path, template_path, export_path, warehouse_path, output_path)
        else:
            print(">>> No warehouse file provided. Fetching from Feishu...")
            warehouse_data = fetch_warehouse_inventory()
            logs = process_shein_files_with_data(msku_path, template_path, export_path, warehouse_data, output_path)

        for p in [msku_path, template_path, export_path, warehouse_path]:
            try:
                os.remove(p)
            except:
                pass

        return FileResponse(
            path=output_path,
            filename="updated_stock_import.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backend Error: {str(e)}")


# ─── Feishu Warehouse Data ───────────────────────────────────────────────────────

@app.get("/api/inventory/feishu-warehouse")
def get_warehouse_from_feishu():
    """Fetch warehouse inventory from Feishu (14-sheet aggregation)."""
    try:
        warehouse_data = fetch_warehouse_inventory()
        return {
            "warehouse_data": warehouse_data,
            "total_skus": len(warehouse_data),
            "source": "feishu"
        }
    except Exception as e:
        print(f"ERROR fetching warehouse from Feishu: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch warehouse data: {str(e)}")


# ─── Warehouse Management ─────────────────────────────────────────────────────────

@app.post("/api/warehouse/sync-from-feishu")
def sync_warehouse_from_feishu():
    """Sync all warehouse data from Feishu to local database asynchronously."""
    def _run():
        try:
            warehouse.sync_from_feishu()
        except Exception as e:
            print(f"Background sync failed: {str(e)}")
            import traceback; traceback.print_exc()
    import threading
    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, "detail": "Sync started in background"}


@app.get("/api/warehouse/summary")
def get_warehouse_summary():
    """Get warehouse summary statistics."""
    try:
        return warehouse.get_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/warehouse/inventory-grid")
def get_warehouse_inventory_grid(
    sheet: str | None = None,
):
    """Get warehouse inventory with row indices for grid display/editing."""
    try:
        all_data = warehouse.get_inventory_all()
        
        if sheet:
            all_data = [r for r in all_data if r.get("sheet_name") == sheet]
        
        grid_data = []
        for i, row in enumerate(all_data):
            grid_data.append({
                "row_index": row.get("id"), # Use database ID as row_index for easier updates
                "sheet_name": row.get("sheet_name"),
                "sheet_id": row.get("sheet_id"),
                "product_no": row.get("product_no", ""),
                "picture": row.get("picture", ""),
                "warehouse_sku": row.get("sku", ""),
                "available_products_volume": row.get("stock_quantity", 0),
                "availability": row.get("availability", ""),
                "warehouse": row.get("warehouse_name", ""),
            })
        
        return {"data": grid_data, "total": len(grid_data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/warehouse/inventory")
def get_warehouse_inventory(
    sheet: str | None = None,
    search: str | None = None,
):
    """Get warehouse inventory with optional filtering."""
    try:
        if search:
            return {"inventory": warehouse.search_inventory(search)}
        if sheet:
            return {"inventory": warehouse.get_inventory_by_sheet(sheet)}
        return {"inventory": warehouse.get_inventory_all()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class InventoryUpdateRequest(BaseModel):
    stock_quantity: int


class InventoryAddRequest(BaseModel):
    sheet_name: str
    warehouse_name: str
    sku: str
    stock_quantity: int


@app.put("/api/warehouse/inventory/{record_id}")
def update_warehouse_inventory(
    record_id: int,
    req: InventoryUpdateRequest,
    current_user: dict | None = None
):
    """Update warehouse inventory record."""
    try:
        return warehouse.update_inventory(record_id, req.stock_quantity)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/warehouse/inventory")
def add_warehouse_inventory(
    req: InventoryAddRequest,
    current_user: dict | None = None
):
    """Add new warehouse inventory record."""
    try:
        return warehouse.add_inventory(
            req.sheet_name, req.warehouse_name, req.sku, req.stock_quantity
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/warehouse/inventory/{record_id}")
def delete_warehouse_inventory(
    record_id: int,
    current_user: dict | None = None
):
    """Delete warehouse inventory record."""
    try:
        return warehouse.delete_inventory(record_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/warehouse/products")
def get_warehouse_products(current_user: dict | None = None):
    """Get all warehouse products."""
    try:
        return {"products": warehouse.get_products()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CellUpdateRequest(BaseModel):
    sheet_id: str
    row_index: int
    column: str
    value: float | int | str


@app.put("/api/warehouse/cell-update")
def update_cell(
    req: CellUpdateRequest,
    current_user: dict | None = None
):
    """Write single cell value to Feishu Wiki sheet."""
    try:
        result = warehouse.write_inventory_cell(
            req.row_index, # This is the DB ID from the frontend
            req.column,
            req.value
        )
        if not result.get("ok"):
            raise HTTPException(status_code=500, detail=result.get("error", "Write failed"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ProductAddRequest(BaseModel):
    product_no: str
    sku: str
    warehouse_name: str | None = None
    image_url: str | None = None


@app.post("/api/warehouse/products")
def add_warehouse_product(
    req: ProductAddRequest,
    current_user: dict | None = None
):
    """Add new warehouse product."""
    try:
        return warehouse.add_product(
            req.product_no, req.sku, req.warehouse_name, req.image_url
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/warehouse/products/{product_id}")
def delete_warehouse_product(
    product_id: int,
    current_user: dict | None = None
):
    """Delete warehouse product."""
    try:
        return warehouse.delete_product(product_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/warehouse/upload-image")
async def upload_warehouse_image(
    file: UploadFile = File(...),
    current_user: dict | None = None
):
    """Upload image to Feishu for warehouse product."""
    try:
        content = await file.read()
        result = warehouse.upload_image_to_feishu(content, file.filename)
        if result.get("ok"):
            return result
        else:
            raise HTTPException(status_code=500, detail=result.get("error"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Ads Management ───────────────────────────────────────────────────────────

class AdsUpdateRequest(BaseModel):
    product_number: str | None = None
    date: str | None = None
    status: str | None = None
    roi: float | None = None
    cost_per_order: float | None = None
    ad_cost_rate: float | None = None
    ad_spend: float | None = None
    revenue: float | None = None
    campaign_budget: float | None = None
    budget_adjustment: str | None = None
    extra_budget_id: str | None = None
    ads_open_date: str | None = None
    total_funds: float | None = None
    profit: float | None = None
    color_flag: str | None = None
    notes: str | None = None


@app.get("/api/ads")
def get_ads(
    store: str | None = None,
    date_start: str | None = None,
    date_end: str | None = None,
    search: str | None = None,
):
    """Get ads data with filters."""
    try:
        return {"ads": ads.get_ads_by_store(store, date_start, date_end, search)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ads/summary")
def get_ads_summary():
    """Get ads summary statistics."""
    try:
        return ads.get_ads_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ads/upload")
async def upload_ads(
    file: UploadFile = File(...),
    store_name: str = Form(...),
    date: str = Form(...),
):
    """Upload ads data from Excel file."""
    try:
        content = await file.read()
        records = ads.parse_ads_excel(content, store_name, date)
        result = ads.save_ads_records(records)
        return {"ok": True, **result}
    except Exception as e:
        print(f"ERROR uploading ads: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.put("/api/ads/{record_id}")
def update_ads_record(
    record_id: int,
    data: AdsUpdateRequest,
):
    """Update ads record."""
    try:
        return ads.update_ads_record(record_id, data.model_dump(exclude_none=True))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/ads/{record_id}")
def delete_ads_record(record_id: int):
    """Delete ads record."""
    try:
        return ads.delete_ads_record(record_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ads/export")
def export_ads(store: str | None = None):
    """Export ads data to Excel."""
    try:
        data = ads.export_to_excel(store)
        from fastapi.responses import Response
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=ads_export.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Product Manager ──────────────────────────────────────────────────────────

def _pm_perf(orders: int) -> str:
    if orders >= 200: return "high"
    if orders >= 100: return "mid"
    if orders >= 50:  return "growing"
    return "low"

def _pm_calc_profit(cost_rmb: float, price_usd: float):
    if not price_usd or price_usd <= 0: return None, None
    EXCHANGE_RATE = 7.0; FIRST_MILE = 1.5; LAST_MILE = 9.5
    FIXED = 0.03 + 0.08 + 0.10 + 0.13; ADS = 0.05
    cost_usd = cost_rmb / EXCHANGE_RATE + FIRST_MILE + LAST_MILE
    cp = cost_usd / price_usd
    return round((1 - cp - FIXED - ADS) * 100, 1), round((1 - cp - FIXED) * 100, 1)


@app.get("/api/product-manager/products")
def pm_list_products(q: str = "", _: dict = Depends(auth.get_current_user)):
    """Product Manager — list all products with performance summary."""
    with db.db_cursor() as cur:
        if q:
            q_like = f"%{q}%"
            cur.execute("""
                SELECT product_no, warehouse_name, image_url, sku, status, stores_available,
                       cost, tt1_price, tt2_price, tt3_price, tt4_price
                FROM products
                WHERE product_no LIKE ? OR warehouse_name LIKE ?
                ORDER BY sort_order, product_no
            """, (q_like, q_like))
        else:
            cur.execute("""
                SELECT product_no, warehouse_name, image_url, sku, status, stores_available,
                       cost, tt1_price, tt2_price, tt3_price, tt4_price
                FROM products ORDER BY sort_order, product_no
            """)
        products = [dict(r) for r in cur.fetchall()]

        if not products:
            return {"products": []}

        pnos = [p["product_no"] for p in products]
        ph = ",".join("?" * len(pnos))

        # Latest period orders + GMV per product (sum across all stores)
        cur.execute(f"""
            WITH latest AS (
                SELECT product_no, MAX(period_start) AS mp
                FROM tiktok_export_analytics WHERE product_no IN ({ph})
                GROUP BY product_no
            )
            SELECT t.product_no,
                   SUM(COALESCE(t.orders,0))  AS total_orders,
                   SUM(COALESCE(t.gmv,0))     AS total_gmv,
                   l.mp                        AS period
            FROM tiktok_export_analytics t
            JOIN latest l ON t.product_no=l.product_no AND t.period_start=l.mp
            GROUP BY t.product_no
        """, pnos)
        orders_map = {r["product_no"]: {"orders": r["total_orders"] or 0,
                                         "gmv": r["total_gmv"] or 0,
                                         "period": r["period"]} for r in cur.fetchall()}

        # Total stock per product
        cur.execute(f"""
            SELECT product_no, SUM(stock_quantity) AS total_stock
            FROM warehouse_inventory WHERE product_no IN ({ph})
            GROUP BY product_no
        """, pnos)
        stock_map = {r["product_no"]: r["total_stock"] or 0 for r in cur.fetchall()}

        # R&R
        cur.execute("SELECT store_code, msku, SUM(order_qty) AS t FROM rr_order_items GROUP BY store_code, msku")
        ord_rows = cur.fetchall()
        cur.execute("SELECT store_code, msku, SUM(return_qty) AS t FROM rr_return_items GROUP BY store_code, msku")
        ret_rows = cur.fetchall()
        cur.execute("SELECT product_no, sku, tk1_seller_sku, tk2_seller_sku, tk3_seller_sku, tk4_seller_sku FROM products")
        all_prods = [dict(r) for r in cur.fetchall()]

    emap: dict = {}
    for p in all_prods:
        for key in [p["sku"], p["product_no"]]:
            if key: emap[str(key).strip().upper()] = p["product_no"]
        for sk_field in [p["tk1_seller_sku"], p["tk2_seller_sku"], p["tk3_seller_sku"], p["tk4_seller_sku"]]:
            if sk_field:
                for sk in str(sk_field).split(","):
                    sk = sk.strip()
                    if sk: emap[sk.upper()] = p["product_no"]

    def _resolve(msku):
        ku = msku.upper()
        if ku in emap: return emap[ku]
        for prefix, pno in emap.items():
            if ku.startswith(prefix + "-") or ku.startswith(prefix + "_"):
                return pno
        return None

    rr_orders: dict = {}
    rr_returns: dict = {}
    for r in ord_rows:
        pno = _resolve(r["msku"])
        if pno: rr_orders[pno] = rr_orders.get(pno, 0) + (r["t"] or 0)
    for r in ret_rows:
        pno = _resolve(r["msku"])
        if pno: rr_returns[pno] = rr_returns.get(pno, 0) + (r["t"] or 0)

    results = []
    for p in products:
        pno = p["product_no"]
        od = orders_map.get(pno, {})
        orders = od.get("orders", 0)
        o = rr_orders.get(pno, 0)
        rt = rr_returns.get(pno, 0)
        rr_rate = round(rt / o * 100, 1) if o > 0 else None
        results.append({**p,
            "total_orders": orders, "total_gmv": od.get("gmv", 0),
            "latest_period": od.get("period"), "total_stock": stock_map.get(pno, 0),
            "rr_rate": rr_rate, "performance": _pm_perf(orders)})

    return {"products": results}


@app.get("/api/product-manager/{product_no:path}")
def pm_product_detail(product_no: str, _: dict = Depends(auth.get_current_user)):
    """Product Manager — full detail for one product."""
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT product_no, warehouse_name, image_url, sku, status, stores_available, cost,
                   tt1_price, tt2_price, tt3_price, tt4_price,
                   tt1_price_max, tt2_price_max, tt3_price_max, tt4_price_max,
                   tk1_seller_sku, tk2_seller_sku, tk3_seller_sku, tk4_seller_sku
            FROM products WHERE product_no=?
        """, (product_no,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Product not found")
        prod = dict(row)

        # Monthly TikTok export (aggregated across stores)
        cur.execute("""
            SELECT period_start, period_end, store_code,
                   COALESCE(orders,0) AS orders, COALESCE(gmv,0) AS gmv,
                   COALESCE(impressions,0) AS impressions, COALESCE(clicks,0) AS clicks,
                   COALESCE(items_sold,0) AS items_sold, COALESCE(refunds,0) AS refunds,
                   COALESCE(ctr,0) AS ctr
            FROM tiktok_export_analytics WHERE product_no=? ORDER BY period_start ASC
        """, (product_no,))
        raw_monthly = [dict(r) for r in cur.fetchall()]

        agg: dict = {}
        for r in raw_monthly:
            k = r["period_start"]
            if k not in agg:
                agg[k] = {"period_start": k, "period_end": r["period_end"],
                          "orders": 0, "gmv": 0.0, "impressions": 0,
                          "clicks": 0, "items_sold": 0, "refunds": 0.0, "by_store": {}}
            agg[k]["orders"]      += r["orders"]
            agg[k]["gmv"]         += r["gmv"]
            agg[k]["impressions"] += r["impressions"]
            agg[k]["clicks"]      += r["clicks"]
            agg[k]["items_sold"]  += r["items_sold"]
            agg[k]["refunds"]     += r["refunds"]
            agg[k]["by_store"][r["store_code"]] = {
                "orders": r["orders"], "gmv": r["gmv"],
                "impressions": r["impressions"], "clicks": r["clicks"], "ctr": r["ctr"],
            }
        for v in agg.values():
            v["ctr"] = round(v["clicks"] / v["impressions"] * 100, 2) if v["impressions"] > 0 else 0
        monthly = sorted(agg.values(), key=lambda x: x["period_start"])

        # Warehouse stock
        cur.execute("""
            SELECT sheet_name, sku, warehouse_name, stock_quantity, availability
            FROM warehouse_inventory WHERE product_no=? ORDER BY sheet_name, sku
        """, (product_no,))
        stock_rows = [dict(r) for r in cur.fetchall()]
        if not stock_rows and prod.get("sku"):
            cur.execute("""
                SELECT sheet_name, sku, warehouse_name, stock_quantity, availability
                FROM warehouse_inventory WHERE sku LIKE ? ORDER BY sheet_name, sku
            """, (f"%{prod['sku']}%",))
            stock_rows = [dict(r) for r in cur.fetchall()]

        stock_groups: dict = {}
        total_stock = 0
        for s in stock_rows:
            sheet = s["sheet_name"] or "Default"
            if sheet not in stock_groups:
                stock_groups[sheet] = {"sheet_name": sheet, "variants": [], "total": 0}
            qty = s["stock_quantity"] or 0
            stock_groups[sheet]["variants"].append({
                "sku": s["sku"], "warehouse_name": s["warehouse_name"],
                "stock": qty, "availability": s["availability"],
            })
            stock_groups[sheet]["total"] += qty
            total_stock += qty

        # Pricing
        STORE_COLS = {"TK1": ("tt1_price","tt1_price_max"), "TK2": ("tt2_price","tt2_price_max"),
                      "TK3": ("tt3_price","tt3_price_max"), "TK4": ("tt4_price","tt4_price_max")}
        pricing: dict = {}
        cost = prod.get("cost")
        if cost:
            for store, (col, col_max) in STORE_COLS.items():
                price = prod.get(col); price_max = prod.get(col_max)
                if price:
                    wa, woa = _pm_calc_profit(cost, price)
                    entry: dict = {"price": price, "profit_with_ads": wa, "profit_without_ads": woa}
                    if price_max and price_max != price:
                        wa_max, woa_max = _pm_calc_profit(cost, price_max)
                        entry.update({"price_max": price_max, "profit_with_ads_max": wa_max, "profit_without_ads_max": woa_max})
                    pricing[store] = entry

        # R&R — build match keys from product_no, sku, and all seller SKUs
        match_keys: set = set()
        for key in [product_no, prod.get("sku")]:
            if key:
                match_keys.add(str(key).strip().upper())
        for sk_field in ["tk1_seller_sku", "tk2_seller_sku", "tk3_seller_sku", "tk4_seller_sku"]:
            val = prod.get(sk_field)
            if val:
                for sk in str(val).split(","):
                    sk = sk.strip()
                    if sk:
                        match_keys.add(sk.upper())

        def _rr_matches(msku: str) -> bool:
            ku = msku.upper()
            if ku in match_keys:
                return True
            for mk in match_keys:
                if ku.startswith(mk + "-") or ku.startswith(mk + "_"):
                    return True
            return False

        # Query orders and returns SEPARATELY to avoid JOIN multiplication bug
        # (multiple upload rows for same msku × store would inflate both sides)
        cur.execute("""
            SELECT store_code, msku, SUM(order_qty) AS oq
            FROM rr_order_items GROUP BY store_code, msku
        """)
        ord_map: dict = {}  # (store_code, msku) -> oq
        for r in cur.fetchall():
            ord_map[(r["store_code"], r["msku"])] = r["oq"] or 0

        cur.execute("""
            SELECT store_code, msku, SUM(return_qty) AS rq
            FROM rr_return_items GROUP BY store_code, msku
        """)
        ret_map: dict = {}  # (store_code, msku) -> rq
        for r in cur.fetchall():
            ret_map[(r["store_code"], r["msku"])] = r["rq"] or 0

        rr_by_store: dict = {}
        for (sc, msku), oq in ord_map.items():
            if not _rr_matches(msku):
                continue
            rq = ret_map.get((sc, msku), 0)
            if sc not in rr_by_store:
                rr_by_store[sc] = {"order_qty": 0, "return_qty": 0}
            rr_by_store[sc]["order_qty"]  += oq
            rr_by_store[sc]["return_qty"] += rq
        for sc, d in rr_by_store.items():
            o2 = d["order_qty"]; r2 = d["return_qty"]
            d["rr_rate"] = round(r2 / o2 * 100, 1) if o2 > 0 else 0
        total_o = sum(v["order_qty"]  for v in rr_by_store.values())
        total_r = sum(v["return_qty"] for v in rr_by_store.values())
        overall_rr = round(total_r / total_o * 100, 1) if total_o > 0 else None

    latest_orders = monthly[-1]["orders"] if monthly else 0
    return {
        "product": {k: prod[k] for k in ["product_no","warehouse_name","image_url","sku","status","cost","stores_available"]},
        "monthly": monthly,
        "stock": {"total": total_stock, "groups": list(stock_groups.values())},
        "pricing": pricing,
        "rr": {"overall": overall_rr, "by_store": rr_by_store},
        "performance": _pm_perf(latest_orders),
        "latest_orders": latest_orders,
    }
