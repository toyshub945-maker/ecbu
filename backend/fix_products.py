import sqlite3
import os

DB_PATH = "data/workflow.db"
STORE_CODE = "TK3"
PERIOD_ID = 57
PRODUCT_NOS = ['205', '253', '470', '287', '280', '178', '401']
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
    
    for pno in PRODUCT_NOS:
        # Pin
        cur.execute(
            "INSERT OR IGNORE INTO board_pins (store_code, product_no) VALUES (?,?)",
            (STORE_CODE, pno)
        )
        # Tasks
        for t in TASK_TYPES:
            cur.execute("""
                INSERT OR IGNORE INTO product_tasks 
                (product_no, period_id, store_code, task_type, status)
                VALUES (?, ?, ?, ?, 'todo')
            """, (pno, PERIOD_ID, STORE_CODE, t))
            
    conn.commit()
    conn.close()
    print("Fixed missing products and tasks.")

if __name__ == "__main__":
    main()
