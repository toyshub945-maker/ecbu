"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import type { User } from "@/lib/types";

const STORES = [
  { code: "TK1", name: "CELNEPHO" },
  { code: "TK2", name: "CYNLLIO" },
  { code: "TK3", name: "VIMISAOI" },
  { code: "TK4", name: "Mikarka" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  leader: "Shop Leader",
  junior: "Junior",
  member: "Member",
};

const ROLE_COLORS: Record<string, string> = {
  admin:  "bg-violet-100 text-violet-700",
  leader: "bg-blue-100 text-blue-700",
  junior: "bg-amber-100 text-amber-700",
  member: "bg-gray-100 text-gray-600",
};

// ─── Edit User Modal ──────────────────────────────────────────────────────────
function EditUserModal({
  user,
  onClose,
  onSaved,
  t,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
  t: ReturnType<typeof useTheme>["theme"];
}) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    password: "",
    role: user.role,
    store_code: user.store_code ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function save() {
    if (!form.name || !form.email) { setError("Name and email are required"); return; }
    setSaving(true); setError("");
    try {
      const payload: Record<string, string> = {
        name: form.name,
        email: form.email,
        role: form.role,
        store_code: form.store_code,
      };
      if (form.password) payload.password = form.password;
      await api.updateUser(user.id, payload);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative ${t.card} rounded-2xl shadow-2xl w-[480px] mx-4 overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${t.divider}`}>
          <div>
            <h2 className={`text-base font-bold ${t.t1}`}>Edit Credentials</h2>
            <p className={`text-xs ${t.t4} mt-0.5`}>Update info for {user.name}</p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${t.t4} hover:${t.t2} transition-colors`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          {/* Avatar preview */}
          <div className="flex items-center gap-3 mb-1">
            <div className={`w-11 h-11 rounded-full ${t.accentSoft} text-base font-bold flex items-center justify-center shrink-0`}>
              {form.name.charAt(0).toUpperCase() || "?"}
            </div>
            <div>
              <div className={`font-semibold text-sm ${t.t1}`}>{form.name || "Name"}</div>
              <div className={`text-xs ${t.t4}`}>{form.email || "email"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Name */}
            <div>
              <label className={`text-xs font-medium ${t.t4} block mb-1`}>Full Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                placeholder="Full name"
              />
            </div>

            {/* Email */}
            <div>
              <label className={`text-xs font-medium ${t.t4} block mb-1`}>Email</label>
              <input
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                type="email"
                className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                placeholder="email@example.com"
              />
            </div>

            {/* Role */}
            <div>
              <label className={`text-xs font-medium ${t.t4} block mb-1`}>Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as "admin" | "leader" | "junior" | "member" }))}
                className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
              >
                <option value="member">Member</option>
                <option value="leader">Shop Leader</option>
                <option value="junior">Junior</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Store */}
            <div>
              <label className={`text-xs font-medium ${t.t4} block mb-1`}>Store</label>
              <select
                value={form.store_code}
                onChange={e => setForm(f => ({ ...f, store_code: e.target.value }))}
                className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
              >
                <option value="">All stores</option>
                {STORES.map(s => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className={`text-xs font-medium ${t.t4} block mb-1`}>
              New Password <span className={`${t.t5} font-normal`}>(leave blank to keep current)</span>
            </label>
            <div className="relative">
              <input
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                type={showPass ? "text" : "password"}
                className={`w-full ${t.inp} rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                placeholder="New password…"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${t.t4} hover:${t.t2} transition-colors`}
              >
                {showPass ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex gap-2 px-6 py-4 border-t ${t.divider}`}>
          <button
            onClick={save}
            disabled={saving}
            className={`flex-1 ${t.btn} py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Changes
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium ${t.btnAlt}`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── My Credentials Panel ─────────────────────────────────────────────────────
function MyCredentialsPanel({
  currentUser,
  onSaved,
  t,
}: {
  currentUser: User;
  onSaved: () => void;
  t: ReturnType<typeof useTheme>["theme"];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: currentUser.name, email: currentUser.email, password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function save() {
    if (!form.name || !form.email) { setError("Name and email are required"); return; }
    if (form.password && form.password !== form.confirm) { setError("Passwords do not match"); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload: Record<string, string> = { name: form.name, email: form.email };
      if (form.password) payload.password = form.password;
      await api.updateUser(currentUser.id, payload);
      // Update local user info
      const stored = localStorage.getItem("user");
      if (stored) {
        const u = JSON.parse(stored);
        u.name = form.name; u.email = form.email;
        localStorage.setItem("user", JSON.stringify(u));
      }
      setSuccess("Credentials updated successfully!");
      setForm(f => ({ ...f, password: "", confirm: "" }));
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${t.card} rounded-xl overflow-hidden mb-5`}>
      {/* Header – always visible */}
      <button
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:${t.bar}`}
        onClick={() => { setOpen(v => !v); setError(""); setSuccess(""); }}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full ${t.accentSoft} text-sm font-bold flex items-center justify-center shrink-0`}>
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className={`font-semibold text-sm ${t.t1}`}>My Credentials</div>
            <div className={`text-xs ${t.t4}`}>{currentUser.email} · {ROLE_LABELS[currentUser.role] ?? currentUser.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[currentUser.role] ?? "bg-gray-100 text-gray-600"}`}>
            {ROLE_LABELS[currentUser.role] ?? currentUser.role}
          </span>
          <svg
            className={`w-4 h-4 ${t.t4} transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable form */}
      {open && (
        <div className={`border-t ${t.divider} px-5 py-5 space-y-4`}>
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {success}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-xs font-medium ${t.t4} block mb-1`}>Full Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className={`text-xs font-medium ${t.t4} block mb-1`}>Email</label>
              <input
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                type="email"
                className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div className={`rounded-xl p-4 space-y-3 ${t.card2}`}>
            <div className={`text-xs font-semibold ${t.t3} flex items-center gap-1.5`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Change Password <span className={`${t.t5} font-normal`}>(optional)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-xs font-medium ${t.t4} block mb-1`}>New Password</label>
                <div className="relative">
                  <input
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    type={showPass ? "text" : "password"}
                    className={`w-full ${t.inp} rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                    placeholder="New password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${t.t4}`}
                  >
                    {showPass ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className={`text-xs font-medium ${t.t4} block mb-1`}>Confirm Password</label>
                <input
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  type={showPass ? "text" : "password"}
                  className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${form.confirm && form.password !== form.confirm ? "ring-2 ring-red-400" : ""}`}
                  placeholder="Repeat password"
                />
                {form.confirm && form.password !== form.confirm && (
                  <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving || !!(form.confirm && form.password !== form.confirm)}
              className={`${t.btn} text-sm px-5 py-2.5 rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2`}
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Changes
                </>
              )}
            </button>
            <button
              onClick={() => { setOpen(false); setForm({ name: currentUser.name, email: currentUser.email, password: "", confirm: "" }); setError(""); setSuccess(""); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium ${t.btnAlt}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const { theme: t } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member", store_code: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [feishuStatus, setFeishuStatus] = useState<{ product_count: number; last_synced_at: string | null } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    const u = localStorage.getItem("user");
    if (u) setCurrentUser(JSON.parse(u));
    loadUsers();
    api.feishuStatus().then(setFeishuStatus).catch(() => {});
  }, [router]);

  async function loadUsers() {
    const data = await api.users();
    setUsers(data.users);
  }

  async function createUser() {
    if (!form.name || !form.email || !form.password) { setError("Name, email and password required"); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      await api.createUser({ ...form, store_code: form.store_code || undefined });
      setSuccess("User created successfully");
      setForm({ name: "", email: "", password: "", role: "member", store_code: "" });
      setShowCreate(false);
      loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(id: number) {
    if (!confirm("Delete this user?")) return;
    try {
      await api.deleteUser(id);
      loadUsers();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  const isAdmin = currentUser?.role === "admin";

  return (
    <>
      <Sidebar />

      {/* Edit credentials modal */}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={loadUsers}
          t={t}
        />
      )}

      <main className={`flex-1 p-6 overflow-auto ${t.page}`}>
        <div className="max-w-3xl mx-auto">
          <h1 className={`text-2xl font-bold ${t.t1} mb-6`}>Settings</h1>

          {/* ── My Credentials (every user) ─────────────────────────────── */}
          {currentUser && (
            <MyCredentialsPanel currentUser={currentUser} onSaved={loadUsers} t={t} />
          )}

          {/* ── Feishu Status ──────────────────────────────────────────── */}
          <section className={`${t.card} rounded-xl p-5 mb-5`}>
            <h2 className={`font-semibold ${t.t2} mb-3`}>Feishu Product Database</h2>
            {feishuStatus ? (
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className={t.t4}>Products synced:</span>{" "}
                  <strong className={t.t1}>{feishuStatus.product_count}</strong>
                </div>
                <div>
                  <span className={t.t4}>Last sync:</span>{" "}
                  <strong className={t.t1}>
                    {feishuStatus.last_synced_at
                      ? new Date(feishuStatus.last_synced_at).toLocaleString()
                      : "Never"}
                  </strong>
                </div>
              </div>
            ) : (
              <p className={`text-sm ${t.t5}`}>Loading…</p>
            )}
            <p className={`text-xs ${t.t5} mt-3`}>
              Use the <strong className={t.t3}>Sync from Feishu</strong> button on the Dashboard to pull product data and images from your Feishu master sheet.
              Make sure <code className={`${t.bar} px-1 rounded`}>FEISHU_APP_SECRET</code> is set in the <code className={`${t.bar} px-1 rounded`}>.env</code> file.
            </p>
          </section>

          {/* ── Team Members ──────────────────────────────────────────── */}
          <section className={`${t.card} rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`font-semibold ${t.t2}`}>Team Members</h2>
              {isAdmin && (
                <button
                  onClick={() => { setShowCreate(v => !v); setError(""); setSuccess(""); }}
                  className={`text-sm ${t.btn} px-3 py-1.5 rounded-lg font-medium`}
                >
                  + Add Member
                </button>
              )}
            </div>

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {success}
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
            )}

            {/* Create form */}
            {showCreate && isAdmin && (
              <div className={`${t.card2} rounded-xl p-4 mb-4 space-y-3`}>
                <h3 className={`text-sm font-semibold ${t.t2}`}>New Team Member</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs ${t.t4} block mb-1`}>Name</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                      placeholder="Sailini" />
                  </div>
                  <div>
                    <label className={`text-xs ${t.t4} block mb-1`}>Email</label>
                    <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      type="email"
                      className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                      placeholder="sailini@example.com" />
                  </div>
                  <div>
                    <label className={`text-xs ${t.t4} block mb-1`}>Password</label>
                    <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      type="password"
                      className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}
                      placeholder="••••••••" />
                  </div>
                  <div>
                    <label className={`text-xs ${t.t4} block mb-1`}>Store</label>
                    <select value={form.store_code} onChange={e => setForm(f => ({ ...f, store_code: e.target.value }))}
                      className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}>
                      <option value="">All stores</option>
                      {STORES.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs ${t.t4} block mb-1`}>Role</label>
                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className={`w-full ${t.inp} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400`}>
                      <option value="member">Member</option>
                      <option value="leader">Shop Leader</option>
                      <option value="junior">Junior</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={createUser} disabled={saving}
                    className={`${t.btn} text-sm px-4 py-2 rounded-lg disabled:opacity-50 font-medium`}>
                    {saving ? "Creating…" : "Create"}
                  </button>
                  <button onClick={() => setShowCreate(false)}
                    className={`text-sm px-4 py-2 rounded-lg ${t.btnAlt}`}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* User list */}
            <div className={`divide-y ${t.divider}`}>
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 py-3 group">
                  <div className={`w-9 h-9 rounded-full ${t.accentSoft} text-sm font-bold flex items-center justify-center shrink-0`}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${t.t1} flex items-center gap-2`}>
                      {u.name}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </div>
                    <div className={`text-xs ${t.t5}`}>
                      {u.email}
                      {u.store_code && (
                        <span className={`ml-2 ${t.t4}`}>· {STORES.find(s => s.code === u.store_code)?.name || u.store_code}</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Edit — admin can edit anyone; user can only see their own edit in MyCredentials panel */}
                    {isAdmin && (
                      <button
                        onClick={() => setEditTarget(u)}
                        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium ${t.t3} hover:${t.t1} border ${t.divider} hover:border-violet-400 transition-colors`}
                        title="Edit credentials"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                    )}
                    {isAdmin && u.id !== currentUser?.id && (
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove user"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
