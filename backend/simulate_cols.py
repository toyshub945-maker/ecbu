import pandas as pd
import json

def simulate_column_detection():
    path = r"d:\Wokrflow app\work flow app export 1.xlsx"
    df = pd.read_excel(path, sheet_name="Template", header=None)
    
    # Logic from process_tiktok.py
    header_row = -1
    for r in range(15):
        vals = [str(x).upper() for x in df.iloc[r].tolist()]
        if "SELLER SKU" in vals or "商家 SKU" in vals:
            header_row = r
            break
            
    if header_row == -1:
        print("Header not found")
        return
        
    header_values = df.iloc[header_row].tolist()
    col_map = {}
    
    for c, lbl in enumerate(header_values):
        lbl = str(lbl)
        lbl_upper = lbl.upper()
        
        # EXPLICIT EXCLUSION: We do not use JIAZHOU/1HAOCANG
        if "JIAZHOU" in lbl_upper or "1HAOCANG" in lbl_upper:
            continue
            
        matched_group = None
        if "运去哪COPE" in lbl or "COPE" in lbl_upper: matched_group = "COPE"
        elif "运去哪RDW" in lbl or "RDW" in lbl_upper: matched_group = "RDW"
        elif "昭临" in lbl or "US01" in lbl_upper or "美西1号仓" in lbl: matched_group = "昭临 US01 / 06 / 07"
        elif "美西谷仓" in lbl or "美西仓库" in lbl or "谷仓" in lbl: matched_group = "美西谷仓"
        elif "MPR_NJ_US" in lbl_upper or "MPR" in lbl_upper: matched_group = "MPR_NJ_US"
        elif "Warehouse 6" in lbl or "仓 6" in lbl: matched_group = "Warehouse 6"
        elif "SELLER SKU" in lbl_upper or "商家 SKU" in lbl: matched_group = "Seller SKU"
        
        if matched_group:
            col_map[matched_group] = c
            
    print(f"Detected col_map: {json.dumps(col_map, indent=2, ensure_ascii=True)}")

if __name__ == "__main__":
    simulate_column_detection()
