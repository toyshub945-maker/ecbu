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
    wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True, read_only=True)
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
            # Use the indexed `sku` column directly; normalise to lower in Python
            cur.execute("""
                SELECT sku, SUM(stock_quantity) as total_qty
                FROM warehouse_inventory
                GROUP BY sku
            """)
            wh_stock: dict[str, int] = {
                row["sku"].lower(): int(row["total_qty"] or 0)
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
            # Pre-aggregate each table separately BEFORE joining — the old single
            # JOIN multiplied every order row × every return row per MSKU before
            # grouping (cartesian explosion). CTEs pre-aggregate first, then join
            # on already-small sets.
            cur.execute("""
                WITH o_agg AS (
                    SELECT lower(msku) AS m, SUM(order_qty) AS total_orders
                    FROM rr_order_items
                    GROUP BY lower(msku)
                ),
                r_agg AS (
                    SELECT lower(msku) AS m, SUM(return_qty) AS total_returns
                    FROM rr_return_items
                    GROUP BY lower(msku)
                )
                SELECT o.m AS msku_lower,
                       o.total_orders,
                       COALESCE(r.total_returns, 0) AS total_returns
                FROM o_agg o
                LEFT JOIN r_agg r ON o.m = r.m
            """)
            rr_map: dict[str, float] = {}
            for row in cur.fetchall():
                if row["total_orders"] and row["total_orders"] > 0:
                    rr_map[row["msku_lower"]] = round(
                        row["total_returns"] / row["total_orders"], 4
                    )

        # Apply enrichments
        for s in skus:
            sku_lower  = s["sku"].lower()
            # msku is stored from ERP upload (e.g. "STP039-Black MB-6")
            # fallback: try base_sku if msku not present
            msku_lower = (s.get("msku") or "").lower() or sku_lower
            prod_no    = str(s.get("product_no") or "")

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

            # R&R rate — match by MSKU first (from ERP data), then fallback to sku
            rr_hit = rr_map.get(msku_lower) or rr_map.get(sku_lower)
            if rr_hit is not None:
                s["rr_rate"] = rr_hit
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


def generate_template_excel(
    product_no: str,
    skus: list[dict],
    months: list[dict],
    daily_prediction: float,
    prediction_days: int,
    grand_total: int,
) -> bytes:
    """
    Fill the exact "Template prediction.xlsx" layout for a single product.

    Template structure:
      Sheet name : "Restock Demand template {product_no}"
      Row 1      : instruction text (bold, wrapped)
      Row 2      : headers, yellow fill FFFFF3CE, bold
                   A=Image | B=SKU | C=TT1-Orders | D=TT2-Orders | E=TT3-Orders | F=TT4-Orders
                   G=Total Orders | H=SKU Quota Rate | I=Now Stock | J=Expected Demand
                   K..K+n-1 = month columns  |  last-3=Selling price | last-2=Profit margin | last-1=Return and refund rate
      Row 3+     : data rows, height 16.5
    """
    import openpyxl as xl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = xl.Workbook()
    ws = wb.active
    ws.title = f"Restock Demand template {product_no}"

    # ── Styles ────────────────────────────────────────────────────────────────
    YELLOW_FILL = PatternFill("solid", fgColor="FFFFF3CE")
    header_font = Font(bold=True, size=10)
    body_font   = Font(size=10)
    thin = Border(
        left=Side(style="thin",   color="D9D9D9"),
        right=Side(style="thin",  color="D9D9D9"),
        top=Side(style="thin",    color="D9D9D9"),
        bottom=Side(style="thin", color="D9D9D9"),
    )

    # ── Column widths (matching exact template widths) ────────────────────────
    month_count = len(months)
    # Fixed cols: A-J (10 cols) + month cols + 3 tail cols
    COL_WIDTHS = {
        "A": 14.875,   # Image
        "B": 30.25,    # SKU
        "C": 11.5,     # TT1-Orders
        "D": 11.875,   # TT2-Orders
        "E": 11.5,     # TT3-Orders
        "F": 11.5,     # TT4-Orders
        "G": 11.5,     # Total Orders
        "H": 13.0,     # SKU Quota Rate
        "I": 10.0,     # Now Stock
        "J": 19.5,     # Expected Demand
    }
    # Month cols and tail cols
    from openpyxl.utils import get_column_letter
    for i in range(month_count):
        col_letter = get_column_letter(11 + i)
        COL_WIDTHS[col_letter] = 10.0
    # Tail cols: Selling price, Profit margin, R&R rate
    tail_start = 11 + month_count
    COL_WIDTHS[get_column_letter(tail_start)]     = 16.25
    COL_WIDTHS[get_column_letter(tail_start + 1)] = 11.75
    COL_WIDTHS[get_column_letter(tail_start + 2)] = 18.625

    for col_letter, width in COL_WIDTHS.items():
        ws.column_dimensions[col_letter].width = width

    # ── Row 1: instruction text ────────────────────────────────────────────────
    total_cols = 10 + month_count + 3
    ws.row_dimensions[1].height = 41.25
    ws.cell(row=1, column=1).value = (
        f"Restock Demand Prediction — Product {product_no}\n"
        f"Daily Prediction: {daily_prediction} orders/day  ×  {prediction_days} days  =  "
        f"{int(daily_prediction * prediction_days)} total expected orders\n"
        f"Grand total orders (all products): {grand_total}"
    )
    ws.cell(row=1, column=1).font = Font(bold=True, size=10)
    ws.cell(row=1, column=1).alignment = Alignment(wrap_text=True, vertical="center")
    if total_cols > 1:
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=total_cols)

    # ── Row 2: headers ─────────────────────────────────────────────────────────
    ws.row_dimensions[2].height = 18.0
    month_header_labels = [m["label"] for m in months]
    header_values = (
        ["Image", "SKU", "TT1-Orders", "TT2-Orders", "TT3-Orders", "TT4-Orders",
         "Total Orders", "SKU Quota Rate", "Now Stock", "Expected Demand"]
        + month_header_labels
        + ["Selling price", "Profit margin", "Return and refund rate"]
    )
    for col_idx, val in enumerate(header_values, 1):
        cell = ws.cell(row=2, column=col_idx)
        cell.value = val
        cell.font = header_font
        cell.fill = YELLOW_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin

    # ── Rows 3+: data ──────────────────────────────────────────────────────────
    for s in skus:
        quota = s["total_orders"] / grand_total if grand_total > 0 else 0
        expected = daily_prediction * prediction_days * quota

        row_data = [
            "",                                    # A: Image (empty)
            s["sku"],                              # B: SKU
            s.get("tt1_orders", 0),               # C
            s.get("tt2_orders", 0),               # D
            s.get("tt3_orders", 0),               # E
            s.get("tt4_orders", 0),               # F
            s["total_orders"],                    # G
            round(quota, 8),                      # H: SKU Quota Rate (as decimal)
            s.get("current_stock", 0),            # I
            round(expected, 1),                   # J
        ]
        for m in months:
            row_data.append(round(expected * m["pct"] / 100, 1))

        sp = s.get("selling_price")
        pm = s.get("profit_margin")
        rr = s.get("rr_rate")
        row_data += [
            round(sp, 2) if sp else "",
            round(pm * 100, 2) if pm else "",
            round(rr * 100, 2) if rr else "",
        ]

        row_num = ws.max_row + 1
        ws.row_dimensions[row_num].height = 16.5
        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=row_num, column=col_idx)
            cell.value = val
            cell.font = body_font
            cell.border = thin
            cell.alignment = Alignment(horizontal="center", vertical="center")
        # SKU left-aligned
        ws.cell(row=row_num, column=2).alignment = Alignment(horizontal="left", vertical="center")

    # ── Freeze below header row ────────────────────────────────────────────────
    ws.freeze_panes = "A3"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
