import { WorkerShift, PayrollRule, SettlementComputation } from '../types';

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
}
