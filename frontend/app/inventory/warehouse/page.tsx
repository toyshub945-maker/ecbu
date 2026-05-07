"use client";
import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useTheme } from "@/components/ThemeProvider";

interface StockData {
  stock: number;
  warehouse: string;
}

const normalize = (str: unknown): string => {
  return str ? String(str).trim().toUpperCase() : "";
};

export default function WarehouseBotPage() {
  const { theme: t } = useTheme();
  const [presentStockData, setPresentStockData] = useState<Record<string, StockData>>({});
  const [templateJsonData, setTemplateJsonData] = useState<Record<string, string>[]>([]);
  const [fileName1, setFileName1] = useState("");
  const [fileName2, setFileName2] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Waiting for both Excel sheets to be uploaded...");
  const [searchFilter, setSearchFilter] = useState("");

  const presentStockInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const handlePresentStockChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMsg("Loading Present Stock...");
    setFileName1(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName], { defval: "" }) as Record<string, string>[];

      const map: Record<string, StockData> = {};

      if (rows.length > 0) {
        const keys = Object.keys(rows[0]);
        const skuKey = keys.find((k) => normalize(k).includes("SKU"));
        const availKey = keys.find((k) => {
          const nk = normalize(k);
          return nk.includes("AVAILABILITY") || nk.includes("VOL") || nk.includes("STOCK") || nk.includes("QTY");
        });
        const whKey = keys.find((k) => normalize(k).includes("WAREHOUSE") || normalize(k).includes("WH"));

        if (skuKey && availKey) {
          rows.forEach((row: Record<string, unknown>) => {
            const sku = normalize(row[skuKey] as string);
            const stock = Number(row[availKey]);
            const wh = whKey ? String(row[whKey] || "").trim() : "";
            if (sku && !isNaN(stock)) {
              if (map[sku] === undefined || stock > map[sku].stock) {
                map[sku] = { stock, warehouse: wh };
              }
            }
          });
        } else {
          setStatusMsg("Error: Could not find 'SKU' or 'Availability' columns");
          return;
        }
      }

      setPresentStockData(map);
      setFileName1(`${Object.keys(map).length} unique SKUs loaded`);
      checkReady(map, templateJsonData);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleTemplateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMsg("Loading Template...");
    setFileName2(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" }) as Record<string, string>[];

      setTemplateJsonData(jsonData);
      setFileName2(`${file.name} loaded`);
      checkReady(presentStockData, jsonData);
    };
    reader.readAsArrayBuffer(file);
  };

  const checkReady = (stock: Record<string, StockData>, template: Record<string, string>[]) => {
    if (Object.keys(stock).length > 0 && template.length > 0) {
      setIsReady(true);
      setStatusMsg("Ready to generate update!");
    }
  };

  const processAndExport = async () => {
    setIsProcessing(true);
    setStatusMsg("Applying intelligent rules & generating Excel...");

    try {
      const ExcelJS = await import("exceljs");
      const { saveAs } = await import("file-saver");

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateArrayBuffer!);
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) throw new Error("Worksheet not found");

      let skuCol = -1,
        availCol = -1,
        volCol = -1,
        whCol = -1;

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (skuCol === -1) {
          row.eachCell((cell, colNum) => {
            const v = normalize(cell.value);
            if (v.includes("SKU")) skuCol = colNum;
            if (v === "AVAILABILITY") availCol = colNum;
            if (v.includes("VOL") || (v.includes("AVAILABLE") && !v.includes("AVAILABILITY")))
              volCol = colNum;
            if (v === "WAREHOUSE" || v === "WH") whCol = colNum;
          });
        } else {
          const rawSkuCell = row.getCell(skuCol);
          const normSku = normalize(rawSkuCell.value);
          if (!normSku) return;

          let matchedData = presentStockData[normSku];
          if (matchedData === undefined) {
            const sortedKeys = Object.keys(presentStockData).sort((a, b) => b.length - a.length);
            for (const key of sortedKeys) {
              const idx = normSku.indexOf(key);
              if (idx !== -1) {
                const charAfter = normSku.charAt(idx + key.length);
                if (!charAfter || !/[A-Z0-9]/i.test(charAfter)) {
                  matchedData = presentStockData[key];
                  break;
                }
              }
            }
          }

          const prevVolCell = row.getCell(volCol > 0 ? volCol : availCol + 1);
          const availCell = row.getCell(availCol > 0 ? availCol : skuCol + 1);

          const prevVol = Number(prevVolCell.value) || 0;
          let newVol = prevVol;

          if (matchedData !== undefined) {
            newVol = matchedData.stock;
            const whName = matchedData.warehouse;

            if (whCol > 0 && whName) {
              row.getCell(whCol).value = whName;
            }
          }

          let displayAvail = "";
          let bColor: string | null = null;
          let cColor: string | null = null;

          if (newVol <= 5) {
            displayAvail = "0";
            cColor = "FFFF0000";
            bColor = "FFFF0000";
          } else if (newVol === 6) {
            displayAvail = "1";
            cColor = "FFFFA500";
            bColor = "FFFFA500";
          } else if (newVol === 7 || newVol === 8) {
            displayAvail = "2";
            cColor = "FFFFA500";
            bColor = "FFFFA500";
          } else if (newVol === 9) {
            displayAvail = "3";
            cColor = "FFFFA500";
            bColor = "FFFFA500";
          } else {
            displayAvail = "";
          }

          if (displayAvail !== "") {
            prevVolCell.value = displayAvail;
            availCell.value = newVol;

            prevVolCell.style = {
              ...prevVolCell.style,
              fill: { type: "pattern", pattern: "solid", fgColor: { argb: cColor } } as any,
              font: { color: { argb: "FFFFFFFF" }, bold: true } as any,
            };
            availCell.style = {
              ...availCell.style,
              fill: { type: "pattern", pattern: "solid", fgColor: { argb: bColor } } as any,
              font: { color: { argb: "FFFFFFFF" }, bold: true } as any,
            };
          } else {
            prevVolCell.value = newVol;
            availCell.value = null;

            if (newVol > prevVol) {
              prevVolCell.style = {
                ...prevVolCell.style,
                fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } } as any,
                font: { color: { argb: "FF006100" }, bold: true } as any,
              };
            } else {
              prevVolCell.style = {
                ...prevVolCell.style,
                fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } } as any,
                font: { color: { argb: "FF000000" } } as any,
              };
            }

            availCell.style = {
              ...availCell.style,
              fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } } as any,
              font: { color: { argb: "FF000000" } } as any,
            };
          }

          availCell.border = {
            top: { style: "thin", color: { argb: "FFDDDDDD" } },
            bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
            left: { style: "thin", color: { argb: "FFDDDDDD" } },
            right: { style: "thin", color: { argb: "FFDDDDDD" } },
          } as any;
          prevVolCell.border = {
            top: { style: "thin", color: { argb: "FFDDDDDD" } },
            bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
            left: { style: "thin", color: { argb: "FFDDDDDD" } },
            right: { style: "thin", color: { argb: "FFDDDDDD" } },
          } as any;
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, "Updated_Stock_" + fileName2);

      setStatusMsg("Excel exported successfully!");
    } catch (err) {
      console.error(err);
      setStatusMsg("Error generating Excel. Check console for details.");
    } finally {
      setIsProcessing(false);
    }
  };

  const [templateArrayBuffer, setTemplateArrayBuffer] = useState<ArrayBuffer | null>(null);

  const handleTemplateChangeWithBuffer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMsg("Loading Template...");
    setFileName2(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      setTemplateArrayBuffer(buffer);

      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: "array" });
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" }) as Record<string, string>[];

      setTemplateJsonData(jsonData);
      setFileName2(`${file.name} loaded`);
      checkReady(presentStockData, jsonData);
    };
    reader.readAsArrayBuffer(file);
  };

  const renderPreview = () => {
    if (templateJsonData.length === 0) return null;

    const keys = Object.keys(templateJsonData[0]);
    const skuKey = keys.find((k) => normalize(k).includes("SKU"));
    const volKey = keys.find(
      (k) =>
        normalize(k).includes("VOL") ||
        normalize(k).includes("AVAILABILITY") ||
        normalize(k).includes("STOCK")
    );

    if (!skuKey || !volKey) return null;

    return templateJsonData
      .filter((row) => {
        const rawSku = String(row[skuKey!] || "");
        const normSku = normalize(rawSku);
        if (!normSku) return false;
        if (searchFilter && !normSku.includes(searchFilter.toUpperCase())) return false;
        return true;
      })
      .map((row, idx) => {
        const rawSku = String(row[skuKey!] || "");
        const normSku = normalize(rawSku);
        const prevVol = Number(row[volKey!] || 0);

        let matchedData = presentStockData[normSku];
        if (matchedData === undefined) {
          const sortedKeys = Object.keys(presentStockData).sort((a, b) => b.length - a.length);
          for (const key of sortedKeys) {
            const idx2 = normSku.indexOf(key);
            if (idx2 !== -1) {
              const charAfter = normSku.charAt(idx2 + key.length);
              if (!charAfter || !/[A-Z0-9]/i.test(charAfter)) {
                matchedData = presentStockData[key];
                break;
              }
            }
          }
        }

        const newVol = matchedData !== undefined ? matchedData.stock : prevVol;
        const isRestock = newVol > prevVol;

        let availStatus = "";
        let badgeClass = "bg-gray-100 text-gray-700 border-gray-200";

        if (newVol <= 5) {
          availStatus = "0";
          badgeClass = "bg-red-100 text-red-700 border-red-200";
        } else if (newVol === 6) {
          availStatus = "1";
          badgeClass = "bg-orange-100 text-orange-700 border-orange-200";
        } else if (newVol === 7 || newVol === 8 || newVol === 9) {
          availStatus = String(newVol);
          badgeClass = "bg-orange-100 text-orange-700 border-orange-200";
        }

        const columnBDisplay = availStatus !== "" ? availStatus : newVol;
        const columnCDisplay = availStatus !== "" ? newVol : "-";

        return (
          <tr key={idx} className={`${t.btn}`}>
            <td className={`px-4 py-3 border-b ${t.divider}`}>
              <strong className={t.t1}>{rawSku}</strong>
            </td>
            <td className={`px-4 py-3 border-b ${t.divider} ${t.t3}`}>{prevVol}</td>
            <td
              className={`px-4 py-3 border-b ${t.divider} font-semibold ${
                availStatus !== "" ? "text-red-600" : t.t1
              }`}
            >
              {columnBDisplay}
            </td>
            <td className={`px-4 py-3 border-b ${t.divider}`}>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded border ${badgeClass}`}>
                {columnCDisplay}
              </span>
            </td>
            <td className={`px-4 py-3 border-b ${t.divider}`}>
              {isRestock ? (
                <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-sm bg-green-50 px-2.5 py-1 rounded">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <polyline
                      points="23 6 13.5 15.5 8.5 10.5 1 18"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <polyline points="17 6 23 6 23 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Restocked
                </span>
              ) : (
                <span className={t.t4}>-</span>
              )}
            </td>
          </tr>
        );
      });
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${t.t1}`}>Warehouse Sheet Bot</h1>
        <p className={`text-sm ${t.t3} mt-1`}>
          Smartly merge, update, and export yesterday&apos;s template with today&apos;s live stock data
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div
          className={`${t.card} rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
            Object.keys(presentStockData).length > 0
              ? "border-green-300 bg-green-50"
              : `${t.divider} hover:border-blue-400 hover:bg-blue-50`
          }`}
          onClick={() => presentStockInputRef.current?.click()}
        >
          <input
            ref={presentStockInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handlePresentStockChange}
          />
          <div className="w-12 h-12 mx-auto mb-4 text-blue-600">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3 className={`font-semibold ${t.t1} mb-1`}>1. Present Stock Sheet</h3>
          <p className={`text-sm ${t.t3} mb-3`}>Contains live availability per warehouse</p>
          <div
            className={`text-sm font-medium ${
              Object.keys(presentStockData).length > 0 ? "text-green-600" : "text-amber-600"
            }`}
          >
            {fileName1 || "No file chosen"}
          </div>
        </div>

        <div
          className={`${t.card} rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
            templateJsonData.length > 0
              ? "border-green-300 bg-green-50"
              : `${t.divider} hover:border-blue-400 hover:bg-blue-50`
          }`}
          onClick={() => templateInputRef.current?.click()}
        >
          <input
            ref={templateInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleTemplateChangeWithBuffer}
          />
          <div className="w-12 h-12 mx-auto mb-4 text-blue-600">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 className={`font-semibold ${t.t1} mb-1`}>2. Yesterday&apos;s Template</h3>
          <p className={`text-sm ${t.t3} mb-3`}>Target file to apply rules to</p>
          <div
            className={`text-sm font-medium ${
              templateJsonData.length > 0 ? "text-green-600" : "text-amber-600"
            }`}
          >
            {fileName2 || "No file chosen"}
          </div>
        </div>
      </div>

      {templateJsonData.length > 0 && (
        <div className={`${t.card} rounded-xl border ${t.divider} mb-8`}>
          <div className={`flex items-center justify-between p-5 border-b ${t.divider}`}>
            <h2 className={`font-semibold ${t.t2}`}>Data Preview</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by SKU..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className={`w-64 px-4 py-2 pl-10 ${t.inp} border ${t.divider} rounded-lg text-sm focus:outline-none focus:border-blue-400`}
              />
              <svg
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${t.t4}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className={`${t.page} sticky top-0`}>
                <tr>
                  <th className={`px-4 py-3 text-left text-xs font-semibold ${t.t3} uppercase tracking-wider border-b ${t.divider}`}>
                    Warehouse - SKU
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold ${t.t3} uppercase tracking-wider border-b ${t.divider}`}>
                    Previous Volume
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold ${t.t3} uppercase tracking-wider border-b ${t.divider}`}>
                    New Max Volume
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold ${t.t3} uppercase tracking-wider border-b ${t.divider}`}>
                    Availability Status
                  </th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold ${t.t3} uppercase tracking-wider border-b ${t.divider}`}>
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-${t.divider}`}>{renderPreview()}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className={`${t.card} rounded-xl border ${t.divider} p-6`}>
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={processAndExport}
            disabled={!isReady || isProcessing}
            className={`flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg transition-all ${
              isReady && !isProcessing
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg"
                : `${t.page} ${t.t4} cursor-not-allowed`
            }`}
          >
            {isProcessing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Process & Export Excel
              </>
            )}
          </button>
          <p
            className={`text-sm ${
              isReady && !isProcessing
                ? "text-green-600"
                : isProcessing
                ? "text-blue-600"
                : t.t3
            }`}
          >
            {statusMsg}
          </p>
        </div>
      </div>
    </div>
  );
}
