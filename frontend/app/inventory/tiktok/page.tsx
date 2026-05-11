"use client";
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";

function backendUrl(path: string) {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return `${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`;
  }
  const h = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const host = (h === "localhost" || /^127\./.test(h) || /^192\.168\./.test(h) || /^10\./.test(h)) ? h : "localhost";
  return `http://${host}:8000${path}`;
}

const SHOPS = [
  { value: "Option 1 - Celnepho", label: "Celnepho (TT1)" },
  { value: "Option 2 - Cynllio", label: "Cynllio (TT2)" },
  { value: "Option 3 - VIMISAOI", label: "VIMISAOI (TT3)" },
  { value: "Option 4 - mikarka shoes", label: "mikarka (TT4)" },
];

export default function TikTokStockPage() {
  const { theme: t } = useTheme();
  const [mskuFile, setMskuFile] = useState<File | null>(null);
  const [inventoryFile, setInventoryFile] = useState<File | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [selectedShop, setSelectedShop] = useState("Option 1 - Celnepho");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  const [warehouseStatus, setWarehouseStatus] = useState<"loading" | "ready" | "error">("ready");
  const [warehouseFallback, setWarehouseFallback] = useState(false);

  const mskuInput = useRef<HTMLInputElement>(null);
  const invInput = useRef<HTMLInputElement>(null);
  const tempInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        await fetch(backendUrl("/api/health"));
        setIsBackendOnline(true);
      } catch {
        setIsBackendOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleUpload = async () => {
    if (!mskuFile || !templateFile) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append("msku_mapping", mskuFile);
    formData.append("template", templateFile);
    formData.append("shop_name", selectedShop);

    if (inventoryFile) {
      formData.append("inventory", inventoryFile);
    }

    try {
      const response = await fetch(backendUrl("/api/inventory/process-tiktok"), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Processing failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "updated_tiktok_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during processing.");
    } finally {
      setLoading(false);
    }
  };

  const UploadBox = ({
    file,
    setFile,
    inputRef,
    title,
    icon,
    description,
  }: {
    file: File | null;
    setFile: (f: File | null) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    title: string;
    icon: React.ReactNode;
    description: string;
  }) => (
    <div
      className={`${t.card} rounded-xl border-2 p-6 cursor-pointer transition-all ${
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
      <div
        className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
          file ? "bg-green-100 text-green-600" : `${t.page} ${t.t3}`
        }`}
      >
        {icon}
      </div>
      <div className={`font-semibold ${t.t1}`}>{title}</div>
      <div className={`text-sm ${t.t3} mt-1`}>{description}</div>
      {file && (
        <div className="mt-3 text-sm font-medium text-green-600 bg-green-100 px-3 py-2 rounded-lg truncate">
          {file.name}
        </div>
      )}
    </div>
  );

  const useWarehouseFallback = () => {
    setWarehouseFallback(true);
    setWarehouseStatus("ready");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${t.t1}`}>TikTok Stock Update</h1>
        <p className={`text-sm ${t.t3} mt-1`}>
          Sync your TikTok Shop template with real-time warehouse data
        </p>
      </div>

      <div className={`${t.card} rounded-xl border ${t.divider} p-6 mb-6`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`font-semibold ${t.t2}`}>Select Shop</h2>
            <p className={`text-sm ${t.t3}`}>Choose which TikTok store to process</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedShop}
              onChange={(e) => setSelectedShop(e.target.value)}
              className={`px-4 py-2.5 ${t.inp} border ${t.divider} rounded-lg text-sm font-medium ${t.t2} focus:outline-none focus:border-blue-400`}
            >
              {SHOPS.map((shop) => (
                <option key={shop.value} value={shop.value}>
                  {shop.label}
                </option>
              ))}
            </select>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                isBackendOnline
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isBackendOnline ? "bg-green-500" : "bg-red-500"
                }`}
              />
              {isBackendOnline === null ? "Checking..." : isBackendOnline ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        {!warehouseFallback && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {warehouseStatus === "loading" ? (
                  <svg className="w-5 h-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : warehouseStatus === "error" ? (
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <div>
                  <div className={`text-sm font-medium ${t.t1}`}>
                    {warehouseStatus === "loading" && "Loading warehouse data from Feishu..."}
                    {warehouseStatus === "ready" && "Warehouse data synced from Feishu"}
                    {warehouseStatus === "error" && "Failed to load from Feishu"}
                  </div>
                  <div className={`text-xs ${t.t3}`}>
                    {warehouseStatus === "loading" && "Please wait..."}
                    {warehouseStatus === "ready" && "Automatically fetched from Feishu"}
                    {warehouseStatus === "error" && "Using fallback option below"}
                  </div>
                </div>
              </div>
              {warehouseStatus === "error" && (
                <button
                  onClick={useWarehouseFallback}
                  className={`px-4 py-2 ${t.card} border ${t.divider} rounded-lg text-sm font-medium ${t.t2} ${t.btn}`}
                >
                  Use Manual Upload
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UploadBox
            file={mskuFile}
            setFile={setMskuFile}
            inputRef={mskuInput}
            title="MSKU Mapping"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            }
            description="TikTok MSKU to Warehouse SKU"
          />
          {(warehouseFallback || warehouseStatus === "error") && (
            <UploadBox
              file={inventoryFile}
              setFile={setInventoryFile}
              inputRef={invInput}
              title="All Warehouse (Fallback)"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              }
              description="Stock data from all 14 sheets"
            />
          )}
          <UploadBox
            file={templateFile}
            setFile={setTemplateFile}
            inputRef={tempInput}
            title="TikTok Template"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            description="Batch edit template to update"
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
          Processing Complete! Template updated.
        </div>
      )}

      <div className={`${t.card} rounded-xl border ${t.divider} p-6`}>
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleUpload}
            disabled={!mskuFile || !templateFile || loading}
            className={`flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all ${
              mskuFile && templateFile && !loading
                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
                : `${t.page} ${t.t4} cursor-not-allowed`
            }`}
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Updating...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Process Update</span>
              </>
            )}
          </button>
          <p className={`text-sm ${t.t3}`}>
            {!mskuFile || !templateFile
              ? "Upload MSKU Mapping and TikTok Template to enable processing"
              : "Ready to process"}
          </p>
        </div>
      </div>
    </div>
  );
}
