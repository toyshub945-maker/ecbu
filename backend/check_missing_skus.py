import pandas as pd
import sqlite3

def check_missing_skus():
    # 1. Get all Warehouse SKUs from mapping file
    mapping_path = r"D:\St APP\CELNEPHO\TIKTOK 1 Products - MSKU.xlsx"
    df_map = pd.read_excel(mapping_path, sheet_name="SKU")
    wh_skus = set(str(s).strip().upper() for s in df_map["Wharehouse SKU"].dropna())
    
    # 2. Get all SKUs from DB
    conn = sqlite3.connect('d:/Wokrflow app/workflow-dashboard/data/workflow.db')
    cur = conn.cursor()
    cur.execute("SELECT sku FROM warehouse_inventory")
    db_skus = set(str(r[0]).strip().upper() for r in cur.fetchall())
    
    missing = wh_skus - db_skus
    print(f"Total SKUs in mapping: {len(wh_skus)}")
    print(f"Total SKUs in DB: {len(db_skus)}")
    print(f"SKUs in mapping but MISSING from DB: {len(missing)}")
    if missing:
        print("First 10 missing:")
        print(list(missing)[:10])
    
    conn.close()

if __name__ == "__main__":
    check_missing_skus()
