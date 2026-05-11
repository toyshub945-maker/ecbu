"""Stock Prediction — parse restock demand Excel and compute per-SKU demand."""
from __future__ import annotations

import io
from typing import Optional

import openpyxl
from . import db


def parse_restock_excel(file_content: bytes) -> dict:
    """
    Parse a multi-sheet restock demand Excel file.

    Sheet structure (each sheet = one product):
      Row 1  – instructions / notes (skip)
      Row 2  – column headers
      Row 3+ – SKU data rows

    Supported header variants:
      Extended: Image | SKU-Color-Size | TT1-Orders | TT2-Orders | TT3-Orders | TT4-Orders | Total Orders | ...
      Simple  : Image | SKU-Color-Size | Total Orders | ...

    Returns a dict with:
      - grand_total: int   (sum of all SKU orders across ALL sheets)
      - skus: list[dict]   (one entry per SKU row, with product_no derived from sheet name)
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
    all_skus: list[dict] = []

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]

        # Derive product_no from sheet name (e.g. "Restock Demand template 217" → "217")
        product_no = sheet_name.strip()
        for prefix in ["Restock Demand template ", "restock demand template ", "Template "]:
            if sheet_name.startswith(prefix):
                product_no = sheet_name[len(prefix):].strip()
                break

        # Row 2 = headers (1-indexed)
        header_row = list(ws.iter_rows(min_row=2, max_row=2, values_only=True))[0]

        # Map header label → column index (0-based within the row)
        col_map: dict[str, int] = {}
        for idx, h in enumerate(header_row):
            if h is None:
                continue
            hs = str(h).strip().lower()
            if any(k in hs for k in ["货号", "颜色", "color", "sku", "size"]):
                col_map.setdefault("sku", idx)
            elif "tt1" in hs:
                col_map["tt1"] = idx
            elif "tt2" in hs:
                col_map["tt2"] = idx
            elif "tt3" in hs:
                col_map["tt3"] = idx
            elif "tt4" in hs:
                col_map["tt4"] = idx
            elif "total orders" in hs or "total order" in hs:
                col_map["total_orders"] = idx
            elif "now stock" in hs or "stock" in hs:
                col_map.setdefault("stock", idx)
            elif "selling price" in hs:
                col_map["selling_price"] = idx
            elif "profit margin" in hs:
                col_map["profit_margin"] = idx
            elif "return" in hs and "refund" in hs:
                col_map["rr_rate"] = idx

        if "sku" not in col_map:
            continue  # unrecognised sheet

        has_tt_cols = all(k in col_map for k in ["tt1", "tt2", "tt3", "tt4"])

        # Data rows start at row 3
        for row_vals in ws.iter_rows(min_row=3, values_only=True):
            sku_val = row_vals[col_map["sku"]] if col_map["sku"] < len(row_vals) else None
            if not sku_val or str(sku_val).strip() in ("", "nan", "None"):
                continue
            sku = str(sku_val).strip()

            def _num(idx_key: str) -> float:
                if idx_key not in col_map:
                    return 0.0
                idx = col_map[idx_key]
                if idx >= len(row_vals):
                    return 0.0
                v = row_vals[idx]
                try:
                    return float(v) if v not in (None, "") else 0.0
                except (TypeError, ValueError):
                    return 0.0

            if has_tt_cols:
                tt1 = _num("tt1")
                tt2 = _num("tt2")
                tt3 = _num("tt3")
                tt4 = _num("tt4")
                total_orders = tt1 + tt2 + tt3 + tt4
                if "total_orders" in col_map:
                    # trust the pre-computed total if available and non-zero
                    precomp = _num("total_orders")
                    if precomp > 0:
                        total_orders = precomp
            else:
                tt1 = tt2 = tt3 = tt4 = 0.0
                total_orders = _num("total_orders")

            current_stock = _num("stock")
            selling_price = _num("selling_price")
            profit_margin = _num("profit_margin")
            rr_rate = _num("rr_rate")

            if total_orders <= 0:
                continue

            all_skus.append({
                "product_no": product_no,
                "sku": sku,
                "tt1_orders": int(round(tt1)),
                "tt2_orders": int(round(tt2)),
                "tt3_orders": int(round(tt3)),
                "tt4_orders": int(round(tt4)),
                "total_orders": int(round(total_orders)),
                "current_stock": int(round(current_stock)),
                "selling_price": round(selling_price, 2),
                "profit_margin": round(profit_margin, 4),
                "rr_rate": round(rr_rate, 4),
            })

    grand_total = sum(s["total_orders"] for s in all_skus)
    for sku in all_skus:
        sku["sku_quota_rate"] = (
            round(sku["total_orders"] / grand_total, 8) if grand_total > 0 else 0.0
        )

    # Enrich with live DB data (warehouse stock + product prices)
    _enrich_from_db(all_skus)

    return {
        "grand_total": grand_total,
        "sku_count": len(all_skus),
        "product_count": len({s["product_no"] for s in all_skus}),
        "skus": all_skus,
    }


def _enrich_from_db(skus: list[dict]) -> None:
    """
    Mutates each sku dict in-place, overriding:
      - current_stock  → SUM(stock_quantity) from warehouse_inventory grouped by sku
      - selling_price  → average of tt1-tt4 prices from products table (matched by product_no)
      - profit_margin  → computed using the SAME formula as the Pricing tab:
                          cost_usd = cost_rmb / 7 + 1.5 (first_mile) + 9.5 (last_mile)
                          profit_with_ads = 1 - cost_usd/price - warehouse(3%) - tiktok(8%)
                                              - refund(10%) - affiliate(13%) - ads(5%)
      - rr_rate        → return_qty / order_qty from rr tables (case-insensitive msku match)
    """
    # ── Pricing tab constants (must match main.py /api/pricing) ──────────────
    EXCHANGE_RATE = 7.0
    FIRST_MILE    = 1.5
    LAST_MILE     = 9.5
    FIXED_FEES    = 0.03 + 0.08 + 0.10 + 0.13   # warehouse + tiktok + refund + affiliate
    ADS           = 0.05

    def _calc_margin(cost_rmb: float, price_usd: float) -> float | None:
        if not price_usd or price_usd <= 0 or not cost_rmb or cost_rmb <= 0:
            return None
        cost_usd = cost_rmb / EXCHANGE_RATE + FIRST_MILE + LAST_MILE
        cost_pct = cost_usd / price_usd
        return round((1 - cost_pct - FIXED_FEES - ADS), 4)   # same as profit_with_ads / 100

    try:
        with db.db_cursor() as cur:
            # ── 1. Warehouse stock by SKU ─────────────────────────────────────
            cur.execute("""
                SELECT lower(sku) as sku_lower, SUM(stock_quantity) as total_qty
                FROM warehouse_inventory
                GROUP BY lower(sku)
            """)
            wh_stock: dict[str, int] = {
                row["sku_lower"]: int(row["total_qty"] or 0)
                for row in cur.fetchall()
            }

            # ── 2. Selling price + profit margin from products table ──────────
            #    Uses same formula as Pricing tab in main.py
            cur.execute("""
                SELECT product_no, cost,
                       tt1_price, tt2_price, tt3_price, tt4_price
                FROM products
            """)
            product_prices: dict[str, float] = {}   # product_no → avg price
            product_margins: dict[str, float] = {}  # product_no → profit_with_ads (0-1)
            for row in cur.fetchall():
                prices = [row[f"tt{i}_price"] for i in range(1, 5) if row[f"tt{i}_price"]]
                if not prices:
                    continue
                avg_price = sum(prices) / len(prices)
                product_prices[str(row["product_no"])] = round(avg_price, 2)
                if row["cost"]:
                    margin = _calc_margin(row["cost"], avg_price)
                    if margin is not None:
                        product_margins[str(row["product_no"])] = margin

            # ── 3. R&R rate by msku (case-insensitive) ────────────────────────
            cur.execute("""
                SELECT lower(o.msku) as msku_lower,
                       SUM(o.order_qty)  as total_orders,
                       COALESCE(SUM(r.return_qty), 0) as total_returns
                FROM rr_order_items o
                LEFT JOIN rr_return_items r
                    ON lower(r.msku) = lower(o.msku)
                GROUP BY lower(o.msku)
            """)
            rr_map: dict[str, float] = {}
            for row in cur.fetchall():
                if row["total_orders"] and row["total_orders"] > 0:
                    rr_map[row["msku_lower"]] = round(
                        row["total_returns"] / row["total_orders"], 4
                    )

        # Apply enrichments
        for s in skus:
            sku_lower = s["sku"].lower()
            prod_no = str(s["product_no"])

            # Stock from warehouse (override Excel value)
            if sku_lower in wh_stock:
                s["current_stock"] = wh_stock[sku_lower]
                s["stock_source"] = "warehouse_db"
            else:
                s["stock_source"] = "excel"

            # Selling price from products table (override Excel value)
            if prod_no in product_prices:
                s["selling_price"] = product_prices[prod_no]
                s["price_source"] = "products_db"
            else:
                s["price_source"] = "excel"

            # Profit margin from Pricing tab formula (override Excel value)
            if prod_no in product_margins:
                s["profit_margin"] = product_margins[prod_no]
                s["margin_source"] = "pricing_db"
            else:
                s["margin_source"] = "excel"

            # R&R rate from rr tables (override Excel value if found)
            if sku_lower in rr_map:
                s["rr_rate"] = rr_map[sku_lower]
                s["rr_source"] = "rr_db"
            else:
                s["rr_source"] = "excel"

    except Exception:
        # DB enrichment is best-effort; don't break the upload if it fails
        pass


def export_prediction_excel(skus: list[dict], months: list[dict], daily_prediction: float, prediction_days: int) -> bytes:
    """
    Generate an Excel export of the stock prediction results.

    months: [{"label": "Jun", "pct": 40}, ...]
    """
    import openpyxl as xl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = xl.Workbook()
    ws = wb.active
    ws.title = "Stock Prediction"

    # Colours
    HEADER_FILL = PatternFill("solid", fgColor="1E293B")
    SUB_FILL    = PatternFill("solid", fgColor="334155")
    GREEN_FILL  = PatternFill("solid", fgColor="DCFCE7")
    YELLOW_FILL = PatternFill("solid", fgColor="FEF9C3")
    RED_FILL    = PatternFill("solid", fgColor="FEE2E2")

    header_font = Font(bold=True, color="FFFFFF", size=10)
    body_font   = Font(size=10)
    thin = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    base_headers = [
        "Product No", "SKU", "TT1 Orders", "TT2 Orders", "TT3 Orders", "TT4 Orders",
        "Total Orders", "Quota Rate %", "Now Stock", "Expected Demand",
    ]
    month_labels = [m["label"] for m in months]
    all_headers = base_headers + month_labels + ["Selling Price", "Profit Margin %", "R&R Rate %"]

    # Write headers
    ws.append(all_headers)
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin

    # Group skus by product_no for subtotal rows
    from collections import defaultdict
    by_product: dict[str, list[dict]] = defaultdict(list)
    for s in skus:
        by_product[s["product_no"]].append(s)

    grand_total = sum(s["total_orders"] for s in skus)

    for prod_no, prod_skus in by_product.items():
        for sku in prod_skus:
            quota = sku["total_orders"] / grand_total if grand_total > 0 else 0
            expected = daily_prediction * prediction_days * quota
            row = [
                prod_no,
                sku["sku"],
                sku.get("tt1_orders", 0),
                sku.get("tt2_orders", 0),
                sku.get("tt3_orders", 0),
                sku.get("tt4_orders", 0),
                sku["total_orders"],
                round(quota * 100, 4),
                sku.get("current_stock", 0),
                round(expected, 1),
            ]
            for m in months:
                row.append(round(expected * m["pct"] / 100, 1))
            row += [
                sku.get("selling_price", ""),
                round(sku.get("profit_margin", 0) * 100, 2) if sku.get("profit_margin") else "",
                round(sku.get("rr_rate", 0) * 100, 2) if sku.get("rr_rate") else "",
            ]
            ws.append(row)
            for cell in ws[ws.max_row]:
                cell.font = body_font
                cell.border = thin
                cell.alignment = Alignment(horizontal="center")

        # Subtotal row
        prod_total = sum(s["total_orders"] for s in prod_skus)
        prod_quota = prod_total / grand_total if grand_total > 0 else 0
        prod_expected = daily_prediction * prediction_days * prod_quota
        sub_row = [
            f"[{prod_no}] TOTAL",
            f"{len(prod_skus)} SKUs",
            sum(s.get("tt1_orders", 0) for s in prod_skus),
            sum(s.get("tt2_orders", 0) for s in prod_skus),
            sum(s.get("tt3_orders", 0) for s in prod_skus),
            sum(s.get("tt4_orders", 0) for s in prod_skus),
            prod_total,
            round(prod_quota * 100, 4),
            sum(s.get("current_stock", 0) for s in prod_skus),
            round(prod_expected, 1),
        ]
        for m in months:
            sub_row.append(round(prod_expected * m["pct"] / 100, 1))
        sub_row += ["", "", ""]
        ws.append(sub_row)
        for cell in ws[ws.max_row]:
            cell.font = Font(bold=True, color="FFFFFF", size=10)
            cell.fill = SUB_FILL
            cell.border = thin
            cell.alignment = Alignment(horizontal="center")

    # Column widths
    ws.column_dimensions["A"].width = 16
    ws.column_dimensions["B"].width = 28
    for col_idx in range(3, len(all_headers) + 1):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 14

    # Freeze header
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
