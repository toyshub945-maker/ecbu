"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeDef } from "@/lib/theme";

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
  const { theme: t } = useTheme();
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

  const dark = t.page === "bg-slate-950";
  const borderCls = dark ? "border-slate-700" : "border-gray-300";
  const theadBg = dark ? "bg-slate-800" : "bg-gray-50";
  const theadText = dark ? "text-slate-300" : "text-gray-600";
  const tbodyBorder = dark ? "border-slate-700" : "border-gray-200";
  const hoverRow = dark ? "hover:bg-slate-800" : "hover:bg-gray-50";
  const inputCls = `${t.inp} rounded-lg text-sm`;
  const selectCls = `${t.inp} rounded-lg text-sm`;

  return (
    <div className={`min-h-screen ${t.page}`}>
      <Sidebar />
      <div className="max-w-[1800px] mx-auto p-4 ml-64">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-2xl font-bold ${t.t1}`}>Ads Management</h1>
            <p className={`text-sm ${t.t3} mt-1`}>
              {summary ? `${summary.total_campaigns} campaigns • $${summary.total_spend.toFixed(2)} spend • ${summary.avg_roi}% avg ROI` : "Loading..."}
            </p>
          </div>
          <div className="flex gap-2">
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
                <input value={activeTab} disabled className={`w-full px-4 py-2 border rounded-lg ${t.page === "bg-slate-950" ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-gray-50"}`} />
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
    </div>
  );
}
