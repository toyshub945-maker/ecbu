from app import feishu, config

def search_sku():
    target = "RS24A16491-BLACK-7.5"
    found = False
    for sid in config.WAREHOUSE_SHEET_IDS:
        print(f"Checking {sid}...")
        try:
            data = feishu.fetch_wiki_sheet_data(sid)
            for rec in data:
                if target in str(rec['fields']).upper():
                    print(f"FOUND in sheet {sid}")
                    print(rec['fields'])
                    found = True
                    break
        except Exception as e:
            print(f"Error checking {sid}: {e}")
        if found: break
    
    if not found:
        print(f"SKU {target} NOT FOUND in any of the {len(config.WAREHOUSE_SHEET_IDS)} sheets.")

if __name__ == "__main__":
    search_sku()
