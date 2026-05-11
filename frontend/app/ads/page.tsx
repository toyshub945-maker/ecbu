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

function getCreativeBadge(entry: CreativeEntry): { type: "budget"|"excluded"|"auth"; label: string; cls: string } | null {
  // Authorization needed — any status (not just Delivering)
  if (entry.status === "Authorization needed") {
    return { type: "auth", label: "🔑 Authorization Needed", cls: "bg-amber-100 text-amber-700 border-amber-300" };
  }
  // Below rules only apply to Delivering creatives
  if (entry.status === "Delivering") {
    if (entry.cost_per_order > 0 && entry.cost_per_order < 1 && entry.sku_orders > 1 && entry.roi > 15) {
      return { type: "budget", label: "💰 Add Budget", cls: "bg-green-100 text-green-700 border-green-300" };
    }
    if (entry.cost_per_order > 10) {
      return { type: "excluded", label: "🚫 Exclude Now", cls: "bg-red-100 text-red-700 border-red-300" };
    }
    if (entry.cost > 10 && entry.sku_orders === 0) {
      return { type: "excluded", label: "🚫 Exclude Now", cls: "bg-red-100 text-red-700 border-red-300" };
    }
  }
  return null;
}

function pct(v: number | null | undefined) {
  if (v == null) return "–";
  return (v * 100).toFixed(1) + "%";
}

