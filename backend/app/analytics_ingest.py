"""Parse the Work Flow Excel (TT1/TT2/TT3/TT4 sheets) into structured data.

The Excel layout:
  Row 1-2  : Group headers (skip)
  Row 3    : Column headers ("Product Number", "Main Image", …)
  Row 4+   : Alternating period-marker rows ("01/12/2026 - 01/18/2026")
             and product data rows (numeric product_no)
"""
from __future__ import annotations
import re
from datetime import date
from typing import Any

import openpyxl

from . import config

# Excel sheet names per store (matches Work Flow EC BU 1.xlsx)
STORE_TO_SHEET: dict[str, list[str]] = {
    "TK1": ["TT1 Analyze and Optimization", "TT1", "Sheet1"],
    "TK2": ["TT2 Analyze and Optimization", "TT2"],
    "TK3": ["TT3 Analyze and Optimization", "TT3"],
    "TK4": ["TT4 Analyze and Optimization", "TT4"],
}

ANALYTICS_COL_MAP: dict[str, str] = {
    "Product impressions": "impressions",
    "Page views":          "page_views",
    "Click-through rate":  "ctr",
    "Avg. visitors":       "avg_visitors",
    "Avg. customers":      "avg_customers",
    "Conversion rate":     "cvr",
    "Items sold":          "items_sold",
    "CTOR":                "ctor",
    "New affiliate creators": "new_creators",
    "New affiliate videos":   "new_videos",
    "New affiliate LIVE":     "new_live",
    "Free sample cost":    "free_sample_cost",
    "Content GMV":         "content_gmv",
    "Ads":                 "ads_spend",
    "ROI":                 "roi",
    "GMV":                 "gmv",
    "Selling Price":       "selling_price",
    "cost (rmb)":          "cost_rmb",
    "Profit Margin":       "profit_margin",
}

NOTES_COL_MAP: dict[str, str] = {
    "Intelligent analysis": "analysis",
    "Action ":              "action",
    "Action":               "action",
    "Results":              "results",
    "Results ":             "results",
}


def _parse_date(val: Any) -> date | None:
    if not val:
        return None
    s = str(val).strip()
    patterns = [
        r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})",
        r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})",
        r"(\w{3})\s+(\d{1,2})\s*[,\-–]\s*(\w{3})\s+(\d{1,2})",
    ]
    for p in patterns:
        m = re.search(p, s)
        if m:
            groups = m.groups()
            try:
                if len(groups) == 3:
                    if len(groups[2]) == 4:
                        return date(int(groups[2]), int(groups[1]), int(groups[0]))
                    else:
                        return date(int(groups[0]), int(groups[1]), int(groups[2]))
            except (ValueError, TypeError):
                pass
    return None


def _parse_period_from_cell(val: Any) -> tuple[date, date] | None:
    """Parse "01/12/2026 - 01/18/2026" or "Jan 12 - Jan 18" style."""
    if not val:
        return None
    s = str(val).strip()

    # "MM/DD/YYYY - MM/DD/YYYY"
    m = re.search(
        r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\s*[\-–]\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", s
    )
    if m:
        try:
            start = date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
            end   = date(int(m.group(6)), int(m.group(4)), int(m.group(5)))
            return start, end
        except ValueError:
            pass

    # "DD/MM/YY - DD/MM/YY" (e.g., "12/04/26 -19/04/26")
    m = re.search(
        r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})\s*[\-–]\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})", s
    )
    if m:
        try:
            y1 = 2000 + int(m.group(3))
            y2 = 2000 + int(m.group(6))
            start = date(y1, int(m.group(2)), int(m.group(1)))
            end   = date(y2, int(m.group(5)), int(m.group(4)))
            return start, end
        except ValueError:
            pass

    # "Jan 12 - Jan 18" (no year — assume current or given context)
    m = re.search(
        r"([A-Za-z]{3})\s+(\d{1,2})\s*[\-–]\s*([A-Za-z]{3})\s+(\d{1,2})", s
    )
    if m:
        MONTHS = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        }
        sm = MONTHS.get(m.group(1).lower())
        em = MONTHS.get(m.group(3).lower())
        if sm and em:
            try:
                year = date.today().year
                start = date(year, sm, int(m.group(2)))
                end   = date(year, em, int(m.group(4)))
                return start, end
            except ValueError:
                pass

    return None


def _parse_number(val: Any) -> float | None:
    if val is None or val == "" or val == "-":
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace(",", "").replace("$", "").replace("%", "").strip()
    if s.lower() == "on":
        return -1.0
    try:
        return float(s)
    except ValueError:
        return None


def _parse_task_status(val: Any) -> str:
    if val is None or val == "":
        return "todo"
    s = str(val).strip().lower()
    if s == "-":
        return "na"
    if "done" in s or "complete" in s:
        return "done"
    if "progress" in s or "working" in s or "in " in s:
        return "in_progress"
    if s:
        return "in_progress"
    return "todo"


