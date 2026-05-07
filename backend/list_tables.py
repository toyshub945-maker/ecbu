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

def list_bitable_tables():
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{config.FEISHU_APP_TOKEN}/tables"
    r = requests.get(url, headers=headers)
    tables = r.json().get("data", {}).get("items", [])
    
    print(f"Total Tables in Bitable: {len(tables)}")
    print(json.dumps(tables, indent=2, ensure_ascii=True))

if __name__ == "__main__":
    list_bitable_tables()
