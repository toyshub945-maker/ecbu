"use client";
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";

function backendUrl(path: string) {
  const h = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const host = (h === "localhost" || /^127\./.test(h) || /^192\.168\./.test(h) || /^10\./.test(h)) ? h : "localhost";
  return `http://${host}:8000${path}`;
}

export default function SheinStockPage() {
  const { theme: t } = useTheme();
  const [mskuFile, setMskuFile] = useState<File | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [exportFile, setExportFile] = useState<File | null>(null);
  const [warehouseFile, setWarehouseFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [warehouseStatus, setWarehouseStatus] = useState<"loading" | "ready" | "error">("loading");
  const [warehouseSkuCount, setWarehouseSkuCount] = useState<number>(0);

  const mskuInput = useRef<HTMLInputElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const exportInput = useRef<HTMLInputElement>(null);
  const warehouseInput = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!mskuFile || !templateFile || !exportFile) return;

    setLoading(true);
    setError(null);
    setSuccess(false);
    setLogs(["System ready. Uploading files..."]);

    const formData = new FormData();
    formData.append("mskuFile", mskuFile);
    formData.append("templateFile", templateFile);
    formData.append("exportFile", exportFile);

    if (warehouseFile) {
      formData.append("warehouseFile", warehouseFile);
    }

    try {
      setLogs((prev) => [...prev, "Processing files on server..."]);
      
      const response = await fetch(backendUrl("/api/inventory/process-shein"), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Processing failed");
      }

      setLogs((prev) => [...prev, "Processing complete. Downloading..."]);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "updated_stock_import.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();

      setLogs((prev) => [...prev, "Download complete!"]);
      setSuccess(true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An error occurred during processing.";
      setError(errMsg);
      setLogs((prev) => [...prev, `Error: ${errMsg}`]);
    } finally {
      setLoading(false);
    }
  };

  const UploadBox = ({
    file,
    setFile,
    inputRef,
    label,
    description,
  }: {
    file: File | null;
    setFile: (f: File | null) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    label: string;
    description: string;
  }) => (
    <div
      className={`${t.card} rounded-xl border-2 p-5 cursor-pointer transition-all ${
        file
          ? "border-green-300 bg-green-50"
          : `border-dashed ${t.divider} hover:border-blue-400 hover:bg-blue-50`
      }`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        type="file"
        hidden
        ref={inputRef}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        accept=".xlsx,.xls"
      />
      <div className={`text-sm font-semibold ${t.t1} mb-1`}>{label}</div>
      <div className={`text-xs ${t.t3} mb-3`}>{description}</div>
      {file ? (
        <div className="text-sm font-medium text-green-600 truncate">{file.name}</div>
      ) : (
        <div className="text-xs text-amber-600 font-medium">No file chosen</div>
      )}
    </div>
  );

  useEffect(() => {
    fetch(backendUrl("/api/warehouse/summary"))
      .then((r) => r.json())
      .then((d) => {
        if (d.total_skus > 0) {
          setWarehouseSkuCount(d.total_skus);
          setWarehouseStatus("ready");
        } else {
          setWarehouseStatus("error");
        }
      })
      .catch(() => setWarehouseStatus("error"));
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${t.t1}`}>SHEIN Stock Update</h1>
        <p className={`text-sm ${t.t3} mt-1`}>
          Upload your data to automate the mapping and generation
        </p>
      </div>

      <div
        className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${
          warehouseStatus === "loading"
            ? "bg-blue-50 border-blue-200"
            : warehouseStatus === "ready"
            ? "bg-green-50 border-green-200"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        {warehouseStatus === "loading" ? (
          <svg className="w-5 h-5 animate-spin text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : warehouseStatus === "ready" ? (
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
        )}
        <div>
          <div className="text-sm font-medium text-gray-800">
            {warehouseStatus === "loading" && "Checking warehouse data…"}
            {warehouseStatus === "ready" && `Warehouse DB ready — ${warehouseSkuCount.toLocaleString()} SKUs synced from Feishu`}
            {warehouseStatus === "error" && "Warehouse DB not synced — upload a warehouse file below (optional)"}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {warehouseStatus === "loading" && "Please wait…"}
            {warehouseStatus === "ready" && "Stock quantities will be pulled automatically. Go to Warehouse Management to re-sync."}
            {warehouseStatus === "error" && "You can still process without it — or upload your global warehouse inventory as file 4 below."}
          </div>
        </div>
      </div>

      <div className={`${t.card} rounded-xl border ${t.divider} p-6 mb-6`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UploadBox
            file={mskuFile}
            setFile={setMskuFile}
            inputRef={mskuInput}
            label="1. MSKU Sheet"
            description="SHEIN MSKU mapping file"
          />
          <UploadBox
            file={templateFile}
            setFile={setTemplateFile}
            inputRef={templateInput}
            label="2. Stock Template (Empty)"
            description="Stock import template to update"
          />
          <UploadBox
            file={exportFile}
            setFile={setExportFile}
            inputRef={exportInput}
            label="3. Merchant Stock Export"
            description="Export from SHEIN merchant center"
          />
          <UploadBox
            file={warehouseFile}
            setFile={setWarehouseFile}
            inputRef={warehouseInput}
            label={`4. Warehouse Inventory${warehouseStatus === "ready" ? " (auto-loaded ✓)" : " (optional)"}`}
            description={
              warehouseStatus === "ready"
                ? `${warehouseSkuCount.toLocaleString()} SKUs from DB — upload to override`
                : "Upload your global warehouse inventory to fill stock quantities"
            }
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-6">
          Stock import file generated successfully!
        </div>
      )}

      <div className={`${t.card} rounded-xl border ${t.divider} p-6 mb-6`}>
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleUpload}
            disabled={!mskuFile || !templateFile || !exportFile || loading}
            className={`flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all ${
              mskuFile && templateFile && exportFile && !loading
                ? "bg-purple-600 text-white hover:bg-purple-700 shadow-md"
                : `${t.page} ${t.t4} cursor-not-allowed`
            }`}
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Process & Sync</span>
              </>
            )}
          </button>
          <p className={`text-sm ${t.t3}`}>
            {!mskuFile || !templateFile || !exportFile
              ? "Upload MSKU Sheet, Stock Template, and Export to enable processing"
              : "Ready to process"}
          </p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
          </div>
          <span className={`text-xs ${t.t4} ml-2`}>Execution Log</span>
        </div>
        <div className="p-4 max-h-48 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className={t.t3}>System ready. Awaiting file uploads...</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className={`mb-1 ${log.includes("Error") ? "text-red-400" : "text-gray-300"}`}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
