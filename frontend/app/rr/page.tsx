"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import type { RRProduct, RRUpload } from "@/lib/types";

const STORES = [
  { code: "TK1", name: "CELNEPHO",  color: "bg-blue-500",    light: "bg-blue-50 border-blue-200",    text: "text-blue-700"    },
  { code: "TK2", name: "CYNLLIO",   color: "bg-emerald-500", light: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  { code: "TK3", name: "VIMISAOI",  color: "bg-orange-500",  light: "bg-orange-50 border-orange-200",  text: "text-orange-700"  },
  { code: "TK4", name: "Mikarka",   color: "bg-purple-500",  light: "bg-purple-50 border-purple-200",  text: "text-purple-700"  },
];

const STORE_MAP = Object.fromEntries(STORES.map(s => [s.code, s]));

function rrColor(rate: number) {
  if (rate === 0)   return { ring: "ring-gray-200",   bg: "bg-gray-50",   text: "text-gray-400",   label: "No data" };
  if (rate < 5)     return { ring: "ring-green-400",  bg: "bg-green-50",  text: "text-green-600",  label: "Low"     };
  if (rate < 10)    return { ring: "ring-yellow-400", bg: "bg-yellow-50", text: "text-yellow-600", label: "Moderate"};
  if (rate < 20)    return { ring: "ring-orange-400", bg: "bg-orange-50", text: "text-orange-600", label: "High"    };
  return              { ring: "ring-red-400",    bg: "bg-red-50",    text: "text-red-600",    label: "Critical" };
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function UploadCard({
  title, icon, color, hint, onUpload, t,
}: {
  title: string; icon: string; color: string; hint: string;
  onUpload: (file: File, store_code: string, period_label: string) => Promise<unknown>; t: import("@/lib/theme").ThemeDef;
}) {
  const [store, setStore] = useState("TK1");
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const res = await onUpload(file, store, period);
      setMsg({ ok: true, text: `Imported ${(res as any).rows ?? "?"} rows` });
      setPeriod("");
    } catch (err: any) {
      setMsg({ ok: false, text: err.message ?? "Upload failed" });
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className={`${t.card} rounded-2xl p-5 flex flex-col gap-4`}>
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center text-white text-base shrink-0`}>{icon}</span>
        <div>
          <div className={`font-bold ${t.t1} text-sm`}>{title}</div>
          <div className={`text-xs ${t.t5} mt-0.5`}>{hint}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STORES.map(s => (
          <button key={s.code} onClick={() => setStore(s.code)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              store === s.code
                ? `${s.light} border-transparent ring-2 ${s.code === "TK1" ? "ring-blue-400" : s.code === "TK2" ? "ring-emerald-400" : s.code === "TK3" ? "ring-orange-400" : "ring-purple-400"}`
                : `${t.card2} ${t.divider} ${t.t5}`
            }`}>
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className={store === s.code ? s.text : ""}>{s.name}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="Period label (optional)"
          className={`flex-1 ${t.inp} rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400`} />
      </div>

      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.ok ? "✓ " : "✕ "}{msg.text}
        </div>
      )}

      <label className={`cursor-pointer inline-flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-xl font-medium transition-colors ${busy ? "opacity-50 cursor-not-allowed" : ""} ${color} text-white hover:opacity-90`}>
        {busy ? "Uploading…" : `Choose File (.xlsx / .csv)`}
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={handle} />
      </label>
    </div>
  );
}

