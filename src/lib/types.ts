export type LogKind = "system" | "reply" | "note";

export interface LogEntry {
  at: string;
  by: string;
  kind: LogKind;
  text: string;
}

export interface Summary {
  issue?: string;
  done?: string;
  next?: string;
  waitingOn?: string;
  sentiment?: string;
  suggestType?: string;
  msgCount?: number;
  updatedAt?: string;
  by?: string;
}

export interface Ticket {
  id: string;
  client: string;
  orderName: string;
  orderId: string;
  orderDate: string;
  customerName: string;
  customerEmail: string;
  total: string;
  currency: string;
  country: string;
  tracking: string;
  trackingUrl: string;
  carrier: string;
  supplier: string;
  type: string;
  priority: string;
  channel: string;
  summary: Summary | null;
  status: string;
  shipStatus: string;
  dispute: string;
  disputeReason: string;
  assignee: string;
  /** Free-text agent name (works without team accounts). Optional: older tickets don't have it. */
  agent?: string;
  createdAt: string;
  createdBy: string;
  firstResponseAt: string;
  resolvedAt: string;
  resolution: string;
  refundAmount: number;
  csat: number;
  qa: Record<string, boolean>;
  qaBy: string;
  log: LogEntry[];
  updatedAt?: string;
}

export interface Order {
  client: string;
  orderName: string;
  orderId?: string;
  orderDate?: string;
  customerName?: string;
  customerEmail?: string;
  country?: string;
  total?: string;
  currency?: string;
  financial?: string;
  fulfillment?: string;
  tracking?: string;
  carrier?: string;
  trackingUrl?: string;
  supplier?: string;
  shipRaw?: string;
  shipStatus?: string;
  shipAt?: string;
  statusAt?: string;
  updatedAt?: string;
  lastEvent?: string;
  source?: string;
}

export interface Client {
  shop: string;
  name: string;
  frtHours?: number | "";
  resHours?: number | "";
  lastEmailAt?: string;
  createdAt?: string;
}

export interface Settings {
  frtHours: number;
  resHours: number;
  currency: string;
  lookbackDays: number;
  retentionDays: number;
}

export interface SyncResult {
  messages: number;
  orders: number;
  tickets: number;
}

export interface SyncState {
  lastSyncAt?: string;
  by?: string;
  processed?: string[];
  /** Gmail threadId -> historyId seen at the last sync, to skip unchanged threads. */
  threads?: Record<string, string>;
  lastResult?: SyncResult;
  error?: string;
  runningSince?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  frtHours: 24,
  resHours: 72,
  currency: "USD",
  lookbackDays: 14,
  retentionDays: 90,
};
