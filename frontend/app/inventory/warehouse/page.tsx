"use client";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useTheme } from "@/components/ThemeProvider";

interface StockData {
  stock: number;
  warehouse: string;
}

const normalize = (str: unknown): string =>
  str ? String(str).trim().toUpperCase() : "";

// ── Status logic (mirrors the standalone HTML reference app) ─────────────────
function getStatus(newVol: number): { status: string; isLow: boolean } {
  if (newVol <= 5)                    return { status: "0", isLow: true };
  if (newVol === 6)                   return { status: "1", isLow: true };
  if (newVol === 7 || newVol === 8)   return { status: "2", isLow: true };
  if (newVol === 9)                   return { status: "3", isLow: true };
  return { status: "", isLow: false };
}

// ── SKU matcher (longest-key-first, no trailing alphanumeric) ────────────────
function matchSku(
  normSku: string,
  stockMap: Record<string, StockData>
): StockData | undefined {
  if (stockMap[normSku] !== undefined) return stockMap[normSku];
  const sorted = Object.keys(stockMap).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const idx = normSku.indexOf(key);
    if (idx !== -1) {
      const after = normSku.charAt(idx + key.length);
      if (!after || !/[A-Z0-9]/i.test(after)) return stockMap[key];
    }
  }
  return undefined;
}

