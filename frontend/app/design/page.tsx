"use client";
import { useState, useCallback, useRef } from "react";
import { useTheme } from "@/lib/theme";

const API = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Issue {
  module: string;
  type: string;
  description: string;
  severity: "critical" | "warning" | "info";
}
interface AnalysisResult {
  optimized_order: string[];
  proofreading_report: { status: "pass" | "warning"; issues: Issue[] };
  module_filenames: string[];
  size_chart_filename: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-50 border-red-300 text-red-800",
  warning:  "bg-amber-50 border-amber-300 text-amber-800",
  info:     "bg-blue-50 border-blue-200 text-blue-700",
};
const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning:  "bg-amber-400",
  info:     "bg-blue-400",
};
const TYPE_LABEL: Record<string, string> = {
  typo:                "Typo",
  color_mismatch:      "Color Mismatch",
  material_mismatch:   "Material Mismatch",
  category_mismatch:   "Category Mismatch",
  font_inconsistency:  "Font Inconsistency",
  info:                "Note",
};

function uid() { return Math.random().toString(36).slice(2); }

// ─── Drop Zone ───────────────────────────────────────────────────────────────
function DropZone({
  label, sublabel, file, onFile, accept = "image/*",
}: {
  label: string; sublabel?: string; file: File | null;
  onFile: (f: File) => void; accept?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => ref.current?.click()}
      className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-2 p-6 min-h-[140px]
        ${dragging ? "border-stone-500 bg-stone-50" : "border-stone-200 hover:border-stone-400 hover:bg-stone-50/60"}`}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {file ? (
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={URL.createObjectURL(file)} alt={file.name}
            className="mx-auto h-20 w-auto object-contain rounded-lg mb-2 shadow-sm" />
          <p className="text-xs font-medium text-stone-700 truncate max-w-[140px]">{file.name}</p>
        </div>
      ) : (
        <>
          <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-lg">🖼</div>
          <p className="text-xs font-semibold text-stone-600 text-center">{label}</p>
          {sublabel && <p className="text-[10px] text-stone-400 text-center leading-snug">{sublabel}</p>}
        </>
      )}
    </div>
  );
}

// ─── Module slot with drag-to-reorder ────────────────────────────────────────
function ModuleSlot({
  index, file, onFile, onRemove,
}: { index: number; file: File | null; onFile: (f: File) => void; onRemove: () => void }) {
  return (
    <div className="relative group">
      <DropZone
        label={`Module ${index + 1}`}
        sublabel="Product banner / feature image"
        file={file}
        onFile={onFile}
      />
      {file && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
        >✕</button>
      )}
      <p className="text-center text-[10px] text-stone-400 mt-1.5 font-medium">
        {file ? "✓ Ready" : "Drop or click"}
      </p>
    </div>
  );
}

// ─── Issue card ───────────────────────────────────────────────────────────────
function IssueCard({ issue }: { issue: Issue }) {
  return (
    <div className={`flex gap-3 items-start border rounded-xl p-3 text-sm ${SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.info}`}>
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_DOT[issue.severity] || SEVERITY_DOT.info}`} />
      <div>
        <span className="font-semibold text-xs uppercase tracking-wide">
          [{TYPE_LABEL[issue.type] || issue.type}] {issue.module}
        </span>
        <p className="mt-0.5 leading-snug">{issue.description}</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DesignPage() {
  const { theme: t } = useTheme();

  const [sizeChart, setSizeChart] = useState<File | null>(null);
  const [modules, setModules] = useState<(File | null)[]>([null, null, null, null, null]);
  const [wordings, setWordings] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");

  // After analysis, the user can reorder by dragging; we store the final order separately
  const [orderedKeys, setOrderedKeys] = useState<string[]>([]);   // "module_1"…"size_chart"
  const dragIdx = useRef<number | null>(null);

  const filledModules = modules.filter(Boolean) as File[];
  const canAnalyze = !!sizeChart && filledModules.length >= 1 && wordings.trim().length > 10;

  // ── Analyze ────────────────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (!canAnalyze) return;
    setAnalyzing(true); setError(""); setResult(null);

    try {
      const fd = new FormData();
      fd.append("size_chart", sizeChart!);
      fd.append("wordings", wordings.trim());
      filledModules.forEach(f => fd.append("modules", f));

      const res = await fetch(`${API}/api/design/analyze`, { method: "POST", body: fd });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail || res.statusText);
      }
      const data: AnalysisResult = await res.json();
      setResult(data);
      setOrderedKeys(data.optimized_order);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Stitch ─────────────────────────────────────────────────────────────────
  async function handleStitch() {
    if (!result) return;
    setStitching(true); setError("");

    // Build file array in ordered sequence
    const fileMap: Record<string, File> = {};
    filledModules.forEach((f, i) => { fileMap[`module_${i + 1}`] = f; });
    if (sizeChart) fileMap["size_chart"] = sizeChart;

    const ordered: File[] = orderedKeys
      .map(k => fileMap[k])
      .filter(Boolean);

    try {
      const fd = new FormData();
      ordered.forEach(f => fd.append("images", f));
      fd.append("target_width", "970");

      const res = await fetch(`${API}/api/design/stitch`, { method: "POST", body: fd });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "aplus_strip.jpg"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setStitching(false);
    }
  }

  // ── Drag reorder (result panel) ────────────────────────────────────────────
  function onDragStart(i: number) { dragIdx.current = i; }
  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    setOrderedKeys(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current!, 1);
      next.splice(i, 0, moved);
      dragIdx.current = i;
      return next;
    });
  }
  function onDragEnd() { dragIdx.current = null; }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.25em] text-stone-400 font-semibold mb-1">Studio</p>
          <h1 className="text-3xl font-light text-stone-900 tracking-tight">A+ Content Builder</h1>
          <p className="mt-1.5 text-sm text-stone-500 max-w-xl">
            Upload your product modules. The AI will sequence them, proofread copy alignment,
            then stitch everything into a single publication-ready strip.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ── LEFT COLUMN: Inputs ─────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-6">

            {/* Size chart */}
            <section className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6">
              <h2 className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-4">
                Static Asset — Size Chart
              </h2>
              <DropZone
                label="Standard Size Chart"
                sublabel="Permanent slot · always placed last"
                file={sizeChart}
                onFile={setSizeChart}
              />
            </section>

            {/* Modules */}
            <section className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6">
              <h2 className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-1">
                Dynamic Modules — Up to 5
              </h2>
              <p className="text-[11px] text-stone-400 mb-4">
                Hero shot, feature images, detail close-ups, colour variants…
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {modules.map((f, i) => (
                  <ModuleSlot
                    key={i} index={i} file={f}
                    onFile={nf => setModules(prev => { const n=[...prev]; n[i]=nf; return n; })}
                    onRemove={() => setModules(prev => { const n=[...prev]; n[i]=null; return n; })}
                  />
                ))}
              </div>
              <p className="text-[11px] text-stone-400 mt-3">
                {filledModules.length} / 5 modules uploaded
              </p>
            </section>

            {/* Wordings */}
            <section className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6">
              <h2 className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-1">
                Wordings & Product Brief
              </h2>
              <p className="text-[11px] text-stone-400 mb-4">
                Paste your marketing copy, USPs, material details, colour names, sizes.
                The AI will cross-check this against image text.
              </p>
              <textarea
                value={wordings}
                onChange={e => setWordings(e.target.value)}
                placeholder={`e.g.\nProduct: Women's Ankle Boot "AURA"\nMaterial: Genuine Full-Grain Leather\nColours: Midnight Black, Ivory White\nSizes: US 5–11 (Half sizes available)\nUSPs: Cushioned insole · Waterproof · Vegan option available\nTagline: "Walk with Purpose"`}
                rows={9}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 placeholder:text-stone-300 resize-none focus:outline-none focus:ring-2 focus:ring-stone-300 transition"
              />
              <p className="text-right text-[10px] text-stone-300 mt-1">{wordings.length} chars</p>
            </section>

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || analyzing}
              className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all duration-200
                bg-stone-900 text-white hover:bg-stone-700 active:scale-[0.99]
                disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing with Gemini…
                </span>
              ) : "✦  Analyze & Sequence"}
            </button>

            {!canAnalyze && (
              <p className="text-center text-[11px] text-stone-400">
                {!sizeChart ? "↑ Add size chart" : filledModules.length === 0 ? "↑ Upload at least 1 module" : "↑ Add product wordings (min 10 chars)"}
              </p>
            )}
          </div>

          {/* ── RIGHT COLUMN: Results ───────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
                <p className="font-semibold mb-1">Error</p>
                <p className="text-xs leading-relaxed">{error}</p>
              </div>
            )}

            {!result && !analyzing && (
              <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 flex flex-col items-center justify-center gap-3 min-h-[320px]">
                <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center text-2xl">✦</div>
                <p className="text-sm font-medium text-stone-400 text-center">
                  Results will appear here<br />after AI analysis
                </p>
              </div>
            )}

            {analyzing && (
              <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 flex flex-col items-center justify-center gap-3 min-h-[320px]">
                <div className="w-10 h-10 border-2 border-stone-200 border-t-stone-600 rounded-full animate-spin" />
                <p className="text-xs text-stone-400 text-center">Gemini is reading your images<br />and cross-checking wordings…</p>
              </div>
            )}

            {result && !analyzing && (
              <>
                {/* Proofreading report */}
                <section className="bg-white rounded-3xl border border-stone-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs uppercase tracking-widest text-stone-400 font-semibold">
                      Proofreading Report
                    </h2>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full
                      ${result.proofreading_report.status === "pass"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                      {result.proofreading_report.status === "pass" ? "✓ Pass" : "⚠ Warning"}
                    </span>
                  </div>

                  {result.proofreading_report.issues.length === 0 ? (
                    <p className="text-xs text-emerald-600 bg-emerald-50 rounded-xl p-3 text-center">
                      ✓ No mismatches found. All modules align with your wordings.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {result.proofreading_report.issues.map((iss, i) => (
                        <IssueCard key={i} issue={iss} />
                      ))}
                    </div>
                  )}
                </section>

                {/* Sequence */}
                <section className="bg-white rounded-3xl border border-stone-100 shadow-sm p-5">
                  <h2 className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-1">
                    AI-Suggested Sequence
                  </h2>
                  <p className="text-[11px] text-stone-400 mb-4">Drag to reorder before stitching</p>
                  <div className="space-y-2">
                    {orderedKeys.map((key, i) => {
                      const isChart = key === "size_chart";
                      const label = isChart
                        ? result.size_chart_filename || "Size Chart"
                        : (() => {
                            const idx = parseInt(key.split("_")[1], 10) - 1;
                            return result.module_filenames[idx] || key;
                          })();
                      return (
                        <div
                          key={key}
                          draggable
                          onDragStart={() => onDragStart(i)}
                          onDragOver={e => onDragOver(e, i)}
                          onDragEnd={onDragEnd}
                          className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing border border-stone-100 hover:border-stone-300 transition-all"
                        >
                          <span className="text-stone-300 text-xs select-none">⠿</span>
                          <span className={`w-6 h-6 rounded-lg text-[10px] font-bold flex items-center justify-center flex-shrink-0
                            ${isChart ? "bg-stone-200 text-stone-600" : "bg-stone-900 text-white"}`}>
                            {i + 1}
                          </span>
                          <span className="text-xs text-stone-600 truncate flex-1">{label}</span>
                          {isChart && (
                            <span className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Size Chart</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Stitch button */}
                <button
                  onClick={handleStitch}
                  disabled={stitching}
                  className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all duration-200
                    bg-emerald-700 text-white hover:bg-emerald-600 active:scale-[0.99]
                    disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
                >
                  {stitching ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Stitching at 970 px…
                    </span>
                  ) : "⬇  Generate & Download Strip"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* footer note */}
        <p className="text-center text-[10px] text-stone-300 mt-12">
          Powered by Gemini 1.5 Flash · Pillow image engine · 970 px output
        </p>
      </div>
    </div>
  );
}
