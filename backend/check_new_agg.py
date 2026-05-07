import sqlite3
import json

def check_new_aggregation():
    warehouse_groups = {
        "RDW": ["YQN Los Angeles Warehouse #1", "RDW", "运去哪RDW", "RDW LA"],
        "COPE": ["运去哪 COPE_CA_US", "COPE_CA_US", "COPE", "运去哪COPE"],
        "Warehouse 6": ["YQN Los Angeles Warehouse #7", "Warehouse 6", "Warehouse6", "仓 6", "6"],
        "MPR_NJ_US": ["MPR_NJ_US", "MPR", "运去哪 MPR", "MPR US"],
        "美西谷仓": ["谷仓 美西仓库", "美西谷仓", "美西仓库", "芝加哥2仓", "易可美", "谷仓"],
        "昭临 US01 / 06 / 07": ["US_JB001", "美西1号仓", "US_JB06", "US_JB07", "美西6号仓", "昭临", "JB01", "JB07", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14"],
    }
    
    conn = sqlite3.connect('d:/Wokrflow app/workflow-dashboard/data/workflow.db')
    cur = conn.cursor()
    cur.execute("SELECT warehouse_name, stock_quantity FROM warehouse_inventory")
    records = cur.fetchall()
    
    totals = {g: 0 for g in warehouse_groups}
    totals["NONE"] = 0
    
    for wh_name, qty in records:
        matched = False
        for group, keywords in warehouse_groups.items():
            if any(k.upper() in wh_name.upper() for k in keywords):
                totals[group] += (qty or 0)
                matched = True
                break
        if not matched:
            totals["NONE"] += (qty or 0)
            
    print("NEW AGGREGATION TOTALS:")
    print(json.dumps(totals, indent=2))
    conn.close()

if __name__ == "__main__":
    check_new_aggregation()
