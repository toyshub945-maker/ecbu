"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

export default function LoginPage() {
  const router = useRouter();
  const { theme: t } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login(email, password);
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className={`${t.card} rounded-2xl shadow-2xl p-10 w-full max-w-md`}>
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${t.accentBg} mb-4`}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className={`text-2xl font-bold ${t.t1}`}>Workflow Dashboard</h1>
          <p className={`text-sm ${t.t4} mt-1`}>EC BU1 Team</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium ${t.t2} mb-1`}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={`w-full ${t.inp} rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500`}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${t.t2} mb-1`}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`w-full ${t.inp} rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500`}
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className={`w-full ${t.btn} font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50`}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className={`text-xs text-center ${t.t5} mt-6`}>
          Default admin: admin@workflow.local / admin123
        </p>
      </div>
    </div>
  );
}
