"use client";
import { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

interface Summary {
  total_skus: number;
  total_stock: number;
  by_sheet: { sheet_name: string; sku_count: number; stock: number }[];
  last_sync: string;
}

export default function WarehouseManagePage() {
  const { theme: t } = useTheme();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const data = await api.warehouseSummary();
      setSummary(data);
    } catch (e) {
      console.error("Failed to load summary");
      setError("Failed to load dashboard analytics");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setSyncing(true);
    const toastId = toast.loading("Syncing latest data from Feishu...");
    try {
      const syncData = await api.warehouseSync();
      if (syncData.ok) {
        toast.loading("Sync running in background, refreshing stats...", { id: toastId });
        await new Promise((r) => setTimeout(r, 5000));
        await fetchSummary();
        toast.success("Warehouse data synced from Feishu", { id: toastId });
      } else {
        toast.error(syncData.detail || "Sync failed", { id: toastId });
      }
    } catch (e: any) {
      toast.error(e.message || "Refresh failed", { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
      <Toaster position="top-right" />
      
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
        <div>
          <h1 className={`text-2xl font-bold ${t.t1} tracking-tight`}>Warehouse Management</h1>
          <p className={`text-sm ${t.t3} mt-1 flex items-center gap-2 font-medium`}>
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Live Feishu Spreadsheet Connection
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={syncing}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2 text-sm font-semibold shadow-lg shadow-blue-100 disabled:opacity-50"
        >
          {syncing ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {syncing ? "Syncing..." : "Refresh Dashboard Stats"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total SKUs", val: summary?.total_skus, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Stock", val: summary?.total_stock, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Active Sheets", val: summary?.by_sheet?.length, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Last Sync", val: summary?.last_sync ? new Date(summary.last_sync).toLocaleTimeString() : "N/A", color: "text-amber-600", bg: "bg-amber-50" },
        ].map(card => (
          <div key={card.label} className={`${t.card} rounded-2xl border ${t.divider} p-5 shadow-sm hover:shadow-md transition-all`}>
            <div className={`text-xs font-bold ${t.t4} uppercase tracking-widest mb-1`}>{card.label}</div>
            <div className={`text-2xl font-black ${loading ? 'opacity-20' : t.t1}`}>
              {loading ? "---" : (typeof card.val === 'number' ? card.val.toLocaleString() : card.val)}
            </div>
          </div>
        ))}
      </div>

      <div className={`${t.card} rounded-2xl border ${t.divider} shadow-xl overflow-hidden relative group`}>
        {iframeLoading && (
          <div className={`absolute inset-0 z-10 ${t.page} flex flex-col items-center justify-center gap-4`}>
            <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="text-center">
              <div className={`text-lg font-bold ${t.t1} animate-pulse`}>Loading Warehouse View...</div>
              <p className={`text-xs ${t.t3} mt-1 uppercase tracking-widest font-black`}>Establishing Connection</p>
            </div>
          </div>
        )}
        
        <div className="absolute top-0 left-0 right-0 h-1 z-20 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"></div>
        
        <iframe
          src="https://h6uzyhsr1c.feishu.cn/sheets/OqPust3BwhHVp0taenDcqJtTnj3?from=wiki"
          className="w-full border-none"
          style={{ height: 'calc(100vh - 250px)', opacity: iframeLoading ? 0 : 1 }}
          title="Feishu Spreadsheet"
          allowFullScreen
          allow="clipboard-read; clipboard-write; self; same-origin"
          onLoad={() => setIframeLoading(false)}
        />
        
        <div className={`p-3 border-t ${t.divider} ${t.page}/50 flex items-center justify-between px-6`}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
            <span className={`text-[10px] font-bold ${t.t3} uppercase tracking-widest`}>
              Live Bi-directional Sync Active
            </span>
          </div>
          <a 
            href="https://h6uzyhsr1c.feishu.cn/sheets/OqPust3BwhHVp0taenDcqJtTnj3?from=wiki" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] font-black text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors uppercase tracking-widest"
          >
            Open in Full Tab
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
