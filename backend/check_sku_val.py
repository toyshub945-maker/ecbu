import pandas as pd
import json

def check_sku_val():
    path = r"D:\St APP\tt1 out put.xlsx"
    df = pd.read_excel(path, header=3)
    res = df[df.iloc[:, 14] == "STP0450-Brown-6"]
    print(json.dumps(res.to_dict(orient='records'), indent=2, default=str))

if __name__ == "__main__":
    check_sku_val()
