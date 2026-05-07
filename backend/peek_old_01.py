import pandas as pd

def peek_old_warehouse_sheet_01():
    path = r"D:\St APP\Warehouse - Inventory - All Platform (2).xlsx"
    xl = pd.ExcelFile(path)
    if "01" in xl.sheet_names:
        df = xl.parse("01")
        print(df.head(10))
    else:
        print(f"Sheet 01 not found. Sheets: {xl.sheet_names}")

if __name__ == "__main__":
    peek_old_warehouse_sheet_01()
