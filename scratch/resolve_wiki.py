import requests
import os
import sys

# Add backend to path to import config
sys.path.append('backend')
from app import warehouse, config

wiki_token = "MTBiwKuoHi39GTkHlync5clHnTf"
try:
    ss_token, _ = warehouse.resolve_wiki_to_spreadsheet_token(wiki_token)
    print(f"Resolved Wiki Token {wiki_token} to Spreadsheet Token: {ss_token}")
    print(f"Direct Spreadsheet URL: https://h6uzyhsr1c.feishu.cn/sheets/{ss_token}")
except Exception as e:
    print(f"Error resolving: {e}")
