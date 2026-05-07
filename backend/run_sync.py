import os
import sys

sys.path.append('D:\\Wokrflow app\\workflow-dashboard\\backend')

from app import warehouse

try:
    print("Starting sync...")
    result = warehouse.sync_from_feishu()
    print("Sync complete:", result)
except Exception as e:
    print("CRASHED!")
    import traceback
    traceback.print_exc()
