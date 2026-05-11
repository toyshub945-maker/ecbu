"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeDef } from "@/lib/theme";
import { api } from "@/lib/api";

function backendUrl(path: string) {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000${path}`;
}

type AdRecord = {
  id: number;
  store_name: string;
  product_number: string;
  date: string;
  status: string;
  roi: number;
  cost_per_order: number;
  ad_cost_rate: number;
  ad_spend: number;
  revenue: number;
  campaign_budget: number;
  budget_adjustment: string;
  extra_budget_id: string;
  ads_open_date: string | null;
  total_funds: number | null;
  profit: number | null;
  color_flag: string | null;
  notes: string;
};

type Summary = {
  total_campaigns: number;
  total_spend: number;
  total_revenue: number;
  avg_roi: number;
  by_store: { store_name: string; campaigns: number; spend: number; revenue: number; avg_roi: number }[];
  last_updated: string | null;
};

const STORES = ["CELNEPHO", "CYNLLIO", "VIMISAOI", "mikarka shoes", "Live", "Weekend"];

const EDITABLE_FIELDS = [
  "product_number", "date", "status", "roi", "cost_per_order", "ad_cost_rate",
  "ad_spend", "revenue", "campaign_budget", "budget_adjustment", "extra_budget_id",
  "ads_open_date", "total_funds", "notes"
];

const COLUMNS = [
  { key: "id", label: "ID", width: "w-16", editable: false },
  { key: "product_number", label: "Product #", width: "w-24", editable: true },
  { key: "date", label: "Date", width: "w-28", editable: true },
  { key: "status", label: "Status", width: "w-24", editable: true },
  { key: "roi", label: "ROI", width: "w-20", editable: false },
  { key: "ad_cost_rate", label: "Ad Cost %", width: "w-24", editable: true },
  { key: "ad_spend", label: "AD Spend", width: "w-28", editable: true },
  { key: "revenue", label: "Revenue", width: "w-28", editable: true },
  { key: "campaign_budget", label: "Campaign Budget", width: "w-28", editable: true },
  { key: "budget_adjustment", label: "Budget Adjustment", width: "w-32", editable: true },
  { key: "extra_budget_id", label: "Extra Budget ID", width: "w-36", editable: true },
  { key: "ads_open_date", label: "Ads Open Date", width: "w-32", editable: true },
  { key: "total_funds", label: "Total Funds", width: "w-24", editable: true },
  { key: "notes", label: "Notes", width: "w-40", editable: true },
];

function getAdCostRateColor(rate: number, t: ThemeDef): string {
  if (rate <= 5) return "bg-green-50";
  if (rate > 5 && rate <= 6) return "bg-pink-50";
  if (rate > 6 && rate <= 7) return "bg-pink-100";
  if (rate > 7 && rate <= 9) return "bg-orange-50";
  return "bg-red-50";
}

function getAdCostRateTextColor(rate: number): string {
  if (rate <= 5) return "text-green-700";
  if (rate > 5 && rate <= 6) return "text-pink-700";
  if (rate > 6 && rate <= 7) return "text-pink-800";
  if (rate > 7 && rate <= 9) return "text-orange-700";
  return "text-red-700";
}

function getBudgetAdjustmentColor(adjustment: string, budget: number): string {
  if (!adjustment || adjustment === "-") return "";
  const adjNum = parseFloat(adjustment);
  if (isNaN(adjNum)) return "";
  if (adjNum > budget) return "bg-green-50";
  if (adjNum < budget) return "bg-red-50";
  return "";
}

function getBudgetAdjustmentTextColor(adjustment: string, budget: number): string {
  if (!adjustment || adjustment === "-") return "";
  const adjNum = parseFloat(adjustment);
  if (isNaN(adjNum)) return "";
  if (adjNum > budget) return "text-green-700";
  if (adjNum < budget) return "text-red-700";
  return "";
}

export default function AdsPage() {
  const { theme: t, themeKey } = useTheme();
  const [mainView, setMainView] = useState<"ads" | "creative">("ads");
  const [activeTab, setActiveTab] = useState("CELNEPHO");
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDate, setUploadDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<string>("status");
  const [bulkEditValue, setBulkEditValue] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: "", roiMin: "", roiMax: "", dateFrom: "", dateTo: "" });

  const [focusedCell, setFocusedCell] = useState<{id: number; field: string} | null>(null);
  const [editValue, setEditValue] = useState("");
  const [copiedCell, setCopiedCell] = useState<{value: string; id: number; field: string} | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  const fetchAds = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "All") params.append("store", activeTab);
      if (searchTerm) params.append("search", searchTerm);
      const res = await fetch(`/api/ads?${params}`);
      const data = await res.json();
      setAds(data.ads || []);
    } catch (e) {
      setError("Failed to load ads data");
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm]);

  const fetchSummary = async () => {
    try {
      const res = await fetch(backendUrl("/api/ads/summary"));
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      console.error("Failed to load summary");
    }
  };

  useEffect(() => {
    fetchAds();
    fetchSummary();
  }, [fetchAds]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadDate) {
      setError("Please select file and date");
      return;
    }
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("store_name", activeTab);
      formData.append("date", uploadDate);
      const res = await fetch(backendUrl("/api/ads/upload"), { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setSuccess(`Uploaded ${data.inserted} records`);
      setShowUpload(false);
      setUploadFile(null);
      setUploadDate("");
      fetchAds();
      fetchSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this record?")) return;
    try {
      await fetch(`/api/ads/${id}`, { method: "DELETE" });
      fetchAds();
      fetchSummary();
    } catch (e) {
      setError("Delete failed");
    }
  };

  const startEdit = (record: AdRecord, field: string) => {
    if (!EDITABLE_FIELDS.includes(field)) return;
    setFocusedCell({ id: record.id, field });
    const value = record[field as keyof AdRecord];
    setEditValue(value === null || value === undefined ? "" : String(value));
  };

  const saveEdit = async () => {
    if (!focusedCell) return;
    const { id, field } = focusedCell;
    let value: string | number = editValue;
    if (["roi", "cost_per_order", "ad_cost_rate", "ad_spend", "revenue", "campaign_budget", "total_funds", "profit"].includes(field)) {
      value = parseFloat(editValue) || 0;
    }
    try {
      await fetch(`/api/ads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      setFocusedCell(null);
      fetchAds();
    } catch (e) {
      setError("Update failed");
    }
  };

  const cancelEdit = () => {
    setFocusedCell(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, record: AdRecord, field: string) => {
    if (focusedCell) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        saveEdit();
        if (e.key === "Tab" && !e.shiftKey) {
          const colIdx = COLUMNS.findIndex(c => c.key === field);
          if (colIdx < COLUMNS.length - 1) {
            const nextField = COLUMNS[colIdx + 1].key;
            if (EDITABLE_FIELDS.includes(nextField)) {
              setTimeout(() => startEdit(record, nextField), 10);
            }
          }
        }
      } else if (e.key === "Escape") {
        cancelEdit();
      }
      return;
    }

    const colIdx = COLUMNS.findIndex(c => c.key === field);
    const currentRecordIdx = displayedAds.findIndex(r => r.id === record.id);

    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEdit(record, field);
    } else if (e.key === "ArrowUp" && currentRecordIdx > 0) {
      e.preventDefault();
      setFocusedCell({ id: displayedAds[currentRecordIdx - 1].id, field });
    } else if (e.key === "ArrowDown" && currentRecordIdx < displayedAds.length - 1) {
      e.preventDefault();
      setFocusedCell({ id: displayedAds[currentRecordIdx + 1].id, field });
    } else if (e.key === "ArrowLeft" && colIdx > 0) {
      e.preventDefault();
      setFocusedCell({ id: record.id, field: COLUMNS[colIdx - 1].key });
    } else if (e.key === "ArrowRight" && colIdx < COLUMNS.length - 1) {
      e.preventDefault();
      setFocusedCell({ id: record.id, field: COLUMNS[colIdx + 1].key });
    } else if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      const value = record[field as keyof AdRecord];
      setCopiedCell({ value: String(value || ""), id: record.id, field });
    } else if (e.ctrlKey && e.key === "v" && copiedCell) {
      e.preventDefault();
      setEditValue(copiedCell.value);
      setFocusedCell({ id: record.id, field });
      saveEdit();
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (activeTab !== "All") params.append("store", activeTab);
      const res = await fetch(`/api/ads/export?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ads_${activeTab.toLowerCase()}_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("Export failed");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedAds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedAds.map(r => r.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} records?`)) return;
    try {
      for (const id of selectedIds) {
        await fetch(`/api/ads/${id}`, { method: "DELETE" });
      }
      setSelectedIds(new Set());
      fetchAds();
      fetchSummary();
      setSuccess(`Deleted ${selectedIds.size} records`);
    } catch (e) {
      setError("Bulk delete failed");
    }
  };

  const handleBulkEdit = async () => {
    if (selectedIds.size === 0 || !bulkEditValue) return;
    try {
      for (const id of selectedIds) {
        await fetch(`/api/ads/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [bulkEditField]: bulkEditValue }),
        });
      }
      setSelectedIds(new Set());
      setShowBulkEdit(false);
      setBulkEditValue("");
      fetchAds();
      setSuccess(`Updated ${selectedIds.size} records`);
    } catch (e) {
      setError("Bulk edit failed");
    }
  };

  const filteredAds = useMemo(() => {
    return activeTab === "All" ? ads : ads.filter(a => a.store_name === activeTab);
  }, [ads, activeTab]);

  const applyFilters = useMemo(() => {
    return filteredAds.filter(r => {
      if (filters.status && r.status !== filters.status) return false;
      if (filters.roiMin && r.roi < parseFloat(filters.roiMin)) return false;
      if (filters.roiMax && r.roi > parseFloat(filters.roiMax)) return false;
      if (filters.dateFrom && r.date < filters.dateFrom) return false;
      if (filters.dateTo && r.date > filters.dateTo) return false;
      return true;
    });
  }, [filteredAds, filters]);

  const displayedAds = applyFilters;

  const renderCellValue = (record: AdRecord, col: typeof COLUMNS[0]) => {
    const field = col.key;
    const value = record[field as keyof AdRecord];
    const isFocused = focusedCell?.id === record.id && focusedCell?.field === field;
    const isEditable = col.editable && EDITABLE_FIELDS.includes(field);

    if (isFocused) {
      if (field === "status") {
        return (
          <select
            className={`w-full h-full px-2 border-2 border-blue-500 ${t.card} text-sm`}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => handleKeyDown(e, record, field)}
            autoFocus
          >
            <option value="Active">Active</option>
            <option value="Paused">Paused</option>
          </select>
        );
      }
      if (["roi", "cost_per_order", "ad_cost_rate", "ad_spend", "revenue", "campaign_budget", "total_funds", "profit"].includes(field)) {
        return (
          <input
            type="number"
            step="0.01"
            className={`w-full h-full px-2 border-2 border-blue-500 ${t.card} text-sm`}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => handleKeyDown(e, record, field)}
            autoFocus
          />
        );
      }
      return (
        <input
          className={`w-full h-full px-2 border-2 border-blue-500 ${t.card} text-sm`}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => handleKeyDown(e, record, field)}
          autoFocus
        />
      );
    }

    if (field === "status") {
      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${value === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{value}</span>;
    }
    if (field === "ad_cost_rate") {
      const rate = value as number;
      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAdCostRateColor(rate, t)} ${getAdCostRateTextColor(rate)}`}>{rate?.toFixed(1) ?? "0"}%</span>;
    }
    if (field === "budget_adjustment") {
      const colorClass = getBudgetAdjustmentColor(value as string, record.campaign_budget);
      const textClass = getBudgetAdjustmentTextColor(value as string, record.campaign_budget);
      if (colorClass) return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass} ${textClass}`}>{value || "-"}</span>;
      return <span className={t.t4}>{value || "-"}</span>;
    }
    if (["ad_spend", "revenue", "campaign_budget", "cost_per_order", "total_funds", "profit"].includes(field)) {
      const val = value as number | null;
      if (val === null || val === undefined) return <span className={t.t4}>-</span>;
      return <span className="font-mono">${val.toFixed(2)}</span>;
    }
    if (field === "roi") {
      const num = typeof value === "number" ? value : parseFloat(value as string);
      return <span className="font-semibold">{!isNaN(num) ? num.toFixed(2) : "-"}</span>;
    }
    if (field === "id") {
      return <span className={`text-xs ${t.t4}`}>#{value}</span>;
    }
    return <span className={`truncate ${t.t3}`}>{value || "-"}</span>;
  };

  const dark = themeKey !== "light";
  const borderCls = t.divider;
  const theadBg = t.bar.split(" ")[0];
  const theadText = t.t3;
  const tbodyBorder = t.divider;
  const hoverRow = `hover:bg-violet-500/10`;
  const inputCls = `${t.inp} rounded-lg text-sm`;
  const selectCls = `${t.inp} rounded-lg text-sm`;

  if (mainView === "creative") {
    return (
      <>
        <Sidebar />
        <div className={`flex-1 overflow-auto ${t.page}`}>
          <div className="max-w-[1800px] mx-auto p-4">
            <div className="flex items-center gap-4 mb-6">
              <div className={`flex gap-1 ${t.card} rounded-lg p-1 border ${t.divider}`}>
                <button onClick={() => setMainView("ads")} className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${mainView === "ads" ? "bg-blue-600 text-white" : `${t.t3} hover:${t.bar}`}`}>
                  📊 Ads Management
                </button>
                <button onClick={() => setMainView("creative")} className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${mainView === "creative" ? "bg-violet-600 text-white" : `${t.t3} hover:${t.bar}`}`}>
                  🎨 Ads Creative
                </button>
              </div>
            </div>
            <AdsCreativeTab />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Sidebar />
      <div className={`flex-1 overflow-auto ${t.page}`}>
      <div className="max-w-[1800px] mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-2xl font-bold ${t.t1}`}>Ads Management</h1>
            <p className={`text-sm ${t.t3} mt-1`}>
              {summary ? `${summary.total_campaigns} campaigns • $${summary.total_spend.toFixed(2)} spend • ${summary.avg_roi}% avg ROI` : "Loading..."}
            </p>
          </div>
          <div className="flex gap-2">
            <div className={`flex gap-1 ${t.card} rounded-lg p-1 border ${t.divider} mr-2`}>
              <button onClick={() => setMainView("ads")} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${mainView === "ads" ? "bg-blue-600 text-white" : `${t.t3} hover:${t.bar}`}`}>
                📊 Ads Management
              </button>
              <button onClick={() => setMainView("creative")} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${mainView === "creative" ? "bg-violet-600 text-white" : `${t.t3} hover:${t.bar}`}`}>
                🎨 Ads Creative
              </button>
            </div>
            <button onClick={handleExport} className={`flex items-center gap-2 px-4 py-2 ${t.card} border ${t.divider} text-sm font-medium ${t.btn}`}>
              📥 Export
            </button>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              📤 Upload Data
            </button>
          </div>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
        {success && <div className="mb-3 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}

        <div className="mb-3 flex items-center gap-2">
          <div className={`flex gap-1 ${t.card} rounded-lg p-1 border ${t.divider}`}>
            {STORES.map(store => (
              <button
                key={store}
                onClick={() => { setActiveTab(store); setSelectedIds(new Set()); }}
                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === store ? "bg-blue-600 text-white" : `${t.t3} ${dark ? "hover:bg-slate-800" : "hover:bg-gray-100"}`
                }`}
              >
                {store}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${showFilters ? "bg-blue-50 border-blue-500 text-blue-700" : `border ${t.divider} ${t.t3} ${dark ? "hover:bg-slate-800" : "hover:bg-gray-50"}`}`}
          >
            🔍 Filters
          </button>
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className={`ml-auto px-4 py-2 border ${inputCls} w-48`}
          />
        </div>

        {showFilters && (
          <div className={`mb-3 p-3 ${t.card} rounded-lg border ${t.divider} flex flex-wrap gap-3 items-center`}>
            <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className={`px-3 py-2 border ${selectCls} min-w-[120px]`}>
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
            </select>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${t.t3}`}>ROI:</span>
              <input type="number" placeholder="Min" value={filters.roiMin} onChange={e => setFilters({ ...filters, roiMin: e.target.value })} className={`w-20 px-2 py-2 border ${inputCls}`} />
              <span className={t.t4}>-</span>
              <input type="number" placeholder="Max" value={filters.roiMax} onChange={e => setFilters({ ...filters, roiMax: e.target.value })} className={`w-20 px-2 py-2 border ${inputCls}`} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${t.t3}`}>Date:</span>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} className={`px-2 py-2 border ${inputCls}`} />
              <span className={t.t4}>to</span>
              <input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} className={`px-2 py-2 border ${inputCls}`} />
            </div>
            <button onClick={() => setFilters({ status: "", roiMin: "", roiMax: "", dateFrom: "", dateTo: "" })} className={`px-3 py-2 text-sm ${t.t3} hover:${t.t2}`}>Clear</button>
            <span className={`ml-auto text-sm ${t.t3}`}>{displayedAds.length} results</span>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="mb-3 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
            <button onClick={() => setShowBulkEdit(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">✏️ Bulk Edit</button>
            <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">🗑️ Delete</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-blue-600 hover:text-blue-800 text-sm">Clear</button>
          </div>
        )}

        <div className={`${t.card} rounded-lg border ${t.divider} overflow-hidden`}>
          {loading ? (
            <div className={`text-center py-20 ${t.t4}`}>Loading...</div>
          ) : displayedAds.length === 0 ? (
            <div className={`text-center py-20 ${t.t4}`}>
              <div className="text-5xl mb-3">📊</div>
              <p className="text-lg font-medium">No data</p>
            </div>
          ) : (
            <div className="overflow-auto" ref={tableRef}>
              <table className="w-full border-collapse text-sm">
                <thead className={`${theadBg} sticky top-0 z-10`}>
                  <tr>
                    <th className={`border ${borderCls} px-2 py-2 text-left ${theadBg} w-10`}>
                      <input type="checkbox" checked={selectedIds.size === displayedAds.length && displayedAds.length > 0} onChange={toggleSelectAll} className="w-4 h-4" />
                    </th>
                    {COLUMNS.map(col => (
                      <th key={col.key} className={`border ${borderCls} px-2 py-2 text-left ${theadBg} text-xs font-semibold ${theadText} uppercase ${col.width}`}>
                        {col.label}
                      </th>
                    ))}
                    <th className={`border ${borderCls} px-2 py-2 text-center ${theadBg} w-16`}>🗑️</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedAds.map(record => (
                    <tr key={record.id} className={hoverRow}>
                      <td className={`border ${tbodyBorder} px-2 py-1 text-center`}>
                        <input type="checkbox" checked={selectedIds.has(record.id)} onChange={() => toggleSelect(record.id)} className="w-4 h-4" />
                      </td>
                      {COLUMNS.map(col => {
                        const isEditable = col.editable && EDITABLE_FIELDS.includes(col.key);
                        return (
                          <td
                            key={col.key}
                            className={`border ${tbodyBorder} px-2 py-2 ${col.width} ${isEditable ? "cursor-text" : ""}`}
                          >
                            <div
                              className={`w-full h-full ${isEditable ? `cursor-pointer ${dark ? "hover:bg-slate-700" : "hover:bg-blue-50"} rounded px-1` : ""}`}
                              onClick={e => { if (isEditable) { e.stopPropagation(); startEdit(record, col.key); } }}
                            >
                              {renderCellValue(record, col)}
                            </div>
                          </td>
                        );
                      })}
                      <td className={`border ${tbodyBorder} px-2 py-1 text-center`}>
                        <button onClick={() => handleDelete(record.id)} className="text-red-500 hover:text-red-700 text-sm">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={`mt-3 text-xs ${t.t3} flex flex-wrap gap-4`}>
          <span>💡 Click to edit • Enter to save • Arrow keys to navigate • Tab to move right</span>
          <span>📋 Ctrl+C to copy • Ctrl+V to paste</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-50 border border-gray-300"></span> ≤5%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-pink-50 border border-gray-300"></span> 6%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-pink-100 border border-gray-300"></span> 7%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-50 border border-gray-300"></span> 8-9%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-50 border border-gray-300"></span> &gt;9%</span>
        </div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${t.card} rounded-2xl p-6 w-[400px] shadow-xl`}>
            <h3 className={`text-lg font-semibold mb-4 ${t.t1}`}>Upload Ads Data</h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${t.t2} mb-1`}>Store</label>
                <input value={activeTab} disabled className={`w-full px-4 py-2 border rounded-lg ${t.inp} opacity-60`} />
              </div>
              <div>
                <label className={`block text-sm font-medium ${t.t2} mb-1`}>Date</label>
                <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} className={`w-full px-4 py-2 border rounded-lg ${t.inp}`} />
              </div>
              <div>
                <label className={`block text-sm font-medium ${t.t2} mb-1`}>Excel File</label>
                <input type="file" accept=".xlsx,.xls" onChange={e => setUploadFile(e.target.files?.[0] || null)} className={`w-full px-4 py-2 border rounded-lg ${t.inp}`} />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowUpload(false)} className={`flex-1 px-4 py-2 border rounded-lg ${t.t3} ${t.btn}`}>Cancel</button>
              <button onClick={handleUpload} disabled={uploading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300">
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${t.card} rounded-2xl p-6 w-[360px] shadow-xl`}>
            <h3 className={`text-lg font-semibold mb-4 ${t.t1}`}>Bulk Edit ({selectedIds.size} records)</h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${t.t2} mb-1`}>Field</label>
                <select value={bulkEditField} onChange={e => setBulkEditField(e.target.value)} className={`w-full px-4 py-2 border rounded-lg ${t.inp}`}>
                  <option value="status">Status</option>
                  <option value="campaign_budget">Campaign Budget</option>
                  <option value="budget_adjustment">Budget Adjustment</option>
                  <option value="notes">Notes</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium ${t.t2} mb-1`}>Value</label>
                {bulkEditField === "status" ? (
                  <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className={`w-full px-4 py-2 border rounded-lg ${t.inp}`}>
                    <option value="">Select...</option>
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                  </select>
                ) : (
                  <input type="text" value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className={`w-full px-4 py-2 border rounded-lg ${t.inp}`} />
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setShowBulkEdit(false); setBulkEditValue(""); }} className={`flex-1 px-4 py-2 border rounded-lg ${t.t3} ${t.btn}`}>Cancel</button>
              <button onClick={handleBulkEdit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
            </div>
          </div>
        </div>
      )}
      </div>{/* flex-1 overflow-auto */}
    </>
  );
}

// ─── Ads Creative Tab ─────────────────────────────────────────────────────────

const CREATIVE_STORES = ["TT1", "TT2", "TT3", "TT4"];

type CreativeUpload = {
  id: number; store_name: string; date_from: string; date_to: string;
  filename: string; row_count: number; uploaded_at: string;
};

type CreativeEntry = {
  id: number; creative_type: string; video_title: string | null;
  video_id: string | null; tiktok_account: string | null; time_posted: string | null;
  status: string | null; authorization_type: string | null;
  cost: number; sku_orders: number; cost_per_order: number;
  gross_revenue: number; roi: number; impressions: number; clicks: number;
  click_rate: number | null; conversion_rate: number | null;
  view_2s: number | null; view_6s: number | null; view_25pct: number | null;
  view_50pct: number | null; view_75pct: number | null; view_100pct: number | null;
};

type CreativeProduct = {
  product_no: string; campaign_name: string;
  warehouse_name: string | null; image_url: string | null;
  videos: CreativeEntry[]; product_cards: CreativeEntry[];
};

function getCreativeBadge(entry: CreativeEntry): { label: string; cls: string } | null {
  const isDelivering = entry.status === "Delivering";
  if (entry.status === "Authorization needed") {
    return { label: "⚠️ Ask creator for ads code", cls: "bg-amber-100 text-amber-700 border-amber-300" };
  }
  if (isDelivering) {
    if (entry.cost_per_order > 0 && entry.cost_per_order < 1 && entry.sku_orders > 1 && entry.roi > 15) {
      return { label: "💰 Can add extra budget", cls: "bg-green-100 text-green-700 border-green-300" };
    }
    if (entry.cost_per_order > 10) {
      return { label: "🚫 Excluded needed", cls: "bg-red-100 text-red-700 border-red-300" };
    }
    if (entry.cost > 10 && entry.sku_orders === 0) {
      return { label: "🚫 Excluded needed", cls: "bg-red-100 text-red-700 border-red-300" };
    }
  }
  return null;
}

function pct(v: number | null | undefined) {
  if (v == null) return "–";
  return (v * 100).toFixed(1) + "%";
}

function AdsCreativeTab() {
  const { theme: t } = useTheme();
  const [store, setStore] = useState("TT1");
  const [uploads, setUploads] = useState<CreativeUpload[]>([]);
  const [selectedUploadId, setSelectedUploadId] = useState<number | null>(null);
  const [products, setProducts] = useState<CreativeProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const loadUploads = useCallback(async () => {
    try {
      const d = await api.creativeUploads(store);
      setUploads(d.uploads);
      if (d.uploads.length > 0 && !selectedUploadId) {
        setSelectedUploadId(d.uploads[0].id);
      }
    } catch { setUploads([]); }
  }, [store]);

  const loadProducts = useCallback(async () => {
    if (!selectedUploadId) { setProducts([]); return; }
    setLoading(true);
    try {
      const d = await api.creativeProducts(store, selectedUploadId);
      setProducts(d.products);
      // Auto-expand all products
      setExpandedProducts(new Set(d.products.map((p: CreativeProduct) => p.product_no)));
    } catch { setProducts([]); }
    finally { setLoading(false); }
  }, [store, selectedUploadId]);

  useEffect(() => { setSelectedUploadId(null); loadUploads(); }, [store]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleUpload = async () => {
    if (!uploadFile || !dateFrom || !dateTo) { setError("Please fill all fields and select a file"); return; }
    setUploading(true); setError(""); setSuccess("");
    try {
      const d = await api.creativeUpload(uploadFile, store, dateFrom, dateTo);
      setSuccess(`✅ Uploaded ${d.rows} rows`);
      setShowUploadModal(false); setUploadFile(null); setDateFrom(""); setDateTo("");
      await loadUploads();
      setSelectedUploadId(d.upload_id);
    } catch (e: any) { setError(e.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  const handleDeleteUpload = async (id: number) => {
    if (!confirm("Delete this upload and all its data?")) return;
    try {
      await api.deleteCreativeUpload(id);
      setUploads(prev => prev.filter(u => u.id !== id));
      if (selectedUploadId === id) { setSelectedUploadId(null); setProducts([]); }
      setSuccess("Upload deleted");
    } catch { setError("Failed to delete"); }
  };

  const toggleProduct = (pno: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(pno)) next.delete(pno); else next.add(pno);
      return next;
    });
  };

  // Count badges across all products
  const badgeSummary = products.reduce((acc, p) => {
    [...p.videos, ...p.product_cards].forEach(e => {
      const b = getCreativeBadge(e);
      if (b?.label.includes("extra budget")) acc.budget++;
      if (b?.label.includes("Excluded")) acc.excluded++;
      if (b?.label.includes("ads code")) acc.auth++;
    });
    return acc;
  }, { budget: 0, excluded: 0, auth: 0 });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${t.t1}`}>Ads Creative</h1>
          <p className={`text-sm ${t.t3} mt-1`}>Analyse creative performance by store and date range</p>
        </div>
        <button onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700">
          📤 Upload Creative Data
        </button>
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {success && <div className="mb-3 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}

      {/* Store tabs */}
      <div className={`flex gap-1 ${t.card} rounded-lg p-1 border ${t.divider} mb-4 w-fit`}>
        {CREATIVE_STORES.map(s => (
          <button key={s} onClick={() => setStore(s)}
            className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${store === s ? "bg-violet-600 text-white" : `${t.t3} hover:${t.bar}`}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Uploads list */}
      {uploads.length > 0 && (
        <div className={`${t.card} border ${t.divider} rounded-xl p-4 mb-5`}>
          <h3 className={`text-sm font-semibold ${t.t2} mb-3`}>Uploaded Data — {store}</h3>
          <div className="flex flex-wrap gap-2">
            {uploads.map(u => (
              <div key={u.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all ${
                  selectedUploadId === u.id
                    ? "border-violet-500 bg-violet-500/10"
                    : `${t.divider} ${t.bar}/50 hover:border-violet-400`
                }`}
                onClick={() => setSelectedUploadId(u.id)}
              >
                <div>
                  <div className={`font-semibold ${t.t1}`}>{u.date_from} → {u.date_to}</div>
                  <div className={`text-xs ${t.t4}`}>{u.filename} · {u.row_count} rows</div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDeleteUpload(u.id); }}
                  className="ml-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded p-1 transition-colors" title="Delete upload">
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploads.length === 0 && (
        <div className={`${t.card} border ${t.divider} rounded-xl p-12 text-center mb-5`}>
          <div className="text-4xl mb-3">🎨</div>
          <p className={`font-semibold ${t.t2}`}>No creative data uploaded for {store}</p>
          <p className={`text-sm ${t.t3} mt-1`}>Upload a TikTok Ads creative report Excel file to get started</p>
          <button onClick={() => setShowUploadModal(true)} className="mt-4 px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700">
            Upload Now
          </button>
        </div>
      )}

      {/* Badge summary */}
      {products.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm">
            <span className="font-bold text-green-700">{badgeSummary.budget}</span>
            <span className="text-green-600">💰 Can add extra budget</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-sm">
            <span className="font-bold text-red-700">{badgeSummary.excluded}</span>
            <span className="text-red-600">🚫 Excluded needed</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <span className="font-bold text-amber-700">{badgeSummary.auth}</span>
            <span className="text-amber-600">⚠️ Auth code needed</span>
          </div>
          <div className={`ml-auto flex items-center gap-2 px-4 py-2 ${t.card} border ${t.divider} rounded-xl text-sm ${t.t3}`}>
            {products.length} products · {products.reduce((a, p) => a + p.videos.length, 0)} videos · {products.reduce((a, p) => a + p.product_cards.length, 0)} product cards
          </div>
        </div>
      )}

      {/* Products grid */}
      {loading ? (
        <div className={`text-center py-20 ${t.t4}`}>Loading creatives...</div>
      ) : (
        <div className="space-y-4">
          {products.map(product => {
            const isExpanded = expandedProducts.has(product.product_no);
            const allEntries = [...product.videos, ...product.product_cards];
            const badges = allEntries.map(getCreativeBadge).filter(Boolean);
            const hasBudget = badges.some(b => b?.label.includes("extra budget"));
            const hasExcluded = badges.some(b => b?.label.includes("Excluded"));
            const hasAuth = badges.some(b => b?.label.includes("ads code"));

            return (
              <div key={product.product_no} className={`${t.card} border ${t.divider} rounded-xl overflow-hidden`}>
                {/* Product header */}
                <div className={`flex items-center gap-3 px-4 py-3 ${t.bar}/50 border-b ${t.divider} cursor-pointer`}
                  onClick={() => toggleProduct(product.product_no)}>
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className={`w-10 h-10 rounded-lg ${t.bar} flex items-center justify-center text-xs font-bold ${t.t4} shrink-0`}>
                      #{product.product_no}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`font-bold ${t.t1}`}>#{product.product_no}
                      {product.warehouse_name && <span className={`ml-2 text-sm font-normal ${t.t3}`}>{product.warehouse_name}</span>}
                    </div>
                    <div className={`text-xs ${t.t4}`}>{product.campaign_name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasBudget && <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 border border-green-300 rounded-full">💰 Budget</span>}
                    {hasExcluded && <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 border border-red-300 rounded-full">🚫 Exclude</span>}
                    {hasAuth && <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300 rounded-full">⚠️ Auth</span>}
                    <span className={`text-xs ${t.t3}`}>{product.videos.length} videos · {product.product_cards.length} cards</span>
                    <span className={`text-lg ${t.t4}`}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 space-y-4">
                    {/* Videos section */}
                    {product.videos.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-bold uppercase tracking-wider ${t.t3}`}>🎬 Video</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${t.bar} ${t.t4}`}>{product.videos.length} creatives</span>
                          <span className={`text-xs ${t.t4}`}>
                            {product.videos.filter(v => getCreativeBadge(v)?.label.includes("extra budget")).length} performing
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={`${t.bar}/60`}>
                                <th className={`text-left px-3 py-2 font-semibold ${t.t3}`}>Video / Creator</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Cost</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Orders</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Cost/Order</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Revenue</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>ROI</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Impressions</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>CTR</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>CVR</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>2s View</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>100% View</th>
                                <th className={`text-center px-3 py-2 font-semibold ${t.t3}`}>Status / Badge</th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.videos.map((v, i) => {
                                const badge = getCreativeBadge(v);
                                return (
                                  <tr key={v.id} className={`border-t ${t.divider} ${i % 2 === 1 ? `${t.bar}/30` : ""}`}>
                                    <td className="px-3 py-2 max-w-[220px]">
                                      <div className={`font-medium ${t.t1} truncate`} title={v.video_title || ""}>
                                        {v.video_title || "–"}
                                      </div>
                                      <div className={`${t.t4} truncate`}>{v.tiktok_account || "–"}</div>
                                      {v.time_posted && <div className={`${t.t5} text-[10px]`}>{v.time_posted}</div>}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono ${t.t2}`}>${v.cost.toFixed(2)}</td>
                                    <td className={`px-3 py-2 text-right font-semibold ${v.sku_orders > 0 ? "text-green-600" : t.t4}`}>{v.sku_orders}</td>
                                    <td className={`px-3 py-2 text-right font-mono ${v.cost_per_order > 10 ? "text-red-600 font-bold" : v.cost_per_order < 1 && v.sku_orders > 0 ? "text-green-600 font-bold" : t.t2}`}>
                                      {v.cost_per_order > 0 ? `$${v.cost_per_order.toFixed(2)}` : "–"}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono ${t.t2}`}>${v.gross_revenue.toFixed(2)}</td>
                                    <td className={`px-3 py-2 text-right font-semibold ${v.roi >= 15 ? "text-green-600" : v.roi > 0 ? "text-amber-600" : t.t4}`}>
                                      {v.roi > 0 ? v.roi.toFixed(1) : "–"}
                                    </td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{v.impressions > 0 ? v.impressions.toLocaleString() : "–"}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{pct(v.click_rate)}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{pct(v.conversion_rate)}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{pct(v.view_2s)}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{pct(v.view_100pct)}</td>
                                    <td className="px-3 py-2 text-center">
                                      <div className="flex flex-col items-center gap-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                          v.status === "Delivering" ? "bg-green-100 text-green-700" :
                                          v.status === "Authorization needed" ? "bg-amber-100 text-amber-700" :
                                          v.status === "Excluded" ? "bg-red-100 text-red-700" :
                                          "bg-gray-100 text-gray-500"
                                        }`}>{v.status || "–"}</span>
                                        {badge && (
                                          <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.cls}`}>
                                            {badge.label}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Product Card section */}
                    {product.product_cards.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-bold uppercase tracking-wider ${t.t3}`}>🃏 Product Card</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${t.bar} ${t.t4}`}>{product.product_cards.length} entries</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={`${t.bar}/60`}>
                                <th className={`text-left px-3 py-2 font-semibold ${t.t3}`}>Status</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Cost</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>SKU Orders</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Cost/Order</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Revenue</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>ROI</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>Impressions</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>CTR</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t3}`}>CVR</th>
                                <th className={`text-center px-3 py-2 font-semibold ${t.t3}`}>Badge</th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.product_cards.map((c, i) => {
                                const badge = getCreativeBadge(c);
                                return (
                                  <tr key={c.id} className={`border-t ${t.divider} ${i % 2 === 1 ? `${t.bar}/30` : ""}`}>
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                        c.status === "Delivering" ? "bg-green-100 text-green-700" :
                                        c.status === "Excluded" ? "bg-red-100 text-red-700" :
                                        "bg-gray-100 text-gray-500"
                                      }`}>{c.status || "–"}</span>
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono ${t.t2}`}>${c.cost.toFixed(2)}</td>
                                    <td className={`px-3 py-2 text-right font-semibold ${c.sku_orders > 0 ? "text-green-600" : t.t4}`}>{c.sku_orders}</td>
                                    <td className={`px-3 py-2 text-right font-mono ${c.cost_per_order > 10 ? "text-red-600 font-bold" : c.cost_per_order < 1 && c.sku_orders > 0 ? "text-green-600 font-bold" : t.t2}`}>
                                      {c.cost_per_order > 0 ? `$${c.cost_per_order.toFixed(2)}` : "–"}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono ${t.t2}`}>${c.gross_revenue.toFixed(2)}</td>
                                    <td className={`px-3 py-2 text-right font-semibold ${c.roi >= 15 ? "text-green-600" : c.roi > 0 ? "text-amber-600" : t.t4}`}>
                                      {c.roi > 0 ? c.roi.toFixed(1) : "–"}
                                    </td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{c.impressions > 0 ? c.impressions.toLocaleString() : "–"}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{pct(c.click_rate)}</td>
                                    <td className={`px-3 py-2 text-right ${t.t3}`}>{pct(c.conversion_rate)}</td>
                                    <td className="px-3 py-2 text-center">
                                      {badge && (
                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.cls}`}>
                                          {badge.label}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${t.card} rounded-2xl p-6 w-[440px] shadow-2xl border ${t.divider}`}>
            <h3 className={`text-lg font-bold mb-4 ${t.t1}`}>Upload Creative Data</h3>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${t.t2} mb-1`}>Store</label>
                <div className={`flex gap-1 ${t.bar}/50 rounded-lg p-1 border ${t.divider}`}>
                  {CREATIVE_STORES.map(s => (
                    <button key={s} onClick={() => setStore(s)}
                      className={`flex-1 py-1.5 rounded text-sm font-semibold transition-all ${store === s ? "bg-violet-600 text-white" : `${t.t3}`}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-medium ${t.t2} mb-1`}>Date From</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${t.inp}`} />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${t.t2} mb-1`}>Date To</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${t.inp}`} />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium ${t.t2} mb-1`}>Creative Report Excel</label>
                <input type="file" accept=".xlsx,.xls"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm ${t.inp}`} />
                {uploadFile && <p className={`text-xs ${t.t4} mt-1`}>📎 {uploadFile.name}</p>}
              </div>
              <div className={`p-3 ${t.bar}/50 rounded-lg border ${t.divider} text-xs ${t.t3}`}>
                <p className="font-semibold mb-1">💡 What gets imported:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>All rows (Delivering + Authorization needed)</li>
                  <li>Product # extracted from campaign name</li>
                  <li>Videos and Product Cards separated automatically</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowUploadModal(false); setError(""); }}
                className={`flex-1 px-4 py-2 border rounded-lg text-sm font-medium ${t.t3} ${t.btn}`}>
                Cancel
              </button>
              <button onClick={handleUpload} disabled={uploading}
                className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
