"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api";
import type { BoardData, Product, TaskInfo, User, Period } from "@/lib/types";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeDef } from "@/lib/theme";

const STORE_NAMES: Record<string, string> = {
  TK1: "CELNEPHO", TK2: "CYNLLIO", TK3: "VIMISAOI", TK4: "Mikarka",
};
const STORE_ACCENT: Record<string, string> = {
  TK1: "bg-blue-600", TK2: "bg-emerald-600", TK3: "bg-orange-600", TK4: "bg-purple-600",
};
const STATUS_CONFIG = {
  todo:        { label: "Todo",        bg: "bg-gray-100",  text: "text-gray-500",  dot: "bg-gray-400" },
  in_progress: { label: "In Progress", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-400" },
  done:        { label: "Done",        bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
  na:          { label: "N/A",         bg: "bg-slate-100", text: "text-slate-400", dot: "bg-slate-300" },
};
const STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress", in_progress: "done", done: "todo", na: "todo",
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return "–";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(decimals);
}
function pct(n: number | null | undefined) {
  if (n == null) return "–";
  return (n * 100).toFixed(1) + "%";
}

// ─── Inline editable cell ─────────────────────────────────────────────────────
function EditCell({
  value, display, onSave, prefix = "", suffix = "", isPercent = false,
}: {
  value: number | null | undefined;
  display: string;
  onSave: (v: number | null) => void;
  prefix?: string; suffix?: string; isPercent?: boolean;
}) {
  const { theme: t } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    let v = value;
    if (isPercent && v != null) v = v * 100;
    setDraft(v != null ? String(v) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  }

  function commit() {
    setEditing(false);
    const raw = draft.trim().replace(/[,$%]/g, "");
    if (raw === "" || raw === "–") { onSave(null); return; }
    let n = parseFloat(raw);
    if (isNaN(n)) { onSave(null); return; }
    if (isPercent) n = n / 100;
    onSave(n);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className={`w-full text-right text-xs border border-violet-400 rounded px-1 py-0.5 focus:outline-none ${t.inp}`}
        style={{ minWidth: 60 }}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit"
      className={`cursor-pointer hover:bg-violet-500/10 rounded px-1 py-0.5 transition-colors select-none`}
    >
      {display}
    </span>
  );
}

// ─── Full metrics modal ───────────────────────────────────────────────────────
function MetricsModal({
  product, periodId, storeCode, onClose, onSaved,
}: {
  product: Product; periodId: number; storeCode: string; onClose: () => void; onSaved: () => void;
}) {
  const { theme: t } = useTheme();
  const a = product.analytics;
  const tk = product.tk_export;
  type Fields = { [k: string]: string };

  function tkPct(v: number | null | undefined): string { return v != null ? String((v * 100).toFixed(2)) : ""; }
  function tkNum(v: number | null | undefined): string { return v != null ? String(v) : ""; }

  const [fields, setFields] = useState<Fields>({
    impressions:              a.impressions != null              ? String(a.impressions)                          : tkNum(tk?.impressions),
    page_views:               a.page_views != null               ? String(a.page_views)                           : tkNum(tk?.clicks),
    ctr:                      a.ctr != null                      ? String((a.ctr * 100).toFixed(2))               : tkPct(tk?.ctr),
    avg_visitors:             a.avg_visitors != null             ? String(a.avg_visitors)                         : tkNum(tk?.unique_clicks),
    avg_customers:            a.avg_customers != null            ? String(a.avg_customers)                        : tkNum(tk?.est_customers),
    cvr:                      a.cvr != null                      ? String((a.cvr * 100).toFixed(2))               : tkPct(tk?.ctor),
    video_impressions:        a.video_impressions != null        ? String(a.video_impressions)                    : tkNum(tk?.seller_video_gmv),
    product_card_impressions: a.product_card_impressions != null ? String(a.product_card_impressions)            : tkNum(tk?.product_card_gmv),
    live_impressions:         a.live_impressions != null         ? String(a.live_impressions)                     : tkNum(tk?.seller_live_gmv),
    items_sold:               a.items_sold != null               ? String(a.items_sold)                          : tkNum(tk?.items_sold),
    ctor:                     a.ctor != null                     ? String((a.ctor * 100).toFixed(2))              : tkPct(tk?.ctor),
    new_creators:             a.new_creators != null             ? String(a.new_creators)                        : "",
    new_videos:               a.new_videos != null               ? String(a.new_videos)                          : "",
    new_live:                 a.new_live != null                 ? String(a.new_live)                            : "",
    free_sample_cost:         a.free_sample_cost != null         ? String(a.free_sample_cost)                    : "",
    content_gmv:              a.content_gmv != null              ? String(a.content_gmv)                         : tkNum(tk?.creator_gmv != null && tk?.affiliate_video_gmv != null ? ((tk.creator_gmv ?? 0) + (tk.affiliate_video_gmv ?? 0)) : (tk?.creator_gmv ?? tk?.affiliate_video_gmv)),
    ads_spend:                a.ads_spend != null                ? (a.ads_spend === -1 ? "On" : String(a.ads_spend)) : "",
    gmv:                      a.gmv != null                      ? String(a.gmv)                                  : tkNum(tk?.gmv),
    roi:                      a.roi != null                      ? String(a.roi)                                   : "",
  });

  // Pricing data — always loaded fresh from the Pricing tab (read-only, not part of analytics save)
  const [pricingData, setPricingData] = useState<{
    cost_rmb: number | null;
    selling_price: number | null;
    selling_price_max: number | null;
    profit_with_ads: number | null;
    profit_without_ads: number | null;
    loaded: boolean;
  }>({ cost_rmb: null, selling_price: null, selling_price_max: null, profit_with_ads: null, profit_without_ads: null, loaded: false });

  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // Always fetch pricing fresh on open — no store_code filter so we get cost even without store price
  useEffect(() => {
    api.getPricing(undefined, product.product_no).then(res => {
      const p = res.products.find(x => x.product_no === product.product_no);
      const storeData = p?.stores?.[storeCode] ?? null;
      setPricingData({
        cost_rmb:          p?.cost_rmb          ?? null,
        selling_price:     storeData?.price     ?? null,
        selling_price_max: (storeData as any)?.price_max ?? null,
        profit_with_ads:   storeData?.profit_with_ads   ?? null,
        profit_without_ads: storeData?.profit_without_ads ?? null,
        loaded: true,
      });
    }).catch(() => { setPricingData(prev => ({ ...prev, loaded: true })); });
  }, [storeCode, product.product_no]); // eslint-disable-line

  useEffect(() => {
    api.getAnalyticsHistory(storeCode, product.product_no).then(res => {
      const formatted = res.history.map(row => ({
        name: row.label || row.period_start,
        Impressions: row.impressions || 0,
        Views: row.page_views || 0,
        CTR: row.ctr ? parseFloat((row.ctr * 100).toFixed(2)) : 0,
        GMV: row.gmv || 0,
      }));
      setHistory(formatted);
    }).catch(console.error);
  }, [storeCode, product.product_no]);

  const TK_SOURCED_FIELDS = new Set(
    tk ? ["impressions","page_views","ctr","avg_visitors","avg_customers","cvr",
          "video_impressions","product_card_impressions","live_impressions",
          "items_sold","ctor","content_gmv","gmv"] : []
  );

  // Revenue & Cost is now a dedicated read-only section — removed from editable groups
  const METRIC_GROUPS = [
    {
      label: "Traffic & Conversion",
      fields: [
        { key: "impressions", label: "Product Impressions", pct: false },
        { key: "page_views", label: "Page Views", pct: false },
        { key: "ctr", label: "CTR (%)", pct: false, note: "enter as %" },
        { key: "avg_visitors", label: "Avg Visitors", pct: false },
        { key: "avg_customers", label: "Avg Customers", pct: false },
        { key: "cvr", label: "Conversion Rate (%)", pct: false, note: "enter as %" },
      ],
    },
    {
      label: "Channel GMV",
      fields: [
        { key: "video_impressions", label: "Seller Video GMV ($)", pct: false },
        { key: "live_impressions", label: "Seller LIVE GMV ($)", pct: false },
        { key: "product_card_impressions", label: "Product Card GMV ($)", pct: false },
        { key: "items_sold", label: "Items Sold", pct: false },
        { key: "ctor", label: "CTOR (%)", pct: false, note: "enter as %" },
      ],
    },
    {
      label: "Affiliate & Content",
      fields: [
        { key: "content_gmv", label: "Content GMV ($)", pct: false },
      ],
    },
    {
      label: "Revenue",
      fields: [
        { key: "gmv", label: "GMV ($)", pct: false },
        { key: "roi", label: "ROI (%)", pct: false },
      ],
    },
  ];

  function parseVal(key: string, val: string): number | string | null {
    const v = val.trim().replace(/[,$%]/g, "");
    if (!v) return null;
    if (key === "ads_spend" && v.toLowerCase() === "on") return -1;
    if (key === "selling_price") return val.trim() || null;
    const pctFields = ["ctr", "cvr", "ctor"];
    const n = parseFloat(v);
    if (isNaN(n)) return null;
    return pctFields.includes(key) ? n / 100 : n;
  }

  async function save() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      product_no: product.product_no,
      period_id: periodId,
      store_code: storeCode,
    };
    for (const [k, v] of Object.entries(fields)) {
      payload[k] = parseVal(k, v);
    }
    try {
      await api.updateAnalytics(payload as Parameters<typeof api.updateAnalytics>[0]);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`${t.card} rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${t.divider}`}>
          <div>
            <h3 className={`font-semibold ${t.t1}`}>All Metrics — Product {product.product_no}</h3>
            {product.warehouse_name && <p className={`text-xs ${t.t4} mt-0.5`}>{product.warehouse_name}</p>}
          </div>
          <button onClick={onClose} className={`${t.t4} hover:${t.t1} text-xl`}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className={`mb-6 border ${t.divider} rounded-xl p-4 ${t.card2}`}>
            <h4 className={`text-xs font-bold ${t.t4} uppercase mb-4 text-center`}>Historical Trends</h4>
            {history.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line yAxisId="left" type="monotone" dataKey="Impressions" stroke="#8b5cf6" strokeWidth={2} dot={{r: 3}} activeDot={{r: 5}} />
                    <Line yAxisId="left" type="monotone" dataKey="Views" stroke="#3b82f6" strokeWidth={2} dot={{r: 3}} activeDot={{r: 5}} />
                    <Line yAxisId="left" type="monotone" dataKey="GMV" stroke="#10b981" strokeWidth={2} dot={{r: 3}} activeDot={{r: 5}} />
                    <Line yAxisId="right" type="monotone" dataKey="CTR" stroke="#f59e0b" strokeWidth={2} dot={{r: 3}} activeDot={{r: 5}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className={`flex items-center justify-center h-32 ${t.t4} text-sm`}>
                No historical data available for this product yet.
              </div>
            )}
          </div>

          {METRIC_GROUPS.map(group => (
            <div key={group.label}>
              <h4 className={`text-xs font-bold ${t.t4} uppercase mb-2`}>{group.label}</h4>
              <div className="grid grid-cols-2 gap-2">
                {group.fields.map(f => {
                  const fromTk = TK_SOURCED_FIELDS.has(f.key) && (product.analytics as any)?.[f.key] == null && fields[f.key] !== "";
                  return (
                    <div key={f.key}>
                      <label className={`text-xs ${t.t3} block mb-0.5 flex items-center gap-1`}>
                        {f.label}{f.note ? <span className={`${t.t4} ml-1`}>({f.note})</span> : ""}
                        {fromTk && <span className="bg-sky-100 text-sky-600 px-1 py-0 rounded text-[9px] font-bold ml-1">TK</span>}
                      </label>
                      <input
                        value={fields[f.key] ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp} ${fromTk ? "border-sky-500/30" : ""}`}
                        placeholder="–"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Pricing Card — always synced from Pricing tab ─────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-xs font-bold ${t.t4} uppercase flex items-center gap-1.5`}>
                💰 Cost &amp; Pricing
                <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0 rounded text-[9px] font-bold normal-case tracking-normal">
                  Synced from Pricing Tab
                </span>
              </h4>
              <a href="/pricing" target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-violet-500 hover:text-violet-700 underline underline-offset-2">
                Edit in Pricing →
              </a>
            </div>

            {!pricingData.loaded ? (
              <div className={`rounded-xl border ${t.divider} p-4 flex items-center justify-center gap-2 ${t.card2}`}>
                <svg className="w-4 h-4 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span className={`text-xs ${t.t4}`}>Loading pricing data…</span>
              </div>
            ) : pricingData.cost_rmb == null && pricingData.selling_price == null ? (
              <div className={`rounded-xl border ${t.divider} p-4 ${t.card2}`}>
                <div className={`text-xs ${t.t4} text-center`}>
                  No pricing data found for this product.{" "}
                  <a href="/pricing" target="_blank" rel="noopener noreferrer" className="text-violet-500 underline">
                    Add pricing →
                  </a>
                </div>
              </div>
            ) : (
              <div className={`rounded-xl border border-emerald-200 overflow-hidden`} style={{ background: "rgba(16,185,129,0.04)" }}>
                <div className="grid grid-cols-2 divide-x divide-y" style={{ borderColor: "#d1fae5" }}>
                  {/* Cost RMB */}
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Cost (RMB)</div>
                    <div className={`text-base font-bold ${t.t1}`}>
                      {pricingData.cost_rmb != null ? `¥${pricingData.cost_rmb}` : <span className={t.t5}>—</span>}
                    </div>
                    {pricingData.cost_rmb != null && (
                      <div className={`text-[10px] ${t.t4} mt-0.5`}>
                        ≈ ${((pricingData.cost_rmb / 7) + 11).toFixed(2)} USD landed
                      </div>
                    )}
                  </div>

                  {/* Selling Price */}
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">
                      Selling Price ({storeCode})
                    </div>
                    <div className={`text-base font-bold ${t.t1}`}>
                      {pricingData.selling_price != null ? (
                        <>
                          ${pricingData.selling_price.toFixed(2)}
                          {pricingData.selling_price_max != null && pricingData.selling_price_max !== pricingData.selling_price && (
                            <span className={`text-xs font-normal ${t.t4} ml-1`}>
                              – ${pricingData.selling_price_max.toFixed(2)}
                            </span>
                          )}
                        </>
                      ) : <span className={t.t5}>No price set for {storeCode}</span>}
                    </div>
                  </div>

                  {/* Profit with Ads */}
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Profit w/ Ads</div>
                    <div className={`text-base font-bold ${
                      pricingData.profit_with_ads == null ? t.t5 :
                      pricingData.profit_with_ads > 15 ? "text-emerald-600" :
                      pricingData.profit_with_ads > 5  ? "text-amber-600"  : "text-red-500"
                    }`}>
                      {pricingData.profit_with_ads != null ? `${pricingData.profit_with_ads.toFixed(1)}%` : "—"}
                    </div>
                  </div>

                  {/* Profit without Ads */}
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Profit w/o Ads</div>
                    <div className={`text-base font-bold ${
                      pricingData.profit_without_ads == null ? t.t5 :
                      pricingData.profit_without_ads > 20 ? "text-emerald-600" :
                      pricingData.profit_without_ads > 10 ? "text-amber-600"  : "text-red-500"
                    }`}>
                      {pricingData.profit_without_ads != null ? `${pricingData.profit_without_ads.toFixed(1)}%` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TikTok Export Analytics section */}
          {product.tk_export && (
            <div>
              <h4 className={`text-xs font-bold ${t.t4} uppercase mb-2 flex items-center gap-2`}>
                TikTok Export Data
                <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-semibold normal-case">
                  {product.tk_export.listing_status ?? "—"}
                </span>
                {product.tk_export.voc_diagnosis && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold normal-case ${
                    product.tk_export.voc_diagnosis === "Good" ? "bg-green-100 text-green-700" :
                    product.tk_export.voc_diagnosis === "Normal" ? "bg-blue-100 text-blue-700" :
                    product.tk_export.voc_diagnosis === "At Risk" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }`}>{product.tk_export.voc_diagnosis}</span>
                )}
              </h4>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[
                  { label: "GMV", val: product.tk_export.gmv != null ? `$${product.tk_export.gmv.toFixed(0)}` : "–" },
                  { label: "Orders", val: product.tk_export.orders != null ? String(product.tk_export.orders) : "–" },
                  { label: "Items Sold", val: product.tk_export.items_sold != null ? String(product.tk_export.items_sold) : "–" },
                  { label: "Impressions", val: product.tk_export.impressions != null ? String(product.tk_export.impressions) : "–" },
                  { label: "CTR", val: product.tk_export.ctr != null ? `${(product.tk_export.ctr * 100).toFixed(2)}%` : "–" },
                  { label: "CTOR", val: product.tk_export.ctor != null ? `${(product.tk_export.ctor * 100).toFixed(2)}%` : "–" },
                  { label: "Add to Cart", val: product.tk_export.add_to_cart != null ? String(product.tk_export.add_to_cart) : "–" },
                  { label: "Refunds ($)", val: product.tk_export.refunds != null ? `$${product.tk_export.refunds.toFixed(0)}` : "–" },
                  { label: "Items Refunded", val: product.tk_export.items_refunded != null ? String(product.tk_export.items_refunded) : "–" },
                  { label: "Shop Tab GMV", val: product.tk_export.shop_tab_gmv != null ? `$${product.tk_export.shop_tab_gmv.toFixed(0)}` : "–" },
                  { label: "Creator GMV", val: product.tk_export.creator_gmv != null ? `$${product.tk_export.creator_gmv.toFixed(0)}` : "–" },
                  { label: "Affiliate GMV", val: product.tk_export.affiliate_video_gmv != null ? `$${product.tk_export.affiliate_video_gmv.toFixed(0)}` : "–" },
                ].map(m => (
                  <div key={m.label} className="bg-blue-50/40 rounded-lg p-2 border border-blue-100/50">
                    <div className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider mb-0.5">{m.label}</div>
                    <div className={`text-sm font-bold ${t.t1}`}>{m.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className={`px-6 py-4 border-t ${t.divider} flex justify-end gap-3`}>
          <button onClick={onClose} className={`px-4 py-2 text-sm ${t.btnAlt} rounded-lg`}>Cancel</button>
          <button onClick={save} disabled={saving}
            className={`px-4 py-2 text-sm ${t.btn} rounded-lg font-medium disabled:opacity-50`}>
            {saving ? "Saving…" : "Save All Metrics"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notes modal ─────────────────────────────────────────────────────────────
function NotesModal({
  product, periodId, storeCode, onClose, onSaved,
}: {
  product: Product; periodId: number; storeCode: string; onClose: () => void; onSaved: () => void;
}) {
  const { theme: t } = useTheme();
  const [analysis, setAnalysis] = useState(product.notes?.analysis ?? "");
  const [action, setAction] = useState(product.notes?.action ?? "");
  const [results, setResults] = useState(product.notes?.results ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.upsertNotes({ product_no: product.product_no, period_id: periodId, store_code: storeCode, analysis, action, results });
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`${t.card} rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${t.divider}`}>
          <div>
            <h3 className={`font-semibold ${t.t1}`}>Notes — Product {product.product_no}</h3>
            {product.warehouse_name && <p className={`text-xs ${t.t4} mt-0.5`}>{product.warehouse_name}</p>}
          </div>
          <button onClick={onClose} className={`${t.t4} hover:${t.t1} text-xl`}>×</button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {[["Intelligent Analysis", analysis, setAnalysis, 4], ["Action", action, setAction, 3], ["Results", results, setResults, 3]] .map(([label, val, setter, rows]) => (
            <div key={label as string}>
              <label className={`block text-xs font-semibold ${t.t3} uppercase mb-1.5`}>{label as string}</label>
              <textarea value={val as string} onChange={e => (setter as (v:string)=>void)(e.target.value)} rows={rows as number}
                className={`w-full border ${t.divider} rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`} />
            </div>
          ))}
        </div>
        <div className={`px-6 py-4 border-t ${t.divider} flex justify-end gap-3`}>
          <button onClick={onClose} className={`px-4 py-2 text-sm ${t.btnAlt} rounded-lg`}>Cancel</button>
          <button onClick={save} disabled={saving} className={`px-4 py-2 text-sm ${t.btn} rounded-lg font-medium disabled:opacity-50`}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Product modal ────────────────────────────────────────────────────────
function AddProductModal({
  storeCode, onClose, onAdded,
}: {
  storeCode: string; onClose: () => void; onAdded: () => void;
}) {
  const { theme: t } = useTheme();
  const [tab, setTab] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ product_no: string; warehouse_name: string | null; image_url: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState({ product_no: "", warehouse_name: "", image_url: "", sku: "" });
  const [msg, setMsg] = useState("");

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await api.searchProducts(query);
      setResults(r.products);
    } finally { setSearching(false); }
  }

  function toggleSelect(pno: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(pno) ? next.delete(pno) : next.add(pno);
      return next;
    });
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      for (const pno of Array.from(selected)) {
        await api.pinProduct(storeCode, pno);
      }
      onAdded(); onClose();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  async function addManual() {
    if (!manual.product_no.trim()) { setMsg("Product number is required"); return; }
    setSaving(true);
    try {
      await api.createProduct({
        product_no: manual.product_no.trim(),
        warehouse_name: manual.warehouse_name || undefined,
        image_url: manual.image_url || undefined,
        sku: manual.sku || undefined,
      });
      await api.pinProduct(storeCode, manual.product_no.trim());
      onAdded(); onClose();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`${t.card} rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.divider}`}>
          <h3 className={`font-semibold ${t.t1}`}>Add Product to {STORE_NAMES[storeCode] || storeCode}</h3>
          <button onClick={onClose} className={`${t.t4} hover:${t.t1} text-xl`}>×</button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${t.divider}`}>
          {(["search", "manual"] as const).map(tb => (
            <button key={tb} onClick={() => { setTab(tb); setMsg(""); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === tb ? `${t.accentTxt} border-b-2 border-violet-500` : `${t.t3} hover:${t.t2}`}`}>
              {tb === "search" ? "Search Feishu Products" : "Add Manually"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "search" ? (
            <>
              <div className="flex gap-2 mb-3">
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && search()}
                  placeholder="Product no, name or SKU…"
                  className={`flex-1 border ${t.divider} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`} />
                <button onClick={search} disabled={searching}
                  className={`${t.btn} px-3 py-2 rounded-lg text-sm disabled:opacity-50`}>
                  {searching ? "…" : "Search"}
                </button>
              </div>
              {results.length === 0 && !searching && (
                <p className={`text-sm ${t.t4} text-center py-6`}>Search for products synced from Feishu</p>
              )}
              <div className="space-y-1.5">
                {results.map(p => (
                  <label key={p.product_no}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selected.has(p.product_no) ? `border-violet-400 ${t.accentSoft}` : `${t.divider} hover:${t.bar}`}`}>
                    <input type="checkbox" checked={selected.has(p.product_no)}
                      onChange={() => toggleSelect(p.product_no)}
                      className="accent-violet-600" />
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className={`w-8 h-8 rounded object-cover border ${t.divider} shrink-0`}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className={`w-8 h-8 rounded ${t.bar} shrink-0`} />
                    )}
                    <div className="min-w-0">
                      <div className={`text-sm font-medium ${t.t1}`}>#{p.product_no}</div>
                      {p.warehouse_name && <div className={`text-xs ${t.t4} truncate`}>{p.warehouse_name}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Product Number *", key: "product_no", val: manual.product_no, ph: "e.g. 156" },
                { label: "Product Name", key: "warehouse_name", val: manual.warehouse_name, ph: "Product description" },
                { label: "Image URL (optional)", key: "image_url", val: manual.image_url, ph: "https://…" },
                { label: "SKU (optional)", key: "sku", val: manual.sku, ph: "SKU code" },
              ].map(f => (
                <div key={f.key}>
                  <label className={`text-xs font-medium ${t.t3} block mb-1`}>{f.label}</label>
                  <input value={f.val} onChange={e => setManual(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    className={`w-full border ${t.divider} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`} />
                </div>
              ))}
            </div>
          )}
          {msg && <p className="text-xs text-red-500 mt-2">{msg}</p>}
        </div>

        <div className={`px-5 py-4 border-t ${t.divider} flex justify-end gap-2`}>
          <button onClick={onClose} className={`px-3 py-2 text-sm ${t.btnAlt} rounded-lg`}>Cancel</button>
          <button
            onClick={tab === "search" ? addSelected : addManual}
            disabled={saving || (tab === "search" && selected.size === 0)}
            className={`px-4 py-2 text-sm ${t.btn} rounded-lg font-medium disabled:opacity-50`}>
            {saving ? "Adding…" : tab === "search" ? `Add ${selected.size > 0 ? `(${selected.size})` : ""}` : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Weekly Report ────────────────────────────────────────────────────────────
const CHART_COLORS = ["#7c3aed","#2563eb","#d97706","#16a34a","#dc2626","#0891b2","#db2777","#65a30d","#9333ea","#0d9488"];

function WeeklyReport({ storeCode }: { storeCode: string }) {
  const { theme: t } = useTheme();
  const [data, setData] = useState<{
    periods: (Period & { total_tasks: number; done_tasks: number; in_progress_tasks: number; product_count: number })[];
    user_period_stats: { period_id: number; user_id: number; name: string; role: string; done_count: number; total_assigned: number }[];
    top_products: { product_no: string; warehouse_name: string | null; image_url: string | null; done_tasks: number; in_progress_tasks: number; total_tasks: number }[];
    users: { id: number; name: string; role: string; store_code: string | null }[];
    recent_notes?: { product_no: string; warehouse_name: string | null; image_url: string | null; period_label: string; analysis: string; action: string; results: string; updated_at: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getStoreReport(storeCode).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [storeCode]);

  function roleBadgeSm(role: string) {
    if (role === "leader") return <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded font-medium">L</span>;
    if (role === "junior") return <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-medium">J</span>;
    return null;
  }

  if (loading) return <div className={`flex items-center justify-center h-48 ${t.t4}`}>Loading report…</div>;
  if (!data || data.periods.length === 0)
    return <div className={`flex flex-col items-center justify-center h-48 ${t.t4} text-sm gap-1`}><p className="text-lg">No historical data yet</p><p>Data will appear once you complete weeks with assigned tasks.</p></div>;

  const { periods, user_period_stats, top_products, users } = data;

  // Build chart data: one row per period
  const chartData = periods.map(p => {
    const row: Record<string, string | number> = {
      label: p.label ?? `${p.period_start?.slice(5)}`,
      "Store %": p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0,
    };
    for (const u of users) {
      const s = user_period_stats.find(x => x.period_id === p.id && x.user_id === u.id);
      row[u.name] = s?.done_count ?? 0;
    }
    return row;
  });

  // Period-over-period trend (compare last two periods)
  const lastP = periods[periods.length - 1];
  const prevP = periods.length >= 2 ? periods[periods.length - 2] : null;
  const lastPct = lastP.total_tasks > 0 ? (lastP.done_tasks / lastP.total_tasks) * 100 : 0;
  const prevPct = prevP && prevP.total_tasks > 0 ? (prevP.done_tasks / prevP.total_tasks) * 100 : null;
  const trend = prevPct != null ? lastPct - prevPct : null;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Weeks", value: periods.length, sub: "tracked", color: "text-violet-500" },
          { label: "Latest Done", value: `${lastP.done_tasks}/${lastP.total_tasks}`, sub: `${Math.round(lastPct)}% complete`, color: "text-green-500" },
          { label: "Products", value: lastP.product_count, sub: "this week", color: "text-blue-500" },
          {
            label: "vs Last Week",
            value: trend != null ? `${trend >= 0 ? "+" : ""}${trend.toFixed(0)}%` : "–",
            sub: trend != null ? (trend >= 0 ? "improvement" : "decline") : "first week",
            color: trend == null ? t.t4 : trend >= 0 ? "text-green-500" : "text-red-500",
          },
        ].map(k => (
          <div key={k.label} className={`${t.card} rounded-xl p-4`}>
            <div className={`text-xs ${t.t4} font-medium uppercase tracking-wider mb-1`}>{k.label}</div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className={`text-xs ${t.t4} mt-0.5`}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Per-user done count chart */}
      {users.length > 0 && (
        <div className={`${t.card} rounded-xl p-4`}>
          <h3 className={`font-bold ${t.t1} mb-4`}>Done Tasks Per Member · By Week</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend iconType="circle" iconSize={8} />
              {users.map((u, i) => (
                <Line key={u.id} type="monotone" dataKey={u.name} stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Store completion % bar chart */}
      <div className={`${t.card} rounded-xl p-4`}>
        <h3 className={`font-bold ${t.t1} mb-4`}>Store Completion % · By Week</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
            <Tooltip formatter={(v) => `${v}%`} />
            <Bar dataKey="Store %" fill="#7c3aed" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* User performance table */}
      <div className={`${t.card} rounded-xl overflow-hidden`}>
        <div className={`p-4 border-b ${t.divider} ${t.bar}/50`}>
          <h3 className={`font-bold ${t.t1}`}>Member Performance · Done / Assigned per Week</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={`border-b ${t.divider} ${t.bar}`}>
                <th className={`text-left px-4 py-2.5 text-xs font-semibold ${t.t3} uppercase tracking-wider sticky left-0 ${t.bar} min-w-[140px]`}>Member</th>
                {periods.map(p => (
                  <th key={p.id} className={`text-center px-3 py-2.5 text-xs font-semibold ${t.t3} uppercase tracking-wider min-w-[90px]`}>
                    {p.label ?? p.period_start?.slice(5)}
                  </th>
                ))}
                <th className={`text-center px-3 py-2.5 text-xs font-semibold ${t.t3} uppercase tracking-wider`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, uidx) => {
                let totalDone = 0;
                return (
                  <tr key={u.id} className={uidx % 2 ? `${t.bar}/30` : ""}>
                    <td className={`px-4 py-2.5 sticky left-0 ${uidx % 2 ? t.bar : t.card.split(" ")[0]} border-r ${t.divider}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full ${t.accentSoft} text-xs font-bold flex items-center justify-center shrink-0`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className={`font-medium ${t.t1} text-xs`}>{u.name}</div>
                          <div>{roleBadgeSm(u.role)}</div>
                        </div>
                      </div>
                    </td>
                    {periods.map(p => {
                      const s = user_period_stats.find(x => x.period_id === p.id && x.user_id === u.id);
                      const done = s?.done_count ?? 0;
                      const assigned = s?.total_assigned ?? 0;
                      totalDone += done;
                      const pct = assigned > 0 ? Math.round((done / assigned) * 100) : null;
                      return (
                        <td key={p.id} className="px-3 py-2.5 text-center">
                          {assigned > 0 ? (
                            <div>
                              <div className={`font-semibold ${t.t1} text-xs`}>{done}<span className={`${t.t4} font-normal`}>/{assigned}</span></div>
                              <div className={`text-[10px] font-medium ${pct === 100 ? "text-green-500" : pct! >= 50 ? "text-amber-500" : t.t4}`}>{pct}%</div>
                            </div>
                          ) : (
                            <span className={`${t.t5} text-xs`}>–</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2.5 text-center font-bold ${t.accentTxt}`}>{totalDone}</td>
                  </tr>
                );
              })}
              {/* Store totals row */}
              <tr className={`border-t-2 ${t.divider} ${t.bar} font-semibold`}>
                <td className={`px-4 py-2.5 sticky left-0 ${t.bar} border-r ${t.divider} text-xs ${t.t3} uppercase tracking-wider`}>Store Total</td>
                {periods.map(p => {
                  const pct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
                  return (
                    <td key={p.id} className="px-3 py-2.5 text-center">
                      <div className={`font-bold ${t.t1} text-xs`}>{p.done_tasks}<span className={`${t.t4} font-normal`}>/{p.total_tasks}</span></div>
                      <div className={`text-[10px] font-medium ${pct >= 80 ? "text-green-500" : pct >= 50 ? "text-amber-500" : "text-red-500"}`}>{pct}%</div>
                    </td>
                  );
                })}
                <td className={`px-3 py-2.5 text-center font-bold ${t.accentTxt}`}>
                  {periods.reduce((s, p) => s + p.done_tasks, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Product progress (latest week) */}
      {top_products.length > 0 && (
        <div className={`${t.card} rounded-xl overflow-hidden`}>
          <div className={`p-4 border-b ${t.divider} ${t.bar}/50`}>
            <h3 className={`font-bold ${t.t1}`}>Product Progress · Latest Week</h3>
            <p className={`text-xs ${t.t4} mt-0.5`}>Showing {top_products.length} products. Green = all done, amber = partial, red = not started.</p>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {top_products.map(p => {
              const pct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
              const barColor = pct === 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400";
              return (
                <div key={p.product_no} className={`flex items-center gap-3 p-2.5 rounded-lg border ${t.divider} hover:${t.bar} transition-colors`}>
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className={`w-10 h-10 rounded-lg object-cover border ${t.divider} shrink-0`} />
                  ) : (
                    <div className={`w-10 h-10 rounded-lg ${t.bar} shrink-0 flex items-center justify-center ${t.t5} text-[10px] font-bold`}>#{p.product_no}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold ${t.t1}`}>#{p.product_no}</span>
                      <span className={`text-[10px] font-bold ${pct === 100 ? "text-green-500" : pct > 0 ? "text-amber-500" : "text-red-500"}`}>{pct}%</span>
                    </div>
                    <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={`text-[10px] ${t.t4} mt-0.5 truncate`}>{p.warehouse_name || "–"} · {p.done_tasks}/{p.total_tasks} tasks</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Optimization Notes */}
      {data.recent_notes && data.recent_notes.length > 0 && (
        <div className={`${t.card} rounded-xl overflow-hidden`}>
          <div className={`p-4 border-b ${t.divider} ${t.bar}/50`}>
            <h3 className={`font-bold ${t.t1}`}>Optimization History & Results</h3>
            <p className={`text-xs ${t.t4} mt-0.5`}>Recent analysis, actions, and results logged by shop leaders.</p>
          </div>
          <div className={`divide-y ${t.divider}`}>
            {data.recent_notes.map((n, i) => (
              <div key={i} className={`p-4 hover:${t.bar} transition-colors`}>
                <div className="flex items-start gap-4 mb-3">
                  {n.image_url ? (
                    <img src={n.image_url} alt="" className={`w-12 h-12 rounded-lg object-cover border ${t.divider} shrink-0`} />
                  ) : (
                    <div className={`w-12 h-12 rounded-lg ${t.bar} shrink-0 flex items-center justify-center ${t.t5} text-xs font-bold`}>#{n.product_no}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm font-bold ${t.t1}`}>#{n.product_no}</span>
                      <span className={`text-[10px] ${t.accentSoft} px-1.5 py-0.5 rounded font-medium`}>{n.period_label}</span>
                    </div>
                    <div className={`text-xs ${t.t4} truncate`}>{n.warehouse_name || "–"} · Updated {new Date(n.updated_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20">
                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Analysis</div>
                    <p className={`text-xs ${t.t2} leading-relaxed italic`}>{n.analysis || "–"}</p>
                  </div>
                  <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                    <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">Action</div>
                    <p className={`text-xs ${t.t2} leading-relaxed italic`}>{n.action || "–"}</p>
                  </div>
                  <div className="bg-green-500/10 p-2.5 rounded-lg border border-green-500/20">
                    <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">Results</div>
                    <p className={`text-xs ${t.t1} leading-relaxed font-medium italic`}>{n.results || "–"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Team Panel ───────────────────────────────────────────────────────────────
const STORES_LIST = [
  { code: "TK1", name: "CELNEPHO" }, { code: "TK2", name: "CYNLLIO" },
  { code: "TK3", name: "VIMISAOI" }, { code: "TK4", name: "Mikarka" },
];

function TeamPanel({
  users, products, taskLabels, stats, periodId, storeCode, onTaskUpdate, onReload,
}: {
  users: User[];
  products: Product[];
  taskLabels: Record<string, string>;
  stats: { id: number; name: string; role: string; done_count: number }[];
  periodId: number;
  storeCode: string;
  onTaskUpdate: (productNo: string, taskKey: string, updates: Partial<TaskInfo>) => void;
  onReload: () => void;
}) {
  const { theme: t } = useTheme();
  const [subTab, setSubTab] = useState<"performance" | "report">("performance");
  const [focusedId, setFocusedId] = useState<number | "unassigned" | null>(null);
  const [search, setSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);

  // Create user
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "junior", store_code: storeCode });
  const [createError, setCreateError] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  const currentUser = typeof window !== "undefined" ? (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })() : {};
  const isAdmin = currentUser?.role === "admin";

  const statsById = new Map(stats.map(s => [s.id, s]));
  const taskTypeList = Object.keys(taskLabels);

  // Build per-user task map
  const tasksByUser: Record<number, { product: Product; taskKey: string; task: TaskInfo }[]> = {};
  const unassigned: { product: Product; taskKey: string; task: TaskInfo }[] = [];
  for (const u of users) tasksByUser[u.id] = [];
  for (const p of products) {
    for (const [tk, task] of Object.entries(p.tasks)) {
      if (task.assigned_to != null && tasksByUser[task.assigned_to]) {
        tasksByUser[task.assigned_to].push({ product: p, taskKey: tk, task });
      } else if (task.assigned_to == null) {
        unassigned.push({ product: p, taskKey: tk, task });
      }
    }
  }

  const rawFocusedList =
    focusedId === "unassigned" ? unassigned :
    typeof focusedId === "number" ? (tasksByUser[focusedId] ?? []) : null;

  const focusedList = rawFocusedList?.filter(({ product, taskKey }) => {
    const matchSearch = !search ||
      product.product_no.includes(search) ||
      (product.warehouse_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTask = taskFilter === "all" || taskKey === taskFilter;
    return matchSearch && matchTask;
  }) ?? null;

  const focusedUser = typeof focusedId === "number" ? users.find(u => u.id === focusedId) : null;

  function roleBadge(role: string) {
    if (role === "leader") return <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Shop Leader</span>;
    if (role === "junior") return <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Junior</span>;
    if (role === "admin")  return <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">Admin</span>;
    return <span className={`text-[10px] ${t.card2} ${t.t3} px-1.5 py-0.5 rounded font-medium`}>Member</span>;
  }

  async function assignTask(product: Product, taskKey: string, task: TaskInfo, userId: number | null) {
    const key = `${product.product_no}-${taskKey}`;
    setSaving(key);
    try {
      await api.upsertTask({ product_no: product.product_no, period_id: periodId, store_code: storeCode, task_type: taskKey, status: task.status, assigned_to: userId });
      const u = users.find(x => x.id === userId);
      onTaskUpdate(product.product_no, taskKey, { assigned_to: userId, assigned_name: u?.name ?? null });
      onReload();
    } finally { setSaving(null); }
  }

  async function createUser() {
    if (!createForm.name || !createForm.email || !createForm.password) { setCreateError("Name, email and password required"); return; }
    setCreateSaving(true); setCreateError("");
    try {
      await api.createUser({ ...createForm, store_code: createForm.store_code || undefined });
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "", role: "junior", store_code: storeCode });
      onReload();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user");
    } finally { setCreateSaving(false); }
  }

  async function handleDeleteUser(id: number) {
    if (!confirm("Are you sure you want to delete this team member? This will not delete their historical work but they will no longer be assignable.")) return;
    try {
      await api.deleteUser(id);
      onReload();
    } catch (e: any) {
      alert(e.message || "Failed to delete user");
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className={`flex gap-1 ${t.bar} p-1 rounded-lg`}>
          {(["performance", "report"] as const).map(st => (
            <button key={st} onClick={() => setSubTab(st)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${subTab === st ? `${t.card.split(" ")[0]} ${t.accentTxt} shadow-sm` : `${t.t3} hover:${t.t2}`}`}>
              {st === "performance" ? "👥 Performance" : "📊 Weekly Report"}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(v => !v)}
            className={`flex items-center gap-1.5 ${t.btn} text-sm px-3 py-1.5 rounded-lg font-medium`}>
            + Add Member
          </button>
        )}
      </div>

      {/* Create user inline form */}
      {showCreate && isAdmin && (
        <div className={`${t.accentSoft} rounded-xl p-4 space-y-3`}>
          <h3 className={`text-sm font-bold ${t.accentTxt}`}>New Team Member</h3>
          {createError && <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{createError}</p>}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Name", key: "name", type: "text", placeholder: "Sailini" },
              { label: "Email", key: "email", type: "email", placeholder: "sailini@example.com" },
              { label: "Password", key: "password", type: "password", placeholder: "••••••••" },
            ].map(f => (
              <div key={f.key}>
                <label className={`text-xs ${t.t3} block mb-1`}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder}
                  value={(createForm as Record<string, string>)[f.key]}
                  onChange={e => setCreateForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`} />
              </div>
            ))}
            <div>
              <label className={`text-xs ${t.t3} block mb-1`}>Role</label>
              <select value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`}>
                <option value="junior">Junior</option>
                <option value="leader">Shop Leader</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className={`text-xs ${t.t3} block mb-1`}>Store</label>
              <select value={createForm.store_code} onChange={e => setCreateForm(p => ({ ...p, store_code: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`}>
                <option value="">All stores</option>
                {STORES_LIST.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={createUser} disabled={createSaving}
              className={`${t.btn} text-sm px-4 py-2 rounded-lg disabled:opacity-50 font-medium`}>
              {createSaving ? "Creating…" : "Create Member"}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError(""); }}
              className={`text-sm px-4 py-2 rounded-lg ${t.btnAlt}`}>Cancel</button>
          </div>
        </div>
      )}

      {subTab === "report" ? (
        <WeeklyReport storeCode={storeCode} />
      ) : (
        <>
          {/* Member summary cards */}
          {users.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-48 ${t.t4} space-y-2`}>
              <p className="text-lg">No team members yet</p>
              <p className="text-sm">Click <strong>+ Add Member</strong> above to create your first team member.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {users.map(u => {
                const s = statsById.get(u.id);
                const assigned = tasksByUser[u.id] ?? [];
                const done = s?.done_count ?? 0;
                const total = assigned.length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const role = s?.role ?? u.role;
                const isFocused = focusedId === u.id;
                 return (
                  <button key={u.id} onClick={() => setFocusedId(isFocused ? null : u.id)}
                    className={`relative group p-4 rounded-xl border text-left transition-all ${isFocused ? `border-violet-400 ${t.accentSoft} ring-2 ring-violet-500/20` : `${t.divider} ${t.card.split(" ")[0]} hover:border-violet-400 hover:shadow-sm`}`}>
                    {isAdmin && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setEditUser(u); }} className={`p-1 hover:${t.accentSoft} rounded ${t.accentTxt} text-[10px]`} title="Edit Member">✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id); }} className="p-1 hover:bg-red-500/10 rounded text-red-400 text-[10px]" title="Delete Member">🗑️</button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-9 h-9 rounded-full ${t.accentSoft} text-sm font-bold flex items-center justify-center shrink-0`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className={`text-sm font-bold ${t.t1} truncate`}>{u.name}</div>
                        <div className="mt-0.5">{roleBadge(role)}</div>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className={`text-2xl font-bold ${t.accentTxt}`}>{done}</span>
                      <span className={`text-xs ${t.t4}`}>/ {total} done</span>
                    </div>
                    <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className={`text-[10px] ${t.t4} mt-1`}>{pct}% complete</div>
                  </button>
                );
              })}
              {unassigned.length > 0 && (
                <button onClick={() => setFocusedId(focusedId === "unassigned" ? null : "unassigned")}
                  className={`p-4 rounded-xl border text-left transition-all ${focusedId === "unassigned" ? "border-orange-400 bg-orange-500/10 ring-2 ring-orange-500/20" : `border-dashed ${t.divider} ${t.card.split(" ")[0]} hover:border-orange-400`}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-9 h-9 rounded-full ${t.bar} ${t.t3} text-xl flex items-center justify-center shrink-0`}>?</div>
                    <div>
                      <div className={`text-sm font-bold ${t.t3}`}>Unassigned</div>
                      <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded font-medium">Needs assignment</span>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-orange-400">{unassigned.length}</div>
                  <div className={`text-xs ${t.t4} mt-1`}>tasks without owner</div>
                </button>
              )}
            </div>
          )}

          {/* Search + filter bar */}
          {focusedId !== null && (
            <div className="flex items-center gap-2 flex-wrap">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product…"
                className={`border ${t.divider} rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`} />
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setTaskFilter("all")}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${taskFilter === "all" ? "bg-violet-600 text-white border-violet-600" : `${t.card.split(" ")[0]} ${t.t3} ${t.divider} hover:${t.bar}`}`}>
                  All Tasks
                </button>
                {taskTypeList.map(tk => (
                  <button key={tk} onClick={() => setTaskFilter(tk === taskFilter ? "all" : tk)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${taskFilter === tk ? "bg-violet-600 text-white border-violet-600" : `${t.card.split(" ")[0]} ${t.t3} ${t.divider} hover:${t.bar}`}`}>
                    {taskLabels[tk] || tk}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Task detail table */}
          {focusedList !== null && (
            <div className={`${t.card} rounded-xl overflow-hidden`}>
              <div className={`flex items-center justify-between p-4 border-b ${t.divider} ${t.bar}/50 flex-wrap gap-2`}>
                <div>
                  <h3 className={`font-bold ${t.t1}`}>
                    {focusedId === "unassigned" ? "Unassigned Tasks" : `${focusedUser?.name ?? ""}'s Tasks`}
                  </h3>
                  <p className={`text-xs ${t.t3}`}>
                    {focusedList.length}{rawFocusedList && rawFocusedList.length !== focusedList.length ? ` of ${rawFocusedList.length}` : ""} tasks
                  </p>
                </div>
                {focusedId !== "unassigned" && (rawFocusedList?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /><span className="font-bold text-green-500">{rawFocusedList!.filter(x => x.task.status === "done").length}</span> done</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /><span className="font-bold text-amber-500">{rawFocusedList!.filter(x => x.task.status === "in_progress").length}</span> in progress</span>
                    <span className={`flex items-center gap-1`}><span className={`w-2 h-2 rounded-full ${t.bar} inline-block`} /><span className={t.t4}>{rawFocusedList!.filter(x => x.task.status === "todo").length}</span> todo</span>
                  </div>
                )}
              </div>
              {focusedList.length === 0 ? (
                <div className={`p-8 text-center ${t.t4} text-sm`}>
                  {search || taskFilter !== "all" ? "No tasks match your filters." : "No tasks assigned. Go to the Board tab and right-click a task cell to assign it."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className={`border-b ${t.divider} ${t.bar}`}>
                        <th className={`text-left px-4 py-2.5 text-xs font-semibold ${t.t3} uppercase tracking-wider`}>Product</th>
                        <th className={`text-left px-4 py-2.5 text-xs font-semibold ${t.t3} uppercase tracking-wider`}>Task</th>
                        <th className={`text-center px-4 py-2.5 text-xs font-semibold ${t.t3} uppercase tracking-wider`}>Status</th>
                        <th className={`text-center px-4 py-2.5 text-xs font-semibold ${t.t3} uppercase tracking-wider`}>
                          {focusedId === "unassigned" ? "Assign To" : "Reassign"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {focusedList.map(({ product, taskKey, task }, idx) => {
                        const cfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.todo;
                        const key = `${product.product_no}-${taskKey}`;
                        return (
                          <tr key={key} className={`border-b ${t.divider} ${idx % 2 ? `${t.bar}/30` : ""}`}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                {product.image_url ? (
                                  <img src={product.image_url} alt="" className={`w-8 h-8 rounded-lg object-cover border ${t.divider} shrink-0`} />
                                ) : (
                                  <div className={`w-8 h-8 rounded-lg ${t.bar} shrink-0 flex items-center justify-center ${t.t5} text-[10px] font-bold`}>#{product.product_no}</div>
                                )}
                                <div>
                                  <div className={`font-semibold ${t.t1}`}>#{product.product_no}</div>
                                  <div className={`text-xs ${t.t4} truncate max-w-[140px]`}>{product.warehouse_name || "–"}</div>
                                </div>
                              </div>
                            </td>
                            <td className={`px-4 py-2.5 ${t.t2}`}>{taskLabels[taskKey] || taskKey}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <select disabled={saving === key} value={task.assigned_to ?? ""}
                                onChange={e => assignTask(product, taskKey, task, e.target.value ? Number(e.target.value) : null)}
                                className={`text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp} disabled:opacity-50`}>
                                <option value="">— Unassign —</option>
                                {users.map(u => (
                                  <option key={u.id} value={u.id}>{u.name}{u.role === "leader" ? " (L)" : u.role === "junior" ? " (J)" : ""}</option>
                                ))}
                              </select>
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

          {focusedList === null && users.length > 0 && (
            <div className={`${t.card} rounded-xl border border-dashed ${t.divider} p-6 text-center ${t.t4} text-sm`}>
              Click a team member card above to see their assigned tasks and progress.
            </div>
          )}
        </>
      )}

      {editUser && (
        <EditUserModal 
          user={editUser} 
          onClose={() => setEditUser(null)} 
          onUpdated={onReload} 
        />
      )}
    </div>
  );
}

function EditUserModal({ user, onClose, onUpdated }: { user: User; onClose: () => void; onUpdated: () => void }) {
  const { theme: t } = useTheme();
  const [form, setForm] = useState({ name: user.name, email: user.email, password: "", role: user.role, store_code: user.store_code || "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!form.name || !form.email) { setError("Name and email required"); return; }
    setSaving(true); setError("");
    try {
      await api.updateUser(user.id, { ...form, store_code: form.store_code || "" });
      onUpdated(); onClose();
    } catch (e: any) {
      setError(e.message || "Failed to update user");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`${t.card} rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.divider}`}>
          <h3 className={`font-semibold ${t.t1}`}>Edit Member: {user.name}</h3>
          <button onClick={onClose} className={`${t.t4} hover:${t.t1} text-xl`}>×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <p className="text-xs text-red-500 bg-red-500/10 p-2 rounded">{error}</p>}
          {[
            { label: "Name", key: "name", type: "text", val: form.name },
            { label: "Email", key: "email", type: "email", val: form.email },
            { label: "New Password (leave blank to keep current)", key: "password", type: "password", val: form.password },
          ].map(f => (
            <div key={f.key}>
              <label className={`text-xs ${t.t3} block mb-1`}>{f.label}</label>
              <input value={f.val} type={f.type} placeholder={f.key === "password" ? "••••••••" : undefined}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-xs ${t.t3} block mb-1`}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${t.inp}`}>
                <option value="junior">Junior</option>
                <option value="leader">Shop Leader</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className={`text-xs ${t.t3} block mb-1`}>Store</label>
              <select value={form.store_code} onChange={e => setForm(f => ({ ...f, store_code: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${t.inp}`}>
                <option value="">All stores</option>
                {STORES_LIST.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className={`px-5 py-4 border-t ${t.divider} flex justify-end gap-2 ${t.bar}/50`}>
          <button onClick={onClose} className={`px-4 py-2 text-sm ${t.btnAlt} rounded-lg transition-colors`}>Cancel</button>
          <button onClick={save} disabled={saving} className={`px-4 py-2 text-sm ${t.btn} rounded-lg font-medium disabled:opacity-50 transition-colors`}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Selection Panel ──────────────────────────────────────────────────
function ProductSelectionPanel({
  storeCode, periodId, selectedProductNos, onUpdated
}: {
  storeCode: string; periodId: number; selectedProductNos: Set<string>; onUpdated: () => void;
}) {
  const { theme: t } = useTheme();
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    setLoadingProducts(true);
    api.allProducts(storeCode)
      .then(d => setAllProducts(d.products))
      .catch(() => setAllProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [storeCode]);

  const filtered = allProducts.filter(p =>
    !filter || p.product_no.includes(filter) || (p.warehouse_name ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  async function toggle(productNo: string, currentSelected: boolean) {
    if (!periodId) { alert("Please select a period first."); return; }
    setSaving(productNo);
    try {
      await api.updateBoardSelection({
        period_id: periodId,
        store_code: storeCode,
        product_nos: [productNo],
        selected: !currentSelected
      });
      onUpdated();
    } catch (e) {
      alert("Failed to update selection");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={`${t.card} rounded-xl overflow-hidden flex flex-col max-h-[70vh]`}>
      {!periodId && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center gap-2 text-sm text-amber-400">
          <span>⚠️</span>
          <span>Select a period from the top bar before adding products to the board.</span>
        </div>
      )}
      <div className={`p-4 border-b ${t.divider} ${t.bar}/50 flex items-center justify-between`}>
        <div>
          <h3 className={`font-bold ${t.t1}`}>Select Products for this Week</h3>
          <p className={`text-xs ${t.t3}`}>Only selected products will appear on the Workflow Board.</p>
        </div>
        <input
          value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Search products..."
          className={`border ${t.divider} rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 w-64 ${t.inp}`}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loadingProducts && (
          <div className={`flex items-center justify-center py-16 ${t.t4} text-sm`}>Loading products...</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {!loadingProducts && filtered.map(p => {
            const isSelected = selectedProductNos.has(p.product_no);
            return (
              <label key={p.product_no} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${!periodId ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${isSelected ? `border-violet-400 ${t.accentSoft} ring-1 ring-violet-500/20` : `${t.divider} hover:${t.bar}`}`}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!!saving || !periodId}
                  onChange={() => toggle(p.product_no, isSelected)}
                  className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                />
                {p.image_url ? (
                  <img src={p.image_url} alt="" className={`w-10 h-10 rounded-lg object-cover border ${t.divider} shrink-0`} />
                ) : (
                  <div className={`w-10 h-10 rounded-lg ${t.bar} shrink-0 flex items-center justify-center ${t.t5} text-xs font-bold`}>#{p.product_no}</div>
                )}
                <div className="min-w-0">
                  <div className={`text-sm font-bold ${t.t1} leading-tight`}>#{p.product_no}</div>
                  <div className={`text-[10px] ${t.t3} truncate mt-0.5`}>{p.warehouse_name || "No name"}</div>
                </div>
                {saving === p.product_no && <div className={`ml-auto ${t.accentTxt} text-xs font-bold`}>...</div>}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Progress tab ─────────────────────────────────────────────────────────────
function ProgressPanel({ storeCode }: { storeCode: string }) {
  const { theme: t } = useTheme();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("gmv");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    setLoading(true);
    api.boardProgress(storeCode)
      .then(r => setRows(r.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [storeCode]);

  function delta(cur: number | null, prev: number | null) {
    if (cur == null || prev == null || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  }

  function DeltaBadge({ cur, prev, isPercent }: { cur: number | null; prev: number | null; isPercent?: boolean }) {
    const d = delta(cur, prev);
    if (d == null) return <span className={`${t.t5} text-xs`}>—</span>;
    const up = d >= 0;
    return (
      <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
        {up ? "↑" : "↓"} {Math.abs(d).toFixed(1)}%
      </span>
    );
  }

  function fmt(v: number | null, prefix = "") {
    if (v == null) return <span className={`${t.t5}`}>—</span>;
    if (v >= 1000000) return <>{prefix}{(v / 1000000).toFixed(1)}M</>;
    if (v >= 1000) return <>{prefix}{(v / 1000).toFixed(1)}K</>;
    return <>{prefix}{v.toLocaleString()}</>;
  }

  function fmtPct(v: number | null) {
    if (v == null) return <span className={`${t.t5}`}>—</span>;
    return <>{(v * 100).toFixed(2)}%</>;
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  function SortTh({ label, k }: { label: string; k: string }) {
    const active = sortKey === k;
    return (
      <th className={`px-3 py-2 text-left text-xs font-semibold ${t.t4} uppercase cursor-pointer hover:${t.t2} whitespace-nowrap`}
        onClick={() => { if (active) setSortDir(d => d === "desc" ? "asc" : "desc"); else { setSortKey(k); setSortDir("desc"); } }}>
        {label}{active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  const hasPrev = rows.some(r => r.prev_period_start != null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-bold ${t.t1}`}>📈 Optimization Progress</h2>
          <p className={`text-xs ${t.t4} mt-0.5`}>
            Comparing latest TikTok export vs previous import per product.
            {!hasPrev && rows.length > 0 && <span className="ml-2 text-amber-500">⚠ Only one import found — upload a second period to see deltas.</span>}
          </p>
        </div>
        <div className={`text-xs ${t.t4}`}>{rows.length} products</div>
      </div>

      {loading ? (
        <div className={`flex items-center justify-center h-48 ${t.t4}`}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className={`flex flex-col items-center justify-center h-48 ${t.t4} ${t.card} rounded-xl`}>
          <p className="text-lg mb-1">No TikTok analytics data yet</p>
          <p className="text-sm">Upload a TikTok export in <strong>Data & Uploads → 📈 TikTok Analytics</strong></p>
        </div>
      ) : (
        <div className={`${t.card} rounded-xl overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={`${t.bar} border-b ${t.divider}`}>
                <tr>
                  <th className={`px-3 py-2 text-left text-xs font-semibold ${t.t4} uppercase sticky left-0 ${t.bar.split(" ")[0]}`}>Product</th>
                  <th className={`px-3 py-2 text-xs font-semibold ${t.t4} uppercase text-center`}>Period</th>
                  <SortTh label="GMV" k="gmv" />
                  <th className={`px-2 py-2 text-xs ${t.t5} uppercase`}>vs prev</th>
                  <SortTh label="Orders" k="orders" />
                  <th className={`px-2 py-2 text-xs ${t.t5} uppercase`}>vs prev</th>
                  <SortTh label="Impressions" k="impressions" />
                  <th className={`px-2 py-2 text-xs ${t.t5} uppercase`}>vs prev</th>
                  <SortTh label="CTR" k="ctr" />
                  <th className={`px-2 py-2 text-xs ${t.t5} uppercase`}>vs prev</th>
                  <SortTh label="CTOR" k="ctor" />
                  <th className={`px-2 py-2 text-xs ${t.t5} uppercase`}>vs prev</th>
                  <SortTh label="Items Sold" k="items_sold" />
                  <th className={`px-2 py-2 text-xs ${t.t5} uppercase`}>vs prev</th>
                  <th className={`px-3 py-2 text-xs font-semibold ${t.t4} uppercase`}>Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${t.divider}`}>
                {sorted.map((r, i) => (
                  <tr key={r.product_no} className={`hover:bg-violet-500/10 transition-colors ${i % 2 !== 0 ? t.bar : ""}`}>
                    <td className={`px-3 py-2 sticky left-0 ${t.card.split(" ")[0]}`}>
                      <div className="flex items-center gap-2 min-w-[160px]">
                        {r.image_url
                          ? <img src={r.image_url} className={`w-9 h-9 rounded-lg object-cover border ${t.divider} shrink-0`} />
                          : <div className={`w-9 h-9 rounded-lg ${t.bar} shrink-0`} />}
                        <div>
                          <div className={`font-semibold ${t.t1} text-xs`}>#{r.product_no}</div>
                          {r.warehouse_name && <div className={`text-[10px] ${t.t4} truncate max-w-[110px]`}>{r.warehouse_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className={`text-[10px] ${t.t3} whitespace-nowrap`}>{r.period_start} →</div>
                      <div className={`text-[10px] ${t.t3} whitespace-nowrap`}>{r.period_end}</div>
                      {r.prev_period_start && (
                        <div className={`text-[9px] ${t.t5} mt-0.5`}>prev: {r.prev_period_start}</div>
                      )}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${t.t1} text-right`}>{fmt(r.gmv, "$")}</td>
                    <td className="px-2 py-2 text-right"><DeltaBadge cur={r.gmv} prev={r.prev_gmv} /></td>
                    <td className={`px-3 py-2 text-right ${t.t2}`}>{fmt(r.orders)}</td>
                    <td className="px-2 py-2 text-right"><DeltaBadge cur={r.orders} prev={r.prev_orders} /></td>
                    <td className={`px-3 py-2 text-right ${t.t2}`}>{fmt(r.impressions)}</td>
                    <td className="px-2 py-2 text-right"><DeltaBadge cur={r.impressions} prev={r.prev_impressions} /></td>
                    <td className={`px-3 py-2 text-right ${t.t2}`}>{fmtPct(r.ctr)}</td>
                    <td className="px-2 py-2 text-right"><DeltaBadge cur={r.ctr} prev={r.prev_ctr} /></td>
                    <td className={`px-3 py-2 text-right ${t.t2}`}>{fmtPct(r.ctor)}</td>
                    <td className="px-2 py-2 text-right"><DeltaBadge cur={r.ctor} prev={r.prev_ctor} /></td>
                    <td className={`px-3 py-2 text-right ${t.t2}`}>{fmt(r.items_sold)}</td>
                    <td className="px-2 py-2 text-right"><DeltaBadge cur={r.items_sold} prev={r.prev_items_sold} /></td>
                    <td className="px-3 py-2">
                      {r.listing_status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.listing_status === "Live" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {r.listing_status}
                        </span>
                      )}
                      {r.voc_diagnosis && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-1 ${
                          r.voc_diagnosis === "Good" ? "bg-emerald-100 text-emerald-700" :
                          r.voc_diagnosis === "Normal" ? "bg-blue-100 text-blue-700" :
                          r.voc_diagnosis === "At Risk" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"}`}>
                          {r.voc_diagnosis}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Data upload tab ──────────────────────────────────────────────────────────
function DataUploadPanel({
  storeCode, onImported,
}: {
  storeCode: string; onImported: () => void;
}) {
  const { theme: t } = useTheme();
  const [activeTab, setActiveTab] = useState<"analytics" | "orders" | "tiktok">("analytics");
  const [analyticsFile, setAnalyticsFile] = useState<File | null>(null);
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [tiktokFile, setTiktokFile] = useState<File | null>(null);
  const [ordersType, setOrdersType] = useState("orders");
  const [periodLabel, setPeriodLabel] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState<{ id: number; filename: string; upload_type: string; period_label: string | null; row_count: number; imported_at: string }[]>([]);
  const [tkPeriods, setTkPeriods] = useState<{ period_start: string; period_end: string; product_count: number; total_gmv: number; imported_at: string }[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await api.ordersHistory(storeCode);
      setHistory(r.uploads);
    } catch {
      // endpoint may not exist yet on older backend — silently ignore
    }
  }, [storeCode]);

  const loadTkPeriods = useCallback(async () => {
    try {
      const r = await api.getTiktokExportList(storeCode);
      setTkPeriods(r.periods);
    } catch {
      setTkPeriods([]);
    }
  }, [storeCode]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { if (activeTab === "tiktok") loadTkPeriods(); }, [activeTab, loadTkPeriods]);

  async function uploadAnalytics() {
    if (!analyticsFile) return;
    setStatus("loading"); setMsg("");
    try {
      const r = await api.importAnalytics(analyticsFile, storeCode);
      setMsg(`✓ Imported ${r.imported} products across ${r.periods_created} new period(s).`);
      setStatus("done");
      onImported();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
    }
  }

  async function uploadTiktok() {
    if (!tiktokFile) return;
    setStatus("loading"); setMsg("");
    try {
      const r = await api.importTiktokExport(tiktokFile, storeCode);
      setMsg(`✓ Imported ${r.imported} products (${r.unmatched} unmatched) for ${r.period_start} → ${r.period_end}`);
      setStatus("done");
      loadTkPeriods();
      onImported();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
    }
  }

  async function uploadOrders() {
    if (!ordersFile) return;
    setStatus("loading"); setMsg("");
    try {
      const r = await api.uploadOrdersRaw(ordersFile, storeCode, ordersType, periodLabel);
      setMsg(`✓ Uploaded ${r.filename} (${r.row_count} rows)`);
      setStatus("done");
      loadHistory();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
    }
  }

  return (
    <div className={`${t.card} rounded-xl overflow-hidden`}>
      <div className={`flex border-b ${t.divider}`}>
        {(["analytics", "orders", "tiktok"] as const).map(tb => (
          <button key={tb} onClick={() => { setActiveTab(tb); setStatus("idle"); setMsg(""); }}
            className={`px-5 py-3 text-sm font-medium transition-colors ${activeTab === tb ? `text-violet-600 border-b-2 border-violet-600 ${t.accentSoft}` : `${t.t3} hover:${t.bar}`}`}>
            {tb === "analytics" ? "📊 Analytics / Work Flow Excel" : tb === "orders" ? "📦 Orders Sheet" : "📈 TikTok Analytics"}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === "analytics" ? (
          <>
            <p className={`text-sm ${t.t3} mb-4`}>
              Upload your <strong>Work Flow EC BU 1.xlsx</strong> file. It will auto-import task statuses, performance metrics, and notes for all weeks inside.
            </p>
            <input type="file" accept=".xlsx,.xls"
              onChange={e => { setAnalyticsFile(e.target.files?.[0] ?? null); setStatus("idle"); setMsg(""); }}
              className={`w-full text-sm ${t.t3} file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border ${t.divider} file:text-sm file:font-medium ${t.inp} mb-3`} />
            {msg && <p className={`text-sm px-3 py-2 rounded-lg mb-3 ${status === "done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg}</p>}
            <button onClick={uploadAnalytics} disabled={!analyticsFile || status === "loading"}
              className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium">
              {status === "loading" ? "Importing…" : "Import Excel"}
            </button>
          </>
        ) : activeTab === "tiktok" ? (
          <>
            <p className={`text-sm ${t.t3} mb-4`}>
              Upload a TikTok product analytics export file (<strong>product_list_All_*.xlsx</strong>). Products are matched by TikTok Product ID and metrics are available on each product card.
            </p>
            <input type="file" accept=".xlsx,.xls"
              onChange={e => { setTiktokFile(e.target.files?.[0] ?? null); setStatus("idle"); setMsg(""); }}
              className={`w-full text-sm ${t.t3} file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border ${t.divider} file:text-sm file:font-medium ${t.inp} mb-3`} />
            {msg && <p className={`text-sm px-3 py-2 rounded-lg mb-3 ${status === "done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg}</p>}
            <button onClick={uploadTiktok} disabled={!tiktokFile || status === "loading"}
              className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium">
              {status === "loading" ? "Importing…" : "Import Analytics"}
            </button>

            {tkPeriods.length > 0 && (
              <div className="mt-5">
                <h4 className={`text-xs font-semibold ${t.t4} uppercase mb-2`}>Imported Periods</h4>
                <div className="space-y-1.5">
                  {tkPeriods.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs bg-sky-50 rounded-lg px-3 py-2 group hover:bg-sky-100 transition-colors">
                      <span className="font-medium text-sky-700">{p.period_start} → {p.period_end}</span>
                      <span className="text-sky-500 ml-auto">{p.product_count} products</span>
                      <span className="text-sky-400">${p.total_gmv.toLocaleString(undefined, { maximumFractionDigits: 0 })} GMV</span>
                      <span className={`${t.t4}`}>{new Date(p.imported_at).toLocaleDateString()}</span>
                      <button 
                        onClick={async () => {
                          if (confirm(`Delete analytics for ${p.period_start} → ${p.period_end}?`)) {
                            try { 
                              await api.deleteTiktokExport(storeCode, p.period_start, p.period_end); 
                              loadTkPeriods(); 
                            } catch (e: any) { alert(`Failed to delete: ${e.message}`); }
                          }
                        }} 
                        className="text-red-400 hover:text-red-600 font-medium ml-2 px-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className={`text-sm ${t.t3} mb-4`}>
              Upload an orders export from TikTok Shop. This records the file for your team's reference.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={`text-xs ${t.t3} block mb-1`}>File Type</label>
                <select value={ordersType} onChange={e => setOrdersType(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${t.inp} focus:outline-none focus:ring-2 focus:ring-violet-400`}>
                  <option value="orders">All Orders</option>
                  <option value="traffic">Traffic Data</option>
                  <option value="affiliate">Affiliate Report</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={`text-xs ${t.t3} block mb-1`}>Period (optional)</label>
                <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)}
                  placeholder="e.g. Apr 20–26"
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${t.inp} focus:outline-none focus:ring-2 focus:ring-violet-400`} />
              </div>
            </div>
            <input type="file" accept=".xlsx,.xls,.csv"
              onChange={e => { setOrdersFile(e.target.files?.[0] ?? null); setStatus("idle"); setMsg(""); }}
              className={`w-full text-sm ${t.t3} file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border ${t.divider} file:text-sm file:font-medium ${t.inp} mb-3`} />
            {msg && <p className={`text-sm px-3 py-2 rounded-lg mb-3 ${status === "done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg}</p>}
            <button onClick={uploadOrders} disabled={!ordersFile || status === "loading"}
              className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium">
              {status === "loading" ? "Uploading…" : "Upload File"}
            </button>

            {/* History */}
            {history.length > 0 && (
              <div className="mt-5">
                <h4 className={`text-xs font-semibold ${t.t4} uppercase mb-2`}>Upload History</h4>
                <div className="space-y-1.5">
                  {history.map(u => (
                    <div key={u.id} className={`flex items-center gap-3 text-xs ${t.bar} rounded-lg px-3 py-2 group hover:bg-violet-500/10 transition-colors`}>
                      <span className={`${t.card2} ${t.t2} px-1.5 py-0.5 rounded font-medium capitalize shrink-0 w-16 text-center`}>{u.upload_type}</span>
                      <span className={`font-medium ${t.t2} truncate flex-1`}>{u.filename}</span>
                      {u.period_label && <span className={`${t.t4} shrink-0 w-24`}>{u.period_label}</span>}
                      <span className={`${t.t4} shrink-0 w-16 text-right`}>{u.row_count} rows</span>
                      <span className={`${t.t4} shrink-0 w-20 text-right`}>{new Date(u.imported_at).toLocaleDateString()}</span>
                      <button 
                        onClick={async () => {
                          if (confirm("Delete this upload record?")) {
                            try { await api.deleteOrderHistory(u.id); loadHistory(); }
                            catch (e: any) { alert(`Failed to delete: ${e.message}`); }
                          }
                        }} 
                        className="text-red-400 hover:text-red-600 font-medium ml-2 px-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Period modal ─────────────────────────────────────────────────────────────
function PeriodModal({ storeCode, onClose, onCreated }: {
  storeCode: string; onClose: () => void; onCreated: (p: Period) => void;
}) {
  const { theme: t } = useTheme();
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [label, setLabel] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function create() {
    if (!start || !end) { setError("Both dates required"); return; }
    setSaving(true);
    try {
      const p = await api.createPeriod({ store_code: storeCode, period_start: start, period_end: end, label: label || undefined });
      onCreated(p as Period); onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`${t.card} rounded-2xl shadow-2xl w-80 mx-4`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.divider}`}>
          <h3 className={`font-semibold ${t.t1}`}>New Period</h3>
          <button onClick={onClose} className={`${t.t4} hover:${t.t1} text-xl`}>×</button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className={`text-xs font-medium ${t.t3} block mb-1`}>Start Date</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${t.inp} focus:outline-none focus:ring-2 focus:ring-violet-400`} /></div>
          <div><label className={`text-xs font-medium ${t.t3} block mb-1`}>End Date</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${t.inp} focus:outline-none focus:ring-2 focus:ring-violet-400`} /></div>
          <div><label className={`text-xs font-medium ${t.t3} block mb-1`}>Label (optional)</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Jan 12–18"
              className={`w-full border rounded-lg px-3 py-2 text-sm ${t.inp} focus:outline-none focus:ring-2 focus:ring-violet-400`} /></div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className={`px-5 py-4 border-t ${t.divider} flex justify-end gap-2`}>
          <button onClick={onClose} className={`px-3 py-2 text-sm ${t.btnAlt} rounded-lg`}>Cancel</button>
          <button onClick={create} disabled={saving}
            className={`px-3 py-2 text-sm ${t.btn} rounded-lg disabled:opacity-50`}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task cell ────────────────────────────────────────────────────────────────
function TaskCell({ taskKey, task, product, periodId, storeCode, users, onOptimisticUpdate }: {
  taskKey: string; task: TaskInfo | undefined; product: Product; periodId: number;
  storeCode: string; users: User[]; onOptimisticUpdate: (updates: Partial<TaskInfo>) => void;
}) {
  const { theme: t } = useTheme();
  const status = task?.status ?? "todo";
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.todo;
  const [saving, setSaving] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setShowDrop(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function cycleStatus() {
    if (saving) return;
    setSaving(true);
    const newStatus = STATUS_CYCLE[status] ?? "todo";
    try {
      await api.upsertTask({ product_no: product.product_no, period_id: periodId, store_code: storeCode, task_type: taskKey, status: newStatus, assigned_to: task?.assigned_to ?? null });
      onOptimisticUpdate({ status: newStatus as TaskInfo["status"], assigned_to: task?.assigned_to ?? null, assigned_name: task?.assigned_name });
    } catch (e: any) {
      alert(`Failed to update task: ${e.message}`);
    } finally { setSaving(false); }
  }

  async function assignUser(userId: number | null) {
    setSaving(true);
    try {
      await api.upsertTask({ product_no: product.product_no, period_id: periodId, store_code: storeCode, task_type: taskKey, status, assigned_to: userId });
      setShowDrop(false);
      const u = users.find(x => x.id === userId);
      onOptimisticUpdate({ status, assigned_to: userId, assigned_name: u?.name });
    } catch (e: any) {
      alert(`Failed to assign: ${e.message}`);
    } finally { setSaving(false); }
  }

  return (
    <td className="px-2 py-1.5 text-center">
      <div className="relative inline-block" ref={ref}>
        <button onClick={cycleStatus} onContextMenu={e => { e.preventDefault(); setShowDrop(v => !v); }}
          disabled={saving} title="Click to cycle · Right-click to assign"
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all hover:opacity-80 ${cfg.bg} ${cfg.text} ${saving ? "opacity-50" : ""}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </button>
        {task?.assigned_name && <div className={`text-xs ${t.t4} mt-0.5 truncate max-w-[80px]`}>{task.assigned_name}</div>}
        {showDrop && (
          <div className={`absolute z-50 left-0 top-full mt-1 w-44 ${t.card} rounded-lg shadow-lg text-left py-1`}>
            <div className={`px-3 py-1.5 text-xs font-semibold ${t.t4} uppercase border-b ${t.divider}`}>Assign to</div>
            <button onClick={() => assignUser(null)} className={`w-full px-3 py-2 text-sm text-left hover:${t.bar} ${t.t3}`}>Unassign</button>
            {users.map(u => (
              <button key={u.id} onClick={() => assignUser(u.id)}
                className={`w-full px-3 py-2 text-sm text-left hover:${t.accentSoft} ${task?.assigned_to === u.id ? `${t.accentSoft} font-medium` : t.t2}`}>
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </td>
  );
}

// ─── Board row ────────────────────────────────────────────────────────────────
function BoardRow({ product, taskTypes, periodId, storeCode, users, onUpdated, onNotes, onMetrics, onHide, onTaskUpdate, onAnalyticsUpdate, onDropRow, index, zebra, hiddenCols, selected, onToggleSelect }: {
  product: Product; taskTypes: string[]; periodId: number; storeCode: string;
  users: User[]; onUpdated: () => void; onNotes: () => void; onMetrics: () => void; onHide: () => void;
  onTaskUpdate: (taskKey: string, updates: Partial<TaskInfo>) => void;
  onAnalyticsUpdate: (field: string, value: number | null) => void;
  onDropRow: (srcId: string, tgtId: string) => void;
  index: number; zebra: boolean; hiddenCols: Set<string>;
  selected: boolean; onToggleSelect: () => void;
}) {
  const { theme: t } = useTheme();
  const tk = product.tk_export;
  const a = {
    ...product.analytics,
    impressions: product.analytics?.impressions ?? tk?.impressions ?? null,
    ctr:         product.analytics?.ctr         ?? tk?.ctr         ?? null,
    cvr:         product.analytics?.cvr         ?? tk?.ctor        ?? null,
    items_sold:  product.analytics?.items_sold  ?? tk?.items_sold  ?? null,
    gmv:         product.analytics?.gmv         ?? tk?.gmv         ?? null,
  };
  const hasNotes = !!(product.notes?.analysis || product.notes?.action || product.notes?.results);

  async function saveMetric(field: string, value: number | null) {
    await api.updateAnalytics({
      product_no: product.product_no, period_id: periodId, store_code: storeCode,
      [field]: value,
    } as Parameters<typeof api.updateAnalytics>[0]);
    onAnalyticsUpdate(field, value);
  }

  return (
    <tr 
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", product.product_no); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDrop={(e) => {
        e.preventDefault();
        const src = e.dataTransfer.getData("text/plain");
        if (src) onDropRow(src, product.product_no);
      }}
      className={`border-b ${t.divider} hover:bg-violet-500/10 transition-colors ${selected ? "bg-violet-500/10" : zebra ? `${t.bar}/50` : ""}`}
    >
      <td className={`px-2 py-2 ${selected ? "bg-violet-500/10" : zebra ? t.bar : t.card.split(" ")[0]}`}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect}
          className="w-4 h-4 rounded text-violet-600 border-gray-300 focus:ring-violet-500" />
      </td>
      <td className={`px-3 py-2 sticky left-0 z-10 ${selected ? "bg-violet-500/10" : zebra ? t.bar : t.card.split(" ")[0]} border-r ${t.divider}`}>
        <div className="flex items-center gap-2.5">
          <div className={`flex flex-col items-center gap-1 ${t.t5} w-6`}>
            <span className={`cursor-move hover:${t.t2} font-bold`} title="Drag to reorder">⠿</span>
            <span className={`text-[10px] font-bold ${t.t4}`}>#{index + 1}</span>
            <button onClick={onHide} title="Delete product" className="text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded px-1 mt-0.5">🗑️</button>
          </div>
          {product.image_url ? (
            <div className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 border ${t.divider}`}>
              <img src={product.image_url} alt={product.product_no} className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          ) : (
            <div className={`w-10 h-10 rounded-lg ${t.bar} shrink-0 flex items-center justify-center ${t.t5} text-lg`}>□</div>
          )}
          <div className="min-w-0">
            <div className={`font-semibold ${t.t1} text-xs`}>#{product.product_no}</div>
            {product.warehouse_name && <div className={`text-xs ${t.t4} truncate max-w-[130px]`} title={product.warehouse_name}>{product.warehouse_name}</div>}
          </div>
        </div>
      </td>

      {taskTypes.map(tk => !hiddenCols.has(tk) && (
        <TaskCell key={tk} taskKey={tk} task={product.tasks[tk]} product={product}
          periodId={periodId} storeCode={storeCode} users={users} onOptimisticUpdate={u => onTaskUpdate(tk, u)} />
      ))}

      {/* Inline-editable analytics */}
      {!hiddenCols.has("impressions") && (
        <td className={`px-2 py-1.5 text-right text-xs ${t.t2}`}>
          <EditCell value={a.impressions} display={fmt(a.impressions)} onSave={v => saveMetric("impressions", v)} />
        </td>
      )}
      {!hiddenCols.has("ctr") && (
        <td className={`px-2 py-1.5 text-right text-xs ${t.t2}`}>
          <EditCell value={a.ctr} display={pct(a.ctr)} onSave={v => saveMetric("ctr", v)} isPercent />
        </td>
      )}
      {!hiddenCols.has("cvr") && (
        <td className={`px-2 py-1.5 text-right text-xs ${t.t2}`}>
          <EditCell value={a.cvr} display={pct(a.cvr)} onSave={v => saveMetric("cvr", v)} isPercent />
        </td>
      )}
      {!hiddenCols.has("items_sold") && (
        <td className={`px-2 py-1.5 text-right text-xs ${t.t2}`}>
          <EditCell value={a.items_sold} display={fmt(a.items_sold)} onSave={v => saveMetric("items_sold", v)} />
        </td>
      )}
      {!hiddenCols.has("gmv") && (
        <td className={`px-2 py-1.5 text-right text-xs font-medium ${t.t1}`}>
          <EditCell value={a.gmv} display={a.gmv != null ? `$${fmt(a.gmv, 0)}` : "–"} onSave={v => saveMetric("gmv", v)} prefix="$" />
        </td>
      )}
      {!hiddenCols.has("roi") && (
        <td className={`px-2 py-1.5 text-right text-xs ${t.t2}`}>
          <EditCell value={a.roi} display={a.roi != null ? `${a.roi.toFixed(1)}x` : "–"} onSave={v => saveMetric("roi", v)} />
        </td>
      )}

      {/* Action buttons */}
      <td className="px-2 py-1.5 text-center">
        <div className="flex items-center gap-1 justify-center">
          <button onClick={onMetrics} title="All metrics" className="w-6 h-6 rounded text-sm bg-blue-50 hover:bg-blue-100 text-blue-500">📊</button>
          <button onClick={onNotes} title={hasNotes ? "View/edit notes" : "Add notes"}
            className={`w-6 h-6 rounded text-sm ${hasNotes ? "bg-violet-100 text-violet-600 hover:bg-violet-200" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>
            {hasNotes ? "✏️" : "📝"}
          </button>
          {product.tk_export && (
            <span
              title={`TikTok Export: GMV $${product.tk_export.gmv?.toFixed(0) ?? "–"} · Orders ${product.tk_export.orders ?? "–"}`}
              className="w-6 h-6 rounded text-[9px] font-bold bg-sky-100 text-sky-600 flex items-center justify-center cursor-default"
            >TK</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main board page ──────────────────────────────────────────────────────────
export default function BoardPage() {
  const router = useRouter();
  const params = useParams();
  const { theme: t } = useTheme();
  const storeCode = (params?.store as string ?? "TK1").toUpperCase();

  const [tab, setTab] = useState<"board" | "data" | "selection" | "team" | "progress">("board");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [stats, setStats] = useState<{ id: number; name: string; role: string; done_count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [notesProduct, setNotesProduct] = useState<Product | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkAssignUserId, setBulkAssignUserId] = useState<string>("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [metricsProduct, setMetricsProduct] = useState<Product | null>(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<{key: string, dir: "asc"|"desc"} | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColMenu, setShowColMenu] = useState(false);

  const toggleCol = (col: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const handleDropRow = (srcProductNo: string, tgtProductNo: string) => {
    if (srcProductNo === tgtProductNo) return;
    setBoard(prev => {
      if (!prev) return prev;
      const prods = [...prev.products];
      const srcIdx = prods.findIndex(p => p.product_no === srcProductNo);
      const tgtIdx = prods.findIndex(p => p.product_no === tgtProductNo);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      
      const [srcProd] = prods.splice(srcIdx, 1);
      prods.splice(tgtIdx, 0, srcProd);
      
      api.updateBoardOrder(prods.map(p => p.product_no)).catch(console.error);
      return { ...prev, products: prods };
    });
  };

  const updateProductTask = (productNo: string, taskKey: string, updates: Partial<TaskInfo>) => {
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        products: prev.products.map(p => {
          if (p.product_no !== productNo) return p;
          return {
            ...p,
            tasks: { ...p.tasks, [taskKey]: { ...p.tasks[taskKey], ...updates } as TaskInfo }
          };
        })
      };
    });
  };

  const updateProductAnalytics = (productNo: string, field: string, value: number | null) => {
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        products: prev.products.map(p => {
          if (p.product_no !== productNo) return p;
          return {
            ...p,
            analytics: { ...p.analytics, [field]: value }
          };
        })
      };
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return prev.dir === "asc" ? { key, dir: "desc" } : null;
      }
      return { key, dir: "desc" };
    });
  };

  const accentClass = STORE_ACCENT[storeCode] ?? "bg-violet-600";

  const loadPeriods = useCallback(async () => {
    const data = await api.periods(storeCode);
    setPeriods(data.periods);
    if (data.periods.length > 0) {
      setSelectedPeriodId(prev => prev ?? data.periods[0].id);
    }
  }, [storeCode]);

  const loadBoard = useCallback(async () => {
    if (!selectedPeriodId) return;
    setLoading(true);
    try { 
      const [boardData, statsData] = await Promise.all([
        api.getBoard(storeCode, selectedPeriodId),
        api.getBoardStats(storeCode, selectedPeriodId)
      ]);
      setBoard(boardData);
      setStats(statsData.stats);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [storeCode, selectedPeriodId]);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    loadPeriods();
  }, [storeCode]); // eslint-disable-line

  useEffect(() => { if (selectedPeriodId) loadBoard(); }, [selectedPeriodId]); // eslint-disable-line

  const taskTypes = board?.task_types ?? [];
  const taskLabels = board?.task_labels ?? {};
  const users = board?.users ?? [];
  
  let filteredProducts = (board?.products ?? []).filter(p =>
    !filter || p.product_no.includes(filter) || (p.warehouse_name ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  if (statusFilter !== "all") {
    filteredProducts = filteredProducts.filter(p => {
      if (statusFilter === "has_analytics") return p.analytics.impressions != null || p.analytics.gmv != null || p.tk_export != null;
      const statuses = taskTypes.map(t => p.tasks[t]?.status ?? "todo");
      if (statusFilter === "todo") return statuses.some(s => s === "todo");
      if (statusFilter === "in_progress") return statuses.some(s => s === "in_progress");
      if (statusFilter === "done") return statuses.every(s => s === "done" || s === "na");
      return true;
    });
  }

  if (sortConfig) {
    filteredProducts.sort((a, b) => {
      let valA: any = a.analytics[sortConfig.key as keyof typeof a.analytics];
      let valB: any = b.analytics[sortConfig.key as keyof typeof b.analytics];
      if (valA == null) valA = -999999999;
      if (valB == null) valB = -999999999;
      if (valA < valB) return sortConfig.dir === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });
  }

  const allTasks = (board?.products ?? []).flatMap(p => taskTypes.map(t => p.tasks[t]));
  const done = allTasks.filter(t => t?.status === "done").length;
  const total = allTasks.filter(t => t?.status !== "na").length;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className={`${t.topbar} px-6 py-4 shrink-0`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${accentClass} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
              {storeCode.slice(-1)}
            </div>
            <div>
              <h1 className={`font-bold ${t.t1}`}>{STORE_NAMES[storeCode] || storeCode}</h1>
              <p className={`text-xs ${t.t4}`}>Workflow Board</p>
            </div>

            {/* Tabs */}
            <div className="ml-4 flex gap-1">
              {(["board", "team", "selection", "progress", "data"] as const).map(tb => (
                <button key={tb} onClick={() => setTab(tb)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === tb ? `${t.accentSoft}` : `${t.t3} hover:${t.bar}`}`}>
                  {tb === "board" ? "📋 Board" : tb === "team" ? "👥 Team" : tb === "selection" ? "✅ Selection" : tb === "progress" ? "📈 Progress" : "📁 Data & Uploads"}
                </button>
              ))}
            </div>

            {/* Stats Bar */}
            {(tab === "board" || tab === "team") && stats.length > 0 && (
              <div className={`flex items-center gap-4 ml-6 pl-6 border-l ${t.divider} overflow-x-auto py-1 no-scrollbar`}>
                {stats.map(s => (
                  <div key={s.id} className="flex flex-col items-center shrink-0">
                    <div className="flex items-center gap-1 leading-none mb-1">
                      <span className={`text-[10px] font-bold ${t.t4} uppercase`}>{s.name}</span>
                      {s.role === "leader" && <span className="text-[8px] bg-blue-100 text-blue-600 px-1 rounded">L</span>}
                      {s.role === "junior" && <span className="text-[8px] bg-amber-100 text-amber-600 px-1 rounded">J</span>}
                    </div>
                    <span className={`text-sm font-bold ${t.accentTxt} leading-none`}>{s.done_count} <span className={`text-[10px] ${t.t4} font-normal`}>done</span></span>
                  </div>
                ))}
              </div>
            )}

            {tab === "board" && (
              <>
                <div className="ml-2 flex items-center gap-1">
                  <div className="relative">
                    <select value={selectedPeriodId ?? ""} onChange={e => setSelectedPeriodId(Number(e.target.value))}
                      className={`border ${t.divider} rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp} pr-8`}>
                      {periods.length === 0 && <option value="">No periods yet</option>}
                      {periods.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <Link href="/weeks" className={`${t.t4} hover:${t.accentTxt} p-1.5 rounded-lg hover:${t.bar} transition-colors`} title="Manage weeks">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </Link>
                  {selectedPeriodId && (
                    <button onClick={async () => {
                      if (confirm("Delete this period? This will wipe all tasks and analytics for this week.")) {
                        await api.deletePeriod(selectedPeriodId);
                        loadPeriods();
                      }
                    }} className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50" title="Delete Period">🗑️</button>
                  )}
                </div>
                <button onClick={() => setShowPeriodModal(true)}
                  className={`text-sm border border-dashed ${t.divider} px-2.5 py-1.5 rounded-lg ${t.t3} hover:border-violet-400 hover:${t.accentTxt} transition-colors`}>
                  + Period
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…"
                    className={`border ${t.divider} rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-violet-400 ${t.inp}`} />
                  <button onClick={() => setShowAddProduct(true)}
                    className={`flex items-center gap-1.5 ${t.btn} text-sm px-3 py-1.5 rounded-lg font-medium`}>
                    + Add Product
                  </button>
                </div>
              </>
            )}
          </div>

          {tab === "board" && total > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <div className={`flex-1 h-1.5 ${t.bar} rounded-full overflow-hidden`}>
                <div className="h-full bg-green-500 transition-all" style={{ width: `${pctDone}%` }} />
              </div>
              <span className={`text-xs ${t.t3} shrink-0`}>{done}/{total} tasks done ({pctDone}%)</span>
            </div>
          )}
          {tab === "board" && (
            <div className="mt-3 flex items-center justify-between gap-4">
              <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
                {[
                  { id: "all", label: "All Products" },
                  { id: "todo", label: "Has Todo" },
                  { id: "in_progress", label: "In Progress" },
                  { id: "done", label: "All Done" },
                  { id: "has_analytics", label: "Has Analytics" }
                ].map(f => (
                  <button key={f.id} onClick={() => setStatusFilter(f.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors shrink-0 ${statusFilter === f.id ? "bg-violet-600 text-white border-violet-600" : `${t.card} ${t.t3} border-${t.divider} hover:${t.bar}`}`}>
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative shrink-0 z-50">
                <button onClick={() => setShowColMenu(!showColMenu)} className={`${t.t3} hover:${t.t1} text-xs px-2 py-1 rounded ${t.bar} hover:${t.card2} font-medium whitespace-nowrap`}>
                  Columns ⚙️
                </button>
                {showColMenu && (
                  <div className={`absolute right-0 mt-2 w-48 ${t.card} rounded-lg shadow-lg z-50 p-2`}>
                    <div className={`text-xs font-bold ${t.t4} mb-1 px-1 uppercase tracking-wider`}>Tasks</div>
                    {taskTypes.map(tk => (
                      <label key={tk} className={`flex items-center gap-2 text-sm ${t.t2} px-1 py-1 hover:${t.bar} rounded cursor-pointer`}>
                        <input type="checkbox" checked={!hiddenCols.has(tk)} onChange={() => toggleCol(tk)} className="rounded text-violet-600 focus:ring-violet-500" />
                        {taskLabels[tk] || tk}
                      </label>
                    ))}
                    <div className={`text-xs font-bold ${t.t4} mt-2 mb-1 px-1 uppercase tracking-wider`}>Analytics</div>
                    {[
                      { id: "impressions", label: "Impressions" },
                      { id: "ctr", label: "CTR" },
                      { id: "cvr", label: "CVR" },
                      { id: "items_sold", label: "Items Sold" },
                      { id: "gmv", label: "GMV" },
                      { id: "roi", label: "ROI" }
                    ].map(col => (
                      <label key={col.id} className={`flex items-center gap-2 text-sm ${t.t2} px-1 py-1 hover:${t.bar} rounded cursor-pointer`}>
                        <input type="checkbox" checked={!hiddenCols.has(col.id)} onChange={() => toggleCol(col.id)} className="rounded text-violet-600 focus:ring-violet-500" />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {tab === "team" ? (
            !selectedPeriodId ? (
              <div className={`flex flex-col items-center justify-center h-64 ${t.t4}`}>
                <p className="text-lg mb-2">Select a period to view team performance</p>
                <button onClick={() => setShowPeriodModal(true)} className={`${t.btn} px-4 py-2 rounded-lg text-sm font-medium`}>+ Create Period</button>
              </div>
            ) : (
              <TeamPanel
                users={users}
                products={board?.products ?? []}
                taskLabels={taskLabels}
                stats={stats}
                periodId={selectedPeriodId}
                storeCode={storeCode}
                onTaskUpdate={updateProductTask}
                onReload={loadBoard}
              />
            )
          ) : tab === "selection" ? (
            <ProductSelectionPanel
              storeCode={storeCode}
              periodId={selectedPeriodId ?? 0}
              selectedProductNos={new Set(board?.products.map(p => p.product_no) ?? [])}
              onUpdated={loadBoard}
            />
          ) : tab === "progress" ? (
            <ProgressPanel storeCode={storeCode} />
          ) : tab === "data" ? (
            <div className="max-w-3xl mx-auto">
              <DataUploadPanel storeCode={storeCode} onImported={() => { loadPeriods(); loadBoard(); }} />
            </div>
          ) : !selectedPeriodId ? (
            <div className={`flex flex-col items-center justify-center h-64 ${t.t4}`}>
              <p className="text-lg mb-2">No period selected</p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setShowPeriodModal(true)} className={`${t.btn} px-4 py-2 rounded-lg text-sm font-medium`}>+ Create Period</button>
                <button onClick={() => setTab("data")} className={`${t.btnAlt} px-4 py-2 rounded-lg text-sm font-medium`}>↑ Import Excel</button>
              </div>
            </div>
          ) : loading ? (
            <div className={`flex items-center justify-center h-64 ${t.t4}`}>Loading board…</div>
          ) : filteredProducts.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-64 ${t.t4}`}>
              <p className="text-lg mb-2">{filter ? "No products match" : "No products yet"}</p>
              {!filter && (
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setShowAddProduct(true)} className={`${t.btn} px-4 py-2 rounded-lg text-sm font-medium`}>+ Add Product</button>
                  <button onClick={() => setTab("data")} className={`${t.btnAlt} px-4 py-2 rounded-lg text-sm font-medium`}>↑ Import Excel</button>
                </div>
              )}
            </div>
          ) : (
            <div className={`${t.card} rounded-xl overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-max">
                  <thead>
                    <tr className={`${t.bar} border-b ${t.divider}`}>
                      <th className={`px-2 py-3 sticky left-0 ${t.bar} z-10 w-8`}>
                        <input type="checkbox"
                          checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedRows.has(p.product_no))}
                          onChange={e => {
                            if (e.target.checked) setSelectedRows(new Set(filteredProducts.map(p => p.product_no)));
                            else setSelectedRows(new Set());
                          }}
                          className="w-4 h-4 rounded text-violet-600 border-gray-300 focus:ring-violet-500" />
                      </th>
                      <th className={`text-left px-3 py-3 font-semibold text-xs ${t.t3} uppercase tracking-wider sticky left-0 ${t.bar} z-10 min-w-[200px]`}>Product</th>
                      {taskTypes.map(tk => !hiddenCols.has(tk) && (
                        <th key={tk} className={`px-2 py-3 font-semibold text-xs ${t.t3} uppercase tracking-wider text-center min-w-[100px]`}>{taskLabels[tk] || tk}</th>
                      ))}
                      {!hiddenCols.has("impressions") && <th onClick={() => handleSort("impressions")} className={`cursor-pointer hover:${t.card2} px-2 py-3 font-semibold text-xs ${t.t3} uppercase text-right min-w-[80px]`} title="Sort by Impressions">Impressions {sortConfig?.key === "impressions" ? (sortConfig.dir === "asc" ? "↑" : "↓") : "⇅"}</th>}
                      {!hiddenCols.has("ctr") && <th onClick={() => handleSort("ctr")} className={`cursor-pointer hover:${t.card2} px-2 py-3 font-semibold text-xs ${t.t3} uppercase text-right min-w-[60px]`} title="Sort by CTR">CTR {sortConfig?.key === "ctr" ? (sortConfig.dir === "asc" ? "↑" : "↓") : "⇅"}</th>}
                      {!hiddenCols.has("cvr") && <th onClick={() => handleSort("cvr")} className={`cursor-pointer hover:${t.card2} px-2 py-3 font-semibold text-xs ${t.t3} uppercase text-right min-w-[60px]`} title="Sort by CVR">CVR {sortConfig?.key === "cvr" ? (sortConfig.dir === "asc" ? "↑" : "↓") : "⇅"}</th>}
                      {!hiddenCols.has("items_sold") && <th onClick={() => handleSort("items_sold")} className={`cursor-pointer hover:${t.card2} px-2 py-3 font-semibold text-xs ${t.t3} uppercase text-right min-w-[70px]`} title="Sort by Items Sold">Items Sold {sortConfig?.key === "items_sold" ? (sortConfig.dir === "asc" ? "↑" : "↓") : "⇅"}</th>}
                      {!hiddenCols.has("gmv") && <th onClick={() => handleSort("gmv")} className={`cursor-pointer hover:${t.card2} px-2 py-3 font-semibold text-xs ${t.t3} uppercase text-right min-w-[80px]`} title="Sort by GMV">GMV {sortConfig?.key === "gmv" ? (sortConfig.dir === "asc" ? "↑" : "↓") : "⇅"}</th>}
                      {!hiddenCols.has("roi") && <th onClick={() => handleSort("roi")} className={`cursor-pointer hover:${t.card2} px-2 py-3 font-semibold text-xs ${t.t3} uppercase text-right min-w-[60px]`} title="Sort by ROI">ROI {sortConfig?.key === "roi" ? (sortConfig.dir === "asc" ? "↑" : "↓") : "⇅"}</th>}
                      <th className={`px-2 py-3 font-semibold text-xs ${t.t3} uppercase text-center min-w-[80px]`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product, idx) => (
                      <BoardRow key={product.product_no} product={product} taskTypes={taskTypes}
                        periodId={selectedPeriodId!} storeCode={storeCode} users={users}
                        onUpdated={loadBoard} onNotes={() => setNotesProduct(product)}
                        onMetrics={() => setMetricsProduct(product)}
                        onHide={async () => {
                          if (confirm("Remove this product from the board? It will be permanently hidden from this store until restored.")) {
                            try {
                              await api.excludeProduct(storeCode, product.product_no);
                              // Instantly remove from local state so UI updates immediately
                              setBoard(prev => prev ? { ...prev, products: prev.products.filter(p => p.product_no !== product.product_no) } : prev);
                            } catch (e: any) {
                              alert(`Failed to remove product: ${e.message}`);
                            }
                          }
                        }}
                        onTaskUpdate={(t, u) => updateProductTask(product.product_no, t, u)}
                        onAnalyticsUpdate={(f, v) => updateProductAnalytics(product.product_no, f, v)}
                        onDropRow={handleDropRow}
                        index={idx}
                        hiddenCols={hiddenCols}
                        zebra={idx % 2 === 1}
                        selected={selectedRows.has(product.product_no)}
                        onToggleSelect={() => setSelectedRows(prev => {
                          const next = new Set(prev);
                          if (next.has(product.product_no)) next.delete(product.product_no);
                          else next.add(product.product_no);
                          return next;
                        })} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedRows.size > 0 && selectedPeriodId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700">
          <span className="text-sm font-semibold">{selectedRows.size} product{selectedRows.size !== 1 ? "s" : ""} selected</span>
          <div className="w-px h-5 bg-gray-600" />
          <select value={bulkAssignUserId} onChange={e => setBulkAssignUserId(e.target.value)}
            className="text-sm bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="">— Assign to —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}{u.role === "leader" ? " (L)" : u.role === "junior" ? " (J)" : ""}</option>
            ))}
            <option value="unassign">✕ Unassign</option>
          </select>
          <button disabled={!bulkAssignUserId || bulkAssigning}
            onClick={async () => {
              setBulkAssigning(true);
              try {
                await api.bulkAssign({
                  product_nos: Array.from(selectedRows),
                  period_id: selectedPeriodId,
                  store_code: storeCode,
                  assigned_to: bulkAssignUserId === "unassign" ? null : Number(bulkAssignUserId),
                });
                setSelectedRows(new Set());
                setBulkAssignUserId("");
                loadBoard();
              } finally { setBulkAssigning(false); }
            }}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors">
            {bulkAssigning ? "Assigning…" : "Assign All Tasks"}
          </button>
          <div className="w-px h-5 bg-gray-600" />
          <button disabled={bulkAssigning}
            onClick={async () => {
              if (!confirm(`Remove ${selectedRows.size} products from this week? All task progress for these products in this week will be lost.`)) return;
              setBulkAssigning(true);
              try {
                await api.updateBoardSelection({
                  product_nos: Array.from(selectedRows),
                  period_id: selectedPeriodId,
                  store_code: storeCode,
                  selected: false,
                });
                setSelectedRows(new Set());
                loadBoard();
              } finally { setBulkAssigning(false); }
            }}
            className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors border border-red-900/50 hover:bg-red-950/30">
            Delete
          </button>
          <div className="w-px h-5 bg-gray-600" />
          <button onClick={() => { setSelectedRows(new Set()); setBulkAssignUserId(""); }}
            className="text-gray-400 hover:text-white text-lg leading-none px-1">×</button>
        </div>
      )}

      {showPeriodModal && (
        <PeriodModal storeCode={storeCode} onClose={() => setShowPeriodModal(false)}
          onCreated={p => { setPeriods(prev => [p, ...prev]); setSelectedPeriodId(p.id); }} />
      )}
      {showAddProduct && (
        <AddProductModal storeCode={storeCode} onClose={() => setShowAddProduct(false)}
          onAdded={() => { loadBoard(); }} />
      )}
      {notesProduct && (
        <NotesModal product={notesProduct} periodId={selectedPeriodId!} storeCode={storeCode}
          onClose={() => setNotesProduct(null)} onSaved={loadBoard} />
      )}
      {metricsProduct && (
        <MetricsModal product={metricsProduct} periodId={selectedPeriodId!} storeCode={storeCode}
          onClose={() => setMetricsProduct(null)} onSaved={loadBoard} />
      )}
    </>
  );
}
