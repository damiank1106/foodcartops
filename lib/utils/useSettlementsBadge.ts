import { useQuery } from '@tanstack/react-query';
import { NotificationRepository } from '@/lib/repositories/notification.repository';
import { SettlementRepository } from '@/lib/repositories/settlement.repository';

export function useSettlementsBadge() {
  const { data: unseenNotifications = 0 } = useQuery({
    queryKey: ['settlement-badge-count'],
    queryFn: async () => {
      const notifRepo = new NotificationRepository();
      return await notifRepo.getUnseenCount('settlement_incoming');
    },
    refetchInterval: 5000,
  });

  const { data: unsettledShiftsCount = 0 } = useQuery({
    queryKey: ['unsettled-shifts-count'],
    queryFn: async () => {
      const settlementRepo = new SettlementRepository();
      const shifts = await settlementRepo.getAllUnsettledShifts();
      return shifts.length;
    },
    refetchInterval: 5000,
  });

  const { data: cashDifferencesCount = 0 } = useQuery({
    queryKey: ['cash-differences-count'],
    queryFn: async () => {
      const settlementRepo = new SettlementRepository();
      const differences = await settlementRepo.getCashDifferences();
      return differences.length;
    },
    refetchInterval: 5000,
  });

  return unseenNotifications + unsettledShiftsCount + cashDifferencesCount;
}
