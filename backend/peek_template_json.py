import win32com.client
import os
import json

def peek_template_win32():
    path = os.path.abspath(r"D:\St APP\CYNLLIO\Tiktoksellercenter_batchedit_20260402_sales_information_template(2).xlsx")
    excel = win32com.client.Dispatch("Excel.Application")
    excel.Visible = False
    try:
        wb = excel.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws = wb.Sheets(1)
        labels = []
        for c in range(1, 50):
            labels.append(str(ws.Cells(3, c).Value or ""))
        print(json.dumps(labels, ensure_ascii=True))
        wb.Close(False)
    finally:
        excel.Quit()

if __name__ == "__main__":
    peek_template_win32()