export default function WarehouseBotPage() {
  const { theme: t } = useTheme();

  // ── State ──────────────────────────────────────────────────────────────────
  const [presentStockData, setPresentStockData] = useState<Record<string, StockData>>({});
  const [templateJsonData, setTemplateJsonData] = useState<Record<string, string>[]>([]);
  const [templateArrayBuffer, setTemplateArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [templateFileName, setTemplateFileName] = useState("");
  const [label1, setLabel1] = useState("No file chosen");
  const [label2, setLabel2] = useState("No file chosen");
  const [loaded1, setLoaded1] = useState(false);
  const [loaded2, setLoaded2] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Waiting for both Excel sheets to be uploaded...");
  const [statusColor, setStatusColor] = useState<"default" | "green" | "blue" | "red">("default");
  const [searchFilter, setSearchFilter] = useState("");

  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);

  const isReady = loaded1 && loaded2;

  // ── File 1: Present Stock ──────────────────────────────────────────────────
  const handlePresentStock = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLabel1("Loading...");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[wb.SheetNames[0]], { defval: "" }
      );
      const map: Record<string, StockData> = {};

      if (rows.length > 0) {
        const keys = Object.keys(rows[0]);
        const skuKey  = keys.find((k) => normalize(k).includes("SKU"));
        const availKey = keys.find((k) => {
          const n = normalize(k);
          return n.includes("AVAILABILITY") || n.includes("VOL") || n.includes("STOCK") || n.includes("QTY");
        });
        const whKey = keys.find((k) => {
          const n = normalize(k);
          return n.includes("WAREHOUSE") || n === "WH";
        });

        if (!skuKey || !availKey) {
          setStatusMsg("Error: Cannot find 'SKU' or 'Availability' columns in Present Stock sheet.");
          setStatusColor("red");
          return;
        }

        rows.forEach((row) => {
          const sku   = normalize(row[skuKey]);
          const stock = Number(row[availKey]);
          const wh    = whKey ? String(row[whKey] ?? "").trim() : "";
          if (sku && !isNaN(stock)) {
            if (map[sku] === undefined || stock > map[sku].stock) {
              map[sku] = { stock, warehouse: wh };
            }
          }
        });
      }

      setPresentStockData(map);
      setLoaded1(true);
      setLabel1(`${Object.keys(map).length} unique SKUs loaded`);
      if (loaded2) { setStatusMsg("Ready to generate update!"); setStatusColor("green"); }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── File 2: Yesterday's Template ──────────────────────────────────────────
  const handleTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLabel2("Loading...");
    setTemplateFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      setTemplateArrayBuffer(buf);

      const data = new Uint8Array(buf);
      const wb = XLSX.read(data, { type: "array" });
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(
        wb.Sheets[wb.SheetNames[0]], { defval: "" }
      );
      setTemplateJsonData(jsonData);
      setLoaded2(true);
      setLabel2(`${file.name} loaded`);
      if (loaded1) { setStatusMsg("Ready to generate update!"); setStatusColor("green"); }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Preview ────────────────────────────────────────────────────────────────
  const renderPreview = () => {
    if (!templateJsonData.length) return null;
    const keys   = Object.keys(templateJsonData[0]);
    const skuKey = keys.find((k) => normalize(k).includes("SKU"));
    const volKey = keys.find((k) => {
      const n = normalize(k);
      return n.includes("VOL") || n.includes("AVAILABILITY") || n.includes("STOCK");
    });
    if (!skuKey) return null;

    return templateJsonData
      .filter((row) => {
        const normSku = normalize(row[skuKey]);
        if (!normSku) return false;
        if (searchFilter && !normSku.includes(searchFilter.toUpperCase())) return false;
        return true;
      })
      .map((row, idx) => {
        const rawSku  = String(row[skuKey] ?? "");
        const normSku = normalize(rawSku);
        const prevVol = Number(volKey ? row[volKey] : 0) || 0;

        const matched = matchSku(normSku, presentStockData);
        const newVol  = matched !== undefined ? matched.stock : prevVol;
        const isRestock = newVol > prevVol;

        const { status, isLow } = getStatus(newVol);

        const colB = isLow ? status : String(newVol);
        const colC = isLow ? String(newVol) : "—";

        const badgeCls = !isLow
          ? `${t.bar} ${t.t3} border ${t.divider}`
          : newVol <= 5
          ? "bg-red-100 text-red-700 border border-red-200"
          : "bg-orange-100 text-orange-700 border border-orange-200";

        const bColor = !isLow ? t.t1 : newVol <= 5 ? "text-red-600 font-bold" : "text-orange-600 font-bold";

        return (
          <tr key={idx} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <td className={`px-4 py-3 border-b ${t.divider}`}>
              <strong className={t.t1}>{rawSku}</strong>
            </td>
            <td className={`px-4 py-3 border-b ${t.divider} ${t.t3}`}>{prevVol}</td>
            <td className={`px-4 py-3 border-b ${t.divider} ${bColor}`}>{colB}</td>
            <td className={`px-4 py-3 border-b ${t.divider}`}>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded ${badgeCls}`}>
                {colC}
              </span>
            </td>
            <td className={`px-4 py-3 border-b ${t.divider}`}>
              {isRestock ? (
                <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-sm bg-green-50 px-2.5 py-1 rounded">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 6 23 6 23 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Restocked
                </span>
              ) : (
                <span className={`${t.t4} text-sm`}>—</span>
              )}
            </td>
          </tr>
        );
      });
  };

  // ── Process & Export ───────────────────────────────────────────────────────
  const processAndExport = async () => {
    if (!templateArrayBuffer) return;
    setIsProcessing(true);
    setStatusMsg("Applying intelligent rules & generating Excel...");
    setStatusColor("blue");

    try {
      // ExcelJS: handle both CommonJS (.Workbook) and ES-module (.default.Workbook) packaging
      const excelMod = await import("exceljs");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ExcelJS: any = (excelMod as any).default ?? excelMod;

      const { saveAs } = await import("file-saver");

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateArrayBuffer);
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("No worksheet found in template.");

      let skuCol = -1, availCol = -1, volCol = -1, whCol = -1;

      worksheet.eachRow({ includeEmpty: false }, (row: any) => {
        if (skuCol !== -1) return; // header already found
        row.eachCell((cell: any, colNum: number) => {
          const v = normalize(cell.value);
          if (v.includes("SKU"))                                           skuCol  = colNum;
          if (v === "AVAILABILITY")                                        availCol = colNum;
          if (v.includes("VOL") || (v.includes("AVAILABLE") && v !== "AVAILABILITY")) volCol = colNum;
          if (v === "WAREHOUSE" || v === "WH")                            whCol   = colNum;
        });
      });

      let headerFound = false;

      worksheet.eachRow({ includeEmpty: false }, (row: any) => {
        // Skip header detection row
        if (!headerFound) {
          headerFound = true;
          return;
        }

        const normSku = normalize(row.getCell(skuCol).value);
        if (!normSku) return;

        const matched = matchSku(normSku, presentStockData);

        const prevVolCell = row.getCell(volCol > 0 ? volCol : availCol + 1);
        const availCell   = row.getCell(availCol > 0 ? availCol : skuCol + 1);

        const prevVol = Number(prevVolCell.value) || 0;
        let newVol = prevVol;

        if (matched !== undefined) {
          newVol = matched.stock;
          if (whCol > 0 && matched.warehouse) {
            row.getCell(whCol).value = matched.warehouse;
          }
        }

        const { status, isLow } = getStatus(newVol);

        const RED    = "FFFF0000";
        const ORANGE = "FFFFA500";
        const WHITE  = "FFFFFFFF";
        const BLACK  = "FF000000";

        if (isLow) {
          const fillColor = newVol <= 5 ? RED : ORANGE;
          // Flip: B = status code, C = actual volume
          prevVolCell.value = status;
          availCell.value   = newVol;

          prevVolCell.style = {
            ...prevVolCell.style,
            fill: { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } },
            font: { color: { argb: WHITE }, bold: true },
          };
          availCell.style = {
            ...availCell.style,
            fill: { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } },
            font: { color: { argb: WHITE }, bold: true },
          };
        } else {
          // Normal: B = volume, C = empty
          prevVolCell.value = newVol;
          availCell.value   = null;

          if (newVol > prevVol) {
            prevVolCell.style = {
              ...prevVolCell.style,
              fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } },
              font: { color: { argb: "FF006100" }, bold: true },
            };
          } else {
            prevVolCell.style = {
              ...prevVolCell.style,
              fill: { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } },
              font: { color: { argb: BLACK } },
            };
          }
          availCell.style = {
            ...availCell.style,
            fill: { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } },
            font: { color: { argb: BLACK } },
          };
        }

        const thinBorder = { style: "thin", color: { argb: "FFDDDDDD" } };
        const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        prevVolCell.border = border;
        availCell.border   = border;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        "Updated_Stock_" + templateFileName
      );

      setStatusMsg("✅ Excel exported successfully!");
      setStatusColor("green");
    } catch (err: unknown) {
      console.error("Export error:", err);
      setStatusMsg(`Error: ${err instanceof Error ? err.message : "Unknown error — check browser console."}`);
      setStatusColor("red");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Colour helpers ─────────────────────────────────────────────────────────
  const statusColorCls =
    statusColor === "green" ? "text-green-600"
    : statusColor === "blue"  ? "text-blue-600"
    : statusColor === "red"   ? "text-red-500"
    : t.t3;

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${t.t1}`}>Warehouse Sheet Bot</h1>
        <p className={`text-sm ${t.t3} mt-1`}>
          Smartly merge, update, and export yesterday&apos;s template with today&apos;s live stock data
        </p>
      </div>

      {/* Upload cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Card 1 */}
        <div
          className={`${t.card} rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
            loaded1 ? "border-green-400 bg-green-50 dark:bg-green-900/20" : `${t.divider} hover:border-blue-400`
          }`}
          onClick={() => ref1.current?.click()}
        >
          <input ref={ref1} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handlePresentStock}/>
          <div className={`w-12 h-12 mx-auto mb-4 ${loaded1 ? "text-green-500" : "text-blue-500"}`}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3 className={`font-semibold ${t.t1} mb-1`}>1. Present Stock Sheet</h3>
          <p className={`text-sm ${t.t3} mb-3`}>Contains live availability per warehouse</p>
          <div className={`text-sm font-medium ${loaded1 ? "text-green-600" : "text-amber-500"}`}>{label1}</div>
        </div>

        {/* Card 2 */}
        <div
          className={`${t.card} rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
            loaded2 ? "border-green-400 bg-green-50 dark:bg-green-900/20" : `${t.divider} hover:border-blue-400`
          }`}
          onClick={() => ref2.current?.click()}
        >
          <input ref={ref2} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleTemplate}/>
          <div className={`w-12 h-12 mx-auto mb-4 ${loaded2 ? "text-green-500" : "text-blue-500"}`}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h3 className={`font-semibold ${t.t1} mb-1`}>2. Yesterday&apos;s Template</h3>
          <p className={`text-sm ${t.t3} mb-3`}>Target file to apply rules to</p>
          <div className={`text-sm font-medium ${loaded2 ? "text-green-600" : "text-amber-500"}`}>{label2}</div>
        </div>
      </div>

      {/* Preview table */}
      {templateJsonData.length > 0 && (
        <div className={`${t.card} rounded-2xl border ${t.divider} mb-8`}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${t.divider}`}>
            <h2 className={`font-semibold ${t.t1}`}>Data Preview</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by SKU..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className={`w-64 pl-9 pr-3 py-2 rounded-lg text-sm border ${t.divider} ${t.inp} focus:outline-none focus:border-blue-400`}
              />
              <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${t.t4}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2"/>
              </svg>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className={`${t.page} sticky top-0 z-10`}>
                <tr>
                  {["Warehouse – SKU", "Previous Volume", "New Max Volume", "Availability Status", "Trend"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold ${t.t3} uppercase tracking-wider border-b ${t.divider}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{renderPreview()}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action footer */}
      <div className={`${t.card} rounded-2xl border ${t.divider} p-6`}>
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={processAndExport}
            disabled={!isReady || isProcessing}
            className={`flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all ${
              isReady && !isProcessing
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5"
                : `${t.page} ${t.t4} cursor-not-allowed opacity-60`
            }`}
          >
            {isProcessing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                Processing…
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Process &amp; Export Excel
              </>
            )}
          </button>
          <p className={`text-sm ${statusColorCls}`}>{statusMsg}</p>
        </div>
      </div>
    </div>
  );
}
