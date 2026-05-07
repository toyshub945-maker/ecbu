import pandas as pd
import os

warehouse_groups = {
    "Warehouse 6":              ["YQN Los Angeles Warehouse #7", "Warehouse 6", "Warehouse6", "仓 6"],
    "MPR_NJ_US":                ["MPR_NJ_US", "MPR", "运去哪 MPR", "MPR US"],
    "美西谷仓":                 ["谷仓 美西仓库", "美西谷仓", "美西仓库", "芝加哥2仓", "易可美", "谷仓"],
    "昭临 US01 / 06 / 07":      ["US_JB001", "美西1号仓", "US_JB06", "US_JB07", "美西6号仓", "昭临", "JB01", "JB07"],
    "COPE":                     ["运去哪 COPE_CA_US", "COPE_CA_US", "COPE", "运去哪COPE"],
    "RDW":                      ["YQN Los Angeles Warehouse #1", "RDW", "运去哪RDW", "RDW LA"],
}

def test_mapping():
    msku_path = r"D:\St APP\CELNEPHO\TIKTOK 1 Products - MSKU.xlsx"
    xl = pd.ExcelFile(msku_path)
    df = xl.parse("Match Template")
    
    sku_col = "SKU"
    wh_col = "Warehouse"
    
    results = []
    for _, row in df.head(10).iterrows():
        sku = str(row[sku_col])
        wh = str(row[wh_col]).strip()
        
        assigned = None
        for group, keywords in warehouse_groups.items():
            if any(k.lower() in wh.lower() for k in keywords):
                assigned = group
                break
        
        results.append({"SKU": sku, "Raw_WH": wh, "Assigned": assigned})
    
    print(results)

if __name__ == "__main__":
    test_mapping()
