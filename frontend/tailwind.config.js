/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  safelist: [
    // ── Page backgrounds ──────────────────────────────────────────────────────
    "bg-slate-950", "bg-slate-100", "bg-zinc-950",
    // ── Cards ─────────────────────────────────────────────────────────────────
    "bg-slate-900", "bg-slate-800", "bg-zinc-900", "bg-zinc-950",
    "bg-slate-50", "bg-white",
    // ── Borders ───────────────────────────────────────────────────────────────
    "border-slate-800", "border-slate-700", "border-slate-200", "border-slate-300",
    "border-zinc-800", "border-zinc-700",
    // ── Text hierarchy ────────────────────────────────────────────────────────
    "text-white", "text-zinc-50",
    "text-slate-200", "text-slate-300", "text-slate-400", "text-slate-500", "text-slate-600",
    "text-slate-700", "text-slate-900",
    "text-zinc-200", "text-zinc-400", "text-zinc-500", "text-zinc-600",
    // ── Accent – Violet ───────────────────────────────────────────────────────
    "bg-violet-600", "bg-violet-500",
    "text-violet-400", "text-violet-300", "text-violet-200",
    "border-violet-500",
    // ── Accent – Indigo ───────────────────────────────────────────────────────
    "bg-indigo-600", "bg-indigo-700", "bg-indigo-50",
    "text-indigo-600", "text-indigo-700", "text-indigo-100",
    "border-indigo-200", "border-indigo-300", "border-indigo-600",
    // ── Accent – Teal ─────────────────────────────────────────────────────────
    "bg-teal-500", "bg-teal-400",
    "text-teal-400", "text-teal-300", "text-teal-200",
    "border-teal-500",
    // ── Bar / row backgrounds ─────────────────────────────────────────────────
    "bg-slate-800/60", "bg-slate-800/50", "bg-zinc-800/50",
    "bg-slate-50",
    // ── Inputs ────────────────────────────────────────────────────────────────
    "bg-slate-800", "bg-zinc-800",
    "border-slate-700", "border-zinc-700", "border-slate-300",
    "placeholder-slate-500", "placeholder-zinc-500", "placeholder-slate-400",
    // ── Buttons ───────────────────────────────────────────────────────────────
    "hover:bg-violet-500", "hover:bg-indigo-700", "hover:bg-teal-400",
    "hover:bg-slate-700", "hover:bg-zinc-700", "hover:bg-slate-50",
    "shadow-violet-500/25", "shadow-teal-500/20",
    "text-zinc-950",
    // ── Gradients ─────────────────────────────────────────────────────────────
    "from-violet-700", "to-indigo-800",
    "from-indigo-600", "to-violet-700",
    "from-teal-700", "to-cyan-800",
    // ── Chart / tooltip ───────────────────────────────────────────────────────
    "bg-slate-100", "bg-zinc-800",
    // ── Tab active/inactive ───────────────────────────────────────────────────
    "border-violet-500", "border-indigo-600", "border-teal-500",
    "text-violet-300", "text-indigo-700", "text-teal-300",
    // ── Shein pink ───────────────────────────────────────────────────────────
    "bg-pink-50", "bg-pink-100", "bg-pink-500", "bg-pink-600",
    "text-pink-400", "text-pink-500", "text-pink-600", "text-pink-700", "text-pink-900",
    "border-pink-100", "border-pink-200", "border-pink-400",
    "hover:bg-pink-600",
    "from-pink-50", "to-rose-50", "from-pink-400", "to-rose-500",
    "ring-pink-400",
  ],
  theme: { extend: {} },
  plugins: [],
};
