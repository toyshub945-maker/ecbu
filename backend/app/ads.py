import pandas as pd
import io
from . import db, config
from datetime import datetime

STORE_MAPPING = {
    "CELNEPHO": "TIKTOK 01",
    "CYNLLIO": "TIKTOK 02",
    "VIMISAOI": "TIKTOK 03",
    "mikarka shoes": "TIKTOK 04",
}

REVERSE_STORE_MAPPING = {v: k for k, v in STORE_MAPPING.items()}


def get_store_sheet_name(store_name: str) -> str:
    return STORE_MAPPING.get(store_name, store_name)


def get_store_name_from_sheet(sheet_name: str) -> str:
    return REVERSE_STORE_MAPPING.get(sheet_name, sheet_name)


def parse_ads_excel(file_content: bytes, store_name: str, date: str, date_range_end: str | None = None) -> list[dict]:
    df = pd.read_excel(io.BytesIO(file_content))
    records = []

    for _, row in df.iterrows():
        campaign_name = str(row.get("Campaign name", row.get("Campaign Name", "")))

        if not campaign_name or campaign_name == "nan":
            continue

        product_number = ""
        if "Product" in campaign_name:
            parts = campaign_name.split("Product")
            if len(parts) > 1:
                product_number = parts[1].strip()

        product_number = product_number or campaign_name

        cost = row.get("Cost", 0) or 0
        gross_revenue = row.get("Gross revenue", row.get("Gross Revenue", 0)) or 0
        roi = row.get("ROI", 0) or 0
        cost_per_order = row.get("Cost per order", row.get("Cost Per Order", 0)) or 0
        orders = row.get("SKU orders", row.get("Orders", 0)) or 0
        current_budget = row.get("Current budget", row.get("Budget", 0)) or 0

        if gross_revenue > 0:
            ad_cost_rate = (cost / gross_revenue) * 100
        else:
            ad_cost_rate = 0

        if cost > 0 and orders > 0:
            cost_per_order = cost / orders

        records.append({
            "store_name": store_name,
            "product_number": str(product_number),
            "date": date,
            "date_range_end": date_range_end,
            "status": "Active",
            "orders": int(orders) if orders else 0,
            "roi": float(roi) if roi else 0,
            "cost_per_order": float(cost_per_order) if cost_per_order else 0,
            "ad_cost_rate": float(round(ad_cost_rate, 2)),
            "ad_spend": float(cost) if cost else 0,
            "revenue": float(gross_revenue) if gross_revenue else 0,
            "campaign_budget": float(current_budget) if current_budget else 0,
            "budget_adjustment": "",
            "extra_budget_id": "",
            "ads_open_date": None,
            "total_funds": None,
            "profit": None,
            "color_flag": None,
            "notes": "",
        })

    return records


