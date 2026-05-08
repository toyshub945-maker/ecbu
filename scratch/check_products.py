import sqlite3
import os

db_path = r"d:\Wokrflow app\workflow-dashboard\data\workflow.db"

product_nos = ["197", "291", "396", "426", "236", "420", "287", "248", "311", "437", "342"]

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print(f"Checking {len(product_nos)} products in DB...")
found = []
missing = []

for pno in product_nos:
    cur.execute("SELECT product_no, stores_available FROM products WHERE product_no = ?", (pno,))
    row = cur.fetchone()
    if row:
        found.append(row)
    else:
        # Try with leading zeros or different formats
        cur.execute("SELECT product_no, stores_available FROM products WHERE product_no LIKE ?", (f"%{pno}",))
        rows = cur.fetchall()
        if rows:
            found.extend(rows)
        else:
            missing.append(pno)

print("\n--- FOUND ---")
for f in found:
    print(f"Product No: {f[0]}, Stores: {f[1]}")

print("\n--- MISSING ---")
for m in missing:
    print(m)

conn.close()
