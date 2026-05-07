import pandas as pd

def peek_old_warehouse():
    path = r"D:\St APP\Warehouse - Inventory - All Platform (2).xlsx"
    xl = pd.ExcelFile(path)
    df = xl.parse(xl.sheet_names[0])
    print(df.head(10))

if __name__ == "__main__":
    peek_old_warehouse()
