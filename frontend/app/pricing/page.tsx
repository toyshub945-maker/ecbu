"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { PricingProduct } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeDef } from "@/lib/theme";

const STORES = ["TK1", "TK2", "TK3", "TK4"] as const;
const STORE_NAMES: Record<string, string> = {
  TK1: "CELNEPHO", TK2: "CYNLLIO", TK3: "VIMISAOI", TK4: "Mikarka",
};
const STORE_COLORS: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  TK1: { dot: "bg-blue-500",    bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  TK2: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  TK3: { dot: "bg-orange-500",  bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
  TK4: { dot: "bg-purple-500",  bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200" },
};

function profitStyle(v: number | null | undefined) {
  if (v == null) return { bg: "bg-slate-100", text: "text-slate-400", label: "—" };
  const label = `${v > 0 ? "+" : ""}${v}%`;
  if (v >= 20) return { bg: "bg-emerald-100", text: "text-emerald-700", label };
  if (v >= 10) return { bg: "bg-amber-100",   text: "text-amber-700",   label };
  if (v >= 0)  return { bg: "bg-orange-100",  text: "text-orange-600",  label };
  return { bg: "bg-red-100", text: "text-red-600", label };
}

function ProfitBar({ value, t }: { value: number | null | undefined; t: ThemeDef }) {
  if (value == null) return <div className={`h-1 rounded ${t.bar} w-full`} />;
  const pct = Math.min(Math.max(value, 0), 40);
  const color = value >= 20 ? "bg-emerald-400" : value >= 10 ? "bg-amber-400" : value >= 0 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className={`h-1 rounded ${t.bar} w-full overflow-hidden`}>
      <div className={`h-full rounded ${color}`} style={{ width: `${(pct / 40) * 100}%` }} />
    </div>
  );
}

function ProductCard({ product, storeFilter, mode, t }: {
  product: PricingProduct; storeFilter: string;
  mode: "with_ads" | "without_ads" | "both"; t: ThemeDef;
}) {
  const visibleStores = storeFilter ? [storeFilter] : STORES.filter(s => product.stores[s]);

  return (
    <div className={`${t.card} rounded-xl overflow-hidden hover:shadow-md transition-shadow`}>
      <div className={`flex items-center gap-3 p-3 border-b ${t.divider}`}>
        {product.image_url ? (
          <img src={product.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" style={{ background: t.bar === "bg-slate-800" ? "#1e293b" : "#f1f5f9" }} />
        ) : (
          <div className={`w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-xl ${t.t5}`} style={{ background: t.bar === "bg-slate-800" ? "#1e293b" : "#f1f5f9" }}>□</div>
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold ${t.t1} leading-tight`}>#{product.product_no}</div>
          <div className={`text-[10px] ${t.t4} truncate mt-0.5`}>{product.warehouse_name || "No name"}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-xs ${t.t4}`}>Cost</div>
          <div className={`text-sm font-bold ${t.t2}`}>¥{product.cost_rmb}</div>
        </div>
      </div>

      <div className={`divide-y ${t.divider}`}>
        {visibleStores.map(s => {
          const d = product.stores[s];
          if (!d) return null;
          const sc = STORE_COLORS[s];
          const wa  = profitStyle(d.profit_with_ads);
          const woa = profitStyle(d.profit_without_ads);
          const mainProfit = mode === "without_ads" ? d.profit_without_ads : d.profit_with_ads;

          const isRange = !!d.price_max && d.price_max !== d.price;
          const waMax  = profitStyle(d.profit_with_ads_max);
          const woaMax = profitStyle(d.profit_without_ads_max);
          const mainProfitMax = mode === "without_ads" ? d.profit_without_ads_max : d.profit_with_ads_max;

          return (
            <div key={s} className="px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  <span className={`text-xs font-medium ${sc.text}`}>{s}</span>
                  <span className={`text-xs ${t.t4}`}>{STORE_NAMES[s]}</span>
                </div>
                <span className={`text-sm font-bold ${t.t2}`}>
                  {isRange ? `$${d.price.toFixed(2)} – $${d.price_max!.toFixed(2)}` : `$${d.price.toFixed(2)}`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                {mode !== "without_ads" && (
                  isRange ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${wa.bg} ${wa.text}`}>w/ Ads {wa.label}~{waMax.label}</span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${wa.bg} ${wa.text}`}>w/ Ads {wa.label}</span>
                  )
                )}
                {mode !== "with_ads" && (
                  isRange ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${woa.bg} ${woa.text}`}>w/o Ads {woa.label}~{woaMax.label}</span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${woa.bg} ${woa.text}`}>w/o Ads {woa.label}</span>
                  )
                )}
              </div>

              <ProfitBar value={isRange ? mainProfitMax ?? mainProfit : mainProfit} t={t} />
            </div>
          );
        })}

        {visibleStores.length === 0 && (
          <div className={`px-3 py-3 text-xs ${t.t4} text-center`}>No price for this store</div>
        )}
      </div>
    </div>
  );
}

