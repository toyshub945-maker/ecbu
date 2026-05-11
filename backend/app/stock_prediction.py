"""Stock Prediction — parse restock demand Excel and compute per-SKU demand."""
from __future__ import annotations

import io
from typing import Optional

import openpyxl


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

    return {
        "grand_total": grand_total,
        "sku_count": len(all_skus),
        "product_count": len({s["product_no"] for s in all_skus}),
        "skus": all_skus,
    }


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
