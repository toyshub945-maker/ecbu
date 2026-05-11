"use client";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";

function backendUrl(path: string) {
  const h = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const host = (h === "localhost" || /^127\./.test(h) || /^192\.168\./.test(h) || /^10\./.test(h)) ? h : "localhost";
  return `http://${host}:8000${path}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SkuRow = {
  product_no: string;
  sku: string;
  tt1_orders: number;
  tt2_orders: number;
  tt3_orders: number;
  tt4_orders: number;
  total_orders: number;
  current_stock: number;
  sku_quota_rate: number;
  selling_price: number;
  profit_margin: number;
  rr_rate: number;
  // source indicators
  stock_source?: "warehouse_db" | "excel";
  price_source?: "products_db" | "excel";
  margin_source?: "pricing_db" | "excel";
  rr_source?: "rr_db" | "excel";
};

type MonthAllocation = {
  id: string;
  label: string;
  pct: number;
};

type ParsedData = {
  grand_total: number;
  sku_count: number;
  product_count: number;
  skus: SkuRow[];
};

type ErpUpload = {
  id: number;
  filename: string;
  period_label: string;
  row_count: number;
  sku_count: number;
  imported_at: string;
};

// ─── Default months ───────────────────────────────────────────────────────────

const DEFAULT_MONTHS: MonthAllocation[] = [
  { id: "jun", label: "Jun", pct: 40 },
  { id: "jul", label: "Jul", pct: 30 },
  { id: "aug", label: "Aug", pct: 25 },
  { id: "sep", label: "Sep", pct: 30 },
  { id: "oct", label: "Oct", pct: 35 },
  { id: "nov", label: "Nov", pct: 40 },
  { id: "dec", label: "Dec", pct: 10 },
  { id: "jan", label: "Jan", pct: 4 },
  { id: "feb", label: "Feb", pct: 4 },
];

const ALL_MONTHS = [
  { id: "jan", label: "Jan" },
  { id: "feb", label: "Feb" },
  { id: "mar", label: "Mar" },
  { id: "apr", label: "Apr" },
  { id: "may", label: "May" },
  { id: "jun", label: "Jun" },
  { id: "jul", label: "Jul" },
  { id: "aug", label: "Aug" },
  { id: "sep", label: "Sep" },
  { id: "oct", label: "Oct" },
  { id: "nov", label: "Nov" },
  { id: "dec", label: "Dec" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function fmtNum(n: number, dec = 1) {
  if (n === 0) return "0";
  return n.toFixed(dec).replace(/\.0$/, "");
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockPredictionPage() {
  const { theme: t } = useTheme();

  // ── Settings ─────────────────────────────────────────────────────────────
  const [dailyPrediction, setDailyPrediction] = useState(60);
  const [predictionDays, setPredictionDays] = useState(90);
  const [months, setMonths] = useState<MonthAllocation[]>(DEFAULT_MONTHS);
  const [showAddMonth, setShowAddMonth] = useState(false);

  // ── Data source mode ──────────────────────────────────────────────────────
  const [dataSource, setDataSource] = useState<"excel" | "erp">("erp");

  // ── Restock Excel data ────────────────────────────────────────────────────
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── ERP uploads ───────────────────────────────────────────────────────────
  const [erpUploads, setErpUploads] = useState<ErpUpload[]>([]);
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<number>>(new Set());
  const [erpLoading, setErpLoading] = useState(false);
  const [erpUploading, setErpUploading] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [erpData, setErpData] = useState<ParsedData | null>(null);
  const [erpFetching, setErpFetching] = useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [showTTCols, setShowTTCols] = useState(true);

  const fileInput = useRef<HTMLInputElement>(null);
  const erpFileInput = useRef<HTMLInputElement>(null);

  // ── Active data (whichever source is selected) ───────────────────────────
  const activeData = dataSource === "erp" ? erpData : parsedData;

  // ── Derived data ──────────────────────────────────────────────────────────
  const grandTotal = activeData?.grand_total ?? 0;

  const filteredSkus = useMemo(() => {
    if (!activeData) return [];
    let skus = activeData.skus;
    if (selectedProduct !== "all") {
      skus = skus.filter(s => (s.product_no || s.sku.split("-")[0]) === selectedProduct);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      skus = skus.filter(s => s.sku.toLowerCase().includes(q) || (s.product_no || "").toLowerCase().includes(q));
    }
    return skus;
  }, [activeData, selectedProduct, searchTerm]);

  const productNos = useMemo(() => {
    if (!activeData) return [];
    return [...new Set(activeData.skus.map(s => s.product_no || s.sku.split("-")[0]))].sort();
  }, [activeData]);

  // Group for display
  const groupedSkus = useMemo(() => {
    const groups: Record<string, SkuRow[]> = {};
    for (const sku of filteredSkus) {
      const key = sku.product_no || sku.sku.split("-")[0];
      if (!groups[key]) groups[key] = [];
      groups[key].push(sku);
    }
    return groups;
  }, [filteredSkus]);

  // ── Compute prediction for a row ──────────────────────────────────────────
  const computeRow = useCallback((sku: SkuRow) => {
    const quota = grandTotal > 0 ? sku.total_orders / grandTotal : 0;
    const expected = dailyPrediction * predictionDays * quota;
    const monthPredictions = months.map(m => ({
      label: m.label,
      value: expected * m.pct / 100,
    }));
    return { quota, expected, monthPredictions };
  }, [grandTotal, dailyPrediction, predictionDays, months]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleFileUpload(file: File) {
    setLoading(true);
    setError(null);
    setParsedData(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(backendUrl("/api/stock-prediction/upload"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.detail || "Upload failed");
      }
      const data: ParsedData = await res.json();
      setParsedData(data);
      // Expand all products by default
      setExpandedProducts(new Set(data.skus.map(s => s.product_no)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  // ── ERP handlers ──────────────────────────────────────────────────────────

  async function fetchErpUploads() {
    setErpLoading(true);
    try {
      const res = await fetch(backendUrl("/api/erp-orders/uploads"));
      const data = await res.json();
      setErpUploads(data.uploads || []);
    } finally {
      setErpLoading(false);
    }
  }

  useEffect(() => { fetchErpUploads(); }, []);

  async function handleErpUpload(file: File) {
    if (!periodLabel.trim()) { setError("Please enter a period label (e.g. 2025 Full Year)"); return; }
    setErpUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("period_label", periodLabel.trim());
    try {
      const res = await fetch(backendUrl("/api/erp-orders/upload"), { method: "POST", body: form });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Upload failed"); }
      const newUpload: ErpUpload = await res.json();
      setErpUploads(prev => [newUpload, ...prev]);
      setSelectedUploadIds(prev => new Set([...prev, newUpload.id]));
      setPeriodLabel("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ERP upload failed");
    } finally {
      setErpUploading(false);
    }
  }

  async function handleErpDelete(id: number) {
    await fetch(backendUrl(`/api/erp-orders/uploads/${id}`), { method: "DELETE" });
    setErpUploads(prev => prev.filter(u => u.id !== id));
    setSelectedUploadIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (erpData) setErpData(null);
  }

  async function loadErpData() {
    setErpFetching(true);
    setError(null);
    try {
      const ids = [...selectedUploadIds].join(",");
      const res = await fetch(backendUrl(`/api/erp-orders/sku-summary?upload_ids=${ids}`));
      if (!res.ok) throw new Error("Failed to load ERP data");
      const data: ParsedData = await res.json();
      setErpData(data);
      setExpandedProducts(new Set(data.skus.map(s => s.product_no || s.sku.split("-")[0])));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setErpFetching(false);
    }
  }

  async function handleExport() {
    if (!activeData) return;
    setExporting(true);
    try {
      const res = await fetch(backendUrl("/api/stock-prediction/export"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus: activeData.skus,
          months: months.map(m => ({ label: m.label, pct: m.pct })),
          daily_prediction: dailyPrediction,
          prediction_days: predictionDays,
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stock_prediction.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function updateMonthPct(id: string, value: string) {
    const num = parseFloat(value);
    setMonths(prev => prev.map(m => m.id === id ? { ...m, pct: isNaN(num) ? 0 : num } : m));
  }

  function removeMonth(id: string) {
    setMonths(prev => prev.filter(m => m.id !== id));
  }

  function addMonth(base: { id: string; label: string }) {
    if (months.find(m => m.id === base.id)) return;
    setMonths(prev => [...prev, { id: base.id, label: base.label, pct: 0 }]);
    setShowAddMonth(false);
  }

  function toggleExpand(prod: string) {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(prod)) next.delete(prod);
      else next.add(prod);
      return next;
    });
  }

  const availableMonthsToAdd = ALL_MONTHS.filter(m => !months.find(existing => existing.id === m.id));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${t.t1}`}>📦 Stock Prediction</h1>
          <p className={`text-sm ${t.t3} mt-1`}>
            Upload restock demand Excel → set daily prediction & month % → view predicted stock needs
          </p>
        </div>
        {activeData && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            )}
            Export Excel
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── LEFT: Settings Panel ────────────────────────────────────────── */}
        <div className="lg:w-72 shrink-0 space-y-4">

          {/* Data Source Toggle */}
          <div className={`${t.card} rounded-xl border ${t.divider} p-1 flex gap-1`}>
            <button
              onClick={() => setDataSource("erp")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                dataSource === "erp" ? "bg-blue-600 text-white shadow" : `${t.t3}`
              }`}
            >
              📦 ERP Orders
            </button>
            <button
              onClick={() => setDataSource("excel")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                dataSource === "excel" ? "bg-purple-600 text-white shadow" : `${t.t3}`
              }`}
            >
              📊 Restock Excel
            </button>
          </div>

          {/* ── ERP Upload Panel ───────────────────────────────────────────── */}
          {dataSource === "erp" && (
            <div className={`${t.card} rounded-xl border ${t.divider} p-4 space-y-3`}>
              <h3 className={`text-sm font-bold ${t.t1} flex items-center gap-2`}>
                <span>📦</span> ERP Order Files
              </h3>
              <p className={`text-[10px] ${t.t4}`}>
                Upload TikTok ERP order exports. You can upload multiple files (last year, this year, etc.) and select which ones to include.
              </p>

              {/* Period label + upload */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Period label (e.g. 2025 Full Year)"
                  value={periodLabel}
                  onChange={e => setPeriodLabel(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${t.divider} ${t.card} ${t.t1} text-xs focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <input
                  type="file"
                  ref={erpFileInput}
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleErpUpload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => erpFileInput.current?.click()}
                  disabled={erpUploading || !periodLabel.trim()}
                  className={`w-full py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    periodLabel.trim() && !erpUploading
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : `${t.page} ${t.t4} cursor-not-allowed border ${t.divider}`
                  }`}
                >
                  {erpUploading ? (
                    <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Uploading...</>
                  ) : "Upload ERP File"}
                </button>
              </div>

              {/* Upload history */}
              {erpLoading ? (
                <div className={`text-xs ${t.t4} text-center py-2`}>Loading...</div>
              ) : erpUploads.length === 0 ? (
                <div className={`text-xs ${t.t4} text-center py-2 border ${t.divider} rounded-lg`}>No uploads yet</div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {erpUploads.map(u => (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUploadIds(prev => {
                        const n = new Set(prev);
                        if (n.has(u.id)) n.delete(u.id); else n.add(u.id);
                        return n;
                      })}
                      className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                        selectedUploadIds.has(u.id)
                          ? "border-blue-400 bg-blue-50"
                          : `${t.page} border-transparent hover:border-blue-200`
                      }`}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={selectedUploadIds.has(u.id)}
                        className="mt-0.5 shrink-0"
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold ${selectedUploadIds.has(u.id) ? "text-blue-700" : t.t2} truncate`}>
                          {u.period_label}
                        </div>
                        <div className={`text-[10px] ${t.t4}`}>
                          {u.sku_count} SKUs · {u.row_count.toLocaleString()} orders
                        </div>
                        <div className={`text-[9px] ${t.t5}`}>{u.filename}</div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleErpDelete(u.id); }}
                        className="text-red-400 hover:text-red-600 transition-colors shrink-0 mt-0.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Load button */}
              <button
                onClick={loadErpData}
                disabled={selectedUploadIds.size === 0 || erpFetching}
                className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  selectedUploadIds.size > 0 && !erpFetching
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow"
                    : `${t.page} ${t.t4} cursor-not-allowed border ${t.divider}`
                }`}
              >
                {erpFetching ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Loading...</>
                ) : `Load Prediction (${selectedUploadIds.size} file${selectedUploadIds.size !== 1 ? "s" : ""})`}
              </button>

              {erpData && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                  <div className="font-semibold">✓ {erpData.sku_count} SKUs loaded</div>
                  <div className="text-emerald-700 mt-0.5">{erpData.product_count} products · {erpData.grand_total.toLocaleString()} total orders</div>
                </div>
              )}
            </div>
          )}

          {/* ── Restock Excel Upload ───────────────────────────────────────── */}
          {dataSource === "excel" && (
          <div className={`${t.card} rounded-xl border ${t.divider} p-4`}>
            <h3 className={`text-sm font-bold ${t.t1} mb-3 flex items-center gap-2`}>
              <span>📂</span> Upload Restock Excel
            </h3>
            <input
              type="file"
              ref={fileInput}
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={loading}
              className={`w-full py-3 rounded-lg border-2 border-dashed text-sm font-medium transition-all flex flex-col items-center gap-1.5 ${
                loading
                  ? `${t.page} ${t.t4} cursor-not-allowed`
                  : `border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400`
              }`}
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span>Parsing...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                  </svg>
                  <span>Upload Restock Excel</span>
                  <span className={`text-xs ${t.t4}`}>.xlsx format</span>
                </>
              )}
            </button>
            {parsedData && (
              <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                <div className="font-semibold">✓ Loaded successfully</div>
                <div className="mt-1 space-y-0.5 text-emerald-700">
                  <div>Products: <strong>{parsedData.product_count}</strong></div>
                  <div>SKUs: <strong>{parsedData.sku_count}</strong></div>
                  <div>Total Orders: <strong>{parsedData.grand_total.toLocaleString()}</strong></div>
                </div>
                {/* Data source summary */}
                <div className="mt-2 pt-2 border-t border-emerald-200 space-y-1">
                  <div className="font-semibold text-emerald-800">Data Sources:</div>
                  {(() => {
                    const wh = parsedData.skus.filter(s => s.stock_source === "warehouse_db").length;
                    const pr = parsedData.skus.filter(s => s.price_source === "products_db").length;
                    const mg = parsedData.skus.filter(s => s.margin_source === "pricing_db").length;
                    return (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${wh > 0 ? "bg-emerald-500" : "bg-gray-400"}`}/>
                          <span>Now Stock: {wh > 0 ? `${wh} SKUs from Warehouse DB` : "from Excel"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${pr > 0 ? "bg-blue-500" : "bg-gray-400"}`}/>
                          <span>Price: {pr > 0 ? `${pr} SKUs from Products DB` : "from Excel"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${mg > 0 ? "bg-violet-500" : "bg-gray-400"}`}/>
                          <span>Profit Margin: {mg > 0 ? `${mg} SKUs from Pricing tab` : "from Excel"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-orange-400"/>
                          <span>R&R Rate: from Excel</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Prediction Settings */}
          <div className={`${t.card} rounded-xl border ${t.divider} p-4`}>
            <h3 className={`text-sm font-bold ${t.t1} mb-3 flex items-center gap-2`}>
              <span>⚙️</span> Prediction Settings
            </h3>
            <div className="space-y-3">
              <div>
                <label className={`text-xs font-medium ${t.t3} block mb-1`}>Orders / Day</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={dailyPrediction}
                    min={1}
                    max={9999}
                    onChange={e => setDailyPrediction(Number(e.target.value) || 0)}
                    className={`flex-1 px-3 py-2 rounded-lg border ${t.divider} ${t.card} ${t.t1} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  <span className={`text-xs ${t.t4} shrink-0`}>orders/day</span>
                </div>
              </div>
              <div>
                <label className={`text-xs font-medium ${t.t3} block mb-1`}>Prediction Window</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={predictionDays}
                    min={1}
                    max={730}
                    onChange={e => setPredictionDays(Number(e.target.value) || 0)}
                    className={`flex-1 px-3 py-2 rounded-lg border ${t.divider} ${t.card} ${t.t1} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  <span className={`text-xs ${t.t4} shrink-0`}>days total</span>
                </div>
                <div className={`text-[10px] ${t.t4} mt-1`}>
                  ≈ {(predictionDays / 30).toFixed(1)} months &nbsp;·&nbsp;
                  Total demand = {(dailyPrediction * predictionDays).toLocaleString()} orders
                </div>
              </div>
            </div>
          </div>

          {/* Month Allocations */}
          <div className={`${t.card} rounded-xl border ${t.divider} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-bold ${t.t1} flex items-center gap-2`}>
                <span>📅</span> Month %
              </h3>
              <button
                onClick={() => setShowAddMonth(v => !v)}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
              >
                + Add
              </button>
            </div>

            {showAddMonth && availableMonthsToAdd.length > 0 && (
              <div className={`mb-3 p-2 ${t.page} rounded-lg border ${t.divider}`}>
                <div className={`text-[10px] ${t.t4} mb-1.5 font-medium`}>Select month to add:</div>
                <div className="flex flex-wrap gap-1">
                  {availableMonthsToAdd.map(m => (
                    <button
                      key={m.id}
                      onClick={() => addMonth(m)}
                      className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {months.map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className={`w-8 text-xs font-semibold ${t.t2} shrink-0`}>{m.label}</span>
                  <input
                    type="number"
                    value={m.pct}
                    min={0}
                    max={200}
                    step={1}
                    onChange={e => updateMonthPct(m.id, e.target.value)}
                    className={`flex-1 px-2 py-1.5 rounded-lg border ${t.divider} ${t.card} ${t.t1} text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  <span className={`text-xs ${t.t4} shrink-0`}>%</span>
                  <button
                    onClick={() => removeMonth(m.id)}
                    className={`${t.t4} hover:text-red-500 transition-colors shrink-0`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Formula preview */}
            <div className={`mt-3 p-2 rounded-lg ${t.page} border ${t.divider} text-[10px] ${t.t4} font-mono`}>
              Expected = {dailyPrediction} × {predictionDays} × quota<br />
              Month = Expected × %
            </div>
          </div>
        </div>

        {/* ── RIGHT: Results Table ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          {!activeData && !loading && !erpFetching && (
            <div className={`${t.card} rounded-xl border ${t.divider} p-12 flex flex-col items-center gap-4 text-center`}>
              <div className="text-5xl">📊</div>
              <div>
                <div className={`text-base font-semibold ${t.t1}`}>Upload your restock demand Excel</div>
                <div className={`text-sm ${t.t3} mt-1`}>
                  The Excel should have sheets named like "Restock Demand template 217"<br />
                  with columns: SKU | TT1-Orders | TT2-Orders | TT3-Orders | TT4-Orders | Total Orders | Now Stock
                </div>
              </div>
              <div className={`text-xs ${t.t4} max-w-sm`}>
                Formula used: <strong>Expected Demand</strong> = Orders/Day × Prediction Days × SKU Quota Rate
              </div>
            </div>
          )}

          {activeData && (
            <>
              {/* Filter bar */}
              <div className={`${t.card} rounded-xl border ${t.divider} p-3 mb-3 flex flex-wrap gap-3 items-center`}>
                <input
                  type="text"
                  placeholder="Search SKU..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className={`flex-1 min-w-32 px-3 py-1.5 rounded-lg border ${t.divider} ${t.card} ${t.t1} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <select
                  value={selectedProduct}
                  onChange={e => setSelectedProduct(e.target.value)}
                  className={`px-3 py-1.5 rounded-lg border ${t.divider} ${t.card} ${t.t1} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="all">All Products ({activeData.product_count})</option>
                  {productNos.map(p => (
                    <option key={p} value={p}>Product {p}</option>
                  ))}
                </select>
                <label className={`flex items-center gap-1.5 text-xs ${t.t3} cursor-pointer select-none`}>
                  <input
                    type="checkbox"
                    checked={showTTCols}
                    onChange={e => setShowTTCols(e.target.checked)}
                    className="rounded"
                  />
                  Show TT1-TT4
                </label>
                <button
                  onClick={() => setExpandedProducts(new Set(Object.keys(groupedSkus)))}
                  className={`text-xs px-2 py-1 rounded-lg ${t.page} border ${t.divider} ${t.t3} hover:${t.t1} transition-colors`}
                >
                  Expand All
                </button>
                <button
                  onClick={() => setExpandedProducts(new Set())}
                  className={`text-xs px-2 py-1 rounded-lg ${t.page} border ${t.divider} ${t.t3} hover:${t.t1} transition-colors`}
                >
                  Collapse All
                </button>
                <span className={`text-xs ${t.t4} ml-auto`}>
                  {filteredSkus.length} SKUs shown
                </span>
              </div>

              {/* Table */}
              <div className={`${t.card} rounded-xl border ${t.divider} overflow-hidden`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className={`${t.page} border-b ${t.divider}`}>
                        <th className={`sticky left-0 z-10 ${t.page} px-3 py-2.5 text-left font-semibold ${t.t2} border-r ${t.divider}`}>
                          SKU
                        </th>
                        {showTTCols && (
                          <>
                            <th className={`px-3 py-2.5 text-right font-semibold ${t.t2}`}>TT1</th>
                            <th className={`px-3 py-2.5 text-right font-semibold ${t.t2}`}>TT2</th>
                            <th className={`px-3 py-2.5 text-right font-semibold ${t.t2}`}>TT3</th>
                            <th className={`px-3 py-2.5 text-right font-semibold ${t.t2}`}>TT4</th>
                          </>
                        )}
                        <th className={`px-3 py-2.5 text-right font-semibold ${t.t2}`}>Total Orders</th>
                        <th className={`px-3 py-2.5 text-right font-semibold ${t.t2}`}>Quota %</th>
                        <th className={`px-3 py-2.5 text-right font-semibold ${t.t2} whitespace-nowrap`}>
                          Now Stock
                          <span className="ml-1 text-[9px] text-emerald-600 font-normal">🏠WH</span>
                        </th>
                        <th className={`px-3 py-2.5 text-right font-semibold text-blue-600 border-l ${t.divider}`}>
                          Expected Demand
                        </th>
                        {months.map(m => (
                          <th
                            key={m.id}
                            className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap`}
                            style={{ color: m.pct > 0 ? "#7c3aed" : undefined }}
                          >
                            {m.label} ({m.pct}%)
                          </th>
                        ))}
                        <th className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap border-l ${t.divider}`} style={{ color: "#0891b2" }}>
                          Selling Price
                          <span className="ml-1 text-[9px] font-normal">💰</span>
                        </th>
                        <th className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap`} style={{ color: "#059669" }}>
                          Profit %
                        </th>
                        <th className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap`} style={{ color: "#dc2626" }}>
                          R&R %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(groupedSkus).map(([prodKey, prodSkus]) => {
                        const prodNo = prodKey;
                        const isExpanded = expandedProducts.has(prodNo);
                        const prodTotalOrders = prodSkus.reduce((s, r) => s + r.total_orders, 0);
                        const prodQuota = grandTotal > 0 ? prodTotalOrders / grandTotal : 0;
                        const prodExpected = dailyPrediction * predictionDays * prodQuota;

                        return [
                          // Product header row
                          <tr
                            key={`hdr-${prodNo}`}
                            onClick={() => toggleExpand(prodNo)}
                            className={`cursor-pointer select-none border-b ${t.divider}`}
                            style={{ background: "rgba(59,130,246,0.08)" }}
                          >
                            <td
                              className={`sticky left-0 z-10 px-3 py-2 font-bold ${t.t1} border-r ${t.divider} flex items-center gap-2`}
                              style={{ background: "rgba(59,130,246,0.08)" }}
                            >
                              <span className="text-blue-500">
                                {isExpanded ? "▼" : "▶"}
                              </span>
                              <span>Product {prodNo}</span>
                              <span className={`text-[10px] font-normal ${t.t4}`}>
                                ({prodSkus.length} SKUs)
                              </span>
                            </td>
                            {showTTCols && (
                              <>
                                <td className={`px-3 py-2 text-right font-semibold ${t.t2}`}>
                                  {prodSkus.reduce((s, r) => s + r.tt1_orders, 0).toLocaleString()}
                                </td>
                                <td className={`px-3 py-2 text-right font-semibold ${t.t2}`}>
                                  {prodSkus.reduce((s, r) => s + r.tt2_orders, 0).toLocaleString()}
                                </td>
                                <td className={`px-3 py-2 text-right font-semibold ${t.t2}`}>
                                  {prodSkus.reduce((s, r) => s + r.tt3_orders, 0).toLocaleString()}
                                </td>
                                <td className={`px-3 py-2 text-right font-semibold ${t.t2}`}>
                                  {prodSkus.reduce((s, r) => s + r.tt4_orders, 0).toLocaleString()}
                                </td>
                              </>
                            )}
                            <td className={`px-3 py-2 text-right font-bold ${t.t1}`}>
                              {prodTotalOrders.toLocaleString()}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${t.t2}`}>
                              {(prodQuota * 100).toFixed(2)}%
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${t.t2}`}>
                              {prodSkus.reduce((s, r) => s + r.current_stock, 0).toLocaleString()}
                            </td>
                            <td className={`px-3 py-2 text-right font-bold text-blue-600 border-l ${t.divider}`}>
                              {fmtNum(prodExpected, 0)}
                            </td>
                            {months.map(m => (
                              <td key={m.id} className={`px-3 py-2 text-right font-semibold`} style={{ color: "#7c3aed" }}>
                                {fmtNum(prodExpected * m.pct / 100, 0)}
                              </td>
                            ))}
                            {/* Avg selling price for product */}
                            <td className={`px-3 py-2 text-right font-semibold border-l ${t.divider}`} style={{ color: "#0891b2" }}>
                              {(() => {
                                const prices = prodSkus.map(s => s.selling_price).filter(p => p > 0);
                                return prices.length > 0 ? `$${(prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2)}` : "—";
                              })()}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold`} style={{ color: "#059669" }}>
                              {(() => {
                                const margins = prodSkus.map(s => s.profit_margin).filter(p => p > 0);
                                return margins.length > 0 ? `${(margins.reduce((a,b)=>a+b,0)/margins.length*100).toFixed(1)}%` : "—";
                              })()}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold`} style={{ color: "#dc2626" }}>
                              {(() => {
                                const rates = prodSkus.map(s => s.rr_rate).filter(p => p > 0);
                                return rates.length > 0 ? `${(rates.reduce((a,b)=>a+b,0)/rates.length*100).toFixed(1)}%` : "—";
                              })()}
                            </td>
                          </tr>,

                          // SKU rows (only if expanded)
                          ...(isExpanded ? prodSkus.map((sku, i) => {
                            const { quota, expected, monthPredictions } = computeRow(sku);
                            const isOdd = i % 2 === 1;
                            return (
                              <tr
                                key={`${prodNo}-${sku.sku}`}
                                className={`border-b ${t.divider} ${isOdd ? t.page : ""}`}
                              >
                                <td className={`sticky left-0 z-10 px-3 py-2 pl-8 font-medium ${t.t2} border-r ${t.divider} ${isOdd ? t.page : t.card}`}>
                                  {sku.sku}
                                </td>
                                {showTTCols && (
                                  <>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{sku.tt1_orders || "-"}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{sku.tt2_orders || "-"}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{sku.tt3_orders || "-"}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{sku.tt4_orders || "-"}</td>
                                  </>
                                )}
                                <td className={`px-3 py-2 text-right font-medium ${t.t1}`}>
                                  {sku.total_orders.toLocaleString()}
                                </td>
                                <td className={`px-3 py-2 text-right ${t.t3}`}>
                                  {(quota * 100).toFixed(3)}%
                                </td>
                                <td className={`px-3 py-2 text-right ${t.t3}`}>
                                  <StockCell stock={sku.current_stock} expected={expected} />
                                </td>
                                <td className={`px-3 py-2 text-right font-semibold text-blue-600 border-l ${t.divider}`}>
                                  {expected > 0 ? fmtNum(expected) : <span className="text-red-400 text-[10px]">—</span>}
                                </td>
                                {monthPredictions.map(mp => (
                                  <td key={mp.label} className="px-3 py-2 text-right" style={{ color: mp.value > 0 ? "#7c3aed" : undefined }}>
                                    {mp.value > 0 ? fmtNum(mp.value) : <span className={`${t.t5} text-[10px]`}>—</span>}
                                  </td>
                                ))}
                                {/* Selling Price */}
                                <td className={`px-3 py-2 text-right border-l ${t.divider}`}>
                                  {sku.selling_price > 0 ? (
                                    <span style={{ color: "#0891b2" }}>
                                      ${sku.selling_price.toFixed(2)}
                                      {sku.price_source === "products_db" && (
                                        <span className="ml-1 text-[9px] text-emerald-600">●</span>
                                      )}
                                    </span>
                                  ) : <span className={`${t.t5} text-[10px]`}>—</span>}
                                </td>
                                {/* Profit Margin */}
                                <td className="px-3 py-2 text-right">
                                  {sku.profit_margin > 0 ? (
                                    <span style={{ color: "#059669" }}>
                                      {(sku.profit_margin * 100).toFixed(1)}%
                                      {sku.margin_source === "pricing_db" && (
                                        <span className="ml-1 text-[9px] text-violet-500">●</span>
                                      )}
                                    </span>
                                  ) : <span className={`${t.t5} text-[10px]`}>—</span>}
                                </td>
                                {/* R&R Rate */}
                                <td className="px-3 py-2 text-right">
                                  {sku.rr_rate > 0 ? (
                                    <RRCell rate={sku.rr_rate} source={sku.rr_source} />
                                  ) : <span className={`${t.t5} text-[10px]`}>—</span>}
                                </td>
                              </tr>
                            );
                          }) : []),
                        ].flat();
                      })}
                    </tbody>

                    {/* Grand total footer */}
                    <tfoot>
                      <tr className={`border-t-2 ${t.divider} font-bold`} style={{ background: "rgba(30,41,59,0.06)" }}>
                        <td className={`sticky left-0 z-10 px-3 py-2.5 ${t.t1} border-r ${t.divider}`} style={{ background: "rgba(30,41,59,0.06)" }}>
                          Grand Total
                        </td>
                        {showTTCols && (
                          <>
                            <td className={`px-3 py-2.5 text-right ${t.t1}`}>
                              {filteredSkus.reduce((s, r) => s + r.tt1_orders, 0).toLocaleString()}
                            </td>
                            <td className={`px-3 py-2.5 text-right ${t.t1}`}>
                              {filteredSkus.reduce((s, r) => s + r.tt2_orders, 0).toLocaleString()}
                            </td>
                            <td className={`px-3 py-2.5 text-right ${t.t1}`}>
                              {filteredSkus.reduce((s, r) => s + r.tt3_orders, 0).toLocaleString()}
                            </td>
                            <td className={`px-3 py-2.5 text-right ${t.t1}`}>
                              {filteredSkus.reduce((s, r) => s + r.tt4_orders, 0).toLocaleString()}
                            </td>
                          </>
                        )}
                        <td className={`px-3 py-2.5 text-right ${t.t1}`}>
                          {filteredSkus.reduce((s, r) => s + r.total_orders, 0).toLocaleString()}
                        </td>
                        <td className={`px-3 py-2.5 text-right ${t.t1}`}>100%</td>
                        <td className={`px-3 py-2.5 text-right ${t.t1}`}>
                          {filteredSkus.reduce((s, r) => s + r.current_stock, 0).toLocaleString()}
                        </td>
                        <td className={`px-3 py-2.5 text-right text-blue-600 border-l ${t.divider}`}>
                          {fmtNum(dailyPrediction * predictionDays, 0)}
                        </td>
                        {months.map(m => (
                          <td key={m.id} className="px-3 py-2.5 text-right" style={{ color: "#7c3aed" }}>
                            {fmtNum(dailyPrediction * predictionDays * m.pct / 100, 0)}
                          </td>
                        ))}
                        <td className={`px-3 py-2.5 text-right border-l ${t.divider} ${t.t4}`}>—</td>
                        <td className={`px-3 py-2.5 text-right ${t.t4}`}>—</td>
                        <td className={`px-3 py-2.5 text-right ${t.t4}`}>—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── R&R cell — color-coded by rate ──────────────────────────────────────────

function RRCell({ rate, source }: { rate: number; source?: string }) {
  const pct = rate * 100;
  let color = "#059669"; // green < 10%
  if (pct >= 20) color = "#dc2626";
  else if (pct >= 10) color = "#d97706";
  return (
    <span style={{ color }}>
      {pct.toFixed(1)}%
      {source === "rr_db" && <span className="ml-1 text-[9px] text-emerald-600">●</span>}
    </span>
  );
}

// ─── Stock cell — color-coded if below expected demand ────────────────────────

function StockCell({ stock, expected }: { stock: number; expected: number }) {
  if (stock === 0) {
    return <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">0</span>;
  }
  if (expected > 0 && stock < expected * 0.5) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">
        {stock}
      </span>
    );
  }
  if (expected > 0 && stock < expected) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-700">
        {stock}
      </span>
    );
  }
  return <span>{stock || "-"}</span>;
}
