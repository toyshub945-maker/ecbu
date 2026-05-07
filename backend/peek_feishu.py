from app import warehouse, feishu, config
import json

def peek_feishu_sheets():
    # Only peek at the first 3 sheets to save time
    spreadsheet_token, _ = warehouse.resolve_wiki_to_spreadsheet_token(config.FEISHU_WIKI_TOKEN)
    records = feishu._fetch_all_records() # This fetches everything, might be slow but okay
    
    sheet_samples = {}
    for rec in records:
        sid = rec.get("sheet_id")
        if sid not in sheet_samples:
            sheet_samples[sid] = rec.get("fields", {})
        if len(sheet_samples) >= 14:
            break
            
    print("SAMPLES FROM SHEETS:")
    print(json.dumps(sheet_samples, indent=2, ensure_ascii=True))

if __name__ == "__main__":
    peek_feishu_sheets()
