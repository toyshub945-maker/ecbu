import pandas as pd
import json

def check_old_warehouse():
    path = r"D:\St APP\Warehouse - Inventory - All Platform (2).xlsx"
    xl = pd.ExcelFile(path)
    sheet = xl.sheet_names[0] # Try first sheet
    df = xl.parse(sheet)
    
    # Show first 20 rows of SKU and Stock
    cols = df.columns.tolist()
    sku_col = next((c for c in cols if "SKU" in str(c).upper()), None)
    stock_col = next((c for c in cols if "VOLUME" in str(c).upper() or "STOCK" in str(c).upper() or "AVAILABLE" in str(c).upper()), None)
    
    if sku_col and stock_col:
        sample = df[[sku_col, stock_col]].head(20).to_dict(orient='records')
        print(json.dumps(sample, indent=2))
    else:
        print(f"Columns not found. Found: {cols}")

if __name__ == "__main__":
    check_old_warehouse()
