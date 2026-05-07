import pandas as pd
import json
import numpy as np

def compare_skus():
    path_manual = r"d:\Wokrflow app\Tiktok app export 1.xlsx"
    path_workflow = r"d:\Wokrflow app\work flow app export 1.xlsx"
    
    def get_clean_df(path):
        df_raw = pd.read_excel(path, sheet_name="Template", header=1)
        # Find SKU col (last one usually)
        sku_col = df_raw.columns[14] 
        # Warehouse cols
        wh_cols = df_raw.columns[7:14]
        df = df_raw[[sku_col] + wh_cols.tolist()].copy()
        df.columns = ["SKU"] + [f"W{i}" for i in range(len(wh_cols))]
        df["SKU"] = df["SKU"].astype(str).str.strip().str.upper()
        # Convert warehouse cols to numeric
        for col in df.columns[1:]:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        return df

    df_m = get_clean_df(path_manual)
    df_w = get_clean_df(path_workflow)
    
    merged = pd.merge(df_m, df_w, on="SKU", suffixes=('_m', '_w'))
    
    # Calculate differences for each warehouse column
    for i in range(7):
        merged[f"diff_{i}"] = merged[f"W{i}_w"] - merged[f"W{i}_m"]
        
    # Find significant discrepancies (e.g. > 1000)
    sig_diffs = []
    for _, row in merged.iterrows():
        total_diff = sum(abs(row[f"diff_{i}"]) for i in range(7))
        if total_diff > 100:
            sig_diffs.append({
                "SKU": row["SKU"],
                "Manual_Total": sum(row[f"W{i}_m"] for i in range(7)),
                "Workflow_Total": sum(row[f"W{i}_w"] for i in range(7)),
                "Diffs": {f"Col{i+7}": int(row[f"diff_{i}"]) for i in range(7) if row[f"diff_{i}"] != 0}
            })
            
    print(f"Total SKUs matched: {len(merged)}")
    print(f"SKUs with differences > 100: {len(sig_diffs)}")
    if sig_diffs:
        print("\nTop 10 discrepancies:")
        print(json.dumps(sig_diffs[:10], indent=2))

if __name__ == "__main__":
    compare_skus()
