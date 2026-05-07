import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT_DIR / "data")))
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = os.environ.get("DB_PATH", str(DATA_DIR / "workflow.db"))

FEISHU_APP_ID     = os.environ.get("FEISHU_APP_ID",     "cli_a94e7db7283adceb")
FEISHU_APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "M0hgv3nGjfqYNAQLYh26DftptDejzlyZ")
FEISHU_APP_TOKEN  = os.environ.get("FEISHU_APP_TOKEN",  "DVpQbQaAYaExCbs76pockUyVnPb")
FEISHU_TABLE_ID   = os.environ.get("FEISHU_TABLE_ID",   "tblOdJ95QQM8matc")
FEISHU_WAREHOUSE_TABLE_ID = os.environ.get("FEISHU_WAREHOUSE_TABLE_ID", "zl0KJL")

# Feishu Wiki configuration (wiki-based sheets)
FEISHU_WIKI_TOKEN = os.environ.get("FEISHU_WIKI_TOKEN", "MTBiwKuoHi39GTkHlync5clHnTf")
WAREHOUSE_SHEET_IDS = [
    "zl0KJL", "FDZV3b", "TucMdN", "OMSX1O", "gLeauX",
    "S84caQ", "nYqHED", "Yn572b", "NrQ2eH", "rlyqSO",
    "325dlX", "anQDvm", "NByPZA", "E4L00d", "4xX70E"
]

SECRET_KEY                  = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")
ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

STORES = [
    {"code": "TK1", "name": "CELNEPHO"},
    {"code": "TK2", "name": "CYNLLIO"},
    {"code": "TK3", "name": "VIMISAOI"},
    {"code": "TK4", "name": "Mikarka"},
]
STORE_NAME_BY_CODE = {s["code"]: s["name"] for s in STORES}

TASK_TYPES = [
    "main_image",
    "description",
    "a_plus",
    "video",
    "title",
    "model_angles",
    "size_chart",
]

TASK_LABELS = {
    "main_image":   "Main Image",
    "description":  "Description",
    "a_plus":       "A+",
    "video":        "Video",
    "title":        "Title",
    "model_angles": "Model Angles",
    "size_chart":   "Size Chart",
}

# Excel column name → task type (handles slight variations between store sheets)
EXCEL_TASK_COLS = {
    "Main Image":    "main_image",
    "Description":   "description",
    "A+":            "a_plus",
    "Video":         "video",
    "Title ":        "title",
    "Title":         "title",
    "Titlle":        "title",
    "Model angles":  "model_angles",
    "Model Angle ":  "model_angles",
    "Model Angle":   "model_angles",
    "Size Chart":    "size_chart",
    "Size Detail":   "size_chart",
    "Size detail":   "size_chart",
}
