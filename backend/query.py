import sqlite3
import os
import sys

# Set encoding for Windows console
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

db_path = os.path.join('..', 'data', 'workflow.db')

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    for val in ['441', '446', '463', '445']:
        print(f"\n--- Searching for '{val}' ---")
        # Check stock quantity
        cursor.execute("SELECT sku, stock_quantity, warehouse_name FROM warehouse_inventory WHERE stock_quantity = ?", (val,))
        rows = cursor.fetchall()
        print(f"Matches as quantity: {len(rows)}")
        for r in rows:
            print(f"  SKU: {r[0]}, Qty: {r[1]}, Warehouse: {r[2]}")
            
        # Check SKU part
        cursor.execute("SELECT sku, stock_quantity, warehouse_name FROM warehouse_inventory WHERE sku LIKE ? LIMIT 5", (f'%{val}%',))
        rows = cursor.fetchall()
        print(f"Matches as SKU part: {len(rows)}")
        for r in rows:
            print(f"  SKU: {r[0]}, Qty: {r[1]}, Warehouse: {r[2]}")

    conn.close()
else:
    print("Database file not found!")
