import sqlite3
import os

# Based on config.py, DB is at workflow-dashboard/data/workflow.db
db_path = "data/workflow.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("DELETE FROM warehouse_inventory;")
    conn.commit()
    print(f"Cleared {cur.rowcount} rows from warehouse_inventory")
    conn.close()
else:
    # Try backup location just in case
    db_path_alt = "backend/data/workflow.db"
    if os.path.exists(db_path_alt):
        conn = sqlite3.connect(db_path_alt)
        cur = conn.cursor()
        cur.execute("DELETE FROM warehouse_inventory;")
        conn.commit()
        print(f"Cleared {cur.rowcount} rows from {db_path_alt}")
        conn.close()
    else:
        print(f"DB not found at {db_path} or {db_path_alt}")
        # List current directory to debug
        print(f"Current Dir: {os.getcwd()}")
        print(f"Files: {os.listdir('.')}")
        if os.path.exists('data'): print(f"data/ contents: {os.listdir('data')}")
