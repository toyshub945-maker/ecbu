import sqlite3
import os

DB_PATH = "data/workflow.db"
TASK_TYPES = [
    "main_image",
    "description",
    "a_plus",
    "video",
    "title",
    "model_angles",
    "size_chart",
]

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Get all pins
    cur.execute("SELECT store_code, product_no FROM board_pins")
    pins = cur.fetchall()
    
    # Get all periods
    cur.execute("SELECT id, store_code FROM weekly_periods")
    periods = cur.fetchall()
    
    added = 0
    for pin_store, pno in pins:
        for pid, p_store in periods:
            if pin_store == p_store:
                for t in TASK_TYPES:
                    cur.execute("""
                        INSERT OR IGNORE INTO product_tasks 
                        (product_no, period_id, store_code, task_type, status)
                        VALUES (?, ?, ?, ?, 'todo')
                    """, (pno, pid, pin_store, t))
                    if cur.rowcount > 0:
                        added += 1
                        
    conn.commit()
    conn.close()
    print(f"Backfilled {added} missing tasks.")

if __name__ == "__main__":
    main()
