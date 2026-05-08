export type ThemeKey = "classic" | "light" | "dark";

export interface ThemeDef {
  key: ThemeKey;
  name: string;
  desc: string;
  // preview[0]=page bg, [1]=card bg, [2]=accent, [3]=positive, [4]=border
  preview: string[];
  page: string;
  card: string;
  card2: string;
  topbar: string;
  divider: string;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  t5: string;
  bar: string;
  inp: string;
  btn: string;
  btnAlt: string;
  accentTxt: string;
  accentBg: string;
  accentSoft: string;
  accentBorder: string;
  greeting: string;
  greetSub: string;
  greetVal: string;
  positive: string;
  negative: string;
  chartGrid: string;
  chartTick: string;
  ttBg: string;
  ttBorder: string;
  notice: string;
  noticeBtn: string;
  ring: string;
  ringTrack: string;
  tabActive: string;
  tabInactive: string;
}

export const THEMES: Record<ThemeKey, ThemeDef> = {

  // ─── Theme 1: Dark Pro ────────────────────────────────────────────────────
  classic: {
    key: "classic",
    name: "Dark Pro",
    desc: "Professional navy dark with violet",
    preview: ["#0f172a", "#1e293b", "#7c3aed", "#34d399", "#334155"],
    page:         "bg-slate-950",
    card:         "bg-slate-900 border border-slate-800",
    card2:        "bg-slate-800/50 border border-slate-700/50",
    topbar:       "bg-slate-900/95 backdrop-blur-md border-b border-slate-800",
    divider:      "border-slate-800",
    t1:           "text-white",
    t2:           "text-slate-200",
    t3:           "text-slate-400",
    t4:           "text-slate-500",
    t5:           "text-slate-600",
    bar:          "bg-slate-800/60",
    inp:          "bg-slate-800 border-slate-700 text-white placeholder-slate-500",
    btn:          "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25",
    btnAlt:       "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700",
    accentTxt:    "text-violet-400",
    accentBg:     "bg-violet-600",
    accentSoft:   "bg-violet-500/10 border-violet-500/20 text-violet-300",
    accentBorder: "border-violet-500/30",
    greeting:     "from-violet-700 to-indigo-800",
    greetSub:     "text-violet-200",
    greetVal:     "text-white",
    positive:     "text-emerald-400",
    negative:     "text-red-400",
    chartGrid:    "#1e293b",
    chartTick:    "#475569",
    ttBg:         "#1e293b",
    ttBorder:     "#334155",
    notice:       "from-violet-600/20 to-indigo-600/10 border-violet-500/30",
    noticeBtn:    "bg-violet-600 hover:bg-violet-500 text-white",
    ring:         "bg-slate-800",
    ringTrack:    "#1e293b",
    tabActive:    "border-violet-500 text-violet-300",
    tabInactive:  "border-transparent text-slate-500 hover:text-slate-300",
  },

  // ─── Theme 2: Light ───────────────────────────────────────────────────────
  light: {
    key: "light",
    name: "Light",
    desc: "Clean white with indigo accents",
    preview: ["#f1f5f9", "#ffffff", "#4f46e5", "#059669", "#e2e8f0"],
    page:         "bg-slate-100",
    card:         "bg-white border border-slate-200 shadow-sm",
    card2:        "bg-slate-50 border border-slate-200",
    topbar:       "bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm",
    divider:      "border-slate-200",
    t1:           "text-slate-900",
    t2:           "text-slate-700",
    t3:           "text-slate-500",
    t4:           "text-slate-400",
    t5:           "text-slate-300",
    bar:          "bg-slate-50",
    inp:          "bg-white border-slate-300 text-slate-900 placeholder-slate-400",
    btn:          "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm",
    btnAlt:       "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300",
    accentTxt:    "text-indigo-600",
    accentBg:     "bg-indigo-600",
    accentSoft:   "bg-indigo-50 border-indigo-200 text-indigo-700",
    accentBorder: "border-indigo-300",
    greeting:     "from-indigo-600 to-violet-700",
    greetSub:     "text-indigo-100",
    greetVal:     "text-white",
    positive:     "text-emerald-600",
    negative:     "text-red-500",
    chartGrid:    "#e2e8f0",
    chartTick:    "#94a3b8",
    ttBg:         "#ffffff",
    ttBorder:     "#e2e8f0",
    notice:       "from-indigo-50 to-violet-50 border-indigo-200",
    noticeBtn:    "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm",
    ring:         "bg-slate-100",
    ringTrack:    "#f1f5f9",
    tabActive:    "border-indigo-600 text-indigo-700",
    tabInactive:  "border-transparent text-slate-400 hover:text-slate-600",
  },

  // ─── Theme 3: Obsidian ────────────────────────────────────────────────────
  dark: {
    key: "dark",
    name: "Obsidian",
    desc: "Pure black with teal accents",
    preview: ["#09090b", "#18181b", "#14b8a6", "#f59e0b", "#3f3f46"],
    page:         "bg-zinc-950",
    card:         "bg-zinc-900 border border-zinc-800",
    card2:        "bg-zinc-950 border border-zinc-800/70",
    topbar:       "bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800",
    divider:      "border-zinc-800",
    t1:           "text-zinc-50",
    t2:           "text-zinc-200",
    t3:           "text-zinc-400",
    t4:           "text-zinc-500",
    t5:           "text-zinc-600",
    bar:          "bg-zinc-800/50",
    inp:          "bg-zinc-800 border-zinc-700 text-zinc-50 placeholder-zinc-500",
    btn:          "bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold shadow-lg shadow-teal-500/20",
    btnAlt:       "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700",
    accentTxt:    "text-teal-400",
    accentBg:     "bg-teal-500",
    accentSoft:   "bg-teal-500/10 border-teal-500/20 text-teal-400",
    accentBorder: "border-teal-500/30",
    greeting:     "from-teal-700 to-cyan-800",
    greetSub:     "text-teal-200",
    greetVal:     "text-white",
    positive:     "text-teal-400",
    negative:     "text-rose-400",
    chartGrid:    "#27272a",
    chartTick:    "#52525b",
    ttBg:         "#18181b",
    ttBorder:     "#3f3f46",
    notice:       "from-teal-600/10 to-cyan-600/10 border-teal-500/20",
    noticeBtn:    "bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold",
    ring:         "bg-zinc-800",
    ringTrack:    "#27272a",
    tabActive:    "border-teal-500 text-teal-300",
    tabInactive:  "border-transparent text-zinc-500 hover:text-zinc-300",
  },
};
