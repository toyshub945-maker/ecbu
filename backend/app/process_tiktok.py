import pandas as pd
import openpyxl
from openpyxl import load_workbook
import os
import sys
import re
import win32com.client
import pythoncom

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def normalize_sku(sku):
    if pd.isna(sku):
        return ""
    s = str(sku).strip().upper()
    if s.endswith('.0'):
        s = s[:-2]
    return s

def find_column(columns, hints):
    """Flexible column detection - fixed to prevent greedy matching"""
    columns_str = [str(c).strip() for c in columns]
    columns_lower = [c.lower() for c in columns_str]
    
    # Phase 1: Exact matches (Highest priority)
    for hint in hints:
        hint_lower = hint.lower()
        if hint_lower in columns_lower:
            return columns_str[columns_lower.index(hint_lower)]
            
    # Phase 2: Word boundary matches (Matches "shein sku" but not "msku")
    for hint in hints:
        hint_lower = hint.lower()
        pattern = r'\b' + re.escape(hint_lower) + r'\b'
        for i, col_lower in enumerate(columns_lower):
            if re.search(pattern, col_lower):
                return columns_str[i]
                
    # Phase 3: Fallback substring matches (Protects against "sku" matching "msku")
    for hint in hints:
        hint_lower = hint.lower()
        for i, col_lower in enumerate(columns_lower):
            if hint_lower == "sku" and "msku" in col_lower:
                continue
            if hint_lower in col_lower or col_lower in hint_lower:
                return columns_str[i]
                
    return None

