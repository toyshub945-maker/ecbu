"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { THEMES, ThemeKey, type ThemeDef } from "@/lib/theme";

interface ThemeContextValue {
  theme: ThemeDef;
  themeKey: ThemeKey;
  setTheme: (k: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<ThemeKey>(() => {
    if (typeof window !== "undefined") {
      // __DASH_THEME__ is pre-seeded by the blocking script in layout.tsx
      // This avoids reading localStorage twice and ensures the same value
      return ((window as any).__DASH_THEME__ as ThemeKey) || "classic";
    }
    return "classic";
  });

  const setTheme = useCallback((k: ThemeKey) => {
    setKey(k);
    localStorage.setItem("dashTheme", k);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: THEMES[key], themeKey: key, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
