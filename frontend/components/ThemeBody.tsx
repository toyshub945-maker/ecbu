"use client";
import { useTheme } from "./ThemeProvider";

export function ThemeBody({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div className={`flex min-h-screen w-full ${theme.page}`}>
      {children}
    </div>
  );
}
