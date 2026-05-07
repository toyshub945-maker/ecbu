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

def list_wiki_nodes():
    # We need the Space ID. We can get it from get_node or resolve_wiki
    wiki_token = config.FEISHU_WIKI_TOKEN
    token = _get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Get info about the wiki token
    url = f"https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token={wiki_token}"
    r = requests.get(url, headers=headers)
    node_data = r.json().get("data", {}).get("node", {})
    space_id = node_data.get("space_id")
    
    print(f"Space ID: {space_id}")
    
    # 2. List all nodes in that space
    nodes_url = f"https://open.feishu.cn/open-apis/wiki/v2/spaces/{space_id}/nodes"
    r = requests.get(nodes_url, headers=headers)
    nodes = r.json().get("data", {}).get("items", [])
    
    print(f"Total nodes in space: {len(nodes)}")
    print(json.dumps(nodes, indent=2, ensure_ascii=True))

if __name__ == "__main__":
    list_wiki_nodes()
