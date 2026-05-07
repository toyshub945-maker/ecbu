"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import type { Period } from "@/lib/types";

const STORES = [
  { code: "TK1", name: "CELNEPHO", color: "bg-blue-500",    ring: "ring-blue-400",   text: "text-blue-700",   light: "bg-blue-50 border-blue-200" },
  { code: "TK2", name: "CYNLLIO",  color: "bg-emerald-500", ring: "ring-emerald-400",text: "text-emerald-700",light: "bg-emerald-50 border-emerald-200" },
  { code: "TK3", name: "VIMISAOI", color: "bg-orange-500",  ring: "ring-orange-400", text: "text-orange-700", light: "bg-orange-50 border-orange-200" },
  { code: "TK4", name: "Mikarka",  color: "bg-purple-500",  ring: "ring-purple-400", text: "text-purple-700", light: "bg-purple-50 border-purple-200" },
];

type PeriodByStore = Record<string, Period[]>;

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function WeeksPage() {
  const router = useRouter();
  const { theme: t } = useTheme();
  const [periodsByStore, setPeriodsByStore] = useState<PeriodByStore>({});
  const [loading, setLoading] = useState(true);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set(STORES.map(s => s.code)));
  const [startDate, setStartDate] = useState(nextMonday());
  const [endDate, setEndDate] = useState(() => addDays(nextMonday(), 6));
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.periods();
      const byStore: PeriodByStore = {};
      for (const s of STORES) byStore[s.code] = [];
      for (const p of data.periods) {
        if (byStore[p.store_code]) byStore[p.store_code].push(p);
      }
      setPeriodsByStore(byStore);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    loadPeriods();
  }, [loadPeriods, router]);

  function handleStartChange(val: string) {
    setStartDate(val);
    setEndDate(addDays(val, 6));
  }

  function toggleStore(code: string) {
    setSelectedStores(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  async function createWeeks() {
    if (selectedStores.size === 0) { setError("Select at least one store"); return; }
    if (!startDate || !endDate) { setError("Start and end dates required"); return; }
    setCreating(true); setError(""); setSuccess("");
    const resolvedLabel = label.trim() || `${startDate} – ${endDate}`;
    const codes = Array.from(selectedStores);
    const results = await Promise.allSettled(
      codes.map(code => api.createPeriod({ store_code: code, period_start: startDate, period_end: endDate, label: resolvedLabel }))
    );
    const ok = results.filter(r => r.status === "fulfilled").length;
    const fail = results.filter(r => r.status === "rejected").length;
    if (ok > 0) setSuccess(`Created week for ${ok} store${ok > 1 ? "s" : ""}${fail > 0 ? ` (${fail} already existed)` : ""}.`);
    if (ok === 0) setError("All selected stores already have a period for these dates.");
    setCreating(false);
    setLabel("");
    await loadPeriods();
  }

  async function deletePeriod(id: number) {
    if (!confirm("Delete this period? This removes all tasks and analytics for that week.")) return;
    setDeleting(id);
    try { await api.deletePeriod(id); await loadPeriods(); }
    catch { alert("Failed to delete period"); }
    finally { setDeleting(null); }
  }

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className={`text-2xl font-bold ${t.t1}`}>Week Setup</h1>
            <p className={`text-sm ${t.t3} mt-1`}>Create and manage weekly work periods for each store. Assign the same week to multiple stores at once.</p>
          </div>

          {/* Create form */}
          <section className={`${t.card} rounded-2xl p-5`}>
            <h2 className={`font-bold ${t.t1} mb-4 flex items-center gap-2`}>
              <span className={`w-6 h-6 ${t.accentSoft} ${t.accentTxt} rounded-md flex items-center justify-center text-sm`}>+</span>
              Create New Week
            </h2>

            {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg mb-4">{success}</div>}
            {error   && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

            {/* Store toggles */}
            <div className="mb-4">
              <label className={`text-xs font-semibold ${t.t3} uppercase tracking-wider block mb-2`}>Apply to Stores</label>
              <div className="flex flex-wrap gap-2">
                {STORES.map(s => {
                  const sel = selectedStores.has(s.code);
                  return (
                    <button key={s.code} onClick={() => toggleStore(s.code)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${sel ? `${s.light} ${s.ring} ring-2 border-transparent` : `${t.card2} ${t.divider} ${t.t5} hover:${t.divider}`}`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                      <span className={sel ? s.text : ""}>{s.name}</span>
                      <span className="text-xs opacity-60">{s.code}</span>
                      {sel && <span className="text-green-500 text-xs">✓</span>}
                    </button>
                  );
                })}
                <button onClick={() => setSelectedStores(new Set(STORES.map(s => s.code)))}
                  className={`px-2 py-1 text-xs ${t.accentTxt} hover:underline`}>All</button>
                <button onClick={() => setSelectedStores(new Set())}
                  className={`px-2 py-1 text-xs ${t.t5} hover:underline`}>None</button>
              </div>
            </div>

            {/* Date + label */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className={`text-xs font-semibold ${t.t3} uppercase tracking-wider block mb-1`}>Start Date</label>
                <input type="date" value={startDate} onChange={e => handleStartChange(e.target.value)}
                  className={`w-full ${t.inp} rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`} />
              </div>
              <div>
                <label className={`text-xs font-semibold ${t.t3} uppercase tracking-wider block mb-1`}>End Date</label>
                <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                  className={`w-full ${t.inp} rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`} />
              </div>
              <div>
                <label className={`text-xs font-semibold ${t.t3} uppercase tracking-wider block mb-1`}>Label (optional)</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                  placeholder={`${startDate ? formatDate(startDate) : "–"} – ${endDate ? formatDate(endDate) : "–"}`}
                  className={`w-full ${t.inp} rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`} />
              </div>
            </div>

            {startDate && endDate && (
              <div className={`${t.accentSoft} rounded-xl px-4 py-2.5 text-sm ${t.accentTxt} mb-4 flex items-center gap-2 border`}>
                <span>📅</span>
                <span>
                  Creating <strong>{formatDate(startDate)} – {formatDate(endDate)}</strong> for{" "}
                  <strong>{selectedStores.size === 0 ? "no stores" : selectedStores.size === 4 ? "all 4 stores" : `${Array.from(selectedStores).join(", ")}`}</strong>
                </span>
              </div>
            )}

            <button onClick={createWeeks} disabled={creating || selectedStores.size === 0}
              className={`${t.btn} text-sm px-5 py-2.5 rounded-xl disabled:opacity-50 font-medium flex items-center gap-2`}>
              {creating ? "Creating…" : `Create Week for ${selectedStores.size} Store${selectedStores.size !== 1 ? "s" : ""}`}
            </button>
          </section>

          {/* Per-store period lists */}
          {loading ? (
            <div className={`text-center py-12 ${t.t5}`}>Loading periods…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {STORES.map(s => {
                const periods = periodsByStore[s.code] ?? [];
                return (
                  <div key={s.code} className={`${t.card} rounded-2xl overflow-hidden`}>
                    {/* Store header */}
                    <div className={`flex items-center gap-3 px-4 py-3 border-b ${t.divider}`}>
                      <span className={`w-3 h-3 rounded-full ${s.color} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <span className={`font-bold ${t.t1}`}>{s.name}</span>
                        <span className={`text-xs ${t.t5} ml-2`}>{s.code}</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.light} ${s.text}`}>
                        {periods.length} week{periods.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {periods.length === 0 ? (
                      <div className={`px-4 py-8 text-center ${t.t5} text-sm`}>
                        No weeks yet. Create one above.
                      </div>
                    ) : (
                      <ul className={`divide-y ${t.divider}`}>
                        {periods.map((p, idx) => {
                          const isLatest = idx === 0;
                          return (
                            <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${isLatest ? `${t.accentSoft} bg-opacity-50` : ""}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-semibold ${t.t1} truncate`}>{p.label}</span>
                                  {isLatest && <span className={`text-[10px] ${t.accentSoft} ${t.accentTxt} px-1.5 py-0.5 rounded font-medium shrink-0 border`}>Latest</span>}
                                </div>
                                <div className={`text-xs ${t.t5} mt-0.5`}>
                                  {formatDate(p.period_start)} → {formatDate(p.period_end)}
                                </div>
                              </div>
                              <a href={`/board/${s.code}`}
                                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${s.light} ${s.text} hover:opacity-80`}>
                                Open →
                              </a>
                              <button onClick={() => deletePeriod(p.id)} disabled={deleting === p.id}
                                className={`${t.t5} hover:text-red-500 text-xs px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40`}
                                title="Delete period">
                                {deleting === p.id ? "…" : "🗑"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
