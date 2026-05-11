"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ComposedChart,
} from "recharts";
import { api } from "@/lib/api";
import type { PMProduct, PMDetail, PerfTier } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeDef } from "@/lib/theme";

const STORES = ["TK1","TK2","TK3","TK4"] as const;
const STORE_HEX: Record<string,string> = { TK1:"#3b82f6", TK2:"#10b981", TK3:"#f97316", TK4:"#a855f7" };
const STORE_NAMES: Record<string,string> = { TK1:"CELNEPHO", TK2:"CYNLLIO", TK3:"VIMISAOI", TK4:"Mikarka" };

const PERF: Record<PerfTier,{ label:string; icon:string; color:string; bg:string; ring:string; bar:string; headerBg:string; dot:string }> = {
  high:    { label:"High",    icon:"🔥", color:"text-emerald-700", bg:"bg-emerald-50",  ring:"ring-emerald-200", bar:"bg-emerald-500", headerBg:"from-emerald-50 via-white to-white", dot:"bg-emerald-500" },
  mid:     { label:"Mid",     icon:"📈", color:"text-blue-700",    bg:"bg-blue-50",     ring:"ring-blue-200",    bar:"bg-blue-500",    headerBg:"from-blue-50 via-white to-white",    dot:"bg-blue-500"    },
  growing: { label:"Growing", icon:"🌱", color:"text-amber-700",   bg:"bg-amber-50",    ring:"ring-amber-200",   bar:"bg-amber-500",   headerBg:"from-amber-50 via-white to-white",   dot:"bg-amber-500"   },
  low:     { label:"Low",     icon:"❄️", color:"text-gray-600",    bg:"bg-gray-100",    ring:"ring-gray-300",    bar:"bg-gray-400",    headerBg:"from-gray-50 via-white to-white",    dot:"bg-gray-400"    },
  none:    { label:"No Data", icon:"—",  color:"text-slate-400",   bg:"bg-slate-50",    ring:"ring-slate-200",   bar:"bg-slate-300",   headerBg:"from-slate-50 via-white to-white",   dot:"bg-slate-300"   },
};

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}K`;
  return n.toFixed(dec);
}

function profitClr(v: number | null | undefined) {
  if (v == null) return "text-gray-400";
  if (v >= 20) return "text-emerald-600"; if (v >= 10) return "text-amber-600";
  if (v >= 0)  return "text-orange-600";  return "text-red-600";
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, prefix = "" }: any) {
  if (!active || !payload?.length) return null;
  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");
  return (
    <div className={`${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"} rounded-xl px-3 py-2 shadow-lg text-xs border`}>
      <p className={`${isDark ? "text-slate-400" : "text-gray-500"} mb-1.5 font-medium`}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className={isDark ? "text-slate-300" : "text-gray-600"}>{p.name}</span>
          <span className={`font-bold ml-auto pl-4 ${isDark ? "text-white" : "text-gray-900"}`}>{prefix}{fmt(p.value)}</span>
        </div>
      ))}
    </div>  );
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────
function UploadPanel({ onClose, onUploaded, t }: { onClose: () => void; onUploaded: () => void; t: ThemeDef }) {
  const { themeKey } = useTheme();
  const [store, setStore]   = useState<string>("TK1");
  const [file, setFile]     = useState<File | null>(null);
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHist]  = useState<any[]>([]);
  const [loadHist, setLoadHist] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    setLoadHist(true);
    try { const r = await api.getTiktokExportList(store, "pm"); setHist(r.periods || []); }
    catch { setHist([]); } finally { setLoadHist(false); }
  }, [store]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.importTiktokExport(file, store, "pm");
      setMsg({ ok: true, text: `Imported ${r.imported} products · ${r.period_start} → ${r.period_end}` });
      setFile(null); if (fileRef.current) fileRef.current.value = "";
      await loadHistory(); onUploaded();
    } catch (e: any) { setMsg({ ok: false, text: e.message || "Upload failed" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`w-[460px] ${t.card} h-full flex flex-col shadow-2xl border-l ${t.divider}`}>
        <div className={`px-5 py-4 border-b ${t.divider} flex items-center justify-between shrink-0 ${themeKey !== "light" ? "bg-slate-900" : "bg-gray-50"}`}>
          <div>
            <h2 className={`font-bold ${t.t1} text-sm`}>Upload Analytics Data</h2>
            <p className={`text-xs ${t.t4} mt-0.5`}>TikTok export · orders + traffic</p>
          </div>
          <button onClick={onClose} className={`${t.t4} hover:${t.t2} p-1.5 rounded-lg ${themeKey !== "light" ? "hover:bg-slate-800" : "hover:bg-gray-100"} transition-colors`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className={`text-[11px] font-semibold ${t.t4} uppercase tracking-wider mb-2`}>Store</div>
            <div className="grid grid-cols-4 gap-2">
              {STORES.map(s => (
                <button key={s} onClick={() => setStore(s)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1.5 border ${
                    store === s
                      ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                      : `${t.card} ${t.t3} border ${themeKey !== "light" ? "border-slate-700 hover:border-violet-500" : "border-gray-200 hover:border-violet-300"} hover:text-violet-500`
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{background: STORE_HEX[s]}} />
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { icon:"📦", label:"Orders", items:["GMV","Orders count","Items sold","AOV","Refunds"] },
              { icon:"📡", label:"Traffic", items:["Impressions","Clicks","CTR","Add-to-cart","CVR"] },
            ].map(cat => (
              <div key={cat.label} className={`${themeKey !== "light" ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"} rounded-xl p-3 border`}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{cat.icon}</span>
                  <span className={`text-xs font-semibold ${t.t2}`}>{cat.label}</span>
                </div>
                {cat.items.map(item => (
                  <div key={item} className="flex items-center gap-1.5 py-0.5">
                    <span className="w-1 h-1 rounded-full bg-violet-400" />
                    <span className={`text-[10px] ${t.t4}`}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className={`text-[11px] ${themeKey !== "light" ? "text-violet-400 bg-violet-950 border-violet-800" : "text-violet-700 bg-violet-50 border-violet-200"} border rounded-xl px-3 py-2.5`}>
            💡 Download from <span className="font-medium">TikTok Seller Center → Analytics → Product Performance</span>
          </div>

          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all ${
            file
              ? "border-violet-400 bg-violet-50"
              : `${themeKey !== "light" ? "border-slate-700 hover:border-violet-500 hover:bg-slate-800" : "border-gray-200 hover:border-violet-300 hover:bg-gray-50"}`
          }`}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { setFile(e.target.files?.[0] || null); setMsg(null); }} />
            {file ? (
              <>
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-xl">📄</div>
                <span className="text-sm font-semibold text-violet-700">{file.name}</span>
                <span className={`text-xs ${t.t4}`}>{(file.size/1024).toFixed(0)} KB</span>
              </>
            ) : (
              <>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${t.bar.split(" ")[0]}`}>📁</div>
                <span className={`text-sm ${t.t3}`}>Click to select .xlsx file</span>
                <span className={`text-xs ${t.t4}`}>TikTok Product Performance Export</span>
              </>
            )}
          </label>

          {msg && (
            <div className={`text-xs px-3 py-2.5 rounded-xl border font-medium ${
              msg.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
            }`}>{msg.ok ? "✓ " : "✗ "}{msg.text}</div>
          )}

          <button onClick={handleUpload} disabled={!file || busy}
            className={`w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm`}>
            {busy ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Importing…</> : <>📤 Import to {store}</>}
          </button>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-semibold ${t.t4} uppercase tracking-wider`}>History · {store}</span>
              {loadHist && <div className={`w-3 h-3 border ${themeKey !== "light" ? "border-slate-600 border-t-slate-300" : "border-gray-300 border-t-gray-500"} rounded-full animate-spin`} />}
            </div>
            {history.length === 0 ? (
              <div className={`text-xs ${t.t4} text-center py-4 ${themeKey !== "light" ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"} rounded-xl border`}>No uploads yet</div>
            ) : (
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <div key={i} className={`flex items-center justify-between ${themeKey !== "light" ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"} rounded-xl px-3 py-2.5 border`}>
                    <div>
                      <div className={`text-xs font-semibold ${t.t2}`}>{h.period_start} → {h.period_end}</div>
                      <div className={`text-[10px] ${t.t4} mt-0.5`}>{h.product_count} products · ${h.total_gmv?.toFixed(0) ?? "—"} GMV</div>
                    </div>
                    <div className={`text-[10px] ${t.t4} flex items-center gap-2`}>
                      {new Date(h.imported_at).toLocaleDateString(undefined,{month:"short",day:"numeric"})}
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm("Delete this upload?")) return;
                          try {
                            await api.deleteTiktokExport(store, h.period_start, h.period_end, "pm");
                            loadHistory();
                            onUploaded();
                          } catch (err: any) {
                            alert(err.message || "Failed to delete");
                          }
                        }}
                        className={`text-red-500 hover:text-red-700 p-1 rounded transition-colors ${themeKey !== "light" ? "hover:bg-red-500/20" : "hover:bg-red-50"}`}
                        title="Delete this upload"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>  );
}

// ─── Chart Section ────────────────────────────────────────────────────────────
function ChartSection({ monthly, t }: { monthly: PMDetail["monthly"]; t: ThemeDef }) {
  const { themeKey } = useTheme();
  const [tab, setTab] = useState<"orders" | "gmv" | "traffic">("orders");

  if (!monthly.length) {
    return (
      <div className="flex flex-col items-center justify-center h-52 gap-3">
        <div className={`w-14 h-14 rounded-2xl ${t.bar} flex items-center justify-center text-2xl`}>📭</div>
        <p className={`${t.t3} text-sm font-medium`}>No TikTok export data yet</p>
        <p className={`${t.t4} text-xs`}>Upload a TikTok export file to see charts</p>
      </div>
    );
  }

  const data = monthly.map(m => ({
    label: m.period_start.slice(0,7),
    orders:      m.orders,
    gmv:         Math.round(m.gmv),
    impressions: m.impressions,
    clicks:      m.clicks,
    ctr:         +m.ctr.toFixed(2),
    items_sold:  m.items_sold,
  }));

  const TABS = [
    { key:"orders",  label:"Orders",  color:"#7c3aed", fill:"#7c3aed" },
    { key:"gmv",     label:"GMV",     color:"#059669", fill:"#059669" },
    { key:"traffic", label:"Traffic", color:"#2563eb", fill:"#2563eb" },
  ] as const;

  const activeTab = TABS.find(x => x.key === tab)!;
  const useBars = data.length < 3;
  const gridColor = themeKey !== "light" ? "#334155" : "#e5e7eb";
  const tickFill = themeKey !== "light" ? "#64748b" : "#9ca3af";

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label:"Total Orders", value: monthly.reduce((s,m)=>s+m.orders,0),      fmt:(v:number)=>v.toLocaleString(),  color:"text-violet-700", bg:"bg-violet-50 border-violet-200" },
          { label:"Total GMV",    value: monthly.reduce((s,m)=>s+m.gmv,0),          fmt:(v:number)=>`$${fmt(v)}`,        color:"text-emerald-700", bg:"bg-emerald-50 border-emerald-200" },
          { label:"Total Impr.",  value: monthly.reduce((s,m)=>s+m.impressions,0),  fmt:(v:number)=>fmt(v),              color:"text-blue-700", bg:"bg-blue-50 border-blue-200" },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl p-3 border ${k.bg}`}>
            <div className={`text-[10px] ${t.t4} uppercase tracking-wider mb-1 font-semibold`}>{k.label}</div>
            <div className={`text-lg font-bold ${k.color}`}>{k.fmt(k.value)}</div>
          </div>
        ))}
      </div>

      <div className={`flex items-center gap-1 mb-4 ${t.bar} rounded-xl p-1 w-fit border ${t.divider}`}>
        {TABS.map(x => (
          <button key={x.key} onClick={() => setTab(x.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              tab === x.key
                ? `${t.card} ${t.t1} shadow-sm`
                : `${t.t4} hover:${t.t2}`
            }`}>
            {x.label}
          </button>
        ))}
      </div>

      <div className={`${themeKey !== "light" ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"} rounded-2xl p-4 border`}>
        <ResponsiveContainer width="100%" height={200}>
          {tab === "traffic" ? (
            useBars ? (
              <BarChart data={data} margin={{top:4,right:4,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip />}/>
                <Bar dataKey="impressions" name="Impressions" fill="#2563eb" radius={[4,4,0,0]} />
                <Bar dataKey="clicks" name="Clicks" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            ) : (
              <ComposedChart data={data} margin={{top:4,right:4,left:-20,bottom:0}}>
                <defs>
                  <linearGradient id="gImp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gClk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip />}/>
                <Area type="monotone" dataKey="impressions" name="Impressions" stroke="#2563eb" strokeWidth={2} fill="url(#gImp)" dot={{fill:"#2563eb",r:3,strokeWidth:0}}/>
                <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#f59e0b" strokeWidth={2} fill="url(#gClk)" dot={{fill:"#f59e0b",r:3,strokeWidth:0}}/>
              </ComposedChart>
            )
          ) : useBars ? (
            <BarChart data={data} margin={{top:4,right:4,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
              <Tooltip content={<CustomTooltip prefix={tab==="gmv"?"$":""} />}/>
              <Bar dataKey={tab} name={tab.charAt(0).toUpperCase()+tab.slice(1)} radius={[6,6,0,0]}>
                {data.map((_, i) => <Cell key={i} fill={activeTab.color}/>)}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{top:4,right:4,left:-20,bottom:0}}>
              <defs>
                <linearGradient id={`grad-${tab}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={activeTab.color} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={activeTab.color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:tickFill}} axisLine={false} tickLine={false}/>
              <Tooltip content={<CustomTooltip prefix={tab==="gmv"?"$":""} />}/>
              <Area type="monotone" dataKey={tab} stroke={activeTab.color} strokeWidth={2.5}
                fill={`url(#grad-${tab})`}
                dot={{ fill: activeTab.color, r: 4, strokeWidth: 2, stroke:"#fff" }}
                activeDot={{ r: 6, fill: activeTab.color, stroke: "#fff", strokeWidth: 2 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>  );
}

// ─── Stock Section ────────────────────────────────────────────────────────────
function StockSection({ stock, t }: { stock: PMDetail["stock"]; t: ThemeDef }) {
  const { themeKey } = useTheme();
  if (!stock.total && !stock.groups.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className={`w-12 h-12 rounded-2xl ${t.bar} flex items-center justify-center text-xl`}>📦</div>
        <p className={`${t.t3} text-sm`}>No stock data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Stat */}
      <div className={`${t.card} rounded-3xl p-5 border ${t.divider} flex items-center justify-between shadow-sm relative overflow-hidden group`}>
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <span className="text-6xl font-black">STOCK</span>
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl text-white shadow-lg shadow-blue-200">📦</div>
          <div>
            <div className={`text-[10px] ${t.t4} uppercase tracking-[0.2em] font-black mb-0.5`}>Current Inventory</div>
            <div className={`text-3xl font-black ${t.t1} tracking-tight`}>{stock.total.toLocaleString()} <span className={`text-sm font-bold ${t.t4}`}>units</span></div>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-2xl font-black text-[10px] uppercase tracking-wider border shadow-sm relative z-10 ${
          stock.total === 0 ? "bg-red-50 text-red-600 border-red-100" :
          stock.total < 50 ? "bg-amber-50 text-amber-600 border-amber-100" :
          "bg-emerald-50 text-emerald-600 border-emerald-100"
        }`}>
          {stock.total === 0 ? "Out of Stock" : stock.total < 50 ? "Low Stock Level" : "Optimal Levels"}
        </div>
      </div>

      <div className="space-y-6">
        {stock.groups.map((g, idx) => (
          <div key={idx} className={`${t.card} rounded-2xl border ${t.divider} overflow-hidden shadow-sm`}>
            <div className={`px-4 py-3 ${themeKey !== "light" ? "bg-white/5" : "bg-gray-50/80"} border-b ${t.divider} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📦</span>
                <h3 className={`font-bold ${t.t1}`}>{g.sheet_name}</h3>
              </div>
              <div className={`text-xs font-bold ${t.t3}`}>
                Total: <span className={t.t1}>{g.total.toLocaleString()}</span> units
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                {/* Header */}
                <div className={`grid grid-cols-[1.5fr_100px_140px_100px] px-4 py-2 text-[10px] font-black uppercase tracking-wider ${t.t4} bg-opacity-50 border-b ${t.divider}`}>
                  <div>Color / Variant / SKU</div>
                  <div className="text-right">Stock</div>
                  <div className="px-4 text-center">Share %</div>
                  <div className="text-right pr-2">Status</div>
                </div>
                
                {/* Rows */}
                {g.variants.map((v, i) => (
                  <div key={i} className={`grid grid-cols-[1.5fr_100px_140px_100px] items-center px-4 py-3 border-b last:border-0 ${t.divider} hover:${themeKey !== "light" ? "bg-white/5" : "bg-gray-50/50"} transition-all`}>
                    <div className="min-w-0 pr-4">
                      <div className={`text-xs font-bold ${t.t1} truncate mb-0.5`}>
                        {v.warehouse_name || "Unknown Warehouse"}
                      </div>
                      <div className={`text-[10px] font-mono ${t.t4} truncate opacity-70`}>
                        {v.sku}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className={`text-xs font-black ${
                        v.stock === 0 ? "text-red-500" : v.stock < 10 ? "text-amber-500" : t.t1
                      }`}>{v.stock.toLocaleString()}</span>
                    </div>

                    <div className="px-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`}>
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              v.stock === 0 ? "bg-red-400" : 
                              v.stock < 10 ? "bg-amber-400" : 
                              "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                            }`} 
                            style={{ width: `${v.percent}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-black ${t.t2} w-9 text-right`}>{v.percent}%</span>
                      </div>
                    </div>

                    <div className="text-right pr-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                        v.stock === 0 
                          ? "bg-red-100 text-red-700" 
                          : v.stock < 10 
                            ? "bg-amber-100 text-amber-700" 
                            : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {v.stock === 0 ? "Empty" : v.stock < 10 ? "Critical" : "Good"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pricing Section ──────────────────────────────────────────────────────────
function PricingSection({ pricing, cost, t }: { pricing: PMDetail["pricing"]; cost: number | null; t: ThemeDef }) {
  const { themeKey } = useTheme();
  const stores = Object.keys(pricing);
  if (!stores.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className={`w-12 h-12 rounded-2xl ${t.bar} flex items-center justify-center text-xl`}>💰</div>
        <p className={`${t.t3} text-sm`}>No pricing data — sync Feishu</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {cost != null && (
        <div className={`${themeKey !== "light" ? "bg-amber-950 border-amber-800" : "bg-amber-50 border-amber-200"} rounded-2xl px-4 py-3 border flex items-center gap-4`}>
          <div className={`text-xs font-semibold ${themeKey !== "light" ? "text-amber-400" : "text-amber-700"}`}>Cost</div>
          <div className={`font-bold ${themeKey !== "light" ? "text-amber-300" : "text-amber-900"}`}>¥{cost}</div>
          <div className={themeKey !== "light" ? "text-amber-700" : "text-amber-300"}>·</div>
          <div className={`text-xs ${themeKey !== "light" ? "text-amber-400" : "text-amber-700"}`}>≈ <span className="font-bold">${(cost/7+11).toFixed(2)}</span> USD landed</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {stores.map(store => {
          const d = pricing[store];
          const isRange = !!d.price_max && d.price_max !== d.price;
          const wa = d.profit_with_ads;
          const woa = d.profit_without_ads;
          const barW = (v: number | null | undefined) => v == null ? 0 : Math.min(Math.max(v, 0), 40) / 40 * 100;
          const barClr = (v: number | null | undefined) =>
            v == null ? "bg-gray-200" : v >= 20 ? "bg-emerald-500" : v >= 10 ? "bg-amber-400" : v >= 0 ? "bg-orange-400" : "bg-red-400";
          return (
            <div key={store} className={`${t.card} rounded-2xl p-4 border ${t.divider} shadow-sm`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{background: STORE_HEX[store] || "#94a3b8"}}/>
                <span className={`text-xs font-bold ${t.t1}`}>{store}</span>
                <span className={`text-[10px] ${t.t4}`}>{STORE_NAMES[store]}</span>
              </div>
              <div className={`text-xl font-bold ${t.t1} mb-3`}>
                {isRange ? `$${d.price.toFixed(2)}–$${d.price_max!.toFixed(2)}` : `$${d.price.toFixed(2)}`}
              </div>
              <div className="space-y-2">
                {[{label:"w/ Ads",v:wa},{label:"w/o Ads",v:woa}].map(row=>(
                  <div key={row.label}>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className={t.t4}>{row.label}</span>
                      <span className={`font-bold ${profitClr(row.v)}`}>
                        {row.v != null ? `${row.v>0?"+":""}${row.v}%` : "—"}
                      </span>
                    </div>
                    <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                      <div className={`h-full rounded-full ${barClr(row.v)}`} style={{width:`${barW(row.v)}%`}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>  );
}

// ─── R&R Section ─────────────────────────────────────────────────────────────
function RRSection({ rr, t }: { rr: PMDetail["rr"]; t: ThemeDef }) {
  const { themeKey } = useTheme();
  const stores = Object.keys(rr.by_store);
  if (!stores.length && rr.overall == null) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className={`w-12 h-12 rounded-2xl ${t.bar} flex items-center justify-center text-xl`}>↩️</div>
        <p className={`${t.t3} text-sm font-medium`}>No R&R data matched</p>
        <p className={`${t.t4} text-xs`}>Upload R&R data in the R&R Rate section</p>
      </div>
    );
  }
  const rrClr    = (r:number) => r<=5?"text-emerald-700":r<=15?"text-amber-700":"text-red-700";
  const rrBarClr = (r:number) => r<=5?"bg-emerald-500":r<=15?"bg-amber-400":"bg-red-500";
  const rrBadge  = (r:number) => r<=5?"bg-emerald-50 text-emerald-700 border-emerald-200":r<=15?"bg-amber-50 text-amber-700 border-amber-200":"bg-red-50 text-red-700 border-red-200";
  const rrLabel  = (r:number) => r<=5?"✓ Excellent":r<=15?"⚠ Moderate":"✗ High Risk";

  return (
    <div className="space-y-4">
      {rr.overall != null && (
        <div className={`rounded-2xl px-5 py-4 border shadow-sm ${rrBadge(rr.overall)} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${t.card2} flex items-center justify-center text-xl`}>↩️</div>
            <div>
              <div className={`text-[10px] ${t.t4} uppercase tracking-wider font-semibold`}>Overall R&R Rate</div>
              <div className={`text-3xl font-black ${rrClr(rr.overall)}`}>{rr.overall}%</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-bold ${rrClr(rr.overall)}`}>{rrLabel(rr.overall)}</div>
            <div className={`text-[10px] ${t.t5} mt-0.5`}>Target: ≤5%</div>
          </div>
        </div>
      )}
      {stores.length > 0 && (
        <div className={`${t.card} rounded-2xl border ${t.divider} overflow-hidden shadow-sm`}>
          <div className={`px-4 py-2.5 border-b ${t.divider} ${themeKey !== "light" ? "bg-slate-800" : "bg-gray-50"}`}>
            <span className={`text-[10px] font-bold ${t.t4} uppercase tracking-wider`}>By Store</span>
          </div>
          {stores.map(sc => {
            const d = rr.by_store[sc];
            const pct = Math.min(d.rr_rate, 30) / 30 * 100;
            return (
              <div key={sc} className={`px-4 py-3 border-b ${t.divider} last:border-0`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{background:STORE_HEX[sc]||"#94a3b8"}}/>
                    <span className={`text-xs font-bold ${t.t2}`}>{sc}</span>
                    <span className={`text-[10px] ${t.t4}`}>{STORE_NAMES[sc]}</span>
                  </div>
                  <span className={`text-sm font-black ${rrClr(d.rr_rate)}`}>{d.rr_rate}%</span>
                </div>
                <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden mb-1.5`}>
                  <div className={`h-full rounded-full ${rrBarClr(d.rr_rate)}`} style={{width:`${Math.max(pct,d.rr_rate>0?2:0)}%`}}/>
                </div>
                <div className={`flex gap-4 text-[10px] ${t.t4}`}>
                  <span>Orders <b className={t.t3}>{d.order_qty.toLocaleString()}</b></span>
                  <span>Returns <b className={t.t3}>{d.return_qty.toLocaleString()}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({ productNo, onClose, t }: { productNo: string; onClose: () => void; t: ThemeDef }) {
  const { themeKey } = useTheme();
  const [detail, setDetail] = useState<PMDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview"|"stock"|"pricing"|"rr">("overview");

  useEffect(() => {
    setLoading(true); setDetail(null);
    api.pmDetail(productNo).then(setDetail).catch(console.error).finally(()=>setLoading(false));
  }, [productNo]);

  const TABS = [
    {key:"overview",icon:"📊",label:"Overview"},
    {key:"stock",   icon:"📦",label:"Stock"},
    {key:"pricing", icon:"💰",label:"Pricing"},
    {key:"rr",      icon:"↩️",label:"R&R Rate"},
  ] as const;

  const perf = detail ? PERF[detail.performance] : null;

  return (
    <div className={`flex flex-col h-full ${t.card}`}>
      <div className={`relative overflow-hidden shrink-0 bg-gradient-to-b ${perf ? perf.headerBg : themeKey !== "light" ? "from-slate-900 via-slate-950 to-slate-950" : "from-gray-50 via-white to-white"}`}>
        <div className={`flex items-center gap-4 px-6 py-5 border-b ${t.divider}`}>
          {detail?.product.image_url ? (
            <img src={detail.product.image_url} alt="" className="w-16 h-16 rounded-2xl object-cover shadow-md ring-2 ring-white shrink-0" />
          ) : (
            <div className={`w-16 h-16 rounded-2xl ${t.bar} shrink-0 flex items-center justify-center text-3xl ${t.t4} ring-2 ring-white shadow-sm`}>□</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-lg font-black ${t.t1}`}>#{productNo}</span>
              {detail && perf && (
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${perf.bg} ${perf.color} ${perf.ring}`}>
                  {perf.icon} {perf.label}
                </span>
              )}
            </div>
            {detail?.product.warehouse_name && (
              <div className={`text-sm ${t.t3} truncate mt-0.5`}>{detail.product.warehouse_name}</div>
            )}
            {detail?.product.status && (
              <div className={`text-[10px] ${t.t4} mt-1 uppercase tracking-wider font-medium`}>{detail.product.status}</div>
            )}
          </div>
          <button onClick={onClose} className={`${t.t4} hover:${t.t2} p-2 rounded-xl ${themeKey !== "light" ? "hover:bg-slate-800" : "hover:bg-gray-100"} transition-colors shrink-0`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full" />
            <span className={`${t.t4} text-sm`}>Loading product data…</span>
          </div>
        </div>
      ) : detail ? (
        <>
          <div className={`grid grid-cols-4 gap-2 px-5 py-3 shrink-0 border-b ${t.divider} ${themeKey !== "light" ? "bg-slate-900/50" : "bg-gray-50/50"}`}>
            {[
              { label:"Orders",     value: fmt(detail.latest_orders),
                sub: detail.monthly.at(-1)?.period_start?.slice(0,7),
                color: perf?.color || t.t1, bg:t.card, icon:"📦" },
              { label:"Latest GMV", value: `$${fmt(detail.monthly.at(-1)?.gmv)}`,
                color:"text-emerald-700", bg:t.card, icon:"💵" },
              { label:"Stock",      value: detail.stock.total.toLocaleString(),
                color: detail.stock.total===0?"text-red-600":detail.stock.total<50?"text-amber-600":t.t1,
                bg:t.card, icon:"🏭" },
              { label:"R&R Rate",   value: detail.rr.overall!=null?`${detail.rr.overall}%`:"—",
                color: detail.rr.overall==null?t.t4:detail.rr.overall>15?"text-red-600":detail.rr.overall>5?"text-amber-600":"text-emerald-600",
                bg:t.card, icon:"↩️" },
            ].map(k => (
              <div key={k.label} className={`rounded-2xl px-3 py-2.5 border ${t.divider} shadow-sm ${k.bg}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">{k.icon}</span>
                  <span className={`text-[9px] ${t.t4} uppercase tracking-wider font-bold`}>{k.label}</span>
                </div>
                <div className={`text-lg font-black ${k.color}`}>{k.value}</div>
                {k.sub && <div className={`text-[9px] ${t.t4} mt-0.5`}>{k.sub}</div>}
              </div>
            ))}
          </div>

          <div className={`flex px-5 border-b ${t.divider} shrink-0 ${t.card}`}>
            {TABS.map(x => (
              <button key={x.key} onClick={() => setTab(x.key)}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold transition-all border-b-2 -mb-px ${
                  tab === x.key
                    ? "border-violet-600 text-violet-700"
                    : `border-transparent ${t.t4} hover:${t.t2}`
                }`}>
                <span>{x.icon}</span>{x.label}
              </button>
            ))}
          </div>

          <div className={`flex-1 overflow-y-auto px-5 py-5 ${t.card}`}>
            {tab === "overview" && <ChartSection monthly={detail.monthly} t={t} />}
            {tab === "stock"    && <StockSection stock={detail.stock} t={t} />}
            {tab === "pricing"  && <PricingSection pricing={detail.pricing} cost={detail.product.cost} t={t} />}
            {tab === "rr"       && <RRSection rr={detail.rr} t={t} />}
          </div>
        </>
      ) : (
        <div className={`flex-1 flex items-center justify-center ${t.t4} text-sm`}>Failed to load</div>
      )}
    </div>  );
}

// ─── Product List Item ────────────────────────────────────────────────────────
function ProductItem({ p, active, onClick, t }: { p: PMProduct; active: boolean; onClick: () => void; t: ThemeDef }) {
  const { themeKey } = useTheme();
  const perf = PERF[p.performance];
  return (
    <button onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group border ${
        active
          ? `${themeKey !== "light" ? "bg-violet-950 border-violet-800" : "bg-violet-50 border-violet-200"} shadow-sm`
          : `hover:${t.bar} border-transparent hover:${t.divider}`
      }`}>
      <div className={`w-0.5 self-stretch rounded-full ${perf.bar} shrink-0 ${active?"opacity-100":"opacity-30 group-hover:opacity-60"}`} />
      {p.image_url ? (
        <img src={p.image_url} alt="" className={`w-10 h-10 rounded-xl object-cover ${t.bar} shrink-0 ring-1 ${t.divider}`} />
      ) : (
        <div className={`w-10 h-10 rounded-xl ${t.bar} shrink-0 flex items-center justify-center ${t.t4} text-sm ring-1 ${t.divider}`}>□</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${active ? "text-violet-500" : t.t1}`}>#{p.product_no}</span>
          <span className={`text-[9px] font-bold ${perf.color}`}>{perf.icon}</span>
        </div>
        <div className={`text-[10px] ${t.t4} truncate`}>{p.warehouse_name || "—"}</div>
        <div className={`flex items-center gap-2 mt-0.5`}>
          {p.total_orders > 0 && <span className={`text-[10px] ${t.t4}`}>{p.total_orders.toLocaleString()} orders</span>}
          {p.total_stock > 0  && <span className={`text-[10px] ${t.t4} opacity-60`}>{p.total_stock} stock</span>}
        </div>
      </div>
      {p.total_gmv > 0 && (
        <div className={`shrink-0 text-xs font-bold ${active?"text-emerald-500":"text-emerald-500"}`}>${fmt(p.total_gmv)}</div>
      )}
    </button>
  );
}

// ─── Module-level cache (survives tab navigation, cleared on upload) ──────────
let _pmCache: PMProduct[] | null = null;
let _pmCacheTime = 0;
const PM_CACHE_TTL = 60_000; // 60 seconds

// ─── Main Page ────────────────────────────────────────────────────────────────
const PERF_FILTERS: {key:PerfTier|"all"; label:string}[] = [
  {key:"all",     label:"All"},
  {key:"high",    label:"🔥 High"},
  {key:"mid",     label:"📈 Mid"},
  {key:"growing", label:"🌱 Growing"},
  {key:"low",     label:"❄️ Low"},
  {key:"none",    label:"— No Data"},
];

export default function ProductManagerPage() {
  const { theme: t, themeKey } = useTheme();
  const [products, setProducts]     = useState<PMProduct[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState("");
  const [search, setSearch]         = useState("");
  const [perfFilter, setPerf]       = useState<PerfTier|"all">("all");
  const [selectedNo, setSelected]   = useState<string|null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async (skipCache = false) => {
    // Serve cached list instantly on repeat visits (no search active)
    if (!search && !skipCache && _pmCache && Date.now() - _pmCacheTime < PM_CACHE_TTL) {
      setProducts(_pmCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api.pmProducts(search || undefined);
      setProducts(r.products);
      if (!search) { _pmCache = r.products; _pmCacheTime = Date.now(); }
    }
    catch(e) { console.error(e); } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const x = setTimeout(()=>setSearch(q),300); return()=>clearTimeout(x); }, [q]);

  const counts = {
    high:    products.filter(p=>p.performance==="high").length,
    mid:     products.filter(p=>p.performance==="mid").length,
    growing: products.filter(p=>p.performance==="growing").length,
    low:     products.filter(p=>p.performance==="low").length,
    none:    products.filter(p=>p.performance==="none").length,
  };
  const filtered = perfFilter==="all" ? products : products.filter(p=>p.performance===perfFilter);

  return (
    <>
      <Sidebar />

      {showUpload && (
        <UploadPanel onClose={()=>setShowUpload(false)} onUploaded={()=>{ _pmCache=null; load(true); setShowUpload(false); }} t={t} />
      )}

      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${t.page}`}>
        <div className={`px-6 py-3.5 border-b ${t.divider} ${t.card} shrink-0 flex items-center justify-between gap-4`}>
          <div>
            <h1 className={`text-base font-black ${t.t1} tracking-tight`}>🗂️ Product Manager</h1>
            <p className={`text-[11px] ${t.t4} mt-0.5`}>Orders · Traffic · Stock · Pricing · R&R</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 ${themeKey !== "light" ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"} rounded-xl px-3 py-1.5 border`}>
              <span className={`text-[10px] ${t.t4}`}>{products.length} products</span>
              <span className={t.t4}>·</span>
              {counts.none === products.length && products.length > 0 ? (
                <span className={`text-[10px] font-bold text-slate-400`}>No analytics data — upload to classify</span>
              ) : (
                <>
                  {[
                    {label:"High",    count:counts.high,    color:"text-emerald-600"},
                    {label:"Mid",     count:counts.mid,     color:"text-blue-600"},
                    {label:"Growing", count:counts.growing, color:"text-amber-600"},
                    {label:"Low",     count:counts.low,     color:t.t4},
                  ].map(k => (
                    <span key={k.label} className={`text-[10px] font-bold ${k.color}`}>{k.count} {k.label}</span>
                  ))}
                  {counts.none > 0 && <span className={`text-[10px] font-bold text-slate-400`}>{counts.none} No Data</span>}
                </>
              )}
            </div>
            <button onClick={()=>setShowUpload(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              Upload Data
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className={`w-72 shrink-0 flex flex-col ${t.card} border-r ${t.divider} min-h-0`}>
            <div className={`p-3 border-b ${t.divider} shrink-0`}>
              <div className="relative">
                <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${t.t4}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search product…"
                  className={`w-full pl-9 pr-3 py-2 text-xs ${t.inp} rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400`}/>
              </div>
            </div>

            <div className={`px-3 py-2 border-b ${t.divider} shrink-0`}>
              <div className="flex flex-wrap gap-1">
                {PERF_FILTERS.map(f => {
                  const cnt = f.key !== "all" ? counts[f.key as PerfTier] : undefined;
                  // Hide tier filter buttons that have 0 products (except "all" and "none" when all are none)
                  if (f.key !== "all" && f.key !== "none" && cnt === 0 && counts.none === products.length) return null;
                  return (
                    <button key={f.key} onClick={()=>setPerf(f.key)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all border ${
                        perfFilter===f.key
                          ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                          : `${t.card} ${t.t3} border ${t.divider} hover:border-violet-300 hover:text-violet-600`
                      }`}>
                      {f.label}{cnt !== undefined ? ` (${cnt})` : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`px-4 py-1.5 shrink-0 ${themeKey !== "light" ? "bg-slate-900" : "bg-gray-50"} border-b ${t.divider}`}>
              <span className={`text-[9px] ${t.t4} uppercase tracking-wider font-semibold`}>{filtered.length} / {products.length} products</span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2 pt-1 space-y-0.5">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin w-5 h-5 border-2 border-violet-200 border-t-violet-600 rounded-full"/>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <span className="text-2xl">🔍</span>
                  <span className={`${t.t4} text-xs`}>No products found</span>
                </div>
              ) : filtered.map(p => (
                <ProductItem key={p.product_no} p={p} active={selectedNo===p.product_no}
                  onClick={()=>setSelected(p.product_no===selectedNo?null:p.product_no)} t={t}/>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            {selectedNo ? (
              <div className="h-full">
                <DetailPanel productNo={selectedNo} onClose={()=>setSelected(null)} t={t} />
              </div>
            ) : (
              <div className={`flex flex-col items-center justify-center h-full gap-5 text-center px-8 ${themeKey !== "light" ? "bg-slate-900/50" : "bg-gray-50"}`}>
                <div className={`w-20 h-20 rounded-3xl ${t.card} flex items-center justify-center text-4xl ring-1 ${t.divider} shadow-sm`}>🗂️</div>
                <div>
                  <p className={`text-lg font-bold ${t.t2}`}>Select a product</p>
                  <p className={`text-sm ${t.t4} mt-1`}>Click any product from the list to view full analytics</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2 max-w-xs w-full text-left">
                  {[
                    {icon:"📊",label:"Monthly Charts",  desc:"Orders, GMV & traffic trends"},
                    {icon:"📦",label:"Stock Levels",    desc:"Color/variant breakdown"},
                    {icon:"💰",label:"Profit Margins",  desc:"Per-store pricing & profit"},
                    {icon:"↩️",label:"R&R Rate",        desc:"Return & refund by store"},
                  ].map(f => (
                    <div key={f.label} className={`${t.card} rounded-2xl p-3 border ${t.divider} shadow-sm`}>
                      <div className="text-xl mb-1">{f.icon}</div>
                      <div className={`text-xs font-semibold ${t.t2}`}>{f.label}</div>
                      <div className={`text-[10px] ${t.t4} mt-0.5`}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
