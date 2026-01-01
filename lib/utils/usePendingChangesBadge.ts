import { useQuery } from '@tanstack/react-query';
import { SyncOutboxRepository } from '../repositories/sync-outbox.repository';

export function usePendingChangesBadge() {
  const syncOutbox = new SyncOutboxRepository();

  const { data = 0 } = useQuery({
    queryKey: ['pending-changes-count'],
    queryFn: async () => {
      const rows = await syncOutbox.listByStatus(['pending', 'syncing', 'failed']);
      let receiptCount = 0;

      rows.forEach((row) => {
        if (row.table_name !== 'expenses') return;
        try {
          const payload = JSON.parse(row.payload_json);
          if (typeof payload?.receipt_image_uri === 'string' && !payload.receipt_image_uri.startsWith('http')) {
            receiptCount += 1;
          }
        } catch (error) {
          console.warn('[PendingChangesBadge] Failed to parse receipt payload', error);
        }
      });

      return rows.length + receiptCount;
    },
    refetchInterval: 10000,
  });

  return data;
}
