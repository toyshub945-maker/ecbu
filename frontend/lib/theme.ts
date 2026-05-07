export type ThemeKey = "classic" | "light" | "dark";

export interface ThemeDef {
  key: ThemeKey;
  name: string;
  desc: string;
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
  classic: {
    key: "classic",
    name: "Classic",
    desc: "Original dark slate",
    preview: ["#0f172a","#1e293b","#8b5cf6","#10b981"],
    page:        "bg-slate-950",
    card:        "bg-slate-900 border border-slate-700/40",
    card2:       "bg-slate-800/40 border border-slate-700/30",
    topbar:      "bg-slate-900/80 backdrop-blur border-b border-slate-800",
    divider:     "border-slate-800",
    t1:          "text-white",
    t2:          "text-slate-300",
    t3:          "text-slate-400",
    t4:          "text-slate-500",
    t5:          "text-slate-600",
    bar:         "bg-slate-800",
    inp:         "bg-slate-800 border-slate-700 text-white placeholder-slate-600",
    btn:         "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20",
    btnAlt:      "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700",
    accentTxt:   "text-violet-400",
    accentBg:    "bg-violet-600",
    accentSoft:  "bg-violet-500/10 border-violet-500/20 text-violet-400",
    accentBorder:"border-violet-500/30",
    greeting:    "from-violet-600 to-indigo-700",
    greetSub:    "text-violet-200",
    greetVal:    "text-white",
    positive:    "text-emerald-400",
    negative:    "text-red-400",
    chartGrid:   "#1e293b",
    chartTick:   "#64748b",
    ttBg:        "#1e293b",
    ttBorder:    "#334155",
    notice:      "from-violet-600/20 to-blue-600/20 border-violet-500/30",
    noticeBtn:   "bg-violet-600 hover:bg-violet-500 text-white",
    ring:        "bg-slate-800",
    ringTrack:   "#1e293b",
    tabActive:   "border-violet-500 text-white",
    tabInactive: "border-transparent text-slate-500 hover:text-slate-300",
  },
  light: {
    key: "light",
    name: "Modern Light",
    desc: "Clean white & purple",
    preview: ["#f8fafc","#ffffff","#7c3aed","#059669"],
    page:        "bg-slate-50",
    card:        "bg-white border border-gray-200 shadow-sm",
    card2:       "bg-gray-50 border border-gray-200",
    topbar:      "bg-white border-b border-gray-200",
    divider:     "border-gray-200",
    t1:          "text-gray-900",
    t2:          "text-gray-700",
    t3:          "text-gray-500",
    t4:          "text-gray-400",
    t5:          "text-gray-300",
    bar:         "bg-gray-100",
    inp:         "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400",
    btn:         "bg-violet-600 hover:bg-violet-700 text-white shadow-sm",
    btnAlt:      "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200",
    accentTxt:   "text-violet-600",
    accentBg:    "bg-violet-600",
    accentSoft:  "bg-violet-50 border-violet-200 text-violet-700",
    accentBorder:"border-violet-200",
    greeting:    "from-violet-600 to-purple-700",
    greetSub:    "text-violet-100",
    greetVal:    "text-white",
    positive:    "text-emerald-600",
    negative:    "text-red-600",
    chartGrid:   "#e5e7eb",
    chartTick:   "#9ca3af",
    ttBg:        "#ffffff",
    ttBorder:    "#e5e7eb",
    notice:      "from-violet-50 to-purple-50 border-violet-200",
    noticeBtn:   "bg-violet-600 hover:bg-violet-700 text-white shadow-sm",
    ring:        "bg-gray-100",
    ringTrack:   "#f3f4f6",
    tabActive:   "border-violet-600 text-violet-700",
    tabInactive: "border-transparent text-gray-400 hover:text-gray-700",
  },
  dark: {
    key: "dark",
    name: "Midnight Dark",
    desc: "Black · purple · green",
    preview: ["#000000","#111111","#a855f7","#22c55e"],
    page:        "bg-black",
    card:        "bg-zinc-900 border border-zinc-800",
    card2:       "bg-zinc-950 border border-zinc-800/60",
    topbar:      "bg-zinc-950 border-b border-zinc-800",
    divider:     "border-zinc-800",
    t1:          "text-white",
    t2:          "text-zinc-200",
    t3:          "text-zinc-400",
    t4:          "text-zinc-500",
    t5:          "text-zinc-600",
    bar:         "bg-zinc-800",
    inp:         "bg-zinc-800 border-zinc-700 text-white placeholder-zinc-600",
    btn:         "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20",
    btnAlt:      "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700",
    accentTxt:   "text-purple-400",
    accentBg:    "bg-purple-600",
    accentSoft:  "bg-purple-500/10 border-purple-500/20 text-purple-400",
    accentBorder:"border-purple-500/30",
    greeting:    "from-purple-700 to-violet-900",
    greetSub:    "text-purple-200",
    greetVal:    "text-white",
    positive:    "text-green-400",
    negative:    "text-red-400",
    chartGrid:   "#18181b",
    chartTick:   "#52525b",
    ttBg:        "#18181b",
    ttBorder:    "#27272a",
    notice:      "from-purple-600/20 to-green-600/10 border-purple-500/30",
    noticeBtn:   "bg-purple-600 hover:bg-purple-500 text-white",
    ring:        "bg-zinc-800",
    ringTrack:   "#27272a",
    tabActive:   "border-purple-500 text-white",
    tabInactive: "border-transparent text-zinc-500 hover:text-zinc-300",
  },
};
