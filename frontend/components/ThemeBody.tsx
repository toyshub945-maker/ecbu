"use client";
import { useTheme } from "./ThemeProvider";

export function ThemeBody({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <div className={`flex min-h-screen ${theme.page}`}>{children}</div>;
}
