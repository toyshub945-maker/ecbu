import pandas as pd
import numpy as np

def check_sums():
    path = r"d:\Wokrflow app\Tiktok app export 1.xlsx"
    df = pd.read_excel(path, sheet_name="Template", header=1)
    
    # Columns 7 to 13 are the warehouse quantities
    cols = df.columns[7:14]
    print(f"Columns: {cols.tolist()}")
    
    for col in cols:
        # Convert to numeric, errors='coerce' turns strings to NaN
        nums = pd.to_numeric(df[col], errors='coerce').fillna(0)
        total = nums.sum()
        print(f"Total in {col}: {total}")

if __name__ == "__main__":
    check_sums()
