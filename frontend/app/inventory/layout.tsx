"use client";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme();
  return (
    <>
      <Sidebar />
      <main className={`flex-1 p-6 overflow-auto ${t.page}`}>
        {children}
      </main>
    </>
  );
}
