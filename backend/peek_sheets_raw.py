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

def peek_spreadsheet_sheets():
    wiki_token = config.FEISHU_WIKI_TOKEN
    spreadsheet_token, _ = warehouse.resolve_wiki_to_spreadsheet_token(wiki_token)
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Get all sheet IDs
    sheets_url = f"https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query"
    r = requests.get(sheets_url, headers=headers)
    sheets = r.json().get("data", {}).get("sheets", [])
    
    sheet_samples = {}
    for s in sheets:
        title = s.get("title")
        sid = s.get("sheet_id")
        
        # 2. Fetch first 2 rows of each sheet
        # Range like "sheetId!1:2"
        data_url = f"https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{spreadsheet_token}/values/{sid}!1:2"
        r_data = requests.get(data_url, headers=headers)
        val_data = r_data.json().get("data", {}).get("valueRange", {}).get("values", [])
        
        sheet_samples[title] = val_data
        if len(sheet_samples) >= 15: break
            
    print("SAMPLES FROM SPREADSHEET SHEETS:")
    print(json.dumps(sheet_samples, indent=2, ensure_ascii=True))

if __name__ == "__main__":
    peek_spreadsheet_sheets()
