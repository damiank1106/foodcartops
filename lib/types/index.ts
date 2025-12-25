export type UserRole = 'boss' | 'boss2' | 'worker' | 'inventory_clerk' | 'developer';

export type PaymentMethod = 'CASH' | 'GCASH' | 'CARD' | 'OTHER';

export type SyncAction = 'create' | 'update' | 'delete';

export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export type ExpenseStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DRAFT';

export type PaidFrom = 'CASH_DRAWER' | 'PERSONAL' | 'COMPANY';

export type SettlementStatus = 'DRAFT' | 'FINALIZED';

export type CommissionType = 'NONE' | 'PERCENT_OF_SALES' | 'PERCENT_OF_PROFIT';

export type LedgerEntryType = 'WAGE' | 'COMMISSION' | 'ADVANCE' | 'DEDUCTION' | 'BONUS' | 'ADJUSTMENT';

export type BossSavedItemType = 'EXCEPTION' | 'ALERT' | 'DRAFT' | 'SETTLEMENT';

export type BossSavedItemSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type BossSavedItemStatus = 'OPEN' | 'RESOLVED';

export type InventoryUnit = 'pcs' | 'kg' | 'g' | 'L' | 'mL';

export type StockLocationType = 'WAREHOUSE' | 'CART';

export type StockMovementReason = 
  | 'PURCHASE' 
  | 'ISSUE_TO_CART' 
  | 'RETURN_TO_WAREHOUSE' 
  | 'WASTE' 
  | 'ADJUSTMENT' 
  | 'TRANSFER';

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
  notes?: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface ProductCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: number;
  updated_at: number;
  business_id?: string;
  device_id?: string;
  deleted_at?: string;
  created_at_iso?: string;
  updated_at_iso?: string;
}

export interface Product {
  id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  price_cents: number;
  cost_cents?: number;
  sku?: string;
  icon_image_uri?: string;
  category?: string;
  is_active: number;
  created_at: number;
  updated_at: number;
  business_id?: string;
  device_id?: string;
  deleted_at?: string;
  created_at_iso?: string;
  updated_at_iso?: string;
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

export type ShiftStatus = 'assigned' | 'active' | 'ended';

export interface WorkerShift {
  id: string;
  worker_id: string;
  cart_id: string;
  clock_in: number;
  clock_out?: number;
  starting_cash_cents: number | null;
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

export interface Expense {
  id: string;
  shift_id: string | null;
  cart_id: string;
  submitted_by_user_id: string;
  approved_by_user_id?: string;
  status: ExpenseStatus;
  category: string;
  amount_cents: number;
  paid_from: PaidFrom;
  notes?: string;
  receipt_image_uri?: string;
  created_at: number;
  updated_at: number;
  reviewed_at?: number;
}

export interface ExpenseWithDetails extends Expense {
  submitted_by_name: string;
  approved_by_name?: string;
  cart_name: string;
}

export interface UserCartAssignment {
  id: string;
  user_id: string;
  cart_id: string;
  created_at: number;
}

export interface Settlement {
  id: string;
  shift_id: string;
  cart_id: string;
  worker_user_id: string;
  created_by_user_id: string;
  finalized_by_user_id?: string;
  computed_json?: string;
  cash_expected_cents: number;
  cash_counted_cents: number;
  cash_difference_cents: number;
  net_due_to_worker_cents: number;
  net_due_to_boss_cents: number;
  status: SettlementStatus;
  notes?: string;
  settlement_day?: string;
  daily_net_sales_cents: number;
  manager_share_cents: number;
  owner_share_cents: number;
  created_at: number;
  updated_at: number;
  finalized_at?: number;
}

export interface SettlementWithDetails extends Settlement {
  worker_name: string;
  cart_name: string;
  created_by_name: string;
  finalized_by_name?: string;
}

export interface PayrollRule {
  id: string;
  worker_user_id: string;
  base_daily_cents: number;
  commission_type: CommissionType;
  commission_rate_bps: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface WorkerLedgerEntry {
  id: string;
  worker_user_id: string;
  shift_id?: string;
  type: LedgerEntryType;
  amount_cents: number;
  notes?: string;
  created_by_user_id: string;
  created_at: number;
}

export interface WorkerLedgerEntryWithDetails extends WorkerLedgerEntry {
  worker_name: string;
  created_by_name: string;
}

export interface SettlementComputation {
  total_sales_cents: number;
  cash_sales_cents: number;
  non_cash_sales_cents: number;
  approved_expenses_cash_drawer_cents: number;
  starting_cash_cents: number;
  cash_expected_cents: number;
  base_wage_cents: number;
  commission_cents: number;
  advances_cents: number;
  deductions_cents: number;
  bonuses_cents: number;
  net_due_to_worker_cents: number;
  net_due_to_boss_cents: number;
}

export interface MonitoringStats {
  today_sales_cents: number;
  today_expenses_cents: number;
  estimated_profit_cents: number;
  unsettled_shifts_count: number;
  cash_differences_sum_cents: number;
  pending_expenses_count: number;
  voided_sales_count: number;
}

export interface MonitoringException {
  id: string;
  type: 'UNSETTLED_SHIFT' | 'CASH_DIFFERENCE' | 'PENDING_EXPENSE' | 'VOIDED_SALE';
  shift_id?: string;
  settlement_id?: string;
  expense_id?: string;
  sale_id?: string;
  description: string;
  amount_cents?: number;
  created_at: number;
}

export interface BossSavedItem {
  id: string;
  type: BossSavedItemType;
  title: string;
  notes?: string;
  severity: BossSavedItemSeverity;
  status: BossSavedItemStatus;
  linked_entity_type?: string;
  linked_entity_id?: string;
  created_by_user_id: string;
  created_at: number;
  updated_at: number;
}

export interface BossSavedItemWithDetails extends BossSavedItem {
  created_by_name: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: InventoryUnit;
  reorder_level_qty: number;
  storage_group: 'FREEZER' | 'CART';
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface StockLocation {
  id: string;
  name: string;
  type: StockLocationType;
  cart_id?: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface StockMovement {
  id: string;
  inventory_item_id: string;
  from_location_id?: string;
  to_location_id?: string;
  qty: number;
  reason: StockMovementReason;
  cost_cents?: number;
  shift_id?: string;
  actor_user_id: string;
  notes?: string;
  created_at: number;
}

export interface StockBalanceCache {
  inventory_item_id: string;
  stock_location_id: string;
  qty: number;
  updated_at: number;
}

export interface StockMovementWithDetails extends StockMovement {
  inventory_item_name: string;
  from_location_name?: string;
  to_location_name?: string;
  actor_name: string;
}

export interface StockBalance {
  inventory_item_id: string;
  inventory_item_name: string;
  unit: InventoryUnit;
  stock_location_id: string;
  stock_location_name: string;
  qty: number;
  reorder_level_qty: number;
  is_low_stock: boolean;
}

export type SavedRecordType = 'expense' | 'settlement';

export interface SavedRecord {
  id: string;
  type: SavedRecordType;
  source_id: string;
  payload_json: string;
  created_by_user_id: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  notes?: string;
}
