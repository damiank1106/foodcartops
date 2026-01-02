import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns';
import { SaleRepository } from '../repositories/sale.repository';
import { ExpenseRepository } from '../repositories/expense.repository';
import { OtherExpenseRepository } from '../repositories/other-expense.repository';
import { SettlementRepository } from '../repositories/settlement.repository';
import { DailySummaryRepository, DailyProductsSoldItem } from '../repositories/daily-summary.repository';
import { DailyOverrideRepository } from '../repositories/daily-override.repository';

export type PeriodType = 'day' | 'week' | 'month' | 'year';

export interface CalendarAnalytics {
  period_type: PeriodType;
  anchor_date: Date;
  date_range: {
    start: Date;
    end: Date;
    label: string;
  };
  totals: {
    sales_cents: number;
    expenses_cents: number;
    other_expenses_cents: number;
    net_sales_cents: number;
    manager_share_cents: number;
    owner_share_cents: number;
  };
  revenue_by_payment: {
    method: 'CASH' | 'GCASH' | 'CARD';
    amount_cents: number;
  }[];
  products_sold: DailyProductsSoldItem[];
  day_reset: boolean;
  breakdown: {
    label: string;
    date: Date;
    sales_cents: number;
    expenses_cents: number;
    other_expenses_cents: number;
  }[];
  other_expenses: {
    id: string;
    date: string;
    name: string;
    amount_cents: number;
    notes?: string;
  }[];
  settlements: {
    id: string;
    shift_id: string;
    worker_name: string;
    cart_name: string;
    status: string;
    total_cents: number;
    created_at: number;
  }[];
}

export class CalendarAnalyticsService {
  private saleRepo: SaleRepository;
  private expenseRepo: ExpenseRepository;
  private otherExpenseRepo: OtherExpenseRepository;
  private settlementRepo: SettlementRepository;
  private dailySummaryRepo: DailySummaryRepository;
  private dailyOverrideRepo: DailyOverrideRepository;

  constructor() {
    this.saleRepo = new SaleRepository();
    this.expenseRepo = new ExpenseRepository();
    this.otherExpenseRepo = new OtherExpenseRepository();
    this.settlementRepo = new SettlementRepository();
    this.dailySummaryRepo = new DailySummaryRepository();
    this.dailyOverrideRepo = new DailyOverrideRepository();
  }

