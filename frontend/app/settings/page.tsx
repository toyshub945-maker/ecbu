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

export default function SettingsPage() {
  const router = useRouter();
  const { theme: t } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
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
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <h1 className={`text-2xl font-bold ${t.t1} mb-6`}>Settings</h1>

          {/* Feishu Status */}
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
                  <strong className={t.t1}>{feishuStatus.last_synced_at ? new Date(feishuStatus.last_synced_at).toLocaleString() : "Never"}</strong>
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

          {/* Team Members */}
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

            {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg mb-4">{success}</div>}
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

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
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <div className={`w-9 h-9 rounded-full ${t.accentSoft} text-sm font-bold flex items-center justify-center shrink-0`}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${t.t1} flex items-center gap-2`}>
                      {u.name}
                      {u.role === "admin" && (
                        <span className={`text-xs ${t.accentSoft} px-1.5 py-0.5 rounded font-medium`}>Admin</span>
                      )}
                      {u.role === "leader" && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Shop Leader</span>
                      )}
                      {u.role === "junior" && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Junior</span>
                      )}
                    </div>
                    <div className={`text-xs ${t.t5}`}>
                      {u.email}
                      {u.store_code && <span className={`ml-2 ${t.t4}`}>· {STORES.find(s => s.code === u.store_code)?.name || u.store_code}</span>}
                    </div>
                  </div>
                  {isAdmin && u.id !== currentUser?.id && (
                    <button onClick={() => deleteUser(u.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
