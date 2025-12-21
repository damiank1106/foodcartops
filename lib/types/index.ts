export type UserRole = 'boss' | 'worker';

export type PaymentMethod = 'CASH' | 'GCASH' | 'CARD' | 'OTHER';

export type SyncAction = 'create' | 'update' | 'delete';

export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  pin?: string;
  password_hash?: string;
  email?: string;
  created_at: number;
  updated_at: number;
  is_active: number;
}

export interface Cart {
  id: string;
  name: string;
  location?: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  price_cents: number;
  category?: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface Sale {
  id: string;
  cart_id: string;
  worker_id: string;
  shift_id?: string;
  total_amount: number;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  notes?: string;
  receipt_photo?: string;
  voided_at?: number;
  voided_by?: string;
  edited_at?: number;
  created_at: number;
  synced_at?: number;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  unit_price_cents: number;
  total_price: number;
  line_total_cents: number;
  created_at: number;
}

export interface Payment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount_cents: number;
  created_at: number;
}

export type ShiftStatus = 'active' | 'ended';

export interface WorkerShift {
  id: string;
  worker_id: string;
  cart_id: string;
  clock_in: number;
  clock_out?: number;
  starting_cash_cents: number;
  expected_cash_cents: number;
  notes?: string;
  status: ShiftStatus;
  created_at: number;
  updated_at: number;
  synced_at?: number;
}

export interface ShiftEvent {
  id: string;
  shift_id: string;
  type: string;
  payload_json?: string;
  created_at: number;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_data?: string;
  new_data?: string;
  created_at: number;
  synced_at?: number;
}

export interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action: SyncAction;
  payload: string;
  attempts: number;
  last_attempt?: number;
  status: SyncStatus;
  error?: string;
  created_at: number;
}

export interface SaleWithItems extends Sale {
  items: (SaleItem & { product_name: string })[];
  payments: Payment[];
  worker_name: string;
  cart_name: string;
}

export interface DashboardStats {
  today_sales: number;
  today_revenue: number;
  active_workers: number;
  total_transactions: number;
  revenue_by_cart: { cart_name: string; revenue: number }[];
  revenue_by_payment: { payment_method: PaymentMethod; revenue: number }[];
}

export interface AppSetting {
  key: string;
  value_json: string;
  updated_at: number;
}
