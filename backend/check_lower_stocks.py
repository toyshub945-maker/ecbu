import pandas as pd
import json

def check_lower_stocks():
    path_manual = r"d:\Wokrflow app\Tiktok app export 1.xlsx"
    path_workflow = r"d:\Wokrflow app\work flow app export 1.xlsx"
    
    def get_clean_df(path):
        df_raw = pd.read_excel(path, sheet_name="Template", header=1)
        sku_col = df_raw.columns[14] 
        wh_cols = df_raw.columns[7:14]
        df = df_raw[[sku_col] + wh_cols.tolist()].copy()
        df.columns = ["SKU"] + [f"W{i}" for i in range(len(wh_cols))]
        df["SKU"] = df["SKU"].astype(str).str.strip().str.upper()
        for col in df.columns[1:]:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        df["Total"] = df[[f"W{i}" for i in range(len(wh_cols))]].sum(axis=1)
        return df

    df_m = get_clean_df(path_manual)
    df_w = get_clean_df(path_workflow)
    
    merged = pd.merge(df_m, df_w, on="SKU", suffixes=('_m', '_w'))
    
    # Find SKUs where Workflow Total < Manual Total
    lower = merged[merged["Total_w"] < merged["Total_m"]]
    
    print(f"Total SKUs matched: {len(merged)}")
    print(f"SKUs where Workflow Total < Manual Total: {len(lower)}")
    if not lower.empty:
        print("\nTop 10 lower stock SKUs:")
        print(json.dumps(lower.sort_values(by="Total_m", ascending=False).head(10)[["SKU", "Total_m", "Total_w"]].to_dict(orient="records"), indent=2))

if __name__ == "__main__":
    check_lower_stocks()
