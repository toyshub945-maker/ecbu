import os
import sys

sys.path.append('D:\\Wokrflow app\\workflow-dashboard\\backend')

from app import warehouse

try:
    print("Testing get_summary...")
    summary = warehouse.get_summary()
    print("Summary:", summary)
except Exception as e:
    print("CRASHED get_summary!")
    import traceback
    traceback.print_exc()
