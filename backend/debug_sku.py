import pandas as pd, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

msku_path = r'D:\St APP\CELNEPHO\TIKTOK 1 Products - MSKU.xlsx'
inv_path  = r'D:\St APP\Warehouse - Inventory - All Platform (2).xlsx'

warehouse_groups = {
    'Warehouse 6':         ['YQN Los Angeles Warehouse #7', 'Warehouse 6', 'Warehouse6', '仓 6'],
    'MPR_NJ_US':           ['MPR_NJ_US', 'MPR', '运去哪 MPR', 'MPR US'],
    '美西谷仓':            ['谷仓 美西仓库', '美西谷仓', '美西仓库', '芝加哥2仓', '易可美', '谷仓'],
    '昭临 US01 / 06 / 07': ['US_JB001', '美西1号仓', 'US_JB06', 'US_JB07', '美西6号仓', '昭临', 'JB01', 'JB07'],
    'COPE':                ['运去哪 COPE_CA_US', 'COPE_CA_US', 'COPE', '运去哪COPE'],
    'RDW':                 ['YQN Los Angeles Warehouse #1', 'RDW', '运去哪RDW', 'RDW LA'],
}

def norm(sku):
    if pd.isna(sku): return ''
    s = str(sku).strip().upper()
    return s[:-2] if s.endswith('.0') else s

# Step 1: MSKU map
xls_m = pd.ExcelFile(msku_path, engine='openpyxl')
msku_map = {}
for sh in xls_m.sheet_names:
    try:
        df = pd.read_excel(xls_m, sheet_name=sh, engine='openpyxl')
        cols = [str(c).strip() for c in df.columns]
        m_col = next((c for c in cols if 'MSKU' in c.upper()), None)
        w_col = next((c for c in cols if ('WAREHOUSE' in c.upper() or 'WHAREHOUSE' in c.upper()) and 'SKU' in c.upper()), None)
        if m_col and w_col:
            for _, row in df.iterrows():
                m, w = norm(row[m_col]), norm(row[w_col])
                if m and w and m != 'NAN' and w != 'NAN':
                    msku_map[m] = w
    except:
        pass

# Find all problem SKUs from comparison
problem_mskus = [
    'STP0210-BEIGETAN-10',
    'STP0365-BLACK-7.5',
    'STP0365-BLACK-8',
    'STP0225-BLACKPATENT-7.5',
]

print("=== MSKU -> WH_SKU mappings ===")
for msku in problem_mskus:
    wh = msku_map.get(msku, 'NOT FOUND')
    print(f"  {msku} -> {wh}")

# Step 2: Trace inventory for each WH_SKU
print()
print("=== INVENTORY TRACE (original calamine engine) ===")
xls_i = pd.ExcelFile(inv_path, engine='openpyxl')
relevant = [s for s in xls_i.sheet_names if any(ch.isdigit() for ch in s) or 'all' in s.lower() or 'inventory' in s.lower()]
print(f"Sheets processed: {relevant}")
print()

for msku in problem_mskus:
    wh_sku = msku_map.get(msku)
    if not wh_sku:
        print(f"{msku}: NOT IN MSKU MAP")
        continue

    total_by_group = {g: 0 for g in warehouse_groups}
    rows_found = []

    for sname in relevant:
        try:
            df_i = pd.read_excel(xls_i, sheet_name=sname, engine='openpyxl')
            cols = [str(c).strip() for c in df_i.columns]
            sku_c = next((c for c in cols if 'Warehouse SKU' in c or 'Wharehouse SKU' in c), None)
            wh_c  = next((c for c in cols if c == 'Warehouse' or ('Warehouse' in c and 'SKU' not in c)), None)
            qty_c = next((c for c in cols if 'Available Products Volume' in c or 'Available Stock' in c or 'Actual Stock' in c), None)
            if not sku_c or not qty_c:
                continue

            mask = df_i[sku_c].astype(str).str.strip().str.upper() == wh_sku
            matched = df_i[mask]
            for _, r in matched.iterrows():
                wh_name = str(r[wh_c]).strip() if wh_c else 'N/A'
                qty = pd.to_numeric(r[qty_c], errors='coerce')
                qty = int(qty) if not pd.isna(qty) else 0

                grp = None
                for g, kws in warehouse_groups.items():
                    if any(k.lower() in wh_name.lower() for k in kws):
                        grp = g
                        break
                if not grp:
                    grp = 'COPE'

                rows_found.append({'sheet': sname, 'wh': wh_name, 'qty': qty, 'group': grp})
                total_by_group[grp] += qty
        except Exception as e:
            pass

    print(f"MSKU: {msku}  (WH_SKU: {wh_sku})")
    for r in rows_found:
        print(f"  Sheet={r['sheet']}  WH={r['wh']}  Qty={r['qty']}  -> Group={r['group']}")
    print(f"  TOTALS: {total_by_group}")
    print(f"  RDW={total_by_group['RDW']}  Warehouse6={total_by_group['Warehouse 6']}")
    print()
