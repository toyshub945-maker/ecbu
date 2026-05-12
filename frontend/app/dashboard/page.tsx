"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import { api } from "@/lib/api";
import type { ThemeDef } from "@/lib/theme";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STORE_HEX: Record<string,string> = { TK1:"#3b82f6", TK2:"#10b981", TK3:"#f97316", TK4:"#a855f7" };
const STORE_NAMES: Record<string,string> = { TK1:"CELNEPHO", TK2:"CYNLLIO", TK3:"VIMISAOI", TK4:"Mikarka" };

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n/1_000).toFixed(1)}K`;
  return n.toFixed(dec);
}

// ─── Target Modal ─────────────────────────────────────────────────────────────
function TargetModal({ year, month, existing, onClose, onSaved, t }: {
  year: number; month: number; existing: any; onClose: () => void; onSaved: () => void; t: ThemeDef;
}) {
  const MN = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [gmv, setGmv]         = useState(existing?.target_gmv?.toString() || "");
  const [orders, setOrders]   = useState(existing?.target_orders?.toString() || "");
  const [products, setProducts] = useState(existing?.target_products?.toString() || "");
  const [notes, setNotes]     = useState(existing?.notes || "");
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState("");

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      await api.upsertTarget({ year, month,
        target_gmv:      gmv      ? parseFloat(gmv)   : null,
        target_orders:   orders   ? parseInt(orders)   : null,
        target_products: products ? parseInt(products) : null,
        notes: notes || null,
      });
      onSaved(); onClose();
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`${t.card} rounded-3xl shadow-2xl w-full max-w-md p-6`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className={`${t.t1} font-black text-lg`}>🎯 Set Monthly Target</h2>
            <p className={`${t.t4} text-sm mt-0.5`}>{MN[month]} {year}</p>
          </div>
          <button onClick={onClose} className={`${t.t4} hover:${t.t1} p-1.5 rounded-xl transition-colors`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="space-y-4">
          {[
            { label:"GMV Target ($)", val:gmv, set:setGmv, ph:"e.g. 50000", icon:"💵" },
            { label:"Orders Target",  val:orders, set:setOrders, ph:"e.g. 2000", icon:"📦" },
            { label:"Products",       val:products, set:setProducts, ph:"e.g. 150", icon:"🗂️" },
          ].map(f => (
            <div key={f.label}>
              <label className={`text-xs font-semibold ${t.t3} mb-1.5 flex items-center gap-1.5 uppercase tracking-wider`}>
                {f.icon} {f.label}
              </label>
              <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} type="number"
                className={`w-full ${t.inp} border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40`}/>
            </div>
          ))}
          <div>
            <label className={`text-xs font-semibold ${t.t3} mb-1.5 flex items-center gap-1.5 uppercase tracking-wider`}>📝 Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Notes…"
              className={`w-full ${t.inp} border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none`}/>
          </div>
        </div>
        {msg && <div className="mt-3 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{msg}</div>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className={`flex-1 py-2.5 ${t.btnAlt} rounded-xl text-sm font-semibold transition-all`}>Cancel</button>
          <button onClick={save} disabled={saving}
            className={`flex-1 py-2.5 ${t.btn} rounded-xl text-sm font-bold transition-all disabled:opacity-40`}>
            {saving ? "Saving…" : "Save Target"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ pct, color, size = 64, t }: { pct: number; color: string; size?: number; t: ThemeDef }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - Math.min(pct / 100, 1) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.ringTrack} strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{transition:"stroke-dashoffset 0.8s ease"}}/>
    </svg>
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, t }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl text-xs border"
         style={{ background: t.ttBg, borderColor: t.ttBorder }}>
      <p className="mb-1.5 font-medium" style={{color:"#94a3b8"}}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full" style={{background:p.color}}/>
          <span style={{color:"#cbd5e1"}}>{p.name}</span>
          <span className="font-bold ml-auto pl-3" style={{color:"#fff"}}>
            {p.dataKey==="gmv"?`$${fmt(p.value)}`:fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Best Performer Card ──────────────────────────────────────────────────────
function BestPerformerCard({ team, t }: { team: any[]; t: ThemeDef }) {
  const sorted = [...team].sort((a,b)=>b.done_count-a.done_count);
  const top = sorted[0];
  if (!top || top.done_count === 0) return null;
  const totalDone = sorted.reduce((s:number, m:any) => s+m.done_count, 0);
  const pct = totalDone > 0 ? Math.round(top.done_count/totalDone*100) : 0;
  const initials = top.name.split(" ").map((p:string)=>p[0]).join("").slice(0,2).toUpperCase();
  const AVATAR_COLORS = ["#7c3aed","#2563eb","#059669","#d97706","#dc2626","#db2777"];
  const avatarColor = AVATAR_COLORS[top.name.charCodeAt(0) % AVATAR_COLORS.length];

  return (
    <div className={`relative overflow-hidden ${t.card} rounded-3xl p-5 h-full`}>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[80px] opacity-[0.06] select-none">🏆</div>
      <div className="relative flex flex-col h-full">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <span>🏆</span>
          <span className={t.t4}>Best Performer · This Month</span>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black text-white shadow-lg shrink-0"
               style={{background:avatarColor}}>
            {initials}
          </div>
          <div>
            <div className={`${t.t1} font-black text-sm leading-tight`}>
              Congratulations {top.name.split(" ")[0]}! 🎉
            </div>
            <div className={`${t.t4} text-[10px] mt-0.5`}>Top task completion</div>
          </div>
        </div>
        <div className="flex items-end gap-3 mb-3">
          <div>
            <div className={`text-2xl font-black ${t.accentTxt}`}>{top.done_count.toLocaleString()}</div>
            <div className={`text-[10px] ${t.t5}`}>tasks done</div>
          </div>
          <div className="mb-1">
            <span className={`text-xs font-bold ${t.positive}`}>{pct}% of team</span>
            <span className="text-[10px] ml-1">🚀</span>
          </div>
        </div>
        <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden mt-auto`}>
          <div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-violet-500 to-green-500 transition-all"
               style={{width:`${Math.min(pct,100)}%`}}/>
        </div>
      </div>
    </div>
  );
}

