from app import warehouse, feishu, config
import json
import requests

def _get_tenant_token():
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    payload = {
        "app_id": config.FEISHU_APP_ID,
        "app_secret": config.FEISHU_APP_SECRET
    }
    r = requests.post(url, json=payload)
    return r.json().get("tenant_access_token")

def peek_sheet_01():
    wiki_token = config.FEISHU_WIKI_TOKEN
    spreadsheet_token, _ = warehouse.resolve_wiki_to_spreadsheet_token(wiki_token)
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Range A1:Z100
    data_url = f"https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{spreadsheet_token}/values/01!A1:Z100"
    r_data = requests.get(data_url, headers=headers)
    val_data = r_data.json().get("data", {}).get("valueRange", {}).get("values", [])
    
    print(f"Data from Sheet 01 (A1:Z100): {len(val_data)} rows")
    if val_data:
        for i, row in enumerate(val_data[:5]):
            print(f"Row {i}: {row}")

if __name__ == "__main__":
    peek_sheet_01()