export default function PricingPage() {
  const { theme: t } = useTheme();
  const [products, setProducts]   = useState<PricingProduct[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [q, setQ]                 = useState("");
  const [search, setSearch]       = useState("");
  const [storeFilter, setStore]   = useState("");
  const [sortBy, setSort]         = useState<"name" | "cost" | "profit">("name");
  const [mode, setMode]           = useState<"both" | "with_ads" | "without_ads">("both");
  const [profitFilter, setProfitFilter] = useState<"healthy" | "moderate" | "low" | "loss" | "">("");
  const [syncing, setSyncing]           = useState(false);
  const [lastSynced, setLastSynced]     = useState<string | null>(null);
  const [syncMsg, setSyncMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPricing(storeFilter || undefined, search || undefined);
      setProducts(res.products);
      setTotal(res.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [storeFilter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.feishuStatus().then(r => setLastSynced(r.last_synced_at)).catch(() => {});
  }, []);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await api.feishuSync();
      setSyncMsg({ ok: true, text: `Synced ${r.total_fetched} products · ${r.inserted} new · ${r.updated} updated` });
      setLastSynced(new Date().toISOString());
      await load();
    } catch (e: any) {
      setSyncMsg({ ok: false, text: e.message || "Sync failed" });
    } finally { setSyncing(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const profitFiltered = profitFilter ? products.filter(p => {
    const vals = Object.values(p.stores).map(s => s.profit_with_ads ?? null).filter(v => v != null) as number[];
    if (!vals.length) return false;
    const best = Math.max(...vals);
    if (profitFilter === "healthy")  return best >= 20;
    if (profitFilter === "moderate") return best >= 10 && best < 20;
    if (profitFilter === "low")      return best >= 0  && best < 10;
    if (profitFilter === "loss")     return best < 0;
    return true;
  }) : products;

  const sorted = [...profitFiltered].sort((a, b) => {
    if (sortBy === "cost") return (b.cost_rmb || 0) - (a.cost_rmb || 0);
    if (sortBy === "profit") {
      const best = (p: PricingProduct) => {
        const vals = Object.values(p.stores).map(s => s.profit_with_ads ?? -999);
        return vals.length ? Math.max(...vals) : -999;
      };
      return best(b) - best(a);
    }
    return (a.warehouse_name || a.product_no).localeCompare(b.warehouse_name || b.product_no);
  });

  const allW: number[] = [], allWo: number[] = [];
  products.forEach(p => Object.values(p.stores).forEach(s => {
    if (s.profit_with_ads    != null) allW.push(s.profit_with_ads);
    if (s.profit_without_ads != null) allWo.push(s.profit_without_ads);
  }));
  const avg = (arr: number[]) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : "—";
  const bestPerProduct = products.map(p => {
    const vals = Object.values(p.stores).map(s => s.profit_with_ads).filter(v => v != null) as number[];
    return vals.length ? Math.max(...vals) : null;
  }).filter(v => v != null) as number[];
  const healthy = bestPerProduct.filter(v => v >= 20).length;
  const loss    = bestPerProduct.filter(v => v < 0).length;

  return (
    <>
      <Sidebar />
      <div className="flex-1 overflow-auto">
      <div className="px-6 py-6 max-w-[1400px] mx-auto">

        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className={`text-2xl font-bold ${t.t1} flex items-center gap-2`}>
              <span>💰</span> Pricing &amp; Profit
            </h1>
            <p className={`text-sm ${t.t3} mt-0.5`}>
              Store-wise pricing · Profit = 1 − Cost% − Warehouse(3%) − TikTok(8%) − Refund(10%) − Affiliate(13%)
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {syncMsg && (
              <span className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${
                syncMsg.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
              }`}>
                {syncMsg.ok ? "✓" : "✗"} {syncMsg.text}
              </span>
            )}
            {lastSynced && (
              <div className={`text-xs ${t.t4} text-right leading-tight`}>
                <div>Last synced</div>
                <div className={`${t.t3} font-medium`}>
                  {new Date(lastSynced).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            )}
            <button onClick={handleSync} disabled={syncing}
              className={`flex items-center gap-1.5 px-3 py-2 ${t.btn} text-sm font-medium rounded-lg transition-colors`}>
              <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? "Syncing…" : "Sync Feishu"}
            </button>
            <div className={`text-xs ${t.t4} ${t.card} rounded-lg px-3 py-2 whitespace-nowrap border`}>
              ¥7/$1 · First mile $1.5 · Last mile $9.5
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Products", value: total, color: t.t1 },
            { label: "Avg Profit w/ Ads", value: avg(allW) !== "—" ? `${avg(allW)}%` : "—", color: parseFloat(avg(allW)) >= 15 ? "text-emerald-600" : "text-amber-600" },
            { label: "Healthy ≥20%", value: healthy, color: "text-emerald-600" },
            { label: "Loss <0%", value: loss, color: "text-red-500" },
          ].map(k => (
            <div key={k.label} className={`${t.card} rounded-xl px-4 py-3`}>
              <div className={`text-xs ${t.t3} mb-1`}>{k.label}</div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-52 max-w-72">
            <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${t.t4}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search product..."
              className={`w-full pl-9 pr-3 py-2 text-sm ${t.inp} rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500`} />
          </div>

          <div className={`flex items-center gap-1 ${t.card} rounded-lg p-1 border`}>
            <button onClick={() => setStore("")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${!storeFilter ? `${t.accentBg} text-white` : `${t.t3} hover:${t.bar}`}`}>
              All Stores
            </button>
            {STORES.map(s => {
              const sc = STORE_COLORS[s];
              return (
                <button key={s} onClick={() => setStore(storeFilter === s ? "" : s)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${storeFilter === s ? `${t.accentBg} text-white` : `${t.t3} hover:${t.bar}`}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {s}
                </button>
              );
            })}
          </div>

          <div className={`flex items-center gap-1 ${t.card} rounded-lg p-1 border`}>
            {(["both","with_ads","without_ads"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${mode === m ? `${t.accentBg} text-white` : `${t.t3} hover:${t.bar}`}`}>
                {m === "both" ? "Both" : m === "with_ads" ? "w/ Ads" : "w/o Ads"}
              </button>
            ))}
          </div>

          <select value={sortBy} onChange={e => setSort(e.target.value as typeof sortBy)}
            className={`text-sm ${t.inp} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500`}>
            <option value="name">Sort: Name</option>
            <option value="cost">Sort: Cost ↓</option>
            <option value="profit">Sort: Profit ↓</option>
          </select>

          <span className={`text-xs ${t.t3} ml-auto`}>{sorted.length}{profitFilter ? ` / ${total}` : ""} products</span>
        </div>

        <div className="flex items-center gap-3 mb-4 text-xs flex-wrap">
          {[
            { key: "healthy",  label: "≥20% Healthy",    bg: "bg-emerald-100", text: "text-emerald-700", activeBg: "bg-emerald-500", activeText: "text-white", ring: "ring-emerald-400" },
            { key: "moderate", label: "10–20% Moderate",  bg: "bg-amber-100",   text: "text-amber-700",   activeBg: "bg-amber-500",   activeText: "text-white", ring: "ring-amber-400"   },
            { key: "low",      label: "0–10% Low",        bg: "bg-orange-100",  text: "text-orange-600",  activeBg: "bg-orange-500",  activeText: "text-white", ring: "ring-orange-400"  },
            { key: "loss",     label: "<0% Loss",         bg: "bg-red-100",     text: "text-red-600",     activeBg: "bg-red-500",     activeText: "text-white", ring: "ring-red-400"     },
          ].map(l => {
            const active = profitFilter === l.key;
            return (
              <button key={l.key} onClick={() => setProfitFilter(active ? "" : l.key as typeof profitFilter)}
                className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer select-none
                  ${active ? `${l.activeBg} ${l.activeText} ring-2 ${l.ring} shadow` : `${l.bg} ${l.text} hover:ring-2 ${l.ring} hover:shadow`}`}>
                {l.label}
              </button>
            );
          })}
          {profitFilter && (
            <button onClick={() => setProfitFilter("")} className={`${t.t4} hover:${t.t3} transition-colors ml-1`}>✕ Clear filter</button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <div className="text-4xl">💰</div>
            <div className={`font-medium ${t.t2}`}>No pricing data</div>
            <div className={`text-sm ${t.t4}`}>Sync from Feishu to load prices</div>
          </div>
        ) : (
          <div className={`grid gap-4 ${storeFilter ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
            {sorted.map(p => <ProductCard key={p.product_no} product={p} storeFilter={storeFilter} mode={mode} t={t} />)}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
