import pandas as pd
import os
import re

def normalize_sku(sku):
    """Normalize SKU for consistent matching"""
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

def load_warehouse_data(warehouse_path):
    """Load warehouse data from Excel file"""
    xl = pd.ExcelFile(warehouse_path, engine="openpyxl")
    inventory_agg = {}
    
    for sheet in xl.sheet_names:
        if sheet.isdigit() or sheet.lower() in ["inventory", "stock", "all"]:
            try:
                df = xl.parse(sheet)
                
                sku_col = find_column(df.columns, ["warehouse sku", "wharehouse sku", "sku"])
                vol_col = find_column(df.columns, ["available products volume", "volume", "stock", "available"])
                
                if not vol_col:
                    for c in df.columns:
                        if "available" in str(c).lower() or "volume" in str(c).lower():
                            vol_col = c
                            break
                
                if not vol_col and len(df.columns) > 3:
                    vol_col = df.columns[3]
                
                if sku_col and vol_col:
                    valid_df = df.dropna(subset=[sku_col])
                    for _, row in valid_df.iterrows():
                        sku = normalize_sku(row[sku_col])
                        vol = row[vol_col]
                        try:
                            vol = float(vol)
                            if pd.isna(vol):
                                vol = 0
                        except:
                            vol = 0
                        inventory_agg[sku] = inventory_agg.get(sku, 0) + vol
            except Exception as e:
                print(f"Warning: Failed to read sheet {sheet}: {e}")
                continue
                    
    return inventory_agg

def find_msku_sheet(xl):
    """Find the best MSKU sheet from Excel file"""
    sheet_names = xl.sheet_names
    
    candidates = ["shein", "match", "msku", "mapping", "erp"]
    for sheet in sheet_names:
        sheet_lower = sheet.lower()
        if any(c in sheet_lower for c in candidates):
            return sheet
    
    return sheet_names[1] if len(sheet_names) > 1 else sheet_names[0]

def find_merchant_sheet(xl):
    """Find the merchant stock export sheet"""
    sheet_names = xl.sheet_names
    
    candidates = ["merchant", "stock", "export", "product"]
    for sheet in sheet_names:
        sheet_lower = sheet.lower()
        if any(c in sheet_lower for c in candidates):
            return sheet
    
    return sheet_names[0]

def process_uploaded_files(msku_path, template_path, export_path, warehouse_path, output_path):
    """Process SHEIN files with manual warehouse file"""
    logs = []
    
    logs.append("Loading warehouse inventory data...")
    try:
        warehouse_data = load_warehouse_data(warehouse_path)
        logs.append(f"Loaded warehouse: {len(warehouse_data)} SKUs")
    except Exception as e:
        raise Exception(f"Failed to load warehouse: {str(e)}")
    
    logs.append("Loading merchant stock export...")
    try:
        xl_export = pd.ExcelFile(export_path, engine="openpyxl")
        export_sheet = find_merchant_sheet(xl_export)
        merchant_df = xl_export.parse(export_sheet)
        logs.append(f"Export sheet: {export_sheet}, rows: {len(merchant_df)}")
    except Exception as e:
        raise Exception(f"Error reading export: {str(e)}")
    
    logs.append("Loading MSKU mapping file...")
    try:
        xl_msku = pd.ExcelFile(msku_path, engine="openpyxl")
        msku_sheet = find_msku_sheet(xl_msku)
        msku_df = xl_msku.parse(msku_sheet)
        
        msku_df.columns = [str(c).strip() for c in msku_df.columns]
        
        msku_col = find_column(msku_df.columns, ["msku", "*msku", "merchant sku", "seller sku"])
        sku_col = find_column(msku_df.columns, ["sku", "*sku", "erp sku", "warehouse sku"])
        
        if not msku_col or not sku_col:
            raise Exception(f"Cannot detect MSKU/SKU columns. Found: {msku_df.columns.tolist()}")
        
        mapping = {}
        for _, row in msku_df.iterrows():
            m_sku = normalize_sku(row[msku_col])
            e_sku = normalize_sku(row[sku_col])
            if m_sku and e_sku:
                mapping[m_sku] = e_sku
        
        logs.append(f"MSKU Mapping: {len(mapping)} pairs, columns: {msku_col} -> {sku_col}")
    except Exception as e:
        raise Exception(f"Error reading MSKU: {str(e)}")
    
    merchant_cols = [str(c).strip() for c in merchant_df.columns]
    m_sku_col = find_column(merchant_cols, ["merchant sku", "seller sku", "msku"])
    s_sku_col = find_column(merchant_cols, ["sku", "product sku", "shein sku"])
    wh_col = find_column(merchant_cols, ["warehouse code", "warehouse", "wh"])
    
    logs.append(f"Merchant columns: m_sku={m_sku_col}, s_sku={s_sku_col}, wh={wh_col}")
    
    updated_rows = []
    mapped_count = 0
    not_in_mapping = 0
    not_in_warehouse = 0
    
    for _, row in merchant_df.iterrows():
        shein_sku = row.get(s_sku_col)
        warehouse_code = row.get(wh_col) if wh_col else None
        
        raw_m_sku = row.get(m_sku_col) if m_sku_col else None
        merchant_sku = normalize_sku(raw_m_sku) if raw_m_sku else ""
        
        erp_sku = mapping.get(merchant_sku)
        total_vol = 0
        
        if erp_sku:
            total_vol = warehouse_data.get(erp_sku, 0)
            if total_vol > 0:
                mapped_count += 1
            else:
                not_in_warehouse += 1
        else:
            not_in_mapping += 1
            total_vol = warehouse_data.get(merchant_sku, 0)
            if total_vol > 0:
                mapped_count += 1
                not_in_mapping -= 1
        
        updated_rows.append({
            "SKU": shein_sku,
            "Warehouse Code": warehouse_code or "",
            "Quantity": int(total_vol)
        })
    
    out_df = pd.DataFrame(updated_rows)
    
    try:
        out_df.to_excel(output_path, index=False)
        logs.append(f"Done! Mapped: {mapped_count}, Missing Mapping: {not_in_mapping}, Missing in Warehouse: {not_in_warehouse}")
    except Exception as e:
        raise Exception(f"Failed to write output: {str(e)}")
    
    return logs