def run_automation(msku_mapping_path, inventory_path, template_path, output_path, shop_name="Default Shop", precomputed_stock=None):
    print(f"\n--- TIKTOK STOCK UPDATE FOR: {shop_name} ---")
    
    logs = []
    missing_mskus = set()
    missing_inventory_skus = set()
    
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
                
                # Use the robust logic from your original production script
                m_col = next((c for c in cols if "MSKU" in c.upper() or (c.upper() == "SKU" and "SELLER" not in c.upper())), None)
                w_col = next((c for c in cols if ("WAREHOUSE" in c.upper() or "WHAREHOUSE" in c.upper()) and "SKU" in c.upper()), None)
                
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
            if len(cols) > 3:
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
    if msku_map:
        sample_keys = list(msku_map.keys())[:5]
        logs.append(f"  Sample mappings: { {k: msku_map[k] for k in sample_keys} }")
    
    # Warehouse group names that match template column labels — must be defined before ERP step
    warehouse_groups = {
        "Warehouse 6":              ["YQN Los Angeles Warehouse #7", "Warehouse 6", "Warehouse6", "仓 6"],
        "MPR_NJ_US":                ["MPR_NJ_US", "MPR", "运去哪 MPR", "MPR US"],
        "美西谷仓":                 ["谷仓 美西仓库", "美西谷仓", "美西仓库", "芝加哥2仓", "易可美", "谷仓"],
        "昭临 US01 / 06 / 07":      ["US_JB001", "美西1号仓", "US_JB06", "US_JB07", "美西6号仓", "昭临", "JB01", "JB07"],
        "COPE":                     ["运去哪 COPE_CA_US", "COPE_CA_US", "COPE", "运去哪COPE"],
        "RDW":                      ["YQN Los Angeles Warehouse #1", "RDW", "运去哪RDW", "RDW LA"],
    }

    # [Step 1.5] Extraction ERP Warehouse Assignment mapping (Warehouse SKU -> Group)
    logs.append("[Step 1.5] Extracting ERP Warehouse Assignments")
    sku_warehouse_group = {}
    try:
        erp_sheet_names = ['MATCH TEMPLATE', 'TIKTOK ERP MATCH TEMPLATE', 'TIKTOK ERP MATCH  TEMPLATE', 'ERP MATCH TEMPLATE']
        actual_erp_sheet = next((s for s in sheet_names if s.upper().strip() in erp_sheet_names), None)

        if actual_erp_sheet:
            df_erp = pd.read_excel(xls_msku, sheet_name=actual_erp_sheet, engine="openpyxl")
            cols_erp = [str(c).strip() for c in df_erp.columns]

            # Use more specific logic for ERP mapping columns
            sku_col_erp = next((c for c in cols_erp if c.upper() == 'SKU' or (c.upper() != 'SELLER SKU' and 'SKU' in c.upper())), None)
            wh_col_erp = next((c for c in cols_erp if 'WAREHOUSE' in c.upper() or 'STORAGE' in c.upper()), None)

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
            else:
                logs.append(f"  ERP columns NOT found. Tried hints, but cols were: {cols_erp[:5]}")
    except Exception as e:
        logs.append(f"  ERP template extraction skipped/failed: {e}")
    
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
            
            relevant_sheets = [s for s in sheet_names_inv if any(ch.isdigit() for ch in s) or "all" in s.lower() or "inventory" in s.lower()]
            logs.append(f"  Processing {len(relevant_sheets)} sheets")
            
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
                            
                            # 1. Use ERP mapping first
                            if sku in sku_warehouse_group:
                                assigned_group = sku_warehouse_group[sku]
                            
                            # 2. Fallback to keyword matching
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
    
    logs.append("[Step 3] Updating TikTok Template")
    
    pythoncom.CoInitialize()
    try:
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        try:
            wb = excel.Workbooks.Open(os.path.abspath(template_path), UpdateLinks=0, ReadOnly=False)
            ws = wb.Sheets(1)
            
            try:
                excel.ScreenUpdating = False
                excel.EnableEvents = False
                excel.Interactive = False 
                excel.Calculation = -4135
            except:
                pass
                
            try:
                ws.Unprotect()
            except:
                pass
            
            header_row = 3  # default based on observation
            col_map = {}
            excluded_cols = []
            
            # Find the row containing "Seller SKU" - wide scan like original
            for r in range(2, 11):
                found_sku = False
                for c in range(1, 100):
                    val = str(ws.Cells(r, c).Value or "").strip().lower()
                    if "seller sku" in val or "seller_sku" in val or "商家sku" in val:
                        found_sku = True
                        col_map["Seller SKU"] = c
                if found_sku:
                    header_row = r
                    logs.append(f"  Detected header row: {header_row}")
                    break
            
            # Fallback: if not found, use column 15 (known default in TikTok templates)
            if "Seller SKU" not in col_map:
                logs.append("  WARNING: 'Seller SKU' not found by label. Falling back to Column 15.")
                col_map["Seller SKU"] = 15
            
            # Scan AROUND the header row for warehouse columns (rows header-2 to header+2)
            for r in range(max(1, header_row - 2), min(11, header_row + 3)):
                for c in range(1, 100):
                    lbl = str(ws.Cells(r, c).Value or "").strip()
                    if not lbl: continue
                    
                    lbl_upper = lbl.upper()
                    
                    # EXPLICIT EXCLUSION: We do not use JIAZHOU/1HAOCANG
                    if "JIAZHOU" in lbl_upper or "1HAOCANG" in lbl_upper:
                        if c not in excluded_cols: excluded_cols.append(c)
                        continue
                    
                    matched_group = None
                    if "运去哪COPE" in lbl or "COPE" in lbl_upper: matched_group = "COPE"
                    elif "运去哪RDW" in lbl or "RDW" in lbl_upper: matched_group = "RDW"
                    elif "昭临" in lbl or "US01" in lbl_upper or "美西1号仓" in lbl: matched_group = "昭临 US01 / 06 / 07"
                    elif "美西谷仓" in lbl or "美西仓库" in lbl or "谷仓" in lbl: matched_group = "美西谷仓"
                    elif "MPR_NJ_US" in lbl_upper or "MPR" in lbl_upper: matched_group = "MPR_NJ_US"
                    elif "Warehouse 6" in lbl or "仓 6" in lbl: matched_group = "Warehouse 6"
                    
                    if matched_group and matched_group not in col_map:
                        col_map[matched_group] = c
                        logs.append(f"    - Mapped {matched_group} to Col {c} (Label: '{lbl}')")
            
            logs.append(f"  Columns found: {list(col_map.keys())}")
            
            if "Seller SKU" not in col_map:
                raise Exception("Template missing 'Seller SKU' column.")
            
            last_row = ws.UsedRange.Rows.Count
            data_start_row = header_row + 1
            
            for r in range(header_row + 1, min(header_row + 15, last_row)):
                cell_val = str(ws.Cells(r, col_map["Seller SKU"]).Value or "").strip().lower()
                if cell_val in ("mandatory", "optional", "uneditable", "必填", "选填") or not cell_val:
                    data_start_row = r + 1
                    continue
                else:
                    data_start_row = r
                    break
            
            logs.append(f"  Data starts at row: {data_start_row}, total rows: {last_row}")
            
            msku_list = []
            if last_row >= data_start_row:
                sku_col_idx = col_map["Seller SKU"]
                mskus_range = ws.Range(ws.Cells(data_start_row, sku_col_idx), ws.Cells(last_row, sku_col_idx))
                # Protect against None values in the list
                mskus_values = mskus_range.Value
                if mskus_values is None: mskus_values = []
                elif not isinstance(mskus_values, tuple) and not isinstance(mskus_values, list): mskus_values = [[mskus_values]]
                msku_list = [str(r[0] or "").strip().upper() for r in list(mskus_values)]
            
            logs.append(f"  Fetched {len(msku_list)} MSKUs from template")
            
            target_groups = [g for g in col_map.keys() if g != "Seller SKU"]
            
            # Debug tracking
            target_debug_ids = ["441", "446", "463", "445", "302"]
            
            updated_count = 0
            if msku_list:
                for group in target_groups:
                    col_idx = col_map[group]
                    col_values = []
                    
                    for i, msku in enumerate(msku_list):
                        if not msku or msku in ("NONE", "NAN", "", "0") or len(msku) < 2:
                            col_values.append([0])
                            continue
                        
                        wh_sku = msku_map.get(msku)
                        stock_data = None
                        
                        if wh_sku:
                            stock_data = aggregated_stock.get(wh_sku)
                        
                        if not stock_data:
                            stock_data = aggregated_stock.get(msku)
                            if stock_data:
                                logs.append(f"  INFO: No mapping for MSKU '{msku}', but found direct stock match.")
                            
                        # Log specific target IDs for debugging
                        if any(tid in msku for tid in target_debug_ids):
                            status = "FOUND" if stock_data else "MISSING"
                            qty = stock_data.get(group, 0) if (stock_data and isinstance(stock_data, dict)) else 0
                            logs.append(f"  DEBUG: SKU '{msku}' ({group}) -> {status}, Qty: {qty}")
                        
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
                        
                        col_values.append([qty])
                    
                    target_range = ws.Range(ws.Cells(data_start_row, col_idx), ws.Cells(last_row, col_idx))
                    try: ws.Unprotect()
                    except: pass
                    target_range.Value = col_values
                
                for col_idx in excluded_cols:
                    reset_values = [[0] for _ in range(len(msku_list))]
                    target_range = ws.Range(ws.Cells(data_start_row, col_idx), ws.Cells(last_row, col_idx))
                    try: ws.Unprotect()
                    except: pass
                    target_range.Value = reset_values

                updated_count = len([m for m in msku_list if m and m not in ("NONE", "NAN", "", "0")])

            wb.SaveAs(os.path.abspath(output_path))
            wb.Close(SaveChanges=False)
        finally:
            try:
                excel.ScreenUpdating = True
                excel.EnableEvents = True
                excel.Interactive = True
                excel.Calculation = -4105
            except:
                pass
            excel.Quit()
            
        logs.append(f"SUCCESS: Updated {updated_count} rows")
        logs.append(f"  MSKUs not in mapping: {len(missing_mskus)}")
        logs.append(f"  SKUs not in inventory: {len(missing_inventory_skus)}")
    except Exception as e:
        logs.append(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        for log in logs:
            print(log)
        raise e
        
    finally:
        pythoncom.CoUninitialize()
        
    for log in logs:
        print(log)
    
    with open("tiktok_processing.log", "w", encoding="utf-8") as f:
        for log in logs:
            f.write(log + "\n")
        
    return aggregated_stock