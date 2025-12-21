import { WorkerShift, PayrollRule, SettlementComputation } from '../types';
import { format } from 'date-fns';
import { SaleRepository } from '../repositories/sale.repository';

export class SettlementService {
  static async computeSettlement(
    shift: WorkerShift,
    totalSalesCents: number,
    cashSalesCents: number,
    nonCashSalesCents: number,
    approvedExpensesCashDrawerCents: number,
    payrollRule: PayrollRule | null,
    advancesCents: number = 0,
    deductionsCents: number = 0,
    bonusesCents: number = 0
  ): Promise<SettlementComputation> {
    const startingCashCents = shift.starting_cash_cents || 0;
    const cashExpectedCents = startingCashCents + cashSalesCents - approvedExpensesCashDrawerCents;

    let baseWageCents = 0;
    let commissionCents = 0;

    if (payrollRule && payrollRule.is_active) {
      baseWageCents = payrollRule.base_daily_cents;

      if (payrollRule.commission_type === 'PERCENT_OF_SALES') {
        commissionCents = Math.floor((totalSalesCents * payrollRule.commission_rate_bps) / 10000);
      } else if (payrollRule.commission_type === 'PERCENT_OF_PROFIT') {
        const profitCents = totalSalesCents - approvedExpensesCashDrawerCents;
        commissionCents = Math.floor((profitCents * payrollRule.commission_rate_bps) / 10000);
      }
    }

    const netDueToWorkerCents = baseWageCents + commissionCents - advancesCents - deductionsCents + bonusesCents;
    const netDueToBossCents = totalSalesCents - approvedExpensesCashDrawerCents - netDueToWorkerCents;

    return {
      total_sales_cents: totalSalesCents,
      cash_sales_cents: cashSalesCents,
      non_cash_sales_cents: nonCashSalesCents,
      approved_expenses_cash_drawer_cents: approvedExpensesCashDrawerCents,
      starting_cash_cents: startingCashCents,
      cash_expected_cents: cashExpectedCents,
      base_wage_cents: baseWageCents,
      commission_cents: commissionCents,
      advances_cents: advancesCents,
      deductions_cents: deductionsCents,
      bonuses_cents: bonusesCents,
      net_due_to_worker_cents: netDueToWorkerCents,
      net_due_to_boss_cents: netDueToBossCents,
    };
  }

  static computeCashDifference(cashExpectedCents: number, cashCountedCents: number): number {
    return cashCountedCents - cashExpectedCents;
  }

  static async computeDailyNetSales(cartId: string, settlementDay: string): Promise<number> {
    const saleRepo = new SaleRepository();
    const dayStart = new Date(settlementDay + 'T00:00:00');
    const dayEnd = new Date(settlementDay + 'T23:59:59');

    const sales = await saleRepo.findAll({
      cart_id: cartId,
      start_date: dayStart,
      end_date: dayEnd,
      include_voided: false,
    });

    const dailyNetSalesCents = sales.reduce((sum, sale) => {
      return sum + sale.total_cents;
    }, 0);

    console.log(`[SettlementService] Daily net sales for cart ${cartId} on ${settlementDay}: ₱${(dailyNetSalesCents / 100).toFixed(2)}`);

    return dailyNetSalesCents;
  }

  static computeNetSalesSplit(dailyNetSalesCents: number, managerBps: number = 7000, ownerBps: number = 3000): {
    managerShareCents: number;
    ownerShareCents: number;
  } {
    const managerShareCents = Math.floor((dailyNetSalesCents * managerBps) / 10000);
    const ownerShareCents = dailyNetSalesCents - managerShareCents;

    console.log(`[SettlementService] Split ${(dailyNetSalesCents / 100).toFixed(2)}: Manager ${(managerShareCents / 100).toFixed(2)} (${managerBps/100}%), Owner ${(ownerShareCents / 100).toFixed(2)} (${ownerBps/100}%)`);

    return {
      managerShareCents,
      ownerShareCents,
    };
  }

  static getSettlementDay(shift: WorkerShift): string {
    const clockOut = shift.clock_out || Date.now();
    return format(clockOut, 'yyyy-MM-dd');
  }
}
