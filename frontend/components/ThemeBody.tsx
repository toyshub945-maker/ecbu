"use client";
import { useTheme } from "./ThemeProvider";

export function ThemeBody({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div className={`flex h-screen w-full overflow-hidden ${theme.page}`}>
      {children}
    </div>
  );
}
