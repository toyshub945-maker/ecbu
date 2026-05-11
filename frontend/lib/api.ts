function resolveBackendHost(): string {
  if (typeof window === "undefined") return "localhost";
  const h = window.location.hostname;
  // Use actual host only for localhost / LAN IPs; any external domain → localhost
  return (h === "localhost" || /^127\./.test(h) || /^192\.168\./.test(h) || /^10\./.test(h)) ? h : "localhost";
}

const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL
    ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`
    : `http://${resolveBackendHost()}:8000/api`;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const msg = typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map((e: any) => `${e.msg} [${(e.loc ?? []).join(".")}]`).join("; ")
        : res.statusText;
    throw new Error(msg || res.statusText);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: import("./types").User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<import("./types").User>("/auth/me"),

  stores: () => request<{ stores: import("./types").Store[] }>("/stores"),

  feishuSync: () => request<{ ok: boolean; inserted: number; updated: number; total_fetched: number }>("/feishu/sync", { method: "POST" }),
  feishuStatus: () => request<{ product_count: number; last_synced_at: string | null }>("/feishu/status"),

  periods: (store_code?: string) =>
    request<{ periods: import("./types").Period[] }>(`/periods${store_code ? `?store_code=${store_code}` : ""}`),
  createPeriod: (data: { store_code: string; period_start: string; period_end: string; label?: string }) =>
    request<import("./types").Period>("/periods", { method: "POST", body: JSON.stringify(data) }),
  deletePeriod: (id: number) => request<{ ok: boolean }>(`/periods/${id}`, { method: "DELETE" }),

  getBoard: (store_code: string, period_id: number) =>
    request<{
      period: import("./types").Period;
      products: import("./types").Product[];
      all_store_products: import("./types").Product[];
      users: import("./types").User[];
      task_types: string[];
      task_labels: Record<string, string>;
    }>(`/board?store_code=${store_code}&period_id=${period_id}`),

  updateBoardSelection: (data: { period_id: number; store_code: string; product_nos: string[]; selected: boolean }) =>
    request<{ ok: boolean }>("/board/select", { method: "POST", body: JSON.stringify(data) }),

  getBoardStats: (store_code: string, period_id: number) =>
    request<{ stats: { id: number; name: string; role: string; done_count: number }[] }>(`/board/stats/${store_code}/${period_id}`),

  bulkAssign: (data: { product_nos: string[]; period_id: number; store_code: string; assigned_to: number | null }) =>
    request<{ ok: boolean; updated: number }>("/tasks/bulk-assign", { method: "PUT", body: JSON.stringify(data) }),

  upsertTask: (data: {
    product_no: string; period_id: number; store_code: string;
    task_type: string; status: string; assigned_to?: number | null; notes?: string | null;
  }) => request<{ ok: boolean }>("/tasks", { method: "PUT", body: JSON.stringify(data) }),

  upsertNotes: (data: {
    product_no: string; period_id: number; store_code: string;
    analysis?: string | null; action?: string | null; results?: string | null;
  }) => request<{ ok: boolean }>("/notes", { method: "PUT", body: JSON.stringify(data) }),

  importAnalytics: (file: File, store_code: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("store_code", store_code);
    return request<{ ok: boolean; imported: number; periods_created: number }>("/analytics/import", {
      method: "POST",
      body: fd,
    });
  },

  dashboardSummary: (period_id?: number) =>
    request<{
      total_products: number;
      last_sync: string | null;
      task_counts: Record<string, number>;
      team_progress: { name: string; store_code: string; done_count: number }[];
      store_gmv: { store_code: string; total_gmv: number; product_count: number }[];
      recent_periods: import("./types").Period[];
    }>(`/dashboard/summary${period_id ? `?period_id=${period_id}` : ""}`),

  searchProducts: (q: string) =>
    request<{ products: { product_no: string; warehouse_name: string | null; image_url: string | null; sku: string | null }[] }>(`/products/search?q=${encodeURIComponent(q)}`),

  createProduct: (data: { product_no: string; warehouse_name?: string; image_url?: string; sku?: string }) =>
    request<{ ok: boolean }>("/products", { method: "POST", body: JSON.stringify(data) }),

  getPeriodSelections: (store_code: string, period_id: number) =>
    request<{ product_nos: string[] }>(`/board/period-selections?store_code=${store_code}&period_id=${period_id}`),

  pinProduct: (store_code: string, product_no: string) =>
    request<{ ok: boolean }>("/board/pin", { method: "POST", body: JSON.stringify({ store_code, product_no }) }),

  unpinProduct: (store_code: string, product_no: string) =>
    request<{ ok: boolean }>(`/board/pin/${store_code}/${encodeURIComponent(product_no)}`, { method: "DELETE" }),

  // Permanently hide a product from a store board (persists across refreshes)
  excludeProduct: (store_code: string, product_no: string) =>
    request<{ ok: boolean }>("/board/exclude", { method: "POST", body: JSON.stringify({ store_code, product_no }) }),

  // Restore a previously hidden product back to the board
  restoreProduct: (store_code: string, product_no: string) =>
    request<{ ok: boolean }>(`/board/exclude/${store_code}/${encodeURIComponent(product_no)}`, { method: "DELETE" }),

  updateBoardOrder: (product_nos: string[]) =>
    request<{ ok: boolean }>("/board/order", { method: "PUT", body: JSON.stringify({ product_nos }) }),

  updateAnalytics: (data: {
    product_no: string; period_id: number; store_code: string;
    [key: string]: string | number | null | undefined;
  }) => request<{ ok: boolean }>("/analytics", { method: "PUT", body: JSON.stringify(data) }),

  getAnalyticsHistory: (store_code: string, product_no: string) =>
    request<{ history: any[] }>(`/analytics/history/${store_code}/${encodeURIComponent(product_no)}`),

  // Orders upload
  uploadOrdersRaw: (file: File, store_code: string, upload_type: string, period_label?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("store_code", store_code);
    fd.append("upload_type", upload_type);
    fd.append("period_label", period_label ?? "");
    return request<{ ok: boolean; id: number; row_count: number; filename: string }>("/orders/upload-raw", { method: "POST", body: fd });
  },

  ordersHistory: (store_code?: string) =>
    request<{ uploads: { id: number; store_code: string; filename: string; upload_type: string; period_label: string | null; row_count: number; imported_at: string }[] }>(`/orders/history${store_code ? `?store_code=${store_code}` : ""}`),

  deleteOrderHistory: (upload_id: number) => 
    request<{ ok: boolean }>(`/orders/history/${upload_id}`, { method: "DELETE" }),

  getStoreReport: (store_code: string) =>
    request<{
      periods: (import("./types").Period & { total_tasks: number; done_tasks: number; in_progress_tasks: number; product_count: number })[];
      user_period_stats: { period_id: number; user_id: number; name: string; role: string; done_count: number; total_assigned: number }[];
      top_products: { product_no: string; warehouse_name: string | null; image_url: string | null; done_tasks: number; in_progress_tasks: number; total_tasks: number }[];
      users: { id: number; name: string; role: string; store_code: string | null }[];
      recent_notes?: { product_no: string; warehouse_name: string | null; image_url: string | null; period_label: string; analysis: string; action: string; results: string; updated_at: string }[];
    }>(`/report/${store_code}`),

  // Return & Refund Rate
  rrUploadOrders: (file: File, store_code: string, period_label?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("store_code", store_code);
    fd.append("period_label", period_label ?? "");
    return request<{ ok: boolean; rows: number; upload_id: number }>("/rr/upload-orders", { method: "POST", body: fd });
  },
  rrUploadReturns: (file: File, store_code: string, period_label?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("store_code", store_code);
    fd.append("period_label", period_label ?? "");
    return request<{ ok: boolean; rows: number; upload_id: number }>("/rr/upload-returns", { method: "POST", body: fd });
  },
  rrProducts: (store_code?: string, q?: string) => {
    const params = new URLSearchParams();
    if (store_code) params.set("store_code", store_code);
    if (q) params.set("q", q);
    const qs = params.toString();
    return request<{ products: import("./types").RRProduct[]; total: number }>(`/rr/products${qs ? `?${qs}` : ""}`);
  },
  rrUploads: (store_code?: string) =>
    request<{ uploads: import("./types").RRUpload[] }>(`/rr/uploads${store_code ? `?store_code=${store_code}` : ""}`),
  rrDeleteUpload: (upload_id: number) =>
    request<{ ok: boolean }>(`/rr/uploads/${upload_id}`, { method: "DELETE" }),

  getPricing: (store_code?: string, q?: string) => {
    const params = new URLSearchParams();
    if (store_code) params.set("store_code", store_code);
    if (q) params.set("q", q);
    const qs = params.toString();
    return request<{ products: import("./types").PricingProduct[]; total: number }>(`/pricing${qs ? `?${qs}` : ""}`);
  },

  allProducts: (store_code?: string) => {
    const qs = store_code ? `?store_code=${store_code}` : "";
    return request<{ products: import("./types").Product[] }>(`/products/all${qs}`);
  },

  users: () => request<{ users: import("./types").User[] }>("/users"),
  createUser: (data: { name: string; email: string; password: string; role: string; store_code?: string }) =>
    request<import("./types").User>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: number, data: Partial<{ name: string; email: string; password: string; role: string; store_code: string }>) =>
    request<{ ok: boolean }>(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),

  // Warehouse
  inventoryGrid: (sheet?: string | null) => {
    const params = new URLSearchParams();
    if (sheet) params.set("sheet", sheet);
    const qs = params.toString();
    return request<{ data: any[] }>(`/warehouse/inventory-grid${qs ? `?${qs}` : ""}`);
  },
  warehouseSummary: () => request<any>("/warehouse/summary"),
  warehouseSync: () => request<{ ok: boolean; total: number; detail?: string }>("/warehouse/sync-from-feishu", { method: "POST" }),
  warehouseCellUpdate: (data: { sheet_id: string; row_index: number; column: string; value: any }) =>
    request<any>("/warehouse/cell-update", { method: "PUT", body: JSON.stringify(data) }),

  // TikTok Export Analytics
  importTiktokExport: (file: File, store_code: string, source: "pm" | "board" = "pm") => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("store_code", store_code);
    fd.append("source", source);
    return request<{ ok: boolean; imported: number; unmatched: number; period_start: string; period_end: string }>(
      "/analytics/import-tiktok-export", { method: "POST", body: fd }
    );
  },
  boardProgress: (store_code: string) =>
    request<{ rows: any[] }>(`/board/progress/${store_code}`),

  getTiktokExportList: (store_code: string, source?: "pm" | "board") =>
    request<{ periods: { period_start: string; period_end: string; product_count: number; total_gmv: number; imported_at: string }[] }>(
      `/analytics/tiktok-export/${store_code}${source ? `?source=${source}` : ""}`
    ),
  getTiktokExportData: (store_code: string, period_start: string, period_end: string) =>
    request<{ rows: any[] }>(`/analytics/tiktok-export/${store_code}/${period_start}/${period_end}`),

  deleteTiktokExport: (store_code: string, period_start: string, period_end: string, source?: "pm" | "board") =>
    request<{ ok: boolean }>(`/analytics/tiktok-export/${store_code}/${period_start}/${period_end}${source ? `?source=${source}` : ""}`, { method: "DELETE" }),

  // Monthly Targets
  getTargets: () => request<{ targets: any[] }>("/targets"),
  upsertTarget: (data: { year: number; month: number; target_gmv?: number | null; target_orders?: number | null; target_products?: number | null; notes?: string | null }) =>
    request<{ ok: boolean }>("/targets", { method: "PUT", body: JSON.stringify(data) }),
  dashboardEnhanced: () => request<any>("/dashboard/enhanced"),

  // Product Manager
  pmProducts: (q?: string) =>
    request<{ products: import("./types").PMProduct[] }>(`/product-manager/products${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  pmDetail: (product_no: string) =>
    request<import("./types").PMDetail>(`/product-manager/${encodeURIComponent(product_no)}`),

  // Ads Creative
  creativeUpload: (file: File, store_name: string, date_from: string, date_to: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("store_name", store_name);
    fd.append("date_from", date_from);
    fd.append("date_to", date_to);
    return request<{ ok: boolean; upload_id: number; rows: number }>("/creative/upload", { method: "POST", body: fd });
  },
  creativeUploads: (store_name?: string) =>
    request<{ uploads: { id: number; store_name: string; date_from: string; date_to: string; filename: string; row_count: number; uploaded_at: string }[] }>(
      `/creative/uploads${store_name ? `?store_name=${store_name}` : ""}`
    ),
  deleteCreativeUpload: (upload_id: number) =>
    request<{ ok: boolean }>(`/creative/uploads/${upload_id}`, { method: "DELETE" }),
  creativeProducts: (store_name?: string, upload_id?: number) => {
    const params = new URLSearchParams();
    if (store_name) params.set("store_name", store_name);
    if (upload_id)  params.set("upload_id", String(upload_id));
    const qs = params.toString();
    return request<{ products: any[] }>(`/creative/products${qs ? `?${qs}` : ""}`);
  },
};
