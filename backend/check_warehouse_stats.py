import sqlite3
import json

def check_warehouse_stats():
    conn = sqlite3.connect('d:/Wokrflow app/workflow-dashboard/data/workflow.db')
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Check total counts per sheet
    cur.execute("SELECT sheet_name, COUNT(*) as total, SUM(stock_quantity) as total_stock FROM warehouse_inventory GROUP BY sheet_name")
    stats = [dict(r) for r in cur.fetchall()]
    print("--- Per Sheet Stats ---")
    print(json.dumps(stats, indent=2))
    
    # Check a sample of non-zero stocks
    cur.execute("SELECT sheet_name, sku, stock_quantity FROM warehouse_inventory WHERE stock_quantity > 0 LIMIT 10")
    samples = [dict(r) for r in cur.fetchall()]
    print("\n--- Non-zero Samples ---")
    print(json.dumps(samples, indent=2))
    
    conn.close()

if __name__ == "__main__":
    check_warehouse_stats()