def process_shein_files_with_data(msku_path, template_path, export_path, warehouse_data, output_path):
    """Process SHEIN files with warehouse data from Feishu"""
    logs = []
    
    logs.append(f"Loading warehouse data from Feishu: {len(warehouse_data)} SKUs")
    
    logs.append("Loading merchant stock export...")
    try:
        xl_export = pd.ExcelFile(export_path, engine="openpyxl")
        export_sheet = find_merchant_sheet(xl_export)
        merchant_df = xl_export.parse(export_sheet)
        logs.append(f"Export: {export_sheet}, rows: {len(merchant_df)}")
    except Exception as e:
        raise Exception(f"Error reading export: {str(e)}")

    logs.append("Loading MSKU mapping...")
    try:
        xl_msku = pd.ExcelFile(msku_path, engine="openpyxl")
        msku_sheet = find_msku_sheet(xl_msku)
        msku_df = xl_msku.parse(msku_sheet)
        
        msku_df.columns = [str(c).strip() for c in msku_df.columns]
        
        msku_col = find_column(msku_df.columns, ["msku", "*msku", "merchant sku", "seller sku"])
        sku_col = find_column(msku_df.columns, ["sku", "*sku", "erp sku", "warehouse sku"])
        
        if not msku_col or not sku_col:
            raise Exception(f"Cannot detect MSKU/SKU columns. Found: {msku_df.columns.tolist()}")
        
        mapping = {}
        for _, row in msku_df.iterrows():
            m_sku = normalize_sku(row[msku_col])
            e_sku = normalize_sku(row[sku_col])
            if m_sku and e_sku:
                mapping[m_sku] = e_sku
        
        logs.append(f"MSKU Mapping: {len(mapping)} pairs")
    except Exception as e:
        raise Exception(f"Error reading MSKU: {str(e)}")
    
    merchant_cols = [str(c).strip() for c in merchant_df.columns]
    m_sku_col = find_column(merchant_cols, ["merchant sku", "seller sku", "msku"])
    s_sku_col = find_column(merchant_cols, ["sku", "product sku", "shein sku"])
    wh_col = find_column(merchant_cols, ["warehouse code", "warehouse", "wh"])
    
    updated_rows = []
    mapped_count = 0
    not_in_mapping = 0
    not_in_warehouse = 0
    
    for _, row in merchant_df.iterrows():
        shein_sku = row.get(s_sku_col)
        warehouse_code = row.get(wh_col) if wh_col else None
        
        raw_m_sku = row.get(m_sku_col) if m_sku_col else None
        merchant_sku = normalize_sku(raw_m_sku) if raw_m_sku else ""
        
        erp_sku = mapping.get(merchant_sku)
        total_vol = 0
        
        if erp_sku:
            if isinstance(warehouse_data, dict):
                if erp_sku in warehouse_data:
                    if isinstance(warehouse_data[erp_sku], dict):
                        total_vol = warehouse_data[erp_sku].get("stock", 0)
                    else:
                        total_vol = warehouse_data[erp_sku]
                elif merchant_sku in warehouse_data:
                    if isinstance(warehouse_data[merchant_sku], dict):
                        total_vol = warehouse_data[merchant_sku].get("stock", 0)
                    else:
                        total_vol = warehouse_data[merchant_sku]
                    erp_sku = merchant_sku
            if total_vol > 0:
                mapped_count += 1
            else:
                not_in_warehouse += 1
        else:
            if isinstance(warehouse_data, dict) and merchant_sku in warehouse_data:
                if isinstance(warehouse_data[merchant_sku], dict):
                    total_vol = warehouse_data[merchant_sku].get("stock", 0)
                else:
                    total_vol = warehouse_data[merchant_sku]
                if total_vol > 0:
                    mapped_count += 1
                else:
                    not_in_mapping += 1
            else:
                not_in_mapping += 1
        
        updated_rows.append({
            "SKU": shein_sku,
            "Warehouse Code": warehouse_code or "",
            "Quantity": int(total_vol)
        })
    
    out_df = pd.DataFrame(updated_rows)
    
    try:
        out_df.to_excel(output_path, index=False)
        logs.append(f"Done! Mapped: {mapped_count}, Missing: {not_in_mapping}, No Stock: {not_in_warehouse}")
    except Exception as e:
        raise Exception(f"Failed to write output: {str(e)}")
    
    return logs