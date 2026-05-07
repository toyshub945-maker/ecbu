"use client";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

const STORES = [
  { code: "TK1", name: "CELNEPHO" },
  { code: "TK2", name: "CYNLLIO" },
  { code: "TK3", name: "VIMISAOI" },
  { code: "TK4", name: "Mikarka" },
];

interface Period {
  period_start: string;
  period_end: string;
  product_count: number;
  total_gmv: number;
  imported_at: string;
}

interface ExportRow {
  product_no: string;
  product_name: string;
  tiktok_product_id: string;
  listing_status: string;
  gmv_range: string;
  voc_diagnosis: string;
  gmv: number | null;
  orders: number | null;
  items_sold: number | null;
  impressions: number | null;
  ctr: number | null;
  add_to_cart: number | null;
  atc_rate: number | null;
  ctor: number | null;
  refunds: number | null;
  items_refunded: number | null;
  shop_tab_gmv: number | null;
  shop_tab_items_sold: number | null;
}

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return "–";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(decimals);
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return "–";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function pct(n: number | null | undefined) {
  if (n == null) return "–";
  return (n * 100).toFixed(2) + "%";
}

export default function TikTokExportPage() {
  const { theme: t } = useTheme();
  const [storeCode, setStoreCode] = useState("TK1");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; unmatched: number; period_start: string; period_end: string } | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<{ start: string; end: string } | null>(null);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchPeriods = async (sc: string) => {
    try {
      const data = await api.getTiktokExportList(sc);
      setPeriods(data.periods);
    } catch {
      setPeriods([]);
    }
  };

  useEffect(() => {
    fetchPeriods(storeCode);
    setSelectedPeriod(null);
    setRows([]);
  }, [storeCode]);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLogs(["Uploading file..."]);

    try {
      setLogs(prev => [...prev, "Parsing export and matching products..."]);
      const data = await api.importTiktokExport(file, storeCode);
      setResult(data);
      setLogs(prev => [
        ...prev,
        `Done! Matched: ${data.imported} products, Unmatched: ${data.unmatched}`,
        `Period: ${data.period_start} → ${data.period_end}`,
      ]);
      await fetchPeriods(storeCode);
      setSelectedPeriod({ start: data.period_start, end: data.period_end });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setLogs(prev => [...prev, `Error: ${msg}`]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPeriod) { setRows([]); return; }
    setLoadingRows(true);
    api.getTiktokExportData(storeCode, selectedPeriod.start, selectedPeriod.end)
      .then(d => setRows(d.rows))
      .catch(() => setRows([]))
      .finally(() => setLoadingRows(false));
  }, [selectedPeriod, storeCode]);

  const VOC_COLOR: Record<string, string> = {
    "Good": "bg-green-100 text-green-700",
    "Normal": "bg-blue-100 text-blue-700",
    "At Risk": "bg-amber-100 text-amber-700",
    "Poor": "bg-red-100 text-red-700",
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${t.t1}`}>TikTok Product Analytics Import</h1>
        <p className={`text-sm ${t.t3} mt-1`}>Upload the TikTok product analytics export to track GMV, orders, and engagement per product</p>
      </div>

      <div className={`${t.card} rounded-xl border ${t.divider} p-6 mb-6`}>
        <h2 className={`text-sm font-semibold ${t.t2} mb-4`}>Upload New Export</h2>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className={`text-xs ${t.t3} font-medium`}>Store</label>
            <select
              value={storeCode}
              onChange={e => setStoreCode(e.target.value)}
              className={`border ${t.divider} rounded-lg px-3 py-2 ${t.inp} text-sm focus:outline-none focus:ring-2 focus:ring-blue-400`}
            >
              {STORES.map(s => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className={`text-xs ${t.t3} font-medium block mb-1`}>Export File (.xlsx)</label>
            <div
              className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                file ? "border-green-300 bg-green-50" : `border-dashed ${t.divider} hover:border-blue-400 hover:bg-blue-50`
              }`}
              onClick={() => fileInput.current?.click()}
            >
              <input
                type="file"
                hidden
                ref={fileInput}
                accept=".xlsx,.xls"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div className="text-sm font-medium text-green-600">{file.name}</div>
              ) : (
                <div className={`text-sm ${t.t4}`}>Click to select <span className={`font-medium ${t.t2}`}>product_list_All_*.xlsx</span></div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <label className={`text-xs ${t.t3} font-medium block mb-1 opacity-0`}>btn</label>
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className={`px-6 py-2 rounded-xl font-semibold text-sm transition-all ${
                file && !loading
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                  : `${t.page} ${t.t4} cursor-not-allowed`
              }`}
            >
              {loading ? "Importing..." : "Import"}
            </button>
          </div>
        </div>

        {error && (
          <div className={`mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm`}>{error}</div>
        )}
        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
            Imported <strong>{result.imported}</strong> products for period <strong>{result.period_start}</strong> → <strong>{result.period_end}</strong>.
            {result.unmatched > 0 && <span className="text-amber-600 ml-2">({result.unmatched} products had no matching Product ID in the system)</span>}
          </div>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className={`text-xs ${t.t4} ml-2`}>Import Log</span>
        </div>
        <div className="p-4 max-h-32 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className={t.t3}>Waiting for upload...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`mb-1 ${log.startsWith("Error") ? "text-red-400" : "text-gray-300"}`}>{log}</div>
            ))
          )}
        </div>
      </div>

      <div className={`${t.card} rounded-xl border ${t.divider} p-6 mb-6`}>
        <h2 className={`text-sm font-semibold ${t.t2} mb-3`}>Imported Periods — {storeCode}</h2>
        {periods.length === 0 ? (
          <p className={`text-sm ${t.t4}`}>No imports yet for this store.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periods.map(p => (
              <button
                key={`${p.period_start}-${p.period_end}`}
                onClick={() => setSelectedPeriod({ start: p.period_start, end: p.period_end })}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                  selectedPeriod?.start === p.period_start && selectedPeriod?.end === p.period_end
                    ? "bg-blue-600 text-white border-blue-600"
                    : `${t.card} ${t.t2} border ${t.divider} hover:border-blue-300 hover:bg-blue-50`
                }`}
              >
                {p.period_start} → {p.period_end}
                <span className="ml-2 text-xs opacity-70">{p.product_count} products</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPeriod && (
        <div className={`${t.card} rounded-xl border ${t.divider} overflow-hidden`}>
          <div className={`px-6 py-4 border-b ${t.divider} flex items-center justify-between`}>
            <div>
              <h2 className={`text-sm font-semibold ${t.t1}`}>
                Analytics: {selectedPeriod.start} → {selectedPeriod.end}
              </h2>
              <p className={`text-xs ${t.t4} mt-0.5`}>{rows.length} products · sorted by GMV desc</p>
            </div>
          </div>

          {loadingRows ? (
            <div className={`flex items-center justify-center py-16 ${t.t4} text-sm`}>Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`${t.page} border-b ${t.divider}`}>
                    <th className={`text-left px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>Product</th>
                    <th className={`text-left px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>Status</th>
                    <th className={`text-left px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>VoC</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>GMV</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>Orders</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>Items Sold</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>Impressions</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>CTR</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>ATC</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>CTOR</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>Refunds</th>
                    <th className={`text-right px-4 py-3 font-semibold ${t.t3} uppercase tracking-wider`}>Shop Tab GMV</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-b ${t.divider} ${t.btn} transition-colors`}>
                      <td className="px-4 py-3">
                        <div className={`font-semibold ${t.t1}`}>#{row.product_no}</div>
                        <div className={`${t.t4} truncate max-w-[200px]`}>{row.product_name || "—"}</div>
                        {row.gmv_range && (
                          <div className={`${t.t4} text-[10px]`}>{row.gmv_range}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.listing_status ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            row.listing_status === "Active" ? "bg-green-100 text-green-700" : `${t.page} ${t.t3}`
                          }`}>{row.listing_status}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.voc_diagnosis ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${VOC_COLOR[row.voc_diagnosis] || `${t.page} ${t.t3}`}`}>
                            {row.voc_diagnosis}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${t.t1}`}>{fmt(row.gmv)}</td>
                      <td className={`px-4 py-3 text-right ${t.t2}`}>{fmtNum(row.orders)}</td>
                      <td className={`px-4 py-3 text-right ${t.t2}`}>{fmtNum(row.items_sold)}</td>
                      <td className={`px-4 py-3 text-right ${t.t2}`}>{fmtNum(row.impressions)}</td>
                      <td className={`px-4 py-3 text-right ${t.t2}`}>{pct(row.ctr)}</td>
                      <td className={`px-4 py-3 text-right ${t.t2}`}>{fmtNum(row.add_to_cart)}</td>
                      <td className={`px-4 py-3 text-right ${t.t2}`}>{pct(row.ctor)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{row.items_refunded ? fmtNum(row.items_refunded) : "–"}</td>
                      <td className={`px-4 py-3 text-right ${t.t2}`}>{fmt(row.shop_tab_gmv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
