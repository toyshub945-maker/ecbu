"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { THEMES, ThemeKey } from "@/lib/theme";

const STORES = [
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

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme: t, themeKey, setTheme } = useTheme();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
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
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg ${t.accentBg} flex items-center justify-center shrink-0`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
          </div>
          <span className="font-bold text-sm tracking-tight">WorkFlow</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavItem href="/dashboard" active={pathname === "/dashboard"} icon="📊" t={t}>
          Dashboard
        </NavItem>

        <div className="pt-3 pb-1 px-2">
          <span className={`text-xs font-semibold ${t.t4} uppercase tracking-wider`}>Stores</span>
        </div>

        {STORES.map(s => {
          const active = pathname.startsWith(`/board/${s.code}`);
          return (
            <Link
              key={s.code}
              href={`/board/${s.code}`}
              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                active ? `${t.bar} ${t.t1}` : `${t.t3} hover:${t.bar} hover:${t.t1}`
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${STORE_COLORS[s.code]} shrink-0`} />
              <span className="truncate">{s.name}</span>
              <span className={`ml-auto text-xs ${t.t5}`}>{s.code}</span>
            </Link>
          );
        })}

        <div className="pt-3 pb-1 px-2">
          <span className={`text-xs font-semibold ${t.t4} uppercase tracking-wider`}>Manage</span>
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

      {/* Theme selector */}
      <div className={`px-3 py-2 border-t ${t.divider}`}>
        <button
          onClick={() => setShowThemePicker(true)}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm w-full transition-colors ${t.btnAlt}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
          </svg>
          <span className="truncate">{t.name}</span>
        </button>
      </div>

      {/* User */}
      {user && (
        <div className={`p-3 border-t ${t.divider}`}>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className={`w-7 h-7 rounded-full ${t.accentBg} flex items-center justify-center text-xs font-bold shrink-0`}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-medium ${t.t1} truncate`}>{user.name}</div>
              <div className={`text-xs ${t.t4} capitalize`}>{user.role}</div>
            </div>
            <button
              onClick={logout}
              className={`${t.t4} hover:${t.t1} text-xs p-1 rounded`}
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

function NavItem({ href, active, icon, children, t }: {
  href: string; active: boolean; icon: string; children: React.ReactNode; t: import("@/lib/theme").ThemeDef;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
        active ? `${t.bar} ${t.t1}` : `${t.t3} hover:${t.bar} hover:${t.t1}`
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function ThemePickerModal({ current, onSelect, onClose }: {
  current: ThemeKey; onSelect: (k: ThemeKey) => void; onClose: () => void;
}) {
  const OPTS: ThemeKey[] = ["classic", "light", "dark"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-black text-lg">Choose Theme</h2>
            <p className="text-zinc-400 text-xs mt-0.5">Pick a look for the entire app</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {OPTS.map(k => {
            const th = THEMES[k];
            const active = current === k;
            return (
              <button key={k} onClick={() => { onSelect(k); onClose(); }}
                className={`relative rounded-2xl overflow-hidden border-2 transition-all ${
                  active ? "border-purple-500 shadow-lg shadow-purple-500/20" : "border-zinc-700 hover:border-zinc-500"
                }`}>
                <div className="h-28 relative" style={{ background: th.preview[0] }}>
                  <div className="absolute top-3 left-3 right-3 rounded-lg p-2" style={{ background: th.preview[1], border: `1px solid ${th.preview[0] === "#f8fafc" ? "#e2e8f0" : "#333"}` }}>
                    <div className="h-1.5 rounded w-12 mb-1.5" style={{ background: th.preview[2] }}/>
                    <div className="h-1 rounded w-8" style={{ background: th.preview[3], opacity: 0.8 }}/>
                    <div className="flex gap-1 mt-2">
                      <div className="h-5 rounded flex-1" style={{ background: th.preview[2], opacity: 0.15 }}/>
                      <div className="h-5 rounded flex-1" style={{ background: th.preview[3], opacity: 0.15 }}/>
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 h-1.5 rounded-full" style={{ background: th.preview[2] }}/>
                </div>
                <div className="px-3 py-2.5" style={{ background: th.preview[1], borderTop: `1px solid ${th.preview[0] === "#f8fafc" ? "#e2e8f0" : "#222"}` }}>
                  <div className="font-bold text-xs" style={{ color: th.preview[0] === "#f8fafc" ? "#111" : "#fff" }}>
                    {k === "classic" ? "1" : k === "light" ? "2" : "3"}. {th.name}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: th.preview[0] === "#f8fafc" ? "#6b7280" : "#71717a" }}>{th.desc}</div>
                  <div className="flex gap-1 mt-1.5">
                    {th.preview.map((c, i) => (
                      <div key={i} className="w-3 h-3 rounded-full border" style={{ background: c, borderColor: "rgba(255,255,255,0.1)" }}/>
                    ))}
                  </div>
                </div>
                {active && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-zinc-600 text-[10px] text-center mt-4">Theme preference is saved automatically</p>
      </div>
    </div>
  );
}
