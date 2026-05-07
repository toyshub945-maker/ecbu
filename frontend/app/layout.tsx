import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeBody } from "@/components/ThemeBody";

export const metadata: Metadata = {
  title: "Workflow Dashboard",
  description: "EC BU1 Team Workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <ThemeBody>{children}</ThemeBody>
        </ThemeProvider>
      </body>
    </html>
  );
}
