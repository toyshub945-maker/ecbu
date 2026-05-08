"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { THEMES, ThemeKey } from "@/lib/theme";

const TK_STORES = [
  { code: "TK1", name: "CELNEPHO" },
  { code: "TK2", name: "CYNLLIO" },
  { code: "TK3", name: "VIMISAOI" },
  { code: "TK4", name: "Mikarka" },
];

const STORE_COLORS: Record<string, string> = {
  TK1: "bg-blue-500",
  TK2: "bg-emerald-500",
  TK3: "bg-orange-500",
  TK4: "bg-purple-500",
};

// Pages Shein members are allowed to access
const SHEIN_ALLOWED = ["/products", "/inventory", "/rr", "/settings"];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme: t, themeKey, setTheme } = useTheme();
  const [user, setUser] = useState<{ name: string; role: string; store_code?: string | null } | null>(null);
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  const isShein = user?.store_code === "SHEIN";
  const isAdmin = user?.role === "admin";

  return (
    <aside className={`w-56 shrink-0 flex flex-col min-h-screen ${t.card}`}>
      {showThemePicker && (
        <ThemePickerModal
          current={themeKey}
          onSelect={(k) => { setTheme(k); setShowThemePicker(false); }}
          onClose={() => setShowThemePicker(false)}
        />
      )}

      {/* Logo */}
      <div className={`px-4 py-5 border-b ${t.divider}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg ${t.accentBg} flex items-center justify-center shrink-0`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className={`font-bold text-sm tracking-tight ${t.t1}`}>WorkFlow</span>
            {isShein && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0" />
                <span className="text-[10px] font-semibold text-pink-500 tracking-wide">SHEIN</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SHEIN NAV ──────────────────────────────────────────────────────── */}
      {isShein ? (
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <div className="pt-1 pb-2 px-2">
            <div className="flex items-center gap-2 px-2 py-2.5 rounded-xl bg-pink-50 border border-pink-100">
              <span className="text-base">🛍️</span>
              <div>
                <div className="text-xs font-bold text-pink-700">Shein Team</div>
                <div className="text-[10px] text-pink-400">Member access</div>
              </div>
            </div>
          </div>

          <div className="pt-2 pb-1 px-2">
            <span className={`text-[10px] font-bold ${t.t5} uppercase tracking-widest`}>Tools</span>
          </div>

          <NavItem href="/products" active={pathname.startsWith("/products")} icon="🗂️" t={t}>
            Product Manager
          </NavItem>
          <NavItem href="/inventory" active={pathname.startsWith("/inventory")} icon="📦" t={t}>
            Inventory
          </NavItem>
          <NavItem href="/rr" active={pathname === "/rr"} icon="↩️" t={t}>
            R&amp;R Rate
          </NavItem>

          <div className="pt-3 pb-1 px-2">
            <span className={`text-[10px] font-bold ${t.t5} uppercase tracking-widest`}>Account</span>
          </div>
          <NavItem href="/settings" active={pathname === "/settings"} icon="⚙️" t={t}>
            Settings
          </NavItem>
        </nav>

      ) : (
      /* ── FULL NAV (admin / TK members) ─────────────────────────────────── */
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavItem href="/dashboard" active={pathname === "/dashboard"} icon="📊" t={t}>
            Dashboard
          </NavItem>

          <div className="pt-3 pb-1 px-2">
            <span className={`text-[10px] font-bold ${t.t5} uppercase tracking-widest`}>Stores</span>
          </div>

          {TK_STORES.map(s => {
            const active = pathname.startsWith(`/board/${s.code}`);
            return (
              <Link
                key={s.code}
                href={`/board/${s.code}`}
                className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                  active ? `${t.bar} ${t.t1} font-medium` : `${t.t3} hover:${t.bar} hover:${t.t2}`
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${STORE_COLORS[s.code]} shrink-0`} />
                <span className="truncate">{s.name}</span>
                <span className={`ml-auto text-[10px] ${t.t5}`}>{s.code}</span>
              </Link>
            );
          })}

          <div className="pt-3 pb-1 px-2">
            <span className={`text-[10px] font-bold ${t.t5} uppercase tracking-widest`}>Manage</span>
          </div>

          <NavItem href="/products" active={pathname.startsWith("/products")} icon="🗂️" t={t}>
            Product Manager
          </NavItem>
          <NavItem href="/weeks" active={pathname === "/weeks"} icon="📅" t={t}>
            Week Setup
          </NavItem>
          <NavItem href="/rr" active={pathname === "/rr"} icon="↩️" t={t}>
            R&amp;R Rate
          </NavItem>
          <NavItem href="/pricing" active={pathname === "/pricing"} icon="💰" t={t}>
            Pricing
          </NavItem>
          <NavItem href="/inventory" active={pathname.startsWith("/inventory")} icon="📦" t={t}>
            Inventory
          </NavItem>
          <NavItem href="/ads" active={pathname.startsWith("/ads")} icon="📈" t={t}>
            Ads Management
          </NavItem>
          <NavItem href="/settings" active={pathname === "/settings"} icon="⚙️" t={t}>
            Settings
          </NavItem>
        </nav>
      )}

      {/* Theme selector */}
      <div className={`px-3 py-2.5 border-t ${t.divider}`}>
        <button
          onClick={() => setShowThemePicker(true)}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm w-full transition-all ${t.btnAlt} hover:scale-[1.01]`}
        >
          <div className="flex gap-1 shrink-0">
            {THEMES[themeKey].preview.slice(0,3).map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ background: c }} />
            ))}
          </div>
          <span className={`flex-1 text-left text-xs font-medium ${t.t2} truncate`}>{THEMES[themeKey].name}</span>
          <svg className={`w-3.5 h-3.5 ${t.t4} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
      </div>

      {/* User */}
      {user && (
        <div className={`p-3 border-t ${t.divider}`}>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className={`w-7 h-7 rounded-full ${isShein ? "bg-pink-500" : t.accentBg} flex items-center justify-center text-xs font-bold shrink-0 text-white`}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-semibold ${t.t1} truncate`}>{user.name}</div>
              <div className={`text-[10px] ${t.t4} capitalize`}>
                {isShein ? "Shein Member" : user.role}
              </div>
            </div>
            <button
              onClick={logout}
              className={`${t.t4} hover:${t.t1} text-sm p-1.5 rounded-lg hover:${t.bar} transition-colors`}
              title="Sign out"
            >
              ↩
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function NavItem({ href, active, icon, children, t }: {
  href: string; active: boolean; icon: string; children: React.ReactNode; t: import("@/lib/theme").ThemeDef;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
        active ? `${t.bar} ${t.t1} font-medium` : `${t.t3} hover:${t.bar} hover:${t.t2}`
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

// ─── Theme Picker Modal ───────────────────────────────────────────────────────
function ThemePickerModal({ current, onSelect, onClose }: {
  current: ThemeKey; onSelect: (k: ThemeKey) => void; onClose: () => void;
}) {
  const OPTS: { key: ThemeKey; emoji: string }[] = [
    { key: "classic", emoji: "🌙" },
    { key: "light",   emoji: "☀️" },
    { key: "dark",    emoji: "🖤" },
  ];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h2 className="text-white font-bold text-base tracking-tight">Appearance</h2>
            <p className="text-slate-400 text-xs mt-0.5">Choose a theme for the entire app</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Theme cards */}
        <div className="p-6 grid grid-cols-3 gap-4">
          {OPTS.map(({ key: k, emoji }) => {
            const th = THEMES[k];
            const active = current === k;
            const isLight = k === "light";

            return (
              <button
                key={k}
                onClick={() => onSelect(k)}
                className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  border: active ? `2px solid ${th.preview[2]}` : "2px solid rgba(255,255,255,0.08)",
                  boxShadow: active ? `0 0 20px ${th.preview[2]}33` : "none",
                  transform: active ? "scale(1.02)" : undefined,
                }}
              >
                <div className="h-36 relative overflow-hidden" style={{ background: th.preview[0] }}>
                  <div className="absolute top-0 left-0 bottom-0 w-8"
                    style={{ background: th.preview[1], borderRight: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)"}` }}>
                    <div className="mt-2.5 mx-1 space-y-1">
                      {[1,0.4,0.4,0.4].map((op, i) => (
                        <div key={i} className="h-1.5 rounded-full mx-0.5" style={{ background: th.preview[2], opacity: op }} />
                      ))}
                    </div>
                  </div>
                  <div className="absolute top-0 left-8 right-0 bottom-0 p-2">
                    <div className="h-4 rounded mb-1.5 flex items-center px-1.5 gap-1"
                      style={{ background: th.preview[1], border: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)"}` }}>
                      <div className="h-1 rounded flex-1" style={{ background: isLight ? "#94a3b8" : "rgba(255,255,255,0.2)" }}/>
                      <div className="h-2 w-4 rounded" style={{ background: th.preview[2], opacity: 0.8 }}/>
                    </div>
                    <div className="flex gap-1 mb-1">
                      {[0.9, 0.6, 0.4].map((op, i) => (
                        <div key={i} className="flex-1 h-7 rounded-lg p-1"
                          style={{ background: th.preview[1], border: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)"}` }}>
                          <div className="h-1 rounded w-3/4 mb-0.5" style={{ background: th.preview[2], opacity: op }}/>
                          <div className="h-1 rounded w-1/2" style={{ background: th.preview[3], opacity: 0.6 }}/>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg overflow-hidden"
                      style={{ background: th.preview[1], border: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)"}` }}>
                      {[1, 0.5, 0.5].map((op, i) => (
                        <div key={i} className="flex gap-1 px-1 py-0.5" style={{ borderBottom: i < 2 ? `1px solid ${th.preview[4]}` : "none" }}>
                          <div className="h-1 rounded w-1/3" style={{ background: th.preview[2], opacity: op }}/>
                          <div className="h-1 rounded w-1/4" style={{ background: th.preview[3], opacity: 0.5 }}/>
                          <div className="h-1 rounded flex-1" style={{ background: isLight ? "#94a3b8" : "rgba(255,255,255,0.12)", opacity: 0.7 }}/>
                        </div>
                      ))}
                    </div>
                  </div>
                  {active && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: th.preview[2] }}>
                      <svg className="w-3 h-3 text-white" fill="none" stroke="white" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="px-3 py-3" style={{
                  background: th.preview[1],
                  borderTop: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)"}`,
                }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{emoji}</span>
                    <span className="font-bold text-xs" style={{ color: isLight ? "#0f172a" : "#f8fafc" }}>{th.name}</span>
                  </div>
                  <p className="text-[10px] leading-tight" style={{ color: isLight ? "#64748b" : "#71717a" }}>{th.desc}</p>
                  <div className="flex gap-1 mt-2">
                    {th.preview.slice(0, 4).map((c, i) => (
                      <div key={i} className="w-3 h-3 rounded-full"
                        style={{ background: c, border: `1px solid ${isLight ? "#cbd5e1" : "rgba(255,255,255,0.15)"}` }} />
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 pb-5 flex items-center justify-between">
          <p className="text-slate-600 text-[10px]">Saved automatically · applies instantly</p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