// ─── Team Table ───────────────────────────────────────────────────────────────
function TeamTable({ team, users, t }: { team: any[]; users: any[]; t: ThemeDef }) {
  const ROLE_ICONS: Record<string,string> = { admin:"👑", manager:"🛠️", member:"👤", viewer:"👁️" };
  const AVATAR_COLORS = ["#7c3aed","#2563eb","#059669","#d97706","#dc2626","#db2777","#0891b2","#65a30d"];
  const STATUS: Record<string,string> = {
    Active:   "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
    Pending:  "bg-amber-500/15 text-amber-400 border border-amber-500/25",
    Inactive: "bg-zinc-700/50 text-zinc-500 border border-zinc-600/25",
  };
  const merged = users.map(u => {
    const tm = team.find(x=>x.name===u.name);
    const done = tm?.done_count ?? 0;
    const status = done >= 5 ? "Active" : done >= 1 ? "Pending" : "Inactive";
    return {...u, done_count:done, status};
  }).sort((a,b)=>b.done_count-a.done_count);
  if (!merged.length) return null;

  return (
    <div className={`${t.card} rounded-3xl overflow-hidden`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b ${t.divider}`}>
        <div>
          <h2 className={`${t.t1} font-black text-base`}>👥 Team Members</h2>
          <p className={`${t.t4} text-xs mt-0.5`}>{merged.length} members · task activity</p>
        </div>
      </div>
      {/* Header */}
      <div className={`grid grid-cols-12 px-5 py-2 border-b ${t.divider} ${t.card2.includes("gray") ? "bg-gray-50" : ""}`}>
        {[["USER",3],["EMAIL",4],["ROLE",2],["TASKS",1],["STATUS",2]].map(([h,span]) => (
          <div key={h as string} className={`col-span-${span} text-[10px] font-bold ${t.t5} uppercase tracking-wider`}>{h}</div>
        ))}
      </div>
      <div className={`divide-y ${t.divider}`}>
        {merged.map((u, i) => {
          const initials = u.name.split(" ").map((p:string)=>p[0]).join("").slice(0,2).toUpperCase();
          const col = AVATAR_COLORS[u.name.charCodeAt(0) % AVATAR_COLORS.length];
          return (
            <div key={u.id} className={`grid grid-cols-12 items-center px-5 py-3 transition-colors hover:${t.bar}/30`}>
              <div className="col-span-3 flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0"
                     style={{background:col}}>{initials}</div>
                <div className="min-w-0">
                  <div className={`text-sm font-bold ${t.t1} truncate`}>{u.name}</div>
                  {u.store_code && <div className={`text-[10px] ${t.t5}`}>{u.store_code}</div>}
                </div>
              </div>
              <div className={`col-span-4 text-sm ${t.t3} truncate pr-4`}>{u.email}</div>
              <div className="col-span-2 flex items-center gap-1.5">
                <span className="text-sm">{ROLE_ICONS[u.role]||"👤"}</span>
                <span className={`text-xs font-semibold ${t.t2} capitalize`}>{u.role}</span>
              </div>
              <div className={`col-span-1 text-sm font-bold ${t.accentTxt}`}>{u.done_count}</div>
              <div className="col-span-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold ${STATUS[u.status]}`}>
                  {u.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { theme: t, setTheme }   = useTheme();
  const [data, setData]         = useState<any>(null);
  const [users, setUsers]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState("");
  const [showTarget, setShowTarget] = useState(false);
  const [adminStoreFilter, setAdminStoreFilter] = useState<string>(""); // "" = all stores

  const load = useCallback(async (storeOverride?: string) => {
    try {
      const u2 = typeof window !== "undefined"
        ? (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })()
        : {};
      // Non-admin: always filter to their own store
      // Admin: use the adminStoreFilter dropdown (empty = all)
      const filterStore = u2.role !== "admin"
        ? (u2.store_code || undefined)
        : (storeOverride !== undefined ? storeOverride : adminStoreFilter) || undefined;
      const [r, u] = await Promise.all([api.dashboardEnhanced(filterStore || undefined), api.users()]);
      setData(r); setUsers(u.users || []);
    } catch { /* fallback */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminStoreFilter]);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
  }, [router, load]);

  async function handleSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await api.feishuSync();
      setSyncMsg(`✓ ${r.total_fetched} products synced`);
      await load();
    } catch (e: any) { setSyncMsg(`✗ ${e.message}`); }
    finally { setSyncing(false); }
  }

  const totalTasks = data ? Object.values(data.task_counts as Record<string,number>).reduce((a:number,b)=>a+b,0) : 0;
  const doneTasks  = data?.task_counts?.done ?? 0;
  const user = typeof window !== "undefined"
    ? (() => { try { return JSON.parse(localStorage.getItem("user")||"{}"); } catch { return {}; } })()
    : {};
  const isAdmin   = user?.role === "admin";
  const userStore = user?.store_code as string | undefined;         // e.g. "TK1"
  // Which store are we actually viewing?
  const activeStore = isAdmin ? (adminStoreFilter || undefined) : (userStore || undefined);
  const storeName   = activeStore ? (STORE_NAMES[activeStore] || activeStore) : null;
  const viewLabel   = storeName
    ? `${activeStore} · ${storeName}`
    : "EC BU1 Overview";

  return (
    <>
      <Sidebar />

      {showTarget && data && (
        <TargetModal year={data.month.year} month={data.month.month}
          existing={data.target} onClose={()=>setShowTarget(false)} onSaved={load} t={t}/>
      )}

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

          {/* ── Top bar ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-black ${t.t1}`}>Dashboard</h1>
              <p className={`text-sm ${t.t4} mt-0.5`}>{data?.month?.label || "Loading…"} · {viewLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              {syncMsg && (
                <span className={`text-xs px-3 py-1.5 rounded-xl border font-medium ${
                  syncMsg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}>{syncMsg}</span>
              )}
              {/* Admin store filter */}
              {isAdmin && (
                <select
                  value={adminStoreFilter}
                  onChange={e => { setAdminStoreFilter(e.target.value); load(e.target.value); }}
                  className={`text-sm font-semibold px-3 py-2 rounded-xl border ${t.inp} ${t.divider} focus:outline-none focus:ring-2 focus:ring-purple-500/30`}
                >
                  <option value="">🏪 All Stores</option>
                  {Object.entries(STORE_NAMES).map(([code, name]) => (
                    <option key={code} value={code}>{code} · {name}</option>
                  ))}
                </select>
              )}
              <button onClick={()=>setShowTarget(true)}
                className={`flex items-center gap-1.5 px-3 py-2 ${t.btnAlt} text-sm font-semibold rounded-xl transition-all`}>
                🎯 Target
              </button>
              <button onClick={handleSync} disabled={syncing}
                className={`flex items-center gap-1.5 px-4 py-2 ${t.btn} text-sm font-bold rounded-xl transition-all disabled:opacity-50`}>
                <svg className={`w-3.5 h-3.5 ${syncing?"animate-spin":""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                {syncing ? "Syncing…" : "Sync Feishu"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className={`animate-spin w-10 h-10 border-2 border-t-purple-500 rounded-full`} style={{borderColor:`${t.ringTrack}`,borderTopColor:"#a855f7"}}/>
                <span className={`${t.t4} text-sm`}>Loading dashboard…</span>
              </div>
            </div>
          ) : (
            <>
              {/* ── First-week notice ─────────────────────────────── */}
              {data?.first_week_notice && (
                <div className={`bg-gradient-to-r ${t.notice} border rounded-3xl p-4 flex items-center gap-4`}>
                  <div className={`w-12 h-12 rounded-2xl ${t.accentSoft} flex items-center justify-center text-2xl shrink-0`}>🎯</div>
                  <div className="flex-1">
                    <div className={`${t.t1} font-bold text-sm`}>It's the first week of {data.month.label}!</div>
                    <div className={`${t.t3} text-xs mt-0.5`}>Set your monthly targets to track progress throughout the month.</div>
                  </div>
                  <button onClick={()=>setShowTarget(true)}
                    className={`shrink-0 px-4 py-2 ${t.noticeBtn} text-sm font-bold rounded-xl transition-all`}>
                    Set Target →
                  </button>
                </div>
              )}

              {/* ── Greeting + Metric Cards ───────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Greeting */}
                <div className={`col-span-1 md:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br ${t.greeting} p-5 border ${t.accentBorder} shadow-xl`}>
                  <div className="absolute right-0 top-0 w-32 h-32 opacity-10">
                    <div className="w-full h-full rounded-full bg-white translate-x-8 -translate-y-8"/>
                  </div>
                  <div className="relative">
                    <div className={`${t.greetSub} text-xs font-semibold uppercase tracking-wider mb-1`}>Welcome back</div>
                    <div className="text-white font-black text-xl mb-1">{user?.name || "Team"} 👋</div>
                    <div className={`${t.greetSub} text-sm mb-4`}>{viewLabel} · {data?.month?.label}</div>
                    <div className="flex items-end gap-3">
                      <div>
                        <div className={`text-[10px] ${t.greetSub} uppercase tracking-wider`}>This Month GMV</div>
                        <div className="text-3xl font-black text-white">${fmt(data?.current?.gmv)}</div>
                      </div>
                      {data?.delta?.gmv != null && (
                        <div className={`mb-1 text-sm font-bold ${data.delta.gmv>=0?"text-green-300":"text-red-300"}`}>
                          {data.delta.gmv>=0?"▲":"▼"} {Math.abs(data.delta.gmv)}% vs last month
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Orders */}
                <div className={`relative overflow-hidden rounded-3xl p-5 ${t.card}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent"/>
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-xl">📦</div>
                      {data?.delta?.orders != null && (
                        <span className={`text-xs font-bold ${data.delta.orders>=0?"text-emerald-400":"text-red-400"}`}>
                          {data.delta.orders>=0?"▲":"▼"} {Math.abs(data.delta.orders)}%
                        </span>
                      )}
                    </div>
                    <div className={`text-2xl font-black ${t.t1} mb-0.5`}>{fmt(data?.current?.orders)}</div>
                    <div className={`text-xs font-semibold ${t.t4} uppercase tracking-wider`}>Total Orders</div>
                    <div className={`text-[10px] ${t.t5} mt-0.5`}>vs {fmt(data?.previous?.orders)} last month</div>
                  </div>
                </div>

                {/* Impressions */}
                <div className={`relative overflow-hidden rounded-3xl p-5 ${t.card}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"/>
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center text-xl">📡</div>
                    </div>
                    <div className={`text-2xl font-black ${t.t1} mb-0.5`}>{fmt(data?.current?.impressions)}</div>
                    <div className={`text-xs font-semibold ${t.t4} uppercase tracking-wider`}>Impressions</div>
                    <div className={`text-[10px] ${t.t5} mt-0.5`}>{data?.current?.product_count||0} products active</div>
                  </div>
                </div>
              </div>

              {/* ── Target + Task Stats ───────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`col-span-1 md:col-span-2 ${t.card} rounded-3xl p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className={`${t.t1} font-black text-base`}>🎯 Monthly Target</h2>
                      <p className={`${t.t4} text-xs mt-0.5`}>{data?.month?.label}</p>
                    </div>
                    <button onClick={()=>setShowTarget(true)}
                      className={`text-xs font-semibold px-3 py-1.5 ${t.accentSoft} rounded-xl transition-colors border`}>
                      {data?.target ? "Edit" : "+ Set Target"}
                    </button>
                  </div>
                  {data?.target ? (
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label:"GMV", icon:"💵", actual:data.current.gmv, target:data.target.target_gmv, fmtFn:(v:number)=>`$${fmt(v)}`, color:"#10b981" },
                        { label:"Orders", icon:"📦", actual:data.current.orders, target:data.target.target_orders, fmtFn:(v:number)=>fmt(v), color:"#a855f7" },
                        { label:"Products", icon:"🗂️", actual:data.total_products, target:data.target.target_products, fmtFn:(v:number)=>fmt(v), color:"#f59e0b" },
                      ].map(k => {
                        const pct = k.target ? Math.min(Math.round(k.actual/k.target*100),100) : null;
                        return (
                          <div key={k.label} className="flex flex-col items-center text-center">
                            <div className="relative mb-2">
                              <ProgressRing pct={pct??0} color={k.color} size={72} t={t}/>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-xs font-black ${t.t1}`}>{pct!=null?`${pct}%`:"—"}</span>
                              </div>
                            </div>
                            <div className={`${t.t1} font-bold text-sm`}>{k.fmtFn(k.actual)}</div>
                            <div className={`${t.t5} text-[10px]`}>of {k.target?k.fmtFn(k.target):"—"}</div>
                            <div className={`text-[10px] ${t.t4} mt-0.5 font-semibold`}>{k.icon} {k.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 gap-3 text-center">
                      <div className="text-4xl opacity-20">🎯</div>
                      <div className={`${t.t4} text-sm`}>No target set for this month</div>
                      <button onClick={()=>setShowTarget(true)} className={`text-xs ${t.accentTxt} font-semibold`}>Click to set target →</button>
                    </div>
                  )}
                  {data?.target?.notes && (
                    <div className={`mt-3 pt-3 border-t ${t.divider} text-xs ${t.t4} italic`}>📝 {data.target.notes}</div>
                  )}
                </div>

                {/* Task stats */}
                <div className={`${t.card} rounded-3xl p-5`}>
                  <h2 className={`${t.t1} font-black text-base mb-4`}>✅ Task Status</h2>
                  <div className="space-y-3">
                    {[
                      { label:"Done",        key:"done",        color:"#10b981" },
                      { label:"In Progress", key:"in_progress", color:"#a855f7" },
                      { label:"Todo",        key:"todo",        color:"#64748b" },
                      { label:"N/A",         key:"na",          color:"#374151" },
                    ].map(s => {
                      const count = data?.task_counts?.[s.key] ?? 0;
                      const pct   = totalTasks>0 ? Math.round(count/totalTasks*100) : 0;
                      return (
                        <div key={s.key}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={`${t.t3} font-medium`}>{s.label}</span>
                            <span className={`${t.t1} font-bold`}>{count.toLocaleString()} <span className={`${t.t5} font-normal`}>({pct}%)</span></span>
                          </div>
                          <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                            <div className="h-full rounded-full" style={{width:`${pct}%`,background:s.color}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`mt-4 pt-3 border-t ${t.divider} flex justify-between text-xs`}>
                    <span className={t.t4}>Total tasks</span>
                    <span className={`${t.t1} font-bold`}>{totalTasks.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* ── GMV Trend Chart ───────────────────────────────── */}
              <div className={`${t.card} rounded-3xl p-5`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className={`${t.t1} font-black text-base`}>📈 Monthly GMV Trend</h2>
                    <p className={`${t.t4} text-xs mt-0.5`}>Last 6 months · {storeName ? `${userStore} – ${storeName}` : "all stores combined"}</p>
                  </div>
                </div>
                {data?.trend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data.trend} margin={{top:4,right:4,left:-20,bottom:0}}>
                      <defs>
                        <linearGradient id="gGmv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#a855f7" stopOpacity={t.key==="light"?0.25:0.4}/>
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="gOrd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#22c55e" stopOpacity={t.key==="light"?0.2:0.3}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false}/>
                      <XAxis dataKey="ym" tick={{fontSize:10,fill:t.chartTick}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:t.chartTick}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<ChartTip t={t}/>}/>
                      <Area type="monotone" dataKey="gmv" name="GMV" stroke="#a855f7" strokeWidth={2.5}
                        fill="url(#gGmv)" dot={{fill:"#a855f7",r:3,strokeWidth:0}}
                        activeDot={{r:5,fill:"#a855f7",stroke:"#fff",strokeWidth:2}}/>
                      <Area type="monotone" dataKey="orders" name="Orders" stroke="#22c55e" strokeWidth={2}
                        fill="url(#gOrd)" dot={{fill:"#22c55e",r:3,strokeWidth:0}}/>
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`flex items-center justify-center h-40 ${t.t5} text-sm`}>
                    No trend data — upload TikTok exports to see monthly trends
                  </div>
                )}
              </div>

              {/* ── Store Performance + Team Progress ─────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${t.card} rounded-3xl p-5`}>
                  <h2 className={`${t.t1} font-black text-base mb-4`}>
                    🏪 {storeName ? `${activeStore} Performance` : "Store Performance"}
                  </h2>
                  {!data?.store_month?.length ? (
                    <div className={`flex flex-col items-center justify-center h-28 ${t.t5} text-sm gap-2`}>
                      <span className="text-2xl">📊</span><span>No data for this month yet</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(data.store_month as any[]).sort((a,b)=>b.gmv-a.gmv).map((s:any) => {
                        const maxGmv = Math.max(...data.store_month.map((x:any)=>x.gmv));
                        const pct = maxGmv>0?(s.gmv/maxGmv)*100:0;
                        return (
                          <div key={s.store_code}>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{background:STORE_HEX[s.store_code]||"#94a3b8"}}/>
                                <span className={`font-bold ${t.t2}`}>{s.store_code}</span>
                                <span className={t.t4}>{STORE_NAMES[s.store_code]}</span>
                              </div>
                              <div className="flex items-center gap-3 text-right">
                                <span className={t.t4}>{s.orders} orders</span>
                                <span className={`font-bold ${t.t1}`}>${fmt(s.gmv)}</span>
                              </div>
                            </div>
                            <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                              <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:STORE_HEX[s.store_code]||"#94a3b8"}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={`${t.card} rounded-3xl p-5`}>
                  <h2 className={`${t.t1} font-black text-base mb-4`}>👥 Team Progress</h2>
                  {!data?.team_progress?.length ? (
                    <div className={`flex flex-col items-center justify-center h-28 ${t.t5} text-sm gap-2`}>
                      <span className="text-2xl">👥</span><span>No assignments yet</span>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {(data.team_progress as any[]).slice(0,6).map((m:any, i:number) => {
                        const maxDone = Math.max(...data.team_progress.map((x:any)=>x.done_count),1);
                        const pct = (m.done_count/maxDone)*100;
                        const COLORS = ["#a855f7","#3b82f6","#22c55e","#f59e0b","#f97316","#ec4899"];
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                              style={{background:COLORS[i%COLORS.length]+"22",color:COLORS[i%COLORS.length]}}>
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-xs mb-1">
                                <span className={`${t.t2} font-semibold truncate`}>{m.name}</span>
                                <span className={`${t.t1} font-bold ml-2 shrink-0`}>{m.done_count}</span>
                              </div>
                              <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                                <div className="h-full rounded-full" style={{width:`${pct}%`,background:COLORS[i%COLORS.length]}}/>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Summary stats ─────────────────────────────────── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon:"📦", label:"Total Products", value:data?.total_products?.toLocaleString()||"—", color:"text-blue-400" },
                  { icon:"✅", label:"Tasks Done",     value:`${doneTasks}/${totalTasks}`,                 color:"text-emerald-400" },
                  { icon:"🔄", label:"In Progress",    value:(data?.task_counts?.in_progress||0).toLocaleString(), color:"text-purple-400" },
                  { icon:"⏳", label:"Todo",           value:(data?.task_counts?.todo||0).toLocaleString(),        color:"text-amber-400" },
                ].map(k => (
                  <div key={k.label} className={`${t.card} rounded-2xl px-4 py-3 flex items-center gap-3`}>
                    <span className="text-2xl">{k.icon}</span>
                    <div>
                      <div className={`text-lg font-black ${k.color}`}>{k.value}</div>
                      <div className={`text-[10px] ${t.t5} uppercase tracking-wider font-semibold`}>{k.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Best Performer + Leaderboard ──────────────────── */}
              {data?.team_progress?.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <BestPerformerCard team={data.team_progress} t={t}/>
                  </div>
                  <div className={`col-span-1 md:col-span-2 ${t.card} rounded-3xl p-5`}>
                    <h2 className={`${t.t1} font-black text-base mb-4`}>🏅 Leaderboard</h2>
                    <div className="space-y-2.5">
                      {[...(data.team_progress as any[])]
                        .sort((a,b)=>b.done_count-a.done_count)
                        .slice(0,5)
                        .map((m:any, i:number) => {
                          const total = (data.team_progress as any[]).reduce((s:number,x:any)=>s+x.done_count,0);
                          const pct = total>0?Math.round(m.done_count/total*100):0;
                          const MEDALS = ["🥇","🥈","🥉","4️⃣","5️⃣"];
                          const COLORS = ["#f59e0b","#94a3b8","#cd7f32","#a855f7","#3b82f6"];
                          const initials = m.name.split(" ").map((p:string)=>p[0]).join("").slice(0,2).toUpperCase();
                          return (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-lg w-6 text-center shrink-0">{MEDALS[i]}</span>
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                                   style={{background:COLORS[i]+"22",color:COLORS[i]}}>
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className={`${t.t2} font-semibold truncate`}>{m.name}</span>
                                  <span className={`${t.t1} font-bold ml-2 shrink-0`}>{m.done_count} <span className={`${t.t5} font-normal text-[10px]`}>({pct}%)</span></span>
                                </div>
                                <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                                  <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:COLORS[i]}}/>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Team Members Table ────────────────────────────── */}
              {users.length > 0 && (
                <TeamTable team={data?.team_progress||[]} users={users} t={t}/>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
