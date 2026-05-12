import pandas as pd
import os
import sys
import re
import zipfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


# ─── Direct XLSX (zip+xml) reader/writer that bypasses openpyxl ───────────────
# TikTok-exported templates often have malformed sharedStrings.xml, styles.xml,
# data validations, drawings, etc. that crash openpyxl on load. We sidestep
# all of that by parsing the cell XML ourselves and editing it in place.


def _parse_shared_strings(xml_bytes):
    """Parse xl/sharedStrings.xml → list of plain strings. Tolerates malformed XML."""
    if not xml_bytes:
        return []
    try:
        text = xml_bytes.decode('utf-8', errors='replace')
    except Exception:
        return []
    si_re = re.compile(r'<si\b[^>]*>(.*?)</si>', re.DOTALL)
    t_re = re.compile(r'<t\b[^>]*>(.*?)</t>', re.DOTALL)
    out = []
    for si in si_re.finditer(text):
        parts = t_re.findall(si.group(1))
        combined = "".join(parts)
        combined = (combined.replace("&lt;", "<")
                            .replace("&gt;", ">")
                            .replace("&quot;", '"')
                            .replace("&apos;", "'")
                            .replace("&amp;", "&"))
        out.append(combined)
    return out


def _xml_escape(s):
    return (str(s).replace("&", "&amp;")
                  .replace("<", "&lt;")
                  .replace(">", "&gt;")
                  .replace('"', "&quot;"))


def _col_letters_to_num(letters):
    """A→1, Z→26, AA→27, AB→28, …"""
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - ord('A') + 1)
    return n


def _col_num_to_letters(n):
    """1→A, 26→Z, 27→AA, …"""
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(ord('A') + r) + s
    return s


# Match a single cell element. Captures: col letters, row num, attrs, inner content.
# Handles both `<c .../>` self-closing and `<c ...>...</c>` forms.
_CELL_RE = re.compile(
    r'<c\s+r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)',
    re.DOTALL,
)
_T_ATTR_RE = re.compile(r'\bt="([^"]+)"')
_V_RE = re.compile(r'<v\b[^>]*>(.*?)</v>', re.DOTALL)
_T_RE = re.compile(r'<t\b[^>]*>(.*?)</t>', re.DOTALL)


def _parse_sheet_cells(sheet_xml, shared):
    """Parse all cells in a sheet XML → (cells dict {(row,col): value}, max_row, max_col)."""
    cells = {}
    max_row = 0
    max_col = 0
    for m in _CELL_RE.finditer(sheet_xml):
        col_letters, row_str, attrs, inner = m.group(1), m.group(2), m.group(3) or "", m.group(4) or ""
        try:
            row = int(row_str)
        except ValueError:
            continue
        col = _col_letters_to_num(col_letters)

        t_match = _T_ATTR_RE.search(attrs)
        ctype = t_match.group(1) if t_match else "n"

        value = None
        if ctype == "s":
            vm = _V_RE.search(inner)
            if vm:
                try:
                    idx = int(vm.group(1).strip())
                    if 0 <= idx < len(shared):
                        value = shared[idx]
                except ValueError:
                    pass
        elif ctype == "inlineStr":
            tm = _T_RE.search(inner)
            if tm:
                value = (tm.group(1)
                         .replace("&lt;", "<")
                         .replace("&gt;", ">")
                         .replace("&quot;", '"')
                         .replace("&apos;", "'")
                         .replace("&amp;", "&"))
        elif ctype in ("str", "b", "e"):
            vm = _V_RE.search(inner)
            if vm:
                value = vm.group(1)
        else:  # numeric ("n" or unspecified)
            vm = _V_RE.search(inner)
            if vm:
                raw = vm.group(1).strip()
                try:
                    f = float(raw)
                    value = int(f) if f == int(f) else f
                except ValueError:
                    value = raw

        if value is not None and value != "":
            cells[(row, col)] = value
        max_row = max(max_row, row)
        max_col = max(max_col, col)
    return cells, max_row, max_col


_MERGE_RE = re.compile(
    r'<mergeCell\s+ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"',
)


def _parse_merges(sheet_xml):
    """Return list of (min_row, min_col, max_row, max_col) for merged cells."""
    merges = []
    for m in _MERGE_RE.finditer(sheet_xml):
        c1, r1, c2, r2 = m.group(1), int(m.group(2)), m.group(3), int(m.group(4))
        merges.append((r1, _col_letters_to_num(c1), r2, _col_letters_to_num(c2)))
    return merges


