import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/auth.context';
import { ExpenseRepository } from '../repositories/expense.repository';
import { UserPreferencesRepository } from '../repositories/user-preferences.repository';

export function useExpensesBadge() {
  const { user } = useAuth();
  const expenseRepo = new ExpenseRepository();
  const prefsRepo = new UserPreferencesRepository();

  const { data: badgeCount = 0 } = useQuery({
    queryKey: ['expenses-badge-count', user?.id, user],
    queryFn: async () => {
      if (!user) return 0;

      const prefs = await prefsRepo.getOrCreate(user.id);
      const lastSeenAt = prefs.last_seen_expenses_at;

      const allExpenses = await expenseRepo.findAll();
      
      const unseenCount = allExpenses.filter(expense => {
        if (expense.is_deleted || expense.deleted_at) return false;
        
        if (!lastSeenAt) {
          return expense.status === 'SUBMITTED';
        }
        
        const expenseUpdatedAt = expense.updated_at_iso || new Date(expense.updated_at).toISOString();
        return expenseUpdatedAt > lastSeenAt && expense.status === 'SUBMITTED';
      }).length;

      return unseenCount;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  return badgeCount;
}
