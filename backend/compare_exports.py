import pandas as pd
import json

def compare_exports():
    path1 = r"d:\Wokrflow app\Tiktok app export 1.xlsx"
    path2 = r"d:\Wokrflow app\work flow app export 1.xlsx"
    
    # Standard TikTok templates usually have data starting after row 3
    # We'll search for 'Seller SKU' to find the header row
    def get_df(path):
        df_raw = pd.read_excel(path, sheet_name="Template")
        header_idx = -1
        for i in range(15):
            if "Seller SKU" in str(df_raw.iloc[i].values):
                header_idx = i
                break
        if header_idx >= 0:
            return pd.read_excel(path, sheet_name="Template", header=header_idx + 1)
        return None

    df1 = get_df(path1)
    df2 = get_df(path2)
    
    if df1 is None or df2 is None:
        print("Error: Could not find header in one of the files")
        return

    # Find the Seller SKU column index
    sku_col1 = [c for c in df1.columns if "Seller SKU" in str(c)][0]
    sku_col2 = [c for c in df2.columns if "Seller SKU" in str(c)][0]
    
    # Find warehouse columns
    def get_wh_cols(df):
        return [c for c in df.columns if "Quantity in" in str(c) or "Warehouse" in str(c)]
    
    wh_cols1 = get_wh_cols(df1)
    wh_cols2 = get_wh_cols(df2)
    
    print(f"Warehouse columns in Manual Export: {wh_cols1}")
    print(f"Warehouse columns in Workflow Export: {wh_cols2}")
    
    # Merge on SKU
    df1_clean = df1[[sku_col1] + wh_cols1].copy()
    df2_clean = df2[[sku_col2] + wh_cols2].copy()
    
    # Normalize SKUs
    df1_clean[sku_col1] = df1_clean[sku_col1].astype(str).str.strip().str.upper()
    df2_clean[sku_col2] = df2_clean[sku_col2].astype(str).str.strip().str.upper()
    
    merged = pd.merge(df1_clean, df2_clean, left_on=sku_col1, right_on=sku_col2, suffixes=('_manual', '_workflow'))
    
    # Find differences
    diffs = []
    for _, row in merged.iterrows():
        sku = row[sku_col1]
        for col1 in wh_cols1:
            # Try to find matching column in df2
            col2 = col1 # Assuming same names for now
            if col2 in wh_cols2:
                val1 = row[col1 + "_manual"]
                val2 = row[col2 + "_workflow"]
                # Handle NaNs
                v1 = 0 if pd.isna(val1) else int(val1)
                v2 = 0 if pd.isna(val2) else int(val2)
                
                if v1 != v2:
                    diffs.append({
                        "SKU": sku,
                        "Warehouse": col1,
                        "Manual": v1,
                        "Workflow": v2
                    })
    
    print(f"Total rows compared: {len(merged)}")
    print(f"Total discrepancies found: {len(diffs)}")
    if diffs:
        print("\nSample Discrepancies:")
        print(json.dumps(diffs[:20], indent=2))

if __name__ == "__main__":
    compare_exports()