class _SheetProxy:
    """Mimics enough of openpyxl's worksheet interface for our pipeline."""
    def __init__(self, cells, max_row, max_col, merges, title="Sheet1"):
        self._cells = cells
        self.max_row = max_row
        self.max_column = max_col
        self.title = title
        self.updates = {}  # (row, col) -> new value to write back
        self.merged_cells = _MergedCellsProxy(merges)
        self.protection = _DummyProtection()

    class _Cell:
        __slots__ = ("_ws", "_row", "_col")
        def __init__(self, ws, row, col):
            self._ws = ws
            self._row = row
            self._col = col

        @property
        def value(self):
            return self._ws._cells.get((self._row, self._col))

        @value.setter
        def value(self, v):
            self._ws._cells[(self._row, self._col)] = v
            self._ws.updates[(self._row, self._col)] = v
            if self._row > self._ws.max_row:
                self._ws.max_row = self._row
            if self._col > self._ws.max_column:
                self._ws.max_column = self._col

    def cell(self, row, column):
        return self._Cell(self, row, column)


class _DummyProtection:
    enabled = False
    sheet = False


class _MergeRange:
    __slots__ = ("min_row", "min_col", "max_row", "max_col")
    def __init__(self, r1, c1, r2, c2):
        self.min_row, self.min_col, self.max_row, self.max_col = r1, c1, r2, c2


class _MergedCellsProxy:
    def __init__(self, merges):
        self.ranges = [_MergeRange(*m) for m in merges]