  async getAnalytics(periodType: PeriodType, anchorDate: Date): Promise<CalendarAnalytics> {
    const dateRange = this.getDateRange(periodType, anchorDate);
    const dateKey = format(dateRange.start, 'yyyy-MM-dd');

    const [sales, expenses, otherExpenses, allSettlements, dailyProductsSold, dailyOverride] = await Promise.all([
      this.saleRepo.findAll({
        start_date: dateRange.start,
        end_date: dateRange.end,
      }),
      this.expenseRepo.findAll(),
      this.otherExpenseRepo.listByRange(
        format(dateRange.start, 'yyyy-MM-dd'),
        format(dateRange.end, 'yyyy-MM-dd')
      ),
      this.settlementRepo.getAllSettlements(500),
      periodType === 'day' ? this.dailySummaryRepo.getDailyProductsSold(dateKey) : Promise.resolve([]),
      periodType === 'day' ? this.dailyOverrideRepo.getOverride(dateKey) : Promise.resolve(null),
    ]);

    const settlements = allSettlements.filter((s: any) => {
      const settlementDate = s.created_at;
      return settlementDate >= dateRange.start.getTime() && settlementDate <= dateRange.end.getTime();
    });

    console.log(`[CalendarAnalytics] Found ${settlements.length} settlements in date range ${format(dateRange.start, 'yyyy-MM-dd')} to ${format(dateRange.end, 'yyyy-MM-dd')}`);

    const filteredExpenses = expenses.filter(
      (e) =>
        e.created_at >= dateRange.start.getTime() &&
        e.created_at <= dateRange.end.getTime() &&
        e.status === 'APPROVED'
    );

    if (periodType === 'day') {
      await this.dailySummaryRepo.upsertProductsSoldSnapshot(dateKey, dailyProductsSold);
    }

    const sales_cents = sales.reduce((sum, s) => sum + s.total_cents, 0);
    const expenses_cents = filteredExpenses.reduce((sum, e) => sum + e.amount_cents, 0);
    const other_expenses_cents = otherExpenses.reduce((sum, oe) => sum + oe.amount_cents, 0);
    const net_sales_cents = sales_cents - expenses_cents - other_expenses_cents;
    const manager_share_cents = Math.floor(net_sales_cents * 0.7);
    const owner_share_cents = Math.floor(net_sales_cents * 0.3);

    const revenue_by_payment: { method: 'CASH' | 'GCASH' | 'CARD'; amount_cents: number }[] = [
      { method: 'CASH', amount_cents: 0 },
      { method: 'GCASH', amount_cents: 0 },
      { method: 'CARD', amount_cents: 0 },
    ];

    for (const sale of sales) {
      for (const payment of sale.payments || []) {
        const entry = revenue_by_payment.find((r) => r.method === payment.method);
        if (entry) {
          entry.amount_cents += payment.amount_cents;
        }
      }
    }

    const breakdown = this.generateBreakdown(periodType, dateRange, sales, filteredExpenses, otherExpenses);
    const isDayReset = periodType === 'day' && dailyOverride?.is_reset === 1;

    const productsSold = periodType === 'day' ? dailyProductsSold : [];

    if (isDayReset) {
      const zeroedRevenue = revenue_by_payment.map((entry) => ({
        ...entry,
        amount_cents: 0,
      }));
      const zeroedBreakdown = breakdown.map((entry) => ({
        ...entry,
        sales_cents: 0,
        expenses_cents: 0,
        other_expenses_cents: 0,
      }));

      return {
        period_type: periodType,
        anchor_date: anchorDate,
        date_range: dateRange,
        totals: {
          sales_cents: 0,
          expenses_cents: 0,
          other_expenses_cents: 0,
          net_sales_cents: 0,
          manager_share_cents: 0,
          owner_share_cents: 0,
        },
        revenue_by_payment: zeroedRevenue,
        products_sold: [],
        day_reset: true,
        breakdown: zeroedBreakdown,
        other_expenses: [],
        settlements: settlements.map((s: any) => ({
          id: s.id,
          shift_id: s.shift_id,
          worker_name: s.worker_name || 'Unknown',
          cart_name: s.cart_name || 'Unknown',
          status: s.status,
          total_cents: s.total_cents || 0,
          created_at: s.created_at,
        })),
      };
    }

    return {
      period_type: periodType,
      anchor_date: anchorDate,
      date_range: dateRange,
      totals: {
        sales_cents,
        expenses_cents,
        other_expenses_cents,
        net_sales_cents,
        manager_share_cents,
        owner_share_cents,
      },
      revenue_by_payment,
      products_sold: productsSold,
      day_reset: false,
      breakdown,
      other_expenses: otherExpenses.map((oe) => ({
        id: oe.id,
        date: oe.date,
        name: oe.name,
        amount_cents: oe.amount_cents,
        notes: oe.notes,
      })),
      settlements: settlements.map((s: any) => ({
        id: s.id,
        shift_id: s.shift_id,
        worker_name: s.worker_name || 'Unknown',
        cart_name: s.cart_name || 'Unknown',
        status: s.status,
        total_cents: s.total_cents || 0,
        created_at: s.created_at,
      })),
    };
  }

  private getDateRange(
    periodType: PeriodType,
    anchorDate: Date
  ): { start: Date; end: Date; label: string } {
    switch (periodType) {
      case 'day':
        return {
          start: startOfDay(anchorDate),
          end: endOfDay(anchorDate),
          label: format(anchorDate, 'MMM d, yyyy'),
        };
      case 'week': {
        const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
        const end = endOfWeek(anchorDate, { weekStartsOn: 1 });
        return {
          start,
          end,
          label: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
        };
      }
      case 'month':
        return {
          start: startOfMonth(anchorDate),
          end: endOfMonth(anchorDate),
          label: format(anchorDate, 'MMMM yyyy'),
        };
      case 'year':
        return {
          start: startOfYear(anchorDate),
          end: endOfYear(anchorDate),
          label: format(anchorDate, 'yyyy'),
        };
    }
  }

