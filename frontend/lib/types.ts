export interface User {
  id: number;
  name: string;
  email?: string;
  role: "admin" | "leader" | "junior" | "member";
  store_code: string | null;
}

export interface Store {
  code: string;
  name: string;
}

export interface Period {
  id: number;
  store_code: string;
  period_start: string;
  period_end: string;
  label: string;
}

export interface TaskInfo {
  status: "todo" | "in_progress" | "done" | "na";
  assigned_to: number | null;
  assigned_name: string | null;
  notes: string | null;
}

export interface Analytics {
  impressions?: number;
  page_views?: number;
  ctr?: number;
  avg_visitors?: number;
  avg_customers?: number;
  cvr?: number;
  ctor?: number;
  video_impressions?: number;
  product_card_impressions?: number;
  live_impressions?: number;
  items_sold?: number;
  gmv?: number;
  roi?: number;
  new_creators?: number;
  new_videos?: number;
  new_live?: number;
  free_sample_cost?: number;
  content_gmv?: number;
  ads_spend?: number;
  selling_price?: string;
  cost_rmb?: number;
  profit_margin?: number;
  [key: string]: string | number | null | undefined;
}

export interface Notes {
  analysis?: string;
  action?: string;
  results?: string;
}

export interface TkExport {
  gmv?: number | null;
  orders?: number | null;
  sku_orders?: number | null;
  items_sold?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  ctr?: number | null;
  add_to_cart?: number | null;
  atc_rate?: number | null;
  ctor?: number | null;
  unique_clicks?: number | null;
  unique_impressions?: number | null;
  unique_ctr?: number | null;
  unique_atc_users?: number | null;
  unique_atc_rate?: number | null;
  unique_ctor?: number | null;
  refunds?: number | null;
  items_refunded?: number | null;
  refund_customers?: number | null;
  listing_status?: string | null;
  voc_diagnosis?: string | null;
  gmv_range?: string | null;
  seller_live_gmv?: number | null;
  seller_video_gmv?: number | null;
  creator_gmv?: number | null;
  creator_live_gmv?: number | null;
  affiliate_video_gmv?: number | null;
  product_card_gmv?: number | null;
  shop_tab_gmv?: number | null;
  shop_tab_impressions?: number | null;
  shop_tab_clicks?: number | null;
  shop_tab_unique_clicks?: number | null;
  shop_tab_customers?: number | null;
  shop_tab_ctr?: number | null;
  shop_tab_ctor?: number | null;
  shop_tab_items_sold?: number | null;
  aov?: number | null;
  est_customers?: number | null;
  gmv_with_tax?: number | null;
  tax?: number | null;
  gmv_with_cofunding?: number | null;
  shipping_fees?: number | null;
  [key: string]: string | number | null | undefined;
}

export interface Product {
  product_no: string;
  image_url: string | null;
  warehouse_name: string | null;
  sku: string | null;
  status: string | null;
  stores_available: string | null;
  tasks: Record<string, TaskInfo>;
  analytics: Analytics;
  notes: Notes;
  tk_export?: TkExport | null;
}

export interface RRProduct {
  msku: string;
  product_no: string;
  warehouse_name: string | null;
  image_url: string | null;
  store_code: string;
  order_qty: number;
  return_qty: number;
  rr_rate: number;
  all_stores: Record<string, { order_qty: number; return_qty: number }>;
}

export interface RRUpload {
  id: number;
  upload_type: "orders" | "returns";
  store_code: string;
  filename: string | null;
  period_label: string | null;
  row_count: number;
  imported_at: string;
}

export interface PricingStoreData {
  price: number;
  price_max?: number | null;
  profit_with_ads: number | null;
  profit_without_ads: number | null;
  profit_with_ads_max?: number | null;
  profit_without_ads_max?: number | null;
}

export interface PricingProduct {
  product_no: string;
  warehouse_name: string | null;
  image_url: string | null;
  cost_rmb: number;
  stores: Record<string, PricingStoreData>;
}

// ─── Product Manager ──────────────────────────────────────────────────────────
export type PerfTier = "high" | "mid" | "growing" | "low";

export interface PMProduct {
  product_no: string;
  warehouse_name: string | null;
  image_url: string | null;
  sku: string | null;
  status: string | null;
  stores_available: string | null;
  cost: number | null;
  tt1_price: number | null;
  tt2_price: number | null;
  tt3_price: number | null;
  tt4_price: number | null;
  total_orders: number;
  total_gmv: number;
  latest_period: string | null;
  total_stock: number;
  rr_rate: number | null;
  performance: PerfTier;
}

export interface PMMonthly {
  period_start: string;
  period_end: string;
  orders: number;
  gmv: number;
  impressions: number;
  clicks: number;
  items_sold: number;
  refunds: number;
  ctr: number;
  by_store: Record<string, { orders: number; gmv: number; impressions: number; clicks: number; ctr: number }>;
}

export interface PMDetail {
  product: { product_no: string; warehouse_name: string | null; image_url: string | null; sku: string | null; status: string | null; cost: number | null; stores_available: string | null };
  monthly: PMMonthly[];
  stock: { total: number; groups: { sheet_name: string; variants: { sku: string; warehouse_name: string | null; stock: number; availability: string | null }[]; total: number }[] };
  pricing: Record<string, { price: number; price_max?: number; profit_with_ads: number | null; profit_without_ads: number | null; profit_with_ads_max?: number | null; profit_without_ads_max?: number | null }>;
  rr: { overall: number | null; by_store: Record<string, { order_qty: number; return_qty: number; rr_rate: number }> };
  performance: PerfTier;
  latest_orders: number;
}

export interface BoardData {
  period: Period;
  products: Product[];
  all_store_products: Product[];
  users: User[];
  task_types: string[];
  task_labels: Record<string, string>;
}
