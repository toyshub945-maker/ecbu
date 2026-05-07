import pandas as pd

def peek_exports():
    path1 = r"d:\Wokrflow app\Tiktok app export 1.xlsx"
    path2 = r"d:\Wokrflow app\work flow app export 1.xlsx"
    
    def peek(path):
        print(f"\n=== PEEKING {path} ===")
        df = pd.read_excel(path, sheet_name="Template", nrows=10)
        # Print column names and first few rows
        print("Columns found in first read:")
        print(df.columns.tolist())
        print("\nFirst 5 rows (values):")
        for i, row in df.head(5).iterrows():
            print(f"Row {i}: {row.tolist()}")

    peek(path1)
    peek(path2)

if __name__ == "__main__":
    peek_exports()
