"use client";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

const APPS = [
  {
    id: "manage",
    title: "Warehouse Management",
    description: "View, edit, and manage warehouse inventory - synced with Feishu",
    icon: "🏠",
    href: "/inventory/manage",
    status: "ready",
  },
  {
    id: "warehouse",
    title: "Warehouse Sheet Bot",
    description: "Process Excel files to merge, update, and export stock data",
    icon: "📦",
    href: "/inventory/warehouse",
    status: "ready",
  },
  {
    id: "tiktok",
    title: "TikTok Stock Update",
    description: "Sync TikTok Shop template with real-time warehouse data",
    icon: "🔄",
    href: "/inventory/tiktok",
    status: "ready",
  },
  {
    id: "shein",
    title: "SHEIN Stock Update",
    description: "Sync SHEIN stock import template with warehouse data",
    icon: "📊",
    href: "/inventory/shein",
    status: "ready",
  },
  {
    id: "stock-prediction",
    title: "Stock Prediction",
    description: "Upload restock demand Excel to predict per-SKU stock needs by month",
    icon: "📦",
    href: "/inventory/stock-prediction",
    status: "ready",
  },
];

export default function InventoryPage() {
  const { theme: t } = useTheme();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${t.t1}`}>Inventory Management</h1>
        <p className={`text-sm ${t.t3} mt-1`}>Manage your inventory tools and functions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {APPS.map((app) => (
          <AppCard key={app.id} app={app} theme={t} />
        ))}
      </div>
    </div>
  );
}

function AppCard({ app, theme: t }: { app: typeof APPS[0]; theme: ReturnType<typeof useTheme>["theme"] }) {
  const isReady = app.status === "ready";

  if (isReady) {
    return (
      <Link
        href={app.href}
        className={`group ${t.card} rounded-xl border ${t.divider} p-6 hover:border-blue-300 hover:shadow-md transition-all`}
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
            {app.icon}
          </div>
          <div className="flex-1">
            <h3 className={`font-semibold ${t.t1} group-hover:text-blue-600 transition-colors`}>
              {app.title}
            </h3>
            <p className={`text-sm ${t.t3} mt-1`}>{app.description}</p>
          </div>
          <span className={`${t.t4} group-hover:text-blue-600 transition-colors`}>
            →
          </span>
        </div>
      </Link>
    );
  }

  return (
    <div className={`${t.card} rounded-xl border ${t.divider} p-6 opacity-75`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center text-xl">
          {app.icon}
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold ${t.t2}`}>{app.title}</h3>
          <p className={`text-sm ${t.t3} mt-1`}>{app.description}</p>
          <span className="inline-block mt-3 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            Coming Soon
          </span>
        </div>
      </div>
    </div>
  );
}