function AdsCreativeTab() {
  const { theme: t, themeKey } = useTheme();
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
  const [actionFilter, setActionFilter] = useState<"budget"|"excluded"|"auth"|null>(null);

  const dark = themeKey !== "light";

  const loadUploads = useCallback(async () => {
    try {
      const d = await api.creativeUploads(store);
      setUploads(d.uploads);
      if (d.uploads.length > 0 && !selectedUploadId) setSelectedUploadId(d.uploads[0].id);
    } catch { setUploads([]); }
  }, [store]);

  const loadProducts = useCallback(async () => {
    if (!selectedUploadId) { setProducts([]); return; }
    setLoading(true);
    try {
      const d = await api.creativeProducts(store, selectedUploadId);
      setProducts(d.products);
      setExpandedProducts(new Set(d.products.map((p: CreativeProduct) => p.product_no)));
    } catch { setProducts([]); }
    finally { setLoading(false); }
  }, [store, selectedUploadId]);

  useEffect(() => { setSelectedUploadId(null); setActionFilter(null); loadUploads(); }, [store]);
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

  // Aggregate badge counts using type field
  const badgeSummary = products.reduce((acc, p) => {
    [...p.videos, ...p.product_cards].forEach(e => {
      const b = getCreativeBadge(e);
      if (b?.type === "budget")   acc.budget++;
      if (b?.type === "excluded") acc.excluded++;
      if (b?.type === "auth")     acc.auth++;
    });
    return acc;
  }, { budget: 0, excluded: 0, auth: 0 });

  // When filter active → flat list of individual matching entries (with product info)
  type FlatEntry = CreativeEntry & { product_no: string; warehouse_name: string | null; image_url: string | null };
  const flatFilteredEntries: FlatEntry[] = actionFilter === null ? [] : products.flatMap(p =>
    [...p.videos, ...p.product_cards]
      .filter(e => getCreativeBadge(e)?.type === actionFilter)
      .map(e => ({ ...e, product_no: p.product_no, warehouse_name: p.warehouse_name, image_url: p.image_url }))
  );

  // Product filter (for grouped view when no filter)
  const filteredProducts = products;

  const totalVideos = products.reduce((a, p) => a + p.videos.length, 0);
  const totalCards  = products.reduce((a, p) => a + p.product_cards.length, 0);

  const statusCls = (s: string | null) =>
    s === "Delivering"            ? "bg-green-100 text-green-700" :
    s === "Authorization needed"  ? "bg-amber-100 text-amber-700" :
    s === "Excluded"              ? "bg-red-100 text-red-700"     : "bg-gray-100 text-gray-500";

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className={`text-2xl font-bold ${t.t1}`}>Ads Creative</h1>
          <p className={`text-sm ${t.t3} mt-0.5`}>Analyse creative performance by store and date range</p>
        </div>
        <button onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 shadow-sm">
          📤 Upload Creative Data
        </button>
      </div>

      {error   && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
      {success && <div className="mb-3 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">{success}</div>}

      {/* ── Store tabs ── */}
      <div className={`flex gap-1 ${t.card} rounded-xl p-1 border ${t.divider} mb-4 w-fit`}>
        {CREATIVE_STORES.map(s => (
          <button key={s} onClick={() => setStore(s)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${store === s ? "bg-violet-600 text-white shadow-sm" : `${t.t3} hover:${t.bar}`}`}>
            {s}
          </button>
        ))}
      </div>

      {/* ── Uploaded period selector ── */}
      {uploads.length > 0 && (
        <div className={`${t.card} border ${t.divider} rounded-xl p-3 mb-4`}>
          <div className={`text-[10px] font-bold uppercase tracking-widest ${t.t4} mb-2`}>Uploaded Periods — {store}</div>
          <div className="flex flex-wrap gap-2">
            {uploads.map(u => (
              <div key={u.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all ${
                  selectedUploadId === u.id
                    ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                    : `${t.divider} hover:border-violet-400 ${t.t2}`
                }`}
                onClick={() => setSelectedUploadId(u.id)}>
                <div className={`w-1.5 h-1.5 rounded-full ${selectedUploadId === u.id ? "bg-violet-500" : "bg-gray-300"}`} />
                <div>
                  <div className="font-semibold text-xs">{u.date_from} → {u.date_to}</div>
                  <div className={`text-[10px] ${t.t4}`}>{u.row_count} rows</div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDeleteUpload(u.id); }}
                  className="ml-1 text-red-400 hover:text-red-600 p-0.5 rounded transition-colors" title="Delete">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
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
          <p className={`text-sm ${t.t3} mt-1`}>Upload a TikTok Ads creative report to get started</p>
          <button onClick={() => setShowUploadModal(true)}
            className="mt-4 px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700">
            Upload Now
          </button>
        </div>
      )}

      {/* ── Action filter cards ── */}
      {products.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {/* All */}
          <button
            onClick={() => setActionFilter(null)}
            className={`flex flex-col gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
              actionFilter === null
                ? `border-violet-400 ${dark ? "bg-violet-950" : "bg-violet-50"} shadow-sm`
                : `${t.card} ${t.divider} hover:border-violet-300`
            }`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${actionFilter === null ? "text-violet-600" : t.t4}`}>All Products</div>
            <div className={`text-2xl font-black ${actionFilter === null ? "text-violet-600" : t.t1}`}>{products.length}</div>
            <div className={`text-[10px] ${t.t4}`}>{totalVideos} videos · {totalCards} cards</div>
          </button>

          {/* Add budget */}
          <button
            onClick={() => setActionFilter(actionFilter === "budget" ? null : "budget")}
            className={`flex flex-col gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
              actionFilter === "budget"
                ? "border-green-400 bg-green-50 shadow-sm"
                : `${t.card} ${t.divider} hover:border-green-300`
            }`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${actionFilter === "budget" ? "text-green-700" : t.t4}`}>💰 Add Budget</div>
            <div className={`text-2xl font-black ${actionFilter === "budget" ? "text-green-700" : "text-green-600"}`}>{badgeSummary.budget}</div>
            <div className={`text-[10px] ${actionFilter === "budget" ? "text-green-600" : t.t4}`}>creatives performing well</div>
          </button>

          {/* Needs exclusion */}
          <button
            onClick={() => setActionFilter(actionFilter === "excluded" ? null : "excluded")}
            className={`flex flex-col gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
              actionFilter === "excluded"
                ? "border-red-400 bg-red-50 shadow-sm"
                : `${t.card} ${t.divider} hover:border-red-300`
            }`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${actionFilter === "excluded" ? "text-red-700" : t.t4}`}>🚫 Needs Exclusion</div>
            <div className={`text-2xl font-black ${actionFilter === "excluded" ? "text-red-700" : "text-red-500"}`}>{badgeSummary.excluded}</div>
            <div className={`text-[10px] ${actionFilter === "excluded" ? "text-red-600" : t.t4}`}>high cost / no orders</div>
          </button>

          {/* Authorization needed */}
          <button
            onClick={() => setActionFilter(actionFilter === "auth" ? null : "auth")}
            className={`flex flex-col gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
              actionFilter === "auth"
                ? "border-amber-400 bg-amber-50 shadow-sm"
                : `${t.card} ${t.divider} hover:border-amber-300`
            }`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${actionFilter === "auth" ? "text-amber-700" : t.t4}`}>🔑 Authorization Needed</div>
            <div className={`text-2xl font-black ${actionFilter === "auth" ? "text-amber-700" : "text-amber-500"}`}>{badgeSummary.auth}</div>
            <div className={`text-[10px] ${actionFilter === "auth" ? "text-amber-600" : t.t4}`}>contact creator for auth code</div>
          </button>
        </div>
      )}

      {/* ── Flat filtered view (individual creatives) ── */}
      {actionFilter !== null && (
        <div className={`${t.card} border ${t.divider} rounded-xl overflow-hidden mb-3`}>
          <div className={`flex items-center gap-3 px-4 py-3 border-b ${t.divider} ${dark ? "bg-white/5" : "bg-gray-50"}`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${t.t2}`}>
              {actionFilter === "budget"   ? "💰 Add Budget" :
               actionFilter === "excluded" ? "🚫 Needs Exclusion" : "🔑 Authorization Needed"}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              actionFilter === "budget"   ? "bg-green-100 text-green-700" :
              actionFilter === "excluded" ? "bg-red-100 text-red-700"     : "bg-amber-100 text-amber-700"
            }`}>{flatFilteredEntries.length} creatives</span>
            <button onClick={() => setActionFilter(null)} className={`ml-auto text-xs ${t.t4} hover:${t.t2}`}>← Back to all</button>
          </div>
          {flatFilteredEntries.length === 0 ? (
            <div className={`text-center py-10 text-sm ${t.t4}`}>No creatives match</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={dark ? "bg-slate-900/60" : "bg-gray-50"}>
                    <th className={`text-left px-4 py-2.5 font-semibold ${t.t4}`}>Product</th>
                    <th className={`text-left px-3 py-2.5 font-semibold ${t.t4}`}>Video ID</th>
                    <th className={`text-left px-3 py-2.5 font-semibold ${t.t4}`}>Creator / Title</th>
                    <th className={`text-left px-3 py-2.5 font-semibold ${t.t4}`}>Type</th>
                    <th className={`text-right px-3 py-2.5 font-semibold ${t.t4}`}>Cost</th>
                    <th className={`text-right px-3 py-2.5 font-semibold ${t.t4}`}>Orders</th>
                    <th className={`text-right px-3 py-2.5 font-semibold ${t.t4}`}>Cost/Order</th>
                    <th className={`text-right px-3 py-2.5 font-semibold ${t.t4}`}>Revenue</th>
                    <th className={`text-right px-3 py-2.5 font-semibold ${t.t4}`}>ROI</th>
                    <th className={`text-right px-3 py-2.5 font-semibold ${t.t4}`}>CTR</th>
                    <th className={`text-center px-3 py-2.5 font-semibold ${t.t4}`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {flatFilteredEntries.map((e, i) => {
                    const rowBg = i % 2 === 1 ? (dark ? "bg-white/[0.02]" : "bg-gray-50/50") : "";
                    return (
                      <tr key={e.id} className={`border-t ${t.divider} ${rowBg}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {e.image_url
                              ? <img src={e.image_url} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0"/>
                              : <div className={`w-7 h-7 rounded-lg ${t.bar} flex items-center justify-center text-[9px] font-bold ${t.t4} shrink-0`}>#{e.product_no}</div>
                            }
                            <span className={`font-bold ${t.t1}`}>#{e.product_no}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-2.5 font-mono text-[10px] ${t.t3}`}>{e.video_id || "–"}</td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <div className={`font-medium ${t.t1} truncate`} title={e.video_title || ""}>{e.video_title || "–"}</div>
                          <div className={`text-[10px] ${t.t4} truncate`}>{e.tiktok_account || "–"}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${e.creative_type === "Video" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>
                            {e.creative_type === "Video" ? "🎬 Video" : "🃏 Card"}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono ${t.t2}`}>${e.cost.toFixed(2)}</td>
                        <td className={`px-3 py-2.5 text-right font-bold ${e.sku_orders > 0 ? "text-green-600" : t.t4}`}>{e.sku_orders || "–"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${e.cost_per_order > 10 ? "text-red-600 font-bold" : e.cost_per_order > 0 && e.cost_per_order < 1 && e.sku_orders > 0 ? "text-green-600 font-bold" : t.t2}`}>
                          {e.cost_per_order > 0 ? `$${e.cost_per_order.toFixed(2)}` : "–"}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono ${t.t2}`}>${e.gross_revenue.toFixed(2)}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${e.roi >= 15 ? "text-green-600" : e.roi > 0 ? "text-amber-600" : t.t4}`}>
                          {e.roi > 0 ? e.roi.toFixed(1) : "–"}
                        </td>
                        <td className={`px-3 py-2.5 text-right ${t.t3}`}>{pct(e.click_rate)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusCls(e.status)}`}>
                            {e.status || "–"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Product list (grouped, shown only when no filter active) ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <span className={`${t.t4} text-sm`}>Loading creatives…</span>
        </div>
      ) : actionFilter === null ? (
        <div className="space-y-3">
          {filteredProducts.length === 0 && (
            <div className={`text-center py-12 ${t.t4} text-sm`}>No products found</div>
          )}
          {filteredProducts.map(product => {
            const isExpanded = expandedProducts.has(product.product_no);
            const allEntries = [...product.videos, ...product.product_cards];

            // Aggregate metrics for this product
            const totalCost    = allEntries.reduce((s, e) => s + e.cost, 0);
            const totalOrders  = allEntries.reduce((s, e) => s + e.sku_orders, 0);
            const totalRev     = allEntries.reduce((s, e) => s + e.gross_revenue, 0);
            const avgROI       = allEntries.filter(e => e.roi > 0).reduce((s, e, _, a) => s + e.roi / a.length, 0);

            const hasBudget   = allEntries.some(e => getCreativeBadge(e)?.type === "budget");
            const hasExcluded = allEntries.some(e => getCreativeBadge(e)?.type === "excluded");
            const hasAuth     = allEntries.some(e => getCreativeBadge(e)?.type === "auth");

            const budgetCount   = allEntries.filter(e => getCreativeBadge(e)?.type === "budget").length;
            const excludedCount = allEntries.filter(e => getCreativeBadge(e)?.type === "excluded").length;
            const authCount     = allEntries.filter(e => getCreativeBadge(e)?.type === "auth").length;

            return (
              <div key={product.product_no} className={`${t.card} border ${t.divider} rounded-xl overflow-hidden shadow-sm`}>
                {/* ── Product row (always visible) ── */}
                <div
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${dark ? "hover:bg-white/5" : "hover:bg-gray-50"}`}
                  onClick={() => toggleProduct(product.product_no)}>

                  {/* Image */}
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 ring-1 ring-black/10" />
                  ) : (
                    <div className={`w-11 h-11 rounded-xl ${t.bar} flex items-center justify-center text-xs font-bold ${t.t4} shrink-0`}>
                      #{product.product_no}
                    </div>
                  )}

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold text-sm ${t.t1}`}>#{product.product_no}</span>
                      {product.warehouse_name && <span className={`text-xs ${t.t3} truncate`}>{product.warehouse_name}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-[10px] ${t.t4}`}>{product.videos.length} videos · {product.product_cards.length} cards</span>
                    </div>
                  </div>

                  {/* Aggregate stats */}
                  <div className="hidden sm:flex items-center gap-5 shrink-0">
                    <div className="text-center">
                      <div className={`text-[10px] ${t.t4} uppercase tracking-wider`}>Cost</div>
                      <div className={`text-sm font-bold ${t.t2}`}>${totalCost.toFixed(0)}</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-[10px] ${t.t4} uppercase tracking-wider`}>Orders</div>
                      <div className={`text-sm font-bold ${totalOrders > 0 ? "text-green-600" : t.t4}`}>{totalOrders}</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-[10px] ${t.t4} uppercase tracking-wider`}>Revenue</div>
                      <div className={`text-sm font-bold ${t.t2}`}>${totalRev.toFixed(0)}</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-[10px] ${t.t4} uppercase tracking-wider`}>Avg ROI</div>
                      <div className={`text-sm font-bold ${avgROI >= 15 ? "text-green-600" : avgROI > 0 ? "text-amber-600" : t.t4}`}>
                        {avgROI > 0 ? avgROI.toFixed(1) : "–"}
                      </div>
                    </div>
                  </div>

                  {/* Action badges */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {hasBudget   && <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 rounded-lg">💰 {budgetCount}</span>}
                    {hasExcluded && <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 rounded-lg">🚫 {excludedCount}</span>}
                    {hasAuth     && <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded-lg">🔑 {authCount}</span>}
                    <svg className={`w-4 h-4 ${t.t4} ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </div>

                {/* ── Expanded creative rows ── */}
                {isExpanded && (
                  <div className={`border-t ${t.divider}`}>

                    {/* Videos */}
                    {product.videos.length > 0 && (
                      <div>
                        <div className={`flex items-center gap-2 px-4 py-2 ${dark ? "bg-white/5" : "bg-gray-50"} border-b ${t.divider}`}>
                          <span className="text-xs">🎬</span>
                          <span className={`text-xs font-bold uppercase tracking-wider ${t.t3}`}>Videos</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.bar} ${t.t4}`}>{product.videos.length}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={dark ? "bg-slate-900/60" : "bg-gray-50/80"}>
                                <th className={`text-left px-4 py-2 font-semibold ${t.t4}`}>Creator / Video</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>Cost</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>Orders</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>Cost/Order</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>Revenue</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>ROI</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>CTR</th>
                                <th className={`text-center px-3 py-2 font-semibold ${t.t4}`}>Status</th>
                                <th className={`text-center px-3 py-2 font-semibold ${t.t4}`}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.videos.map((v, i) => {
                                const badge = getCreativeBadge(v);
                                const rowBg = i % 2 === 1 ? (dark ? "bg-white/[0.02]" : "bg-gray-50/50") : "";
                                return (
                                  <tr key={v.id} className={`border-t ${t.divider} ${rowBg}`}>
                                    <td className="px-4 py-2.5 max-w-[200px]">
                                      <div className={`font-medium ${t.t1} truncate text-xs`} title={v.video_title || ""}>{v.video_title || "–"}</div>
                                      <div className={`${t.t4} truncate text-[10px]`}>{v.tiktok_account || "–"}</div>
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-mono ${t.t2}`}>${v.cost.toFixed(2)}</td>
                                    <td className={`px-3 py-2.5 text-right font-bold ${v.sku_orders > 0 ? "text-green-600" : t.t4}`}>{v.sku_orders || "–"}</td>
                                    <td className={`px-3 py-2.5 text-right font-mono ${v.cost_per_order > 10 ? "text-red-600 font-bold" : v.cost_per_order > 0 && v.cost_per_order < 1 && v.sku_orders > 0 ? "text-green-600 font-bold" : t.t2}`}>
                                      {v.cost_per_order > 0 ? `$${v.cost_per_order.toFixed(2)}` : "–"}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-mono ${t.t2}`}>${v.gross_revenue.toFixed(2)}</td>
                                    <td className={`px-3 py-2.5 text-right font-semibold ${v.roi >= 15 ? "text-green-600" : v.roi > 0 ? "text-amber-600" : t.t4}`}>
                                      {v.roi > 0 ? v.roi.toFixed(1) : "–"}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right ${t.t3}`}>{pct(v.click_rate)}</td>
                                    <td className="px-3 py-2.5 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusCls(v.status)}`}>
                                        {v.status || "–"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      {badge ? (
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${badge.cls}`}>
                                          {badge.type === "budget"   ? "💰 Add Budget" :
                                           badge.type === "excluded"  ? "🚫 Exclude Now" :
                                           "🔑 Authorization Needed"}
                                        </span>
                                      ) : <span className={`text-[10px] ${t.t5}`}>—</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Product Cards */}
                    {product.product_cards.length > 0 && (
                      <div className={product.videos.length > 0 ? `border-t ${t.divider}` : ""}>
                        <div className={`flex items-center gap-2 px-4 py-2 ${dark ? "bg-white/5" : "bg-gray-50"} border-b ${t.divider}`}>
                          <span className="text-xs">🃏</span>
                          <span className={`text-xs font-bold uppercase tracking-wider ${t.t3}`}>Product Cards</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.bar} ${t.t4}`}>{product.product_cards.length}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={dark ? "bg-slate-900/60" : "bg-gray-50/80"}>
                                <th className={`text-right px-4 py-2 font-semibold ${t.t4}`}>Cost</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>Orders</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>Cost/Order</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>Revenue</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>ROI</th>
                                <th className={`text-right px-3 py-2 font-semibold ${t.t4}`}>CTR</th>
                                <th className={`text-center px-3 py-2 font-semibold ${t.t4}`}>Status</th>
                                <th className={`text-center px-3 py-2 font-semibold ${t.t4}`}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.product_cards.map((c, i) => {
                                const badge = getCreativeBadge(c);
                                const rowBg = i % 2 === 1 ? (dark ? "bg-white/[0.02]" : "bg-gray-50/50") : "";
                                return (
                                  <tr key={c.id} className={`border-t ${t.divider} ${rowBg}`}>
                                    <td className={`px-4 py-2.5 text-right font-mono ${t.t2}`}>${c.cost.toFixed(2)}</td>
                                    <td className={`px-3 py-2.5 text-right font-bold ${c.sku_orders > 0 ? "text-green-600" : t.t4}`}>{c.sku_orders || "–"}</td>
                                    <td className={`px-3 py-2.5 text-right font-mono ${c.cost_per_order > 10 ? "text-red-600 font-bold" : c.cost_per_order > 0 && c.cost_per_order < 1 && c.sku_orders > 0 ? "text-green-600 font-bold" : t.t2}`}>
                                      {c.cost_per_order > 0 ? `$${c.cost_per_order.toFixed(2)}` : "–"}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-mono ${t.t2}`}>${c.gross_revenue.toFixed(2)}</td>
                                    <td className={`px-3 py-2.5 text-right font-semibold ${c.roi >= 15 ? "text-green-600" : c.roi > 0 ? "text-amber-600" : t.t4}`}>
                                      {c.roi > 0 ? c.roi.toFixed(1) : "–"}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right ${t.t3}`}>{pct(c.click_rate)}</td>
                                    <td className="px-3 py-2.5 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusCls(c.status)}`}>
                                        {c.status || "–"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      {badge ? (
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${badge.cls}`}>
                                          {badge.type === "budget"   ? "💰 Add Budget" :
                                           badge.type === "excluded"  ? "🚫 Exclude Now" :
                                           "🔑 Authorization Needed"}
                                        </span>
                                      ) : <span className={`text-[10px] ${t.t5}`}>—</span>}
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
      ) : null}

      {/* ── Upload modal ── */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${t.card} rounded-2xl p-6 w-full max-w-md shadow-2xl border ${t.divider}`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-base font-bold ${t.t1}`}>Upload Creative Data</h3>
              <button onClick={() => { setShowUploadModal(false); setError(""); }}
                className={`${t.t4} hover:${t.t2} p-1.5 rounded-lg transition-colors`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            {error && <div className="mb-3 p-2.5 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold ${t.t3} uppercase tracking-wider mb-2`}>Store</label>
                <div className={`flex gap-1 ${t.bar}/50 rounded-xl p-1 border ${t.divider}`}>
                  {CREATIVE_STORES.map(s => (
                    <button key={s} onClick={() => setStore(s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${store === s ? "bg-violet-600 text-white shadow-sm" : `${t.t3}`}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold ${t.t3} uppercase tracking-wider mb-1.5`}>Date From</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-xl text-sm ${t.inp}`} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold ${t.t3} uppercase tracking-wider mb-1.5`}>Date To</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-xl text-sm ${t.inp}`} />
                </div>
              </div>
              <div>
                <label className={`block text-xs font-semibold ${t.t3} uppercase tracking-wider mb-1.5`}>Creative Report Excel</label>
                <label className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  uploadFile ? "border-violet-400 bg-violet-50" : `${t.divider} hover:border-violet-300`
                }`}>
                  <input type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                  <span className="text-2xl">{uploadFile ? "📄" : "📁"}</span>
                  <div>
                    <div className={`text-sm font-medium ${uploadFile ? "text-violet-700" : t.t3}`}>
                      {uploadFile ? uploadFile.name : "Click to select file"}
                    </div>
                    <div className={`text-[10px] ${t.t4} mt-0.5`}>
                      {uploadFile ? `${(uploadFile.size/1024).toFixed(0)} KB` : ".xlsx / .xls"}
                    </div>
                  </div>
                </label>
              </div>
              <div className={`p-3 ${t.bar}/50 rounded-xl border ${t.divider} text-xs ${t.t3} space-y-1`}>
                <p className="font-semibold">💡 What gets imported:</p>
                <p>· All rows (Delivering + Authorization needed)</p>
                <p>· Product # extracted from campaign name</p>
                <p>· Videos and Product Cards separated automatically</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowUploadModal(false); setError(""); }}
                className={`flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium ${t.t3} ${t.btn}`}>
                Cancel
              </button>
              <button onClick={handleUpload} disabled={uploading || !uploadFile || !dateFrom || !dateTo}
                className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-all">
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    Uploading…
                  </span>
                ) : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
