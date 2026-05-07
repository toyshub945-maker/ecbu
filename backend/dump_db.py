import sqlite3
import json

def dump_db():
    conn = sqlite3.connect('d:/Wokrflow app/workflow-dashboard/data/workflow.db')
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute('SELECT * FROM warehouse_inventory LIMIT 20')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    
    with open('db_dump.json', 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    dump_db()
