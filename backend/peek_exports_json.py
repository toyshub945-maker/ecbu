import pandas as pd
import json

def peek_exports():
    path1 = r"d:\Wokrflow app\Tiktok app export 1.xlsx"
    path2 = r"d:\Wokrflow app\work flow app export 1.xlsx"
    
    def peek(path):
        print(f"\n=== PEEKING {path} ===")
        df = pd.read_excel(path, sheet_name="Template", nrows=10)
        print("Columns found in first read:")
        print(json.dumps(df.columns.tolist(), ensure_ascii=True))
        print("\nFirst 10 rows (values):")
        for i, row in df.iterrows():
            print(f"Row {i}: {json.dumps(row.tolist(), ensure_ascii=True)}")

    peek(path1)
    peek(path2)

if __name__ == "__main__":
    peek_exports()
