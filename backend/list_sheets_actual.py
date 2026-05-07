from app import feishu, config
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

def list_sheets():
    spreadsheet_token = "OqPust3BwhHVp0taenDcqJtTnj3"
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    url = f"https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query"
    r = requests.get(url, headers=headers)
    data = r.json()
    
    print(json.dumps(data, indent=2, ensure_ascii=True))

if __name__ == "__main__":
    list_sheets()