  private generateBreakdown(
    periodType: PeriodType,
    dateRange: { start: Date; end: Date },
    sales: any[],
    expenses: any[],
    otherExpenses: any[]
  ): {
    label: string;
    date: Date;
    sales_cents: number;
    expenses_cents: number;
    other_expenses_cents: number;
  }[] {
    let intervals: Date[];

    switch (periodType) {
      case 'day':
        intervals = [dateRange.start];
        break;
      case 'week':
        intervals = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
        break;
      case 'month':
        intervals = eachWeekOfInterval({ start: dateRange.start, end: dateRange.end }, { weekStartsOn: 1 });
        break;
      case 'year':
        intervals = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });
        break;
    }

    return intervals.map((date) => {
      let rangeStart: Date;
      let rangeEnd: Date;
      let label: string;

      if (periodType === 'day') {
        rangeStart = startOfDay(date);
        rangeEnd = endOfDay(date);
        label = format(date, 'MMM d');
      } else if (periodType === 'week') {
        rangeStart = startOfDay(date);
        rangeEnd = endOfDay(date);
        label = format(date, 'EEE d');
      } else if (periodType === 'month') {
        rangeStart = startOfWeek(date, { weekStartsOn: 1 });
        rangeEnd = endOfWeek(date, { weekStartsOn: 1 });
        label = `Week ${format(date, 'w')}`;
      } else {
        rangeStart = startOfMonth(date);
        rangeEnd = endOfMonth(date);
        label = format(date, 'MMM');
      }

      const periodSales = sales.filter(
        (s) => s.created_at >= rangeStart.getTime() && s.created_at <= rangeEnd.getTime()
      );
      const periodExpenses = expenses.filter(
        (e) => e.created_at >= rangeStart.getTime() && e.created_at <= rangeEnd.getTime()
      );
      const periodOtherExpenses = otherExpenses.filter((oe) => {
        const oeDate = new Date(oe.date);
        return oeDate >= rangeStart && oeDate <= rangeEnd;
      });

      const sales_cents = periodSales.reduce((sum, s) => sum + s.total_cents, 0);
      const expenses_cents = periodExpenses.reduce((sum, e) => sum + e.amount_cents, 0);
      const other_expenses_cents = periodOtherExpenses.reduce((sum, oe) => sum + oe.amount_cents, 0);

      return {
        label,
        date,
        sales_cents,
        expenses_cents,
        other_expenses_cents,
      };
    });
  }

  async getDatesWithEntries(year: number, month: number): Promise<Set<string>> {
    const startDate = new Date(year, month, 1);
    const endDate = endOfMonth(startDate);

    const [sales, expenses, otherExpenses, allSettlements] = await Promise.all([
      this.saleRepo.findAll({
        start_date: startOfDay(startDate),
        end_date: endOfDay(endDate),
      }),
      this.expenseRepo.findAll(),
      this.otherExpenseRepo.listByRange(
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd')
      ),
      this.settlementRepo.getAllSettlements(1000),
    ]);

    const datesSet = new Set<string>();

    for (const sale of sales) {
      const dateStr = format(new Date(sale.created_at), 'yyyy-MM-dd');
      datesSet.add(dateStr);
    }

    for (const expense of expenses) {
      if (expense.status === 'APPROVED') {
        const expenseDate = new Date(expense.created_at);
        if (expenseDate >= startDate && expenseDate <= endDate) {
          const dateStr = format(expenseDate, 'yyyy-MM-dd');
          datesSet.add(dateStr);
        }
      }
    }

    for (const oe of otherExpenses) {
      datesSet.add(oe.date);
    }

    for (const settlement of allSettlements) {
      const settlementDate = new Date((settlement as any).created_at);
      if (settlementDate >= startDate && settlementDate <= endDate) {
        const dateStr = format(settlementDate, 'yyyy-MM-dd');
        datesSet.add(dateStr);
      }
    }

    return datesSet;
  }
}
