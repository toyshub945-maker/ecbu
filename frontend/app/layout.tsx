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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script: runs before first paint to prevent theme flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try{
              var k=localStorage.getItem('dashTheme')||'classic';
              window.__DASH_THEME__=k;
              var bg={classic:'#020617',light:'#f1f5f9',dark:'#09090b'};
              document.documentElement.style.backgroundColor=bg[k]||'#020617';
            }catch(e){window.__DASH_THEME__='classic';}
          })();
        ` }} />
      </head>
      <body>
        <ThemeProvider>
          <ThemeBody>{children}</ThemeBody>
        </ThemeProvider>
      </body>
    </html>
  );
}
