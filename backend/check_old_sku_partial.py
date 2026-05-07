import pandas as pd
import json

def check_old_output():
    path = r"D:\St APP\tt1 out put.xlsx"
    df_raw = pd.read_excel(path)
    header_idx = -1
    for i in range(15):
        if "Seller SKU" in str(df_raw.iloc[i].values):
            header_idx = i
            break
    if header_idx >= 0:
        df = pd.read_excel(path, header=header_idx + 1)
        # Partial match
        res = df[df.apply(lambda row: "MRS22A12054" in str(row.values), axis=1)]
        if not res.empty:
            # Only print a few columns to avoid mess
            print(json.dumps(res.head(5).to_dict(orient='records'), indent=2, default=str))
        else:
            print("SKU not found in old output.")
    else:
        print("Header not found.")

if __name__ == "__main__":
    check_old_output()