function ProductCard({ p, t }: { p: RRProduct; t: import("@/lib/theme").ThemeDef }) {
  const colors = rrColor(p.rr_rate);
  const store = STORE_MAP[p.store_code];
  const [open, setOpen] = useState(false);

  return (
    <div className={`${t.card} rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-md`}>
      <div className={`relative h-36 ${t.bar} flex items-center justify-center shrink-0`}>
        {p.image_url
          ? <img src={p.image_url} alt="" className="h-full w-full object-contain p-2" />
          : <span className="text-4xl opacity-20">📦</span>
        }
        <div className={`absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-lg ${colors.bg} ${colors.text} ring-1 ${colors.ring}`}>
          {p.rr_rate > 0 ? `${p.rr_rate.toFixed(1)}%` : "—"}
        </div>
        {store && (
          <div className="absolute top-2 left-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${store.light} ${store.text} border`}>{store.code}</span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <div className={`text-sm font-bold ${t.t1} leading-tight`}>
            #{p.product_no}
          </div>
          <div className={`text-[10px] ${t.t5} truncate mt-0.5`}
                title={p.warehouse_name || ""}>
            {p.warehouse_name || <span className="italic">No name</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 text-center mt-auto">
          <div className="bg-blue-50 rounded-lg py-1.5 px-1">
            <div className="text-[10px] text-blue-400 font-medium">Orders</div>
            <div className="text-sm font-bold text-blue-700">{fmt(p.order_qty)}</div>
          </div>
          <div className="bg-red-50 rounded-lg py-1.5 px-1">
            <div className="text-[10px] text-red-400 font-medium">Returns</div>
            <div className="text-sm font-bold text-red-600">{fmt(p.return_qty)}</div>
          </div>
          <div className={`${colors.bg} rounded-lg py-1.5 px-1 ring-1 ${colors.ring}`}>
            <div className={`text-[10px] font-medium ${colors.text}`}>R&R%</div>
            <div className={`text-sm font-bold ${colors.text}`}>{p.rr_rate > 0 ? `${p.rr_rate.toFixed(1)}%` : "—"}</div>
          </div>
        </div>

        {p.order_qty > 0 && (
          <div className={`h-1.5 ${t.bar} rounded-full overflow-hidden`}>
            <div
              className={`h-full rounded-full transition-all ${p.rr_rate < 5 ? "bg-green-400" : p.rr_rate < 10 ? "bg-yellow-400" : p.rr_rate < 20 ? "bg-orange-400" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, p.rr_rate * 3)}%` }}
            />
          </div>
        )}

        {Object.keys(p.all_stores).length > 1 && (
          <div>
            <button onClick={() => setOpen(v => !v)} className="text-[10px] text-violet-500 hover:underline">
              {open ? "▲ Hide" : "▼ All stores"}
            </button>
            {open && (
              <div className="mt-1.5 space-y-1">
                {Object.entries(p.all_stores).map(([sc, d]) => {
                  const rate = d.order_qty > 0 ? (d.return_qty / d.order_qty * 100) : 0;
                  const c = rrColor(rate);
                  const st = STORE_MAP[sc];
                  return (
                    <div key={sc} className="flex items-center gap-2 text-[10px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${st?.color ?? "bg-gray-400"} shrink-0`} />
                      <span className={`${t.t3} w-12 shrink-0`}>{sc}</span>
                      <span className={t.t5}>O:{fmt(d.order_qty)} R:{fmt(d.return_qty)}</span>
                      <span className={`ml-auto font-semibold ${c.text}`}>{rate > 0 ? `${rate.toFixed(1)}%` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadHistory({ uploads, onDelete, t }: { uploads: RRUpload[]; onDelete: (id: number) => void; t: import("@/lib/theme").ThemeDef }) {
  if (uploads.length === 0) return (
    <div className={`text-center py-8 ${t.t5} text-sm`}>No uploads yet.</div>
  );

  return (
    <div className={`divide-y ${t.divider}`}>
      {uploads.map(u => {
        const store = STORE_MAP[u.store_code];
        const typeColor = u.upload_type === "orders" ? "bg-blue-100 text-blue-600" : "bg-red-100 text-red-600";
        return (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeColor} uppercase shrink-0`}>
              {u.upload_type}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`w-2 h-2 rounded-full ${store?.color ?? "bg-gray-400"}`} />
              <span className={`text-xs ${t.t3}`}>{u.store_code}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-medium ${t.t2} truncate`}>{u.filename ?? "—"}</div>
              <div className={`text-[10px] ${t.t5}`}>
                {u.period_label ? `${u.period_label} · ` : ""}
                {u.row_count} rows · {new Date(u.imported_at).toLocaleString()}
              </div>
            </div>
            <button onClick={() => onDelete(u.id)}
              className={`${t.t5} hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors text-xs shrink-0`}
              title="Delete upload and its data">
              🗑
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function RRPage() {
  const router = useRouter();
  const { theme: t } = useTheme();
  const [products, setProducts] = useState<RRProduct[]>([]);
  const [uploads, setUploads] = useState<RRUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStore, setFilterStore] = useState<string>("");
  const [tab, setTab] = useState<"dashboard" | "upload" | "history">("dashboard");
  const [sortBy, setSortBy] = useState<"rr_rate" | "order_qty" | "return_qty">("rr_rate");

  const load = useCallback(async (q = query, sc = filterStore) => {
    setLoading(true);
    try {
      const [pd, ud] = await Promise.all([
        api.rrProducts(sc || undefined, q || undefined),
        api.rrUploads(),
      ]);
      setProducts(pd.products);
      setUploads(ud.uploads);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [query, filterStore]);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
  }, [load, router]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearch(v: string) {
    setQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v, filterStore), 400);
  }

  function handleStoreFilter(sc: string) {
    const next = filterStore === sc ? "" : sc;
    setFilterStore(next);
    load(query, next);
  }

  async function handleDeleteUpload(id: number) {
    if (!confirm("Delete this upload? This will remove all its order/return data from R&R calculations.")) return;
    await api.rrDeleteUpload(id);
    load();
  }

  const sorted = [...products].sort((a, b) => {
    if (sortBy === "rr_rate") return b.rr_rate - a.rr_rate;
    if (sortBy === "order_qty") return b.order_qty - a.order_qty;
    return b.return_qty - a.return_qty;
  });

  const totalOrders = products.reduce((s, p) => s + p.order_qty, 0);
  const totalReturns = products.reduce((s, p) => s + p.return_qty, 0);
  const avgRR = products.length > 0
    ? products.reduce((s, p) => s + p.rr_rate, 0) / products.length
    : 0;
  const criticalCount = products.filter(p => p.rr_rate >= 20).length;
  const highCount = products.filter(p => p.rr_rate >= 10 && p.rr_rate < 20).length;

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-5">

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className={`text-2xl font-bold ${t.t1} flex items-center gap-2`}>
                ↩️ Return &amp; Refund Rate
              </h1>
              <p className={`text-sm ${t.t3} mt-1`}>
                Track product-level R&amp;R rates · Formula: <code className={`${t.bar} px-1.5 py-0.5 rounded text-xs`}>Return &amp; Refund Qty ÷ Order Qty × 100</code>
              </p>
            </div>

            <div className={`flex items-center gap-1 ${t.bar} p-1 rounded-xl text-sm`}>
              {(["dashboard", "upload", "history"] as const).map(tb => (
                <button key={tb} onClick={() => setTab(tb)}
                  className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-all ${tab === tb ? `${t.card} ${t.t1} shadow` : `${t.t5} hover:${t.t3}`}`}>
                  {tb === "dashboard" ? "📊 Dashboard" : tb === "upload" ? "⬆️ Upload" : "🗂 History"}
                </button>
              ))}
            </div>
          </div>

          {tab === "upload" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadCard title="Upload Order Sheet" icon="📦" color="bg-blue-600" hint="Needs MSKU/SKU column + order quantity column"
                onUpload={async (file, store_code, period_label) => { const res = await api.rrUploadOrders(file, store_code, period_label); load(); return res; }} t={t} />
              <UploadCard title="Upload Return / Refund Sheet" icon="↩️" color="bg-red-500" hint="Needs MSKU/SKU column + return/refund quantity column"
                onUpload={async (file, store_code, period_label) => { const res = await api.rrUploadReturns(file, store_code, period_label); load(); return res; }} t={t} />

              <div className={`${t.accentSoft} rounded-2xl p-4 text-sm ${t.accentTxt} space-y-2 border`}>
                <div className="font-semibold flex items-center gap-2">💡 Supported column names (auto-detected)</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="font-medium text-violet-600 mb-1">MSKU / SKU column</div>
                    <div className="space-y-0.5 opacity-80">
                      <div>MSKU, Seller SKU, SKU</div>
                      <div>Product No, Item ID</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-blue-600 mb-1">Order quantity column</div>
                    <div className="space-y-0.5 opacity-80">
                      <div>Units Ordered, Order Qty</div>
                      <div>Quantity, Units, Paid Units</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-red-500 mb-1">Return/Refund qty column</div>
                    <div className="space-y-0.5 opacity-80">
                      <div>Return Qty, Refund Qty</div>
                      <div>Returns, Refunds, Returned</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className={`${t.card} rounded-2xl overflow-hidden`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${t.divider}`}>
                <span className={`font-semibold ${t.t1} text-sm`}>Upload History</span>
                <span className={`text-xs ${t.t5}`}>{uploads.length} uploads</span>
              </div>
              <UploadHistory uploads={uploads} onDelete={handleDeleteUpload} t={t} />
            </div>
          )}

          {tab === "dashboard" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`${t.card} rounded-2xl px-4 py-3`}>
                  <div className={`text-xs ${t.t4} font-medium`}>Products</div>
                  <div className={`text-2xl font-bold ${t.t1} mt-0.5`}>{products.length}</div>
                </div>
                <div className="bg-blue-50 rounded-2xl border border-blue-100 shadow-sm px-4 py-3">
                  <div className="text-xs text-blue-400 font-medium">Total Orders</div>
                  <div className="text-2xl font-bold text-blue-700 mt-0.5">{totalOrders.toLocaleString()}</div>
                </div>
                <div className="bg-red-50 rounded-2xl border border-red-100 shadow-sm px-4 py-3">
                  <div className="text-xs text-red-400 font-medium">Total Returns</div>
                  <div className="text-2xl font-bold text-red-600 mt-0.5">{totalReturns.toLocaleString()}</div>
                </div>
                <div className={`rounded-2xl border shadow-sm px-4 py-3 ${avgRR < 5 ? "bg-green-50 border-green-100" : avgRR < 10 ? "bg-yellow-50 border-yellow-100" : "bg-red-50 border-red-100"}`}>
                  <div className={`text-xs font-medium ${avgRR < 5 ? "text-green-400" : avgRR < 10 ? "text-yellow-500" : "text-red-400"}`}>Avg R&amp;R Rate</div>
                  <div className={`text-2xl font-bold mt-0.5 ${avgRR < 5 ? "text-green-700" : avgRR < 10 ? "text-yellow-700" : "text-red-700"}`}>
                    {avgRR.toFixed(1)}%
                  </div>
                </div>
              </div>

              {(criticalCount > 0 || highCount > 0) && (
                <div className="flex flex-wrap gap-2">
                  {criticalCount > 0 && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2 rounded-xl">
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      {criticalCount} product{criticalCount > 1 ? "s" : ""} with Critical R&amp;R (&gt;20%)
                    </div>
                  )}
                  {highCount > 0 && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-medium px-3 py-2 rounded-xl">
                      <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                      {highCount} product{highCount > 1 ? "s" : ""} with High R&amp;R (10–20%)
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-48">
                  <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${t.t5}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={query} onChange={e => handleSearch(e.target.value)}
                    placeholder="Search by MSKU, product name…"
                    className={`w-full pl-9 pr-4 py-2 ${t.inp} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`} />
                </div>

                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleStoreFilter("")}
                    className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all ${filterStore === "" ? `${t.btn} text-white` : `${t.card} ${t.divider} ${t.t5}`}`}>
                    All
                  </button>
                  {STORES.map(s => (
                    <button key={s.code} onClick={() => handleStoreFilter(s.code)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all ${filterStore === s.code ? `${s.light} ${s.text} border` : `${t.card} ${t.divider} ${t.t5}`}`}>
                      <span className={`w-2 h-2 rounded-full ${s.color}`} />
                      {s.code}
                    </button>
                  ))}
                </div>

                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className={`text-xs ${t.inp} rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400`}>
                  <option value="rr_rate">Sort: R&R Rate ↓</option>
                  <option value="order_qty">Sort: Orders ↓</option>
                  <option value="return_qty">Sort: Returns ↓</option>
                </select>

                <span className={`text-xs ${t.t5} ml-auto shrink-0`}>{products.length} products</span>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { label: "Low < 5%",       bg: "bg-green-100",  text: "text-green-700"  },
                  { label: "Moderate 5–10%", bg: "bg-yellow-100", text: "text-yellow-700" },
                  { label: "High 10–20%",    bg: "bg-orange-100", text: "text-orange-700" },
                  { label: "Critical > 20%", bg: "bg-red-100",    text: "text-red-700"    },
                ].map(l => (
                  <span key={l.label} className={`${l.bg} ${l.text} px-2.5 py-1 rounded-full font-medium`}>{l.label}</span>
                ))}
              </div>

              {loading ? (
                <div className={`text-center py-16 ${t.t5}`}>Loading…</div>
              ) : sorted.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="text-5xl">📭</div>
                  <div className={`font-medium ${t.t3}`}>No R&amp;R data yet</div>
                  <div className={`text-sm ${t.t5}`}>Upload an order sheet and a return sheet to get started.</div>
                  <button onClick={() => setTab("upload")}
                    className={`mt-2 ${t.btn} text-sm px-4 py-2 rounded-xl font-medium`}>
                    Go to Upload →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {sorted.map(p => <ProductCard key={`${p.msku}-${p.store_code}`} p={p} t={t} />)}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
