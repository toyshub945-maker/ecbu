from app import feishu
import json

def debug_mapping():
    warehouse_groups = {
        "Warehouse 6": ["YQN Los Angeles Warehouse #7", "Warehouse 6", "Warehouse6", "仓 6", "6"],
        "MPR_NJ_US": ["MPR_NJ_US", "MPR", "运去哪 MPR", "MPR US"],
        "美西谷仓": ["谷仓 美西仓库", "美西谷仓", "美西仓库", "芝加哥2仓", "易可美", "谷仓"],
        "昭临 US01 / 06 / 07": ["US_JB001", "美西1号仓", "US_JB06", "US_JB07", "美西6号仓", "昭临", "JB01", "JB07", "1", "7", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14"],
        "COPE": ["运去哪 COPE_CA_US", "COPE_CA_US", "COPE", "运去哪COPE"],
        "RDW": ["YQN Los Angeles Warehouse #1", "RDW", "运去哪RDW", "RDW LA"],
    }
    
    unique_warehouses = ["US_JB07 美西1号仓", "US_JB06 美西1号仓(2)", "运去哪 YQN Los Angeles Warehouse #7", "US_JB001 美西1号仓", "01", "谷仓 美西仓库", "运去哪 YQN Los Angeles Warehouse #1", "运去哪 COPE_CA_US", "运去哪 MPR_NJ_US", "02", "运去哪 RDW_CA_US", "03", "04", "05", "US_JB07 美西6号仓", "06", "07", "08", "09", "10", "易可美 芝加哥2仓", "11", "14"]
    
    mapping_results = {}
    for wh in unique_warehouses:
        matched = "NONE"
        for group, keywords in warehouse_groups.items():
            if any(k.upper() in wh.upper() for k in keywords):
                matched = group
                break
        mapping_results[wh] = matched
        
    print(json.dumps(mapping_results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    debug_mapping()