def _read_xlsx_direct(path):
    """Read xlsx by direct XML parsing → _SheetProxy and remembers source path."""
    with zipfile.ZipFile(path, 'r') as z:
        names = z.namelist()
        shared = []
        if 'xl/sharedStrings.xml' in names:
            try:
                shared = _parse_shared_strings(z.read('xl/sharedStrings.xml'))
            except Exception:
                shared = []
        sheet_paths = sorted([n for n in names
                              if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')])
        if not sheet_paths:
            raise Exception("No worksheet found in template")
        sheet_path = sheet_paths[0]
        sheet_xml = z.read(sheet_path).decode('utf-8', errors='replace')

    cells, max_row, max_col = _parse_sheet_cells(sheet_xml, shared)
    merges = _parse_merges(sheet_xml)
    proxy = _SheetProxy(cells, max_row, max_col, merges, title=os.path.basename(sheet_path))
    proxy._source_path = path
    proxy._sheet_path = sheet_path
    return proxy


_ROW_RE = re.compile(r'(<row\b[^>]*>)(.*?)</row>', re.DOTALL)
_CELL_TAG_RE = re.compile(r'<c\b[^>]*?(?:/>|>.*?</c>)', re.DOTALL)


def _update_sheet_xml(sheet_xml, updates):
    """Apply numeric-value updates {(row, col): value} to sheet XML and
    return modified XML. Replaces existing cells in-place; inserts new
    cells before </row> if the cell didn't previously exist. Rows that
    don't exist yet are appended just before </sheetData>."""
    by_row = {}
    for (r, c), v in updates.items():
        by_row.setdefault(r, {})[c] = v

    def render_cell(r, c, v):
        ref = _col_num_to_letters(c) + str(r)
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"><v>{v}</v></c>'
        # Fallback: inline string
        return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{_xml_escape(v)}</t></is></c>'

    handled_rows = set()

    def modify_row(m):
        row_open = m.group(1)
        row_inner = m.group(2)
        nm = re.search(r'\br="(\d+)"', row_open)
        if not nm:
            return m.group(0)
        row_num = int(nm.group(1))
        if row_num not in by_row:
            return m.group(0)
        handled_rows.add(row_num)
        targets = dict(by_row[row_num])

        def replace_cell(cm):
            tag = cm.group(0)
            rm = re.search(r'\br="([A-Z]+)(\d+)"', tag)
            if not rm:
                return tag
            col_num = _col_letters_to_num(rm.group(1))
            if col_num in targets:
                v = targets.pop(col_num)
                return render_cell(row_num, col_num, v)
            return tag

        new_inner = _CELL_TAG_RE.sub(replace_cell, row_inner)

        # Append any cells that didn't already exist for this row
        if targets:
            extra = "".join(render_cell(row_num, c, v) for c, v in sorted(targets.items()))
            new_inner = new_inner + extra
        return row_open + new_inner + '</row>'

    new_xml = _ROW_RE.sub(modify_row, sheet_xml)

    # Append rows that didn't exist in the original sheet (rare for TikTok templates)
    missing_rows = [r for r in by_row if r not in handled_rows]
    if missing_rows:
        extra_rows = ""
        for r in sorted(missing_rows):
            cells_xml = "".join(render_cell(r, c, v) for c, v in sorted(by_row[r].items()))
            extra_rows += f'<row r="{r}">{cells_xml}</row>'
        if "</sheetData>" in new_xml:
            new_xml = new_xml.replace("</sheetData>", extra_rows + "</sheetData>", 1)
    return new_xml


def _save_xlsx_with_updates(source_path, sheet_path, updates, output_path):
    """Copy source xlsx to output, applying updates to the given sheet XML."""
    with zipfile.ZipFile(source_path, 'r') as zin:
        files = [(item.filename, zin.read(item.filename)) for item in zin.infolist()]

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for fname, content in files:
            if fname == sheet_path:
                xml = content.decode('utf-8', errors='replace')
                new_xml = _update_sheet_xml(xml, updates)
                content = new_xml.encode('utf-8')
            zout.writestr(fname, content)


def _get_cell_value(ws, row, col):
    """Get cell value, resolving merged cells to top-left value."""
    val = ws.cell(row=row, column=col).value
    if val is None:
        for merge in ws.merged_cells.ranges:
            if (merge.min_row <= row <= merge.max_row
                    and merge.min_col <= col <= merge.max_col):
                val = ws.cell(row=merge.min_row, column=merge.min_col).value
                break
    return val


# ─── MSKU mapping helpers ─────────────────────────────────────────────────────

def normalize_sku(sku):
    if pd.isna(sku):
        return ""
    s = str(sku).strip().upper()
    if s.endswith('.0'):
        s = s[:-2]
    return s


def find_column(columns, hints):
    """Flexible column detection - prevents greedy matching"""
    columns_str = [str(c).strip() for c in columns]
    columns_lower = [c.lower() for c in columns_str]

    for hint in hints:
        hl = hint.lower()
        if hl in columns_lower:
            return columns_str[columns_lower.index(hl)]

    for hint in hints:
        hl = hint.lower()
        pattern = r'\b' + re.escape(hl) + r'\b'
        for i, cl in enumerate(columns_lower):
            if re.search(pattern, cl):
                return columns_str[i]

    for hint in hints:
        hl = hint.lower()
        for i, cl in enumerate(columns_lower):
            if hl == "sku" and "msku" in cl:
                continue
            if hl in cl or cl in hl:
                return columns_str[i]
    return None


# ─── Main entry point ─────────────────────────────────────────────────────────

def run_automation(msku_mapping_path, inventory_path, template_path, output_path,
                   shop_name="Default Shop", precomputed_stock=None):
    print(f"\n--- TIKTOK STOCK UPDATE FOR: {shop_name} ---")

    logs = []
    missing_mskus = set()
    missing_inventory_skus = set()

    # ── Step 1: Read MSKU Mapping ────────────────────────────────────────────
    logs.append(f"[Step 1] Reading MSKU Mapping: {os.path.basename(msku_mapping_path)}")
    msku_map = {}

    try:
        xls_msku = pd.ExcelFile(msku_mapping_path, engine="openpyxl")
        sheet_names = xls_msku.sheet_names
        logs.append(f"  Sheets found: {sheet_names}")

        for sheet in sheet_names:
            try:
                df_sheet = pd.read_excel(xls_msku, sheet_name=sheet, engine="openpyxl")
                cols = [str(c).strip() for c in df_sheet.columns]
                m_col = next((c for c in cols
                              if "MSKU" in c.upper() or (c.upper() == "SKU" and "SELLER" not in c.upper())),
                             None)
                w_col = next((c for c in cols
                              if ("WAREHOUSE" in c.upper() or "WHAREHOUSE" in c.upper()) and "SKU" in c.upper()),
                             None)
                if m_col and w_col:
                    count = 0
                    for _, row in df_sheet.iterrows():
                        m = normalize_sku(row[m_col])
                        w = normalize_sku(row[w_col])
                        if m and w and m != 'NAN' and w != 'NAN':
                            msku_map[m] = w
                            count += 1
                    logs.append(f"  Sheet '{sheet}': {count} mappings ({m_col} -> {w_col})")
            except Exception as e:
                logs.append(f"  Error sheet '{sheet}': {e}")

        if not msku_map:
            df_msku = pd.read_excel(msku_mapping_path, sheet_name=0, engine="openpyxl")
            cols = [str(c).strip() for c in df_msku.columns]
            if len(cols) > 4:
                m_col, w_col = cols[3], cols[4]
                for _, row in df_msku.iterrows():
                    m = normalize_sku(row[m_col])
                    w = normalize_sku(row[w_col])
                    if m and w:
                        msku_map[m] = w
                logs.append(f"  Fallback: {len(msku_map)} mappings from columns {m_col}, {w_col}")
    except Exception as e:
        logs.append(f"  ERROR reading mapping: {e}")
        raise Exception(f"Failed to read MSKU mapping: {e}")

    logs.append(f"  Total MSKU mappings: {len(msku_map)}")

    warehouse_groups = {
        "Warehouse 6":              ["YQN Los Angeles Warehouse #7", "Warehouse 6", "Warehouse6", "仓 6"],
        "MPR_NJ_US":                ["MPR_NJ_US", "MPR", "运去哪 MPR", "MPR US"],
        "美西谷仓":                 ["谷仓 美西仓库", "美西谷仓", "美西仓库", "芝加哥2仓", "易可美", "谷仓"],
        "昭临 US01 / 06 / 07":      ["US_JB001", "美西1号仓", "US_JB06", "US_JB07", "美西6号仓", "昭临", "JB01", "JB07"],
        "COPE":                     ["运去哪 COPE_CA_US", "COPE_CA_US", "COPE", "运去哪COPE"],
        "RDW":                      ["YQN Los Angeles Warehouse #1", "RDW", "运去哪RDW", "RDW LA"],
    }

    # ── Step 1.5: ERP Warehouse Assignment ───────────────────────────────────
    logs.append("[Step 1.5] Extracting ERP Warehouse Assignments")
    sku_warehouse_group = {}
    try:
        erp_sheet_names = ['MATCH TEMPLATE', 'TIKTOK ERP MATCH TEMPLATE',
                           'TIKTOK ERP MATCH  TEMPLATE', 'ERP MATCH TEMPLATE']
        actual_erp_sheet = next((s for s in sheet_names if s.upper().strip() in erp_sheet_names), None)
        if actual_erp_sheet:
            df_erp = pd.read_excel(xls_msku, sheet_name=actual_erp_sheet, engine="openpyxl")
            cols_erp = [str(c).strip() for c in df_erp.columns]
            sku_col_erp = next((c for c in cols_erp
                                if c.upper() == 'SKU'
                                or (c.upper() != 'SELLER SKU' and 'SKU' in c.upper())),
                               None)
            wh_col_erp = next((c for c in cols_erp
                               if 'WAREHOUSE' in c.upper() or 'STORAGE' in c.upper()),
                              None)
            if sku_col_erp and wh_col_erp:
                logs.append(f"  Found ERP columns: {sku_col_erp} -> {wh_col_erp}")
                for _, row in df_erp.iterrows():
                    sku = normalize_sku(row[sku_col_erp])
                    wh = str(row[wh_col_erp]).strip()
                    if sku and wh and sku != 'NAN' and wh != 'NAN':
                        assigned = None
                        for group_name, keywords in warehouse_groups.items():
                            if any(k.lower() in wh.lower() for k in keywords):
                                assigned = group_name
                                break
                        if assigned:
                            sku_warehouse_group[sku] = assigned
                logs.append(f"  Loaded ERP assignments for {len(sku_warehouse_group)} SKUs")
    except Exception as e:
        logs.append(f"  ERP template extraction skipped/failed: {e}")

    # ── Step 2: Read Inventory ───────────────────────────────────────────────
    logs.append("[Step 2] Reading Inventory Data")
    aggregated_stock = {}

    if precomputed_stock:
        logs.append("  Using precomputed stock from Feishu")
        aggregated_stock = precomputed_stock
    elif not inventory_path:
        logs.append("  No inventory file provided. Fetching from Feishu/DB...")
        from .feishu import fetch_warehouse_inventory
        aggregated_stock = fetch_warehouse_inventory(sku_warehouse_group=sku_warehouse_group)
    else:
        try:
            xls_inv = pd.ExcelFile(inventory_path, engine="openpyxl")
            sheet_names_inv = xls_inv.sheet_names
            relevant_sheets = [s for s in sheet_names_inv
                               if any(ch.isdigit() for ch in s)
                               or "all" in s.lower() or "inventory" in s.lower()]
            for sheet_name in relevant_sheets:
                try:
                    df_inv = pd.read_excel(xls_inv, sheet_name=sheet_name, engine="openpyxl")
                    cols = [str(c).strip() for c in df_inv.columns]
                    sku_c = find_column(cols, ["warehouse sku", "wharehouse sku", "sku"])
                    qty_c = find_column(cols, ["available products volume", "volume", "available", "stock"])
                    wh_c = find_column(cols, ["warehouse"])
                    if not qty_c and len(df_inv.columns) > 3:
                        qty_c = df_inv.columns[3]
                    if sku_c and qty_c:
                        for _, row in df_inv.iterrows():
                            sku = normalize_sku(row[sku_c])
                            if not sku or sku == 'NAN':
                                continue
                            qty = pd.to_numeric(row[qty_c], errors='coerce')
                            if pd.isna(qty) or qty < 0:
                                continue
                            qty = int(qty)
                            wh_name = str(row.get(wh_c, "")).strip().lower() if wh_c else ""
                            assigned_group = None
                            if sku in sku_warehouse_group:
                                assigned_group = sku_warehouse_group[sku]
                            if not assigned_group and wh_name:
                                for group_name, keywords in warehouse_groups.items():
                                    if any(k.lower() in wh_name.lower() for k in keywords):
                                        assigned_group = group_name
                                        break
                            if not assigned_group:
                                assigned_group = "COPE"
                            if sku not in aggregated_stock:
                                aggregated_stock[sku] = {g: 0 for g in warehouse_groups}
                            aggregated_stock[sku][assigned_group] += qty
                except Exception as e:
                    logs.append(f"    Sheet {sheet_name} error: {e}")
        except Exception as e:
            logs.append(f"  ERROR reading inventory: {e}")
            raise Exception(f"Failed to read inventory: {e}")

    logs.append(f"  Total warehouse SKUs: {len(aggregated_stock)}")

    # ── Step 3: Update TikTok Template via direct XML manipulation ───────────
    logs.append("[Step 3] Updating TikTok Template (direct XML, no openpyxl load)")

    current_step = "reading template xlsx"
    try:
        ws = _read_xlsx_direct(template_path)
        logs.append(f"  Loaded sheet '{ws.title}' (max_row={ws.max_row}, max_col={ws.max_column})")

        col_map = {}
        excluded_cols = []
        header_row = 3

        current_step = "scanning for Seller SKU header"
        scan_max_col = min(100, max(ws.max_column, 30))
        for r in range(2, 11):
            found = False
            for c in range(1, scan_max_col + 1):
                v = str(_get_cell_value(ws, r, c) or "").strip().lower()
                if "seller sku" in v or "seller_sku" in v or "商家sku" in v:
                    found = True
                    col_map["Seller SKU"] = c
            if found:
                header_row = r
                logs.append(f"  Detected header row: {header_row}")
                break

        if "Seller SKU" not in col_map:
            logs.append("  WARNING: 'Seller SKU' not found by label. Falling back to Column 15.")
            col_map["Seller SKU"] = 15

        current_step = "scanning warehouse columns"
        for r in range(max(1, header_row - 2), min(11, header_row + 3)):
            for c in range(1, scan_max_col + 1):
                lbl = str(_get_cell_value(ws, r, c) or "").strip()
                if not lbl:
                    continue
                lbl_upper = lbl.upper()
                if "JIAZHOU" in lbl_upper or "1HAOCANG" in lbl_upper:
                    if c not in excluded_cols:
                        excluded_cols.append(c)
                    continue
                matched_group = None
                if "运去哪COPE" in lbl or "COPE" in lbl_upper:
                    matched_group = "COPE"
                elif "运去哪RDW" in lbl or "RDW" in lbl_upper:
                    matched_group = "RDW"
                elif "昭临" in lbl or "US01" in lbl_upper or "美西1号仓" in lbl:
                    matched_group = "昭临 US01 / 06 / 07"
                elif "美西谷仓" in lbl or "美西仓库" in lbl or "谷仓" in lbl:
                    matched_group = "美西谷仓"
                elif "MPR_NJ_US" in lbl_upper or "MPR" in lbl_upper:
                    matched_group = "MPR_NJ_US"
                elif "Warehouse 6" in lbl or "仓 6" in lbl:
                    matched_group = "Warehouse 6"
                if matched_group and matched_group not in col_map:
                    col_map[matched_group] = c
                    logs.append(f"    - Mapped {matched_group} to Col {c} (Label: '{lbl}')")

        logs.append(f"  Columns found: {list(col_map.keys())}")
        if "Seller SKU" not in col_map:
            raise Exception("Template missing 'Seller SKU' column.")

        current_step = "computing data start row"
        max_row = ws.max_row or 0
        sku_col_idx = col_map["Seller SKU"]
        data_start_row = header_row + 1
        for r in range(header_row + 1, min(header_row + 15, max_row + 1)):
            cv = str(_get_cell_value(ws, r, sku_col_idx) or "").strip().lower()
            if cv in ("mandatory", "optional", "uneditable", "必填", "选填") or not cv:
                data_start_row = r + 1
                continue
            else:
                data_start_row = r
                break

        logs.append(f"  Data starts at row: {data_start_row}, total rows: {max_row}")

        current_step = "reading MSKU list from template"
        msku_list = []
        if max_row >= data_start_row:
            for r in range(data_start_row, max_row + 1):
                v = str(_get_cell_value(ws, r, sku_col_idx) or "").strip().upper()
                msku_list.append(v)
        logs.append(f"  Fetched {len(msku_list)} MSKUs from template")

        target_groups = [g for g in col_map.keys() if g != "Seller SKU"]
        target_debug_ids = ["441", "446", "463", "445", "302"]

        current_step = "writing stock values"
        updated_count = 0
        if msku_list:
            for group in target_groups:
                col_idx = col_map[group]
                for i, msku in enumerate(msku_list):
                    r = data_start_row + i
                    if not msku or msku in ("NONE", "NAN", "", "0") or len(msku) < 2:
                        ws.cell(row=r, column=col_idx).value = 0
                        continue
                    wh_sku = msku_map.get(msku)
                    stock_data = None
                    if wh_sku:
                        stock_data = aggregated_stock.get(wh_sku)
                    if not stock_data:
                        stock_data = aggregated_stock.get(msku)
                    if any(tid in msku for tid in target_debug_ids):
                        status = "FOUND" if stock_data else "MISSING"
                        qty_dbg = stock_data.get(group, 0) if (stock_data and isinstance(stock_data, dict)) else 0
                        logs.append(f"  DEBUG: SKU '{msku}' ({group}) -> {status}, Qty: {qty_dbg}")
                    if not stock_data:
                        if not wh_sku:
                            missing_mskus.add(msku)
                        else:
                            missing_inventory_skus.add(wh_sku)
                    qty = 0
                    if stock_data:
                        if isinstance(stock_data, dict):
                            qty = int(stock_data.get(group, 0))
                        else:
                            qty = int(stock_data)
                    ws.cell(row=r, column=col_idx).value = qty

            # Reset excluded columns (JIAZHOU / 1HAOCANG) to 0
            for col_idx in excluded_cols:
                for i in range(len(msku_list)):
                    ws.cell(row=data_start_row + i, column=col_idx).value = 0

            updated_count = len([m for m in msku_list if m and m not in ("NONE", "NAN", "", "0")])

        current_step = "saving output xlsx"
        _save_xlsx_with_updates(template_path, ws._sheet_path, ws.updates, output_path)

        logs.append(f"SUCCESS: Updated {updated_count} rows")
        logs.append(f"  MSKUs not in mapping: {len(missing_mskus)}")
        logs.append(f"  SKUs not in inventory: {len(missing_inventory_skus)}")

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logs.append(f"ERROR during '{current_step}': {type(e).__name__}: {e}")
        logs.append(f"Traceback:\n{tb}")
        for log in logs:
            print(log)
        raise Exception(f"[Step 3 / {current_step}] {type(e).__name__}: {e}") from e

    for log in logs:
        print(log)

    try:
        with open("tiktok_processing.log", "w", encoding="utf-8") as f:
            for log in logs:
                f.write(log + "\n")
    except Exception:
        pass

    return aggregated_stock