def save_ads_records(records: list[dict]) -> dict:
    inserted = 0
    updated = 0

    with db.db_cursor() as cur:
        for record in records:
            cur.execute("""
                INSERT INTO ads_campaigns (
                    store_name, product_number, date, date_range_end, status, orders,
                    roi, cost_per_order, ad_cost_rate, ad_spend, revenue, campaign_budget,
                    budget_adjustment, extra_budget_id, ads_open_date, total_funds, profit,
                    color_flag, notes, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                record.get("store_name"),
                record.get("product_number"),
                record.get("date"),
                record.get("date_range_end"),
                record.get("status", "Active"),
                record.get("orders", 0),
                record.get("roi"),
                record.get("cost_per_order"),
                record.get("ad_cost_rate"),
                record.get("ad_spend"),
                record.get("revenue"),
                record.get("campaign_budget"),
                record.get("budget_adjustment"),
                record.get("extra_budget_id"),
                record.get("ads_open_date"),
                record.get("total_funds"),
                record.get("profit"),
                record.get("color_flag"),
                record.get("notes"),
            ))
            inserted += 1

    return {"total": len(records), "inserted": inserted, "updated": updated}


def get_ads_by_store(store_name: str | None = None, date_start: str | None = None, date_end: str | None = None, search: str | None = None) -> list[dict]:
    with db.db_cursor() as cur:
        query = "SELECT * FROM ads_campaigns WHERE 1=1"
        params = []
        
        if store_name:
            query += " AND store_name = ?"
            params.append(store_name)
        
        if date_start:
            query += " AND date >= ?"
            params.append(date_start)
        
        if date_end:
            query += " AND date <= ?"
            params.append(date_end)
        
        if search:
            query += " AND (product_number LIKE ? OR notes LIKE ?)"
            params.append(f"%{search}%")
        
        query += " ORDER BY date DESC, id DESC"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        return [dict(row) for row in rows]


def get_ads_summary() -> dict:
    with db.db_cursor() as cur:
        cur.execute("""
            SELECT 
                store_name,
                COUNT(*) as total_campaigns,
                SUM(ad_spend) as total_spend,
                SUM(revenue) as total_revenue,
                AVG(roi) as avg_roi
            FROM ads_campaigns
            GROUP BY store_name
        """)
        rows = cur.fetchall()
        
        by_store = []
        total_spend = 0
        total_revenue = 0
        
        for row in rows:
            by_store.append({
                "store_name": row["store_name"],
                "campaigns": row["total_campaigns"],
                "spend": row["total_spend"] or 0,
                "revenue": row["total_revenue"] or 0,
                "avg_roi": round(row["avg_roi"] or 0, 2),
            })
            total_spend += row["total_spend"] or 0
            total_revenue += row["total_revenue"] or 0
        
        cur.execute("SELECT MAX(date) as last_updated FROM ads_campaigns")
        last_row = cur.fetchone()
        last_updated = last_row["last_updated"] if last_row else None
        
        return {
            "total_campaigns": sum(s["campaigns"] for s in by_store),
            "total_spend": round(total_spend, 2),
            "total_revenue": round(total_revenue, 2),
            "avg_roi": round((total_revenue / total_spend * 100) if total_spend > 0 else 0, 2),
            "by_store": by_store,
            "last_updated": last_updated,
        }


def update_ads_record(record_id: int, data: dict) -> dict:
    if not data:
        return {"updated": 0}
    
    with db.db_cursor() as cur:
        set_clauses = []
        values = []
        
        for field in ["product_number", "date", "date_range_end", "status", "orders", "roi",
                      "cost_per_order", "ad_cost_rate", "ad_spend", "revenue", "campaign_budget",
                      "budget_adjustment", "extra_budget_id", "ads_open_date", "total_funds",
                      "profit", "color_flag", "notes"]:
            if field in data:
                set_clauses.append(f"{field} = ?")
                values.append(data[field])
        
        if not set_clauses:
            return {"updated": 0}
        
        set_clauses.append("updated_at = CURRENT_TIMESTAMP")
        values.append(record_id)
        
        query = f"UPDATE ads_campaigns SET {', '.join(set_clauses)} WHERE id = ?"
        cur.execute(query, values)
        
        return {"updated": cur.rowcount}


def delete_ads_record(record_id: int) -> dict:
    with db.db_cursor() as cur:
        cur.execute("DELETE FROM ads_campaigns WHERE id = ?", (record_id,))
        return {"deleted": cur.rowcount}


def upsert_weekend_row(store_name: str, product_number: str, date: str, data: dict) -> dict:
    """Insert or update a single row identified by (store_name, product_number, date)."""
    with db.db_cursor() as cur:
        cur.execute(
            "SELECT id FROM ads_campaigns WHERE store_name=? AND product_number=? AND date=?",
            (store_name, product_number, date),
        )
        row = cur.fetchone()

        fields = ["ad_spend", "orders", "cost_per_order", "revenue", "roi", "total_funds"]
        if row:
            sets = ", ".join(f"{f} = ?" for f in fields if f in data)
            vals = [data[f] for f in fields if f in data]
            if sets:
                vals.append(row["id"])
                cur.execute(f"UPDATE ads_campaigns SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?", vals)
            return {"id": row["id"], "action": "updated"}
        else:
            cur.execute("""
                INSERT INTO ads_campaigns
                    (store_name, product_number, date, status,
                     ad_spend, orders, cost_per_order, revenue, roi, total_funds,
                     updated_at)
                VALUES (?,?,?,'Active',?,?,?,?,?,?,CURRENT_TIMESTAMP)
            """, (
                store_name, product_number, date,
                data.get("ad_spend", 0), data.get("orders", 0),
                data.get("cost_per_order", 0), data.get("revenue", 0),
                data.get("roi", 0), data.get("total_funds", 0),
            ))
            return {"id": cur.lastrowid, "action": "inserted"}


def get_weekend_rows(store_name: str, date: str) -> list[dict]:
    """Return TT1–TT4 rows for a given store + date (creates blanks if missing)."""
    tt_labels = ["TT1", "TT2", "TT3", "TT4"]
    with db.db_cursor() as cur:
        cur.execute(
            "SELECT * FROM ads_campaigns WHERE store_name=? AND date=? AND product_number IN (?,?,?,?)",
            (store_name, date, *tt_labels),
        )
        rows = {r["product_number"]: dict(r) for r in cur.fetchall()}

    result = []
    for label in tt_labels:
        if label in rows:
            result.append(rows[label])
        else:
            result.append({
                "id": None, "store_name": store_name, "product_number": label,
                "date": date, "status": "Active",
                "ad_spend": 0, "orders": 0, "cost_per_order": 0,
                "revenue": 0, "roi": 0, "total_funds": 0,
            })
    return result


def export_to_excel(store_name: str | None = None) -> bytes:
    records = get_ads_by_store(store_name=store_name)
    df = pd.DataFrame(records)
    output = io.BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    output.seek(0)
    return output.read()


# TT store labels for daily summary
TT_STORES = {
    "CELNEPHO": "TT1",
    "CYNLLIO": "TT2",
    "VIMISAOI": "TT3",
    "mikarka shoes": "TT4",
}


def get_daily_store_summary(date: str | None = None) -> dict:
    """Return per-TT-store aggregated metrics for a given date (defaults to latest)."""
    with db.db_cursor() as cur:
        if not date:
            cur.execute("SELECT MAX(date) as latest FROM ads_campaigns WHERE store_name IN (?, ?, ?, ?)",
                        tuple(TT_STORES.keys()))
            row = cur.fetchone()
            date = row["latest"] if row else None

        if not date:
            return {"date": None, "stores": []}

        result = []
        for store_name, label in TT_STORES.items():
            cur.execute("""
                SELECT
                    COALESCE(SUM(ad_spend), 0)       AS cost,
                    COALESCE(SUM(orders), 0)         AS orders,
                    COALESCE(SUM(revenue), 0)        AS revenue,
                    COALESCE(AVG(roi), 0)            AS roi,
                    COALESCE(MAX(total_funds), 0)    AS ad_balance
                FROM ads_campaigns
                WHERE store_name = ? AND date = ?
            """, (store_name, date))
            row = cur.fetchone()
            if row:
                cost = float(row["cost"])
                orders = int(row["orders"])
                cpo = round(cost / orders, 2) if orders > 0 else 0
                result.append({
                    "store": label,
                    "cost": round(cost, 2),
                    "orders": orders,
                    "cost_per_order": cpo,
                    "revenue": round(float(row["revenue"]), 2),
                    "roi": round(float(row["roi"]), 2),
                    "ad_balance": round(float(row["ad_balance"]), 2),
                })

        return {"date": date, "stores": result}


def get_available_dates_for_stores(store_names: list[str]) -> list[str]:
    """Return distinct dates that have data for any of the given stores."""
    placeholders = ",".join("?" * len(store_names))
    with db.db_cursor() as cur:
        cur.execute(
            f"SELECT DISTINCT date FROM ads_campaigns WHERE store_name IN ({placeholders}) ORDER BY date DESC LIMIT 90",
            store_names,
        )
        return [row["date"] for row in cur.fetchall()]