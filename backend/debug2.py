import pandas as pd, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

msku_path = r'D:\St APP\CELNEPHO\TIKTOK 1 Products - MSKU.xlsx'
inv_path  = r'D:\St APP\Warehouse - Inventory - All Platform (2).xlsx'

# ── 1. Check sheet 08 columns ───────────────────────────────────────────────
print("=== SHEET 08 COLUMNS & SAMPLE ===")
df08 = pd.read_excel(inv_path, sheet_name='08', engine='openpyxl', nrows=5)
print("Columns:", list(df08.columns))
print(df08.to_string())

# ── 2. Check Match Template for STP0210 ────────────────────────────────────
print()
print("=== MATCH TEMPLATE: STP0210 & STP0365 entries ===")
df_erp = pd.read_excel(msku_path, sheet_name='Match Template', engine='openpyxl')
print("Columns:", list(df_erp.columns))
mask = df_erp.iloc[:, 0].astype(str).str.upper().str.contains('STP0210|STP0365|STP0225', na=False)
print(df_erp[mask].head(15).to_string())

# ── 3. What does the SKU col actually contain? ─────────────────────────────
print()
print("=== MATCH TEMPLATE 'SKU' column sample (first 5 non-null) ===")
sku_col = df_erp.columns[1]  # 'SKU' is second column
wh_col  = df_erp.columns[4]  # 'Warehouse' is fifth column
sample = df_erp[[sku_col, wh_col]].dropna(subset=[wh_col]).head(10)
print(sample.to_string())