def _find_header_row(rows: list[tuple], max_scan: int = 10) -> int | None:
    for i, row in enumerate(rows[:max_scan]):
        if row and row[0] is not None and str(row[0]).strip() == "Product Number":
            return i
    return None


def _build_col_index(header: tuple) -> dict[str, int]:
    """Map column name → column index. Handle duplicate names with _2, _3 suffix."""
    col_index: dict[str, int] = {}
    seen: dict[str, int] = {}
    for i, h in enumerate(header):
        if h is None:
            continue
        name = str(h).strip()
        if not name:
            continue
        if name in seen:
            seen[name] += 1
            col_index[f"{name}_{seen[name]}"] = i
        else:
            seen[name] = 1
            col_index[name] = i
    return col_index


def parse_workflow_excel(file_path: str, store_code: str) -> dict:
    """Return list of product entries grouped by period."""
    wb = openpyxl.load_workbook(file_path, data_only=True)

    # Pick the right sheet
    candidates = STORE_TO_SHEET.get(store_code, [])
    ws = None
    for name in candidates:
        if name in wb.sheetnames:
            ws = wb[name]
            break
    if ws is None and wb.sheetnames:
        ws = wb[wb.sheetnames[0]]
    if ws is None:
        return {"error": "No usable sheet found", "entries": []}

    rows = list(ws.iter_rows(values_only=True))
    header_idx = _find_header_row(rows)
    if header_idx is None:
        return {"error": "Header row (Product Number) not found", "entries": []}

    col_index = _build_col_index(rows[header_idx])

    entries: list[dict] = []
    current_period: tuple[date, date] | None = None

    for row in rows[header_idx + 1:]:
        if not any(c is not None for c in row):
            continue

        first = row[0]

        # Period marker row (date range in first cell)
        period = _parse_period_from_cell(first)
        if period:
            current_period = period
            continue

        if current_period is None:
            continue

        # Must have a product number in col 0
        if first is None:
            continue
        product_no = str(first).strip().lstrip("'")
        if not product_no:
            continue
        # Strip leading zeros for purely numeric product numbers (e.g. "021" → "21")
        if re.match(r"^\d+$", product_no):
            product_no = str(int(product_no))
        elif not re.match(r"^\d", product_no):
            continue

        # Task statuses
        tasks: dict[str, str] = {}
        for excel_col, task_key in config.EXCEL_TASK_COLS.items():
            idx = col_index.get(excel_col)
            if idx is not None and idx < len(row):
                tasks[task_key] = _parse_task_status(row[idx])

        # Analytics metrics
        analytics: dict[str, Any] = {}

        # Find "Product impressions" anchor for performance columns
        perf_anchor = col_index.get("Product impressions")
        if perf_anchor is not None:
            perf_cols = [
                (0,  "impressions"),
                (1,  "page_views"),
                (2,  "ctr"),
                (3,  "avg_visitors"),
                (4,  "avg_customers"),
                (5,  "cvr"),
                # Video / Product card / LIVE impressions follow
                (6,  "video_impressions"),
                (7,  "product_card_impressions"),
                (8,  "live_impressions"),
                (9,  "items_sold"),
                (10, "ctor"),
            ]
            for offset, key in perf_cols:
                idx = perf_anchor + offset
                if idx < len(row):
                    analytics[key] = _parse_number(row[idx])

        # Affiliate content columns
        for col_name, key in [
            ("New affiliate creators", "new_creators"),
            ("New affiliate videos",   "new_videos"),
            ("New affiliate LIVE",     "new_live"),
            ("Free sample cost",       "free_sample_cost"),
            ("Content GMV",            "content_gmv"),
            ("Ads",                    "ads_spend"),
            ("ROI",                    "roi"),
            ("GMV",                    "gmv"),
            ("Selling Price",          "selling_price"),
            ("cost (rmb)",             "cost_rmb"),
            ("Profit Margin",          "profit_margin"),
        ]:
            idx = col_index.get(col_name)
            if idx is not None and idx < len(row):
                val = row[idx]
                if key == "selling_price":
                    analytics[key] = str(val).strip() if val else None
                else:
                    analytics[key] = _parse_number(val)

        # Notes columns
        notes: dict[str, str | None] = {}
        for col_name, note_key in NOTES_COL_MAP.items():
            idx = col_index.get(col_name)
            if idx is not None and idx < len(row):
                val = row[idx]
                notes[note_key] = str(val).strip() if val else None

        entries.append({
            "product_no":   product_no,
            "period_start": current_period[0].isoformat(),
            "period_end":   current_period[1].isoformat(),
            "tasks":        tasks,
            "analytics":    analytics,
            "notes":        notes,
        })

    return {"entries": entries, "sheet_used": ws.title}
