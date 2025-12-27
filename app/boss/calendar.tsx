import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { CalendarAnalyticsService, PeriodType } from '@/lib/services/calendar-analytics.service';
import { OtherExpenseRepository } from '@/lib/repositories/other-expense.repository';
import { Calendar as CalendarIcon, Plus, X, Trash2, ChevronLeft, ChevronRight, Download, FileText, BarChart3 } from 'lucide-react-native';
import { format, addDays, addWeeks, addMonths, addYears, subDays, subWeeks, subMonths, subYears } from 'date-fns';
import * as Print from 'expo-print';
import * as MailComposer from 'expo-mail-composer';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Svg, Circle, Path } from 'react-native-svg';

type SubTab = 'numbers' | 'export' | 'charts';

interface CalendarScreenProps {
  selectedDate?: Date;
}

export default function CalendarScreen({ selectedDate }: CalendarScreenProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [periodType, setPeriodType] = useState<PeriodType>('day');
  const [anchorDate, setAnchorDate] = useState<Date>(selectedDate || new Date());

  React.useEffect(() => {
    if (selectedDate) {
      setAnchorDate(selectedDate);
    }
  }, [selectedDate]);
  const [selectedSubTab, setSelectedSubTab] = useState<SubTab>('numbers');
  const [otherExpenseModalVisible, setOtherExpenseModalVisible] = useState(false);
  const [editingOtherExpense, setEditingOtherExpense] = useState<any>(null);
  const [otherExpenseName, setOtherExpenseName] = useState('');
  const [otherExpenseAmount, setOtherExpenseAmount] = useState('');
  const [otherExpenseNotes, setOtherExpenseNotes] = useState('');
  const [otherExpenseDate, setOtherExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [progressSteps, setProgressSteps] = useState<{ label: string; state: 'pending' | 'done' | 'error' }[]>([]);
  const [exportStatus, setExportStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');

  const analyticsService = new CalendarAnalyticsService();
  const otherExpenseRepo = new OtherExpenseRepository();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['calendar-analytics', periodType, format(anchorDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      return analyticsService.getAnalytics(periodType, anchorDate);
    },
  });

  const createOtherExpenseMutation = useMutation({
    mutationFn: async (data: {
      date: string;
      name: string;
      amount_cents: number;
      notes?: string;
    }) => {
      if (!user?.id) throw new Error('No user');
      return otherExpenseRepo.create({
        ...data,
        created_by_user_id: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-analytics'] });
      setOtherExpenseModalVisible(false);
      resetOtherExpenseForm();
      Alert.alert('Success', 'Other expense created');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to create: ${error}`);
    },
  });

  const updateOtherExpenseMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      date: string;
      name: string;
      amount_cents: number;
      notes?: string;
    }) => {
      if (!user?.id) throw new Error('No user');
      return otherExpenseRepo.update({
        ...data,
        updated_by_user_id: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-analytics'] });
      setOtherExpenseModalVisible(false);
      resetOtherExpenseForm();
      Alert.alert('Success', 'Other expense updated');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to update: ${error}`);
    },
  });

  const deleteOtherExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('No user');
      return otherExpenseRepo.softDelete(id, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-analytics'] });
      Alert.alert('Success', 'Other expense deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete: ${error}`);
    },
  });

  const deleteDaySalesMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      if (!user?.id) throw new Error('No user');
      const dateObj = new Date(dateStr);
      const { SaleRepository } = await import('@/lib/repositories/sale.repository');
      const saleRepo = new SaleRepository();
      const deletedCount = await saleRepo.deleteSalesForDay(dateObj);
      
      const { AuditRepository } = await import('@/lib/repositories/audit.repository');
      const auditRepo = new AuditRepository();
      await auditRepo.log({
        user_id: user.id,
        entity_type: 'sale',
        entity_id: `calendar_day_sales_reset_${dateStr}`,
        action: 'calendar_day_sales_reset',
        new_data: { date: dateStr, sales_deleted_count: deletedCount, role: user.role },
      });

      return { deletedCount, dateStr };
    },
    onSuccess: ({ deletedCount, dateStr }) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['boss-monitoring-stats'] });
      
      const today = format(new Date(), 'yyyy-MM-dd');
      if (dateStr === today) {
        console.log('[Calendar] Today data reset - Overview will refresh');
      }
      
      Alert.alert('Success', `Sales reset for this day (${deletedCount} sale${deletedCount !== 1 ? 's' : ''} deleted)`);
    },
    onError: (error: any) => {
      console.error('[Calendar] Delete error:', error);
      Alert.alert('Error', `Failed to delete: ${error?.message || error}`);
    },
  });

  const resetOtherExpenseForm = () => {
    setEditingOtherExpense(null);
    setOtherExpenseName('');
    setOtherExpenseAmount('');
    setOtherExpenseNotes('');
    setOtherExpenseDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const openOtherExpenseModal = (expense?: any) => {
    if (expense) {
      setEditingOtherExpense(expense);
      setOtherExpenseName(expense.name);
      setOtherExpenseAmount((expense.amount_cents / 100).toFixed(2));
      setOtherExpenseNotes(expense.notes || '');
      setOtherExpenseDate(expense.date);
    } else {
      resetOtherExpenseForm();
    }
    setOtherExpenseModalVisible(true);
  };

  const handleSaveOtherExpense = () => {
    if (!otherExpenseName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    const amount = parseFloat(otherExpenseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Amount must be greater than 0');
      return;
    }

    const amount_cents = Math.round(amount * 100);

    if (editingOtherExpense) {
      updateOtherExpenseMutation.mutate({
        id: editingOtherExpense.id,
        date: otherExpenseDate,
        name: otherExpenseName,
        amount_cents,
        notes: otherExpenseNotes || undefined,
      });
    } else {
      createOtherExpenseMutation.mutate({
        date: otherExpenseDate,
        name: otherExpenseName,
        amount_cents,
        notes: otherExpenseNotes || undefined,
      });
    }
  };

  const handleDeleteOtherExpense = (id: string, name: string) => {
    Alert.alert('Delete Other Expense', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteOtherExpenseMutation.mutate(id),
      },
    ]);
  };

  const handleDeleteDaySales = () => {
    if (!analytics) return;
    if (deleteDaySalesMutation.isPending) return;

    const dateStr = format(analytics.date_range.start, 'yyyy-MM-dd');
    const formattedDate = format(analytics.date_range.start, 'MMM d, yyyy');
    const today = format(new Date(), 'yyyy-MM-dd');
    const isDeletingToday = dateStr === today;

    Alert.alert(
      'Reset All Sales',
      `Reset all sales for ${formattedDate}? This will delete all sales records, sale items, and payments for this day.${isDeletingToday ? ' Today\'s Overview will also be reset.' : ''} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            console.log('[Calendar] Deleting sales for:', dateStr);
            deleteDaySalesMutation.mutate(dateStr);
          },
        },
      ]
    );
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      switch (periodType) {
        case 'day':
          setAnchorDate(subDays(anchorDate, 1));
          break;
        case 'week':
          setAnchorDate(subWeeks(anchorDate, 1));
          break;
        case 'month':
          setAnchorDate(subMonths(anchorDate, 1));
          break;
        case 'year':
          setAnchorDate(subYears(anchorDate, 1));
          break;
      }
    } else {
      switch (periodType) {
        case 'day':
          setAnchorDate(addDays(anchorDate, 1));
          break;
        case 'week':
          setAnchorDate(addWeeks(anchorDate, 1));
          break;
        case 'month':
          setAnchorDate(addMonths(anchorDate, 1));
          break;
        case 'year':
          setAnchorDate(addYears(anchorDate, 1));
          break;
      }
    }
  };

  const updateProgressStep = (index: number, state: 'pending' | 'done' | 'error') => {
    setProgressSteps((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], state };
      }
      return updated;
    });
  };

  const handleExportCSV = async (type: 'sales' | 'expenses' | 'settlements' | 'revenues' | 'other_expenses' | 'split_70_30' | 'export_all') => {
    if (!analytics) return;

    if (type === 'export_all') {
      await handleExportAllCSV();
      return;
    }

    let csvContent = '';
    let filename = '';

    switch (type) {
      case 'sales':
        csvContent = 'Date,Total Sales\n';
        csvContent += `${analytics.date_range.label},₱${(analytics.totals.sales_cents / 100).toFixed(2)}\n`;
        filename = `sales_${format(anchorDate, 'yyyy-MM-dd')}.csv`;
        break;
      case 'expenses':
        csvContent = 'Date,Total Expenses\n';
        csvContent += `${analytics.date_range.label},₱${(analytics.totals.expenses_cents / 100).toFixed(2)}\n`;
        filename = `expenses_${format(anchorDate, 'yyyy-MM-dd')}.csv`;
        break;
      case 'revenues':
        csvContent = 'Payment Method,Amount\n';
        analytics.revenue_by_payment.forEach((r) => {
          csvContent += `${r.method},₱${(r.amount_cents / 100).toFixed(2)}\n`;
        });
        filename = `revenues_${format(anchorDate, 'yyyy-MM-dd')}.csv`;
        break;
      case 'other_expenses':
        csvContent = 'Date,Name,Amount,Notes\n';
        analytics.other_expenses.forEach((oe) => {
          csvContent += `${oe.date},"${oe.name}",₱${(oe.amount_cents / 100).toFixed(2)},"${oe.notes || ''}"\n`;
        });
        filename = `other_expenses_${format(anchorDate, 'yyyy-MM-dd')}.csv`;
        break;
      case 'split_70_30':
        csvContent = 'Period,Net Sales,Operation Manager (70%),General Manager (30%),Cash,GCash,Card\n';
        csvContent += `${analytics.date_range.label},₱${(analytics.totals.net_sales_cents / 100).toFixed(2)},₱${(analytics.totals.manager_share_cents / 100).toFixed(2)},₱${(analytics.totals.owner_share_cents / 100).toFixed(2)}`;
        analytics.revenue_by_payment.forEach((r) => {
          csvContent += `,₱${(r.amount_cents / 100).toFixed(2)}`;
        });
        csvContent += '\n';
        filename = `split_70_30_${format(anchorDate, 'yyyy-MM-dd')}.csv`;
        break;
    }

    try {
      const file = new File(Paths.cache, filename);
      file.write(csvContent);

      const canEmail = await MailComposer.isAvailableAsync();
      if (canEmail) {
        await MailComposer.composeAsync({
          subject: `${type.toUpperCase()} Export - ${analytics.date_range.label}`,
          body: `Please find attached the ${type} export.`,
          attachments: [file.uri],
        });
      } else {
        if (Platform.OS !== 'web') {
          await Sharing.shareAsync(file.uri);
        } else {
          Alert.alert('Export Ready', 'CSV file created in cache directory');
        }
      }
    } catch (error) {
      Alert.alert('Error', `Failed to export: ${error}`);
    }
  };

  const handleExportAllCSV = async () => {
    if (!analytics || !user?.id) return;

    const steps = [
      { label: 'Preparing date range…', state: 'pending' as const },
      { label: 'Loading sales…', state: 'pending' as const },
      { label: 'Loading expenses…', state: 'pending' as const },
      { label: 'Loading other expenses…', state: 'pending' as const },
      { label: 'Calculating 70/30 split…', state: 'pending' as const },
      { label: 'Generating CSV…', state: 'pending' as const },
      { label: 'Writing file…', state: 'pending' as const },
      { label: 'Opening email…', state: 'pending' as const },
    ];

    setProgressSteps(steps);
    setExportStatus('running');
    setProgressModalVisible(true);

    const { AuditRepository } = await import('@/lib/repositories/audit.repository');
    const auditRepo = new AuditRepository();

    await auditRepo.log({
      user_id: user.id,
      entity_type: 'export',
      entity_id: `calendar_export_all_start_${format(anchorDate, 'yyyy-MM-dd')}`,
      action: 'calendar_export_all_csv_start',
      new_data: {
        period_type: periodType,
        period_start: format(analytics.date_range.start, 'yyyy-MM-dd'),
        period_end: format(analytics.date_range.end, 'yyyy-MM-dd'),
        role: user.role,
      },
    });

    try {
      updateProgressStep(0, 'done');
      await new Promise((resolve) => setTimeout(resolve, 100));

      updateProgressStep(1, 'done');
      await new Promise((resolve) => setTimeout(resolve, 100));

      updateProgressStep(2, 'done');
      await new Promise((resolve) => setTimeout(resolve, 100));

      updateProgressStep(3, 'done');
      await new Promise((resolve) => setTimeout(resolve, 100));

      updateProgressStep(4, 'done');
      await new Promise((resolve) => setTimeout(resolve, 100));

      updateProgressStep(5, 'done');

      let csvContent = `Export All CSV\n`;
      csvContent += `Period Start,${format(analytics.date_range.start, 'yyyy-MM-dd HH:mm:ss')}\n`;
      csvContent += `Period End,${format(analytics.date_range.end, 'yyyy-MM-dd HH:mm:ss')}\n`;
      csvContent += `Generated At,${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\n`;
      csvContent += `\n`;
      csvContent += 'Section,Date,ID,Description,Payment Method,Amount,Extra Data\n';

      if (analytics.totals.sales_cents > 0 || analytics.totals.expenses_cents > 0 || analytics.other_expenses.length > 0) {
        csvContent += `SALES,${analytics.date_range.label},,Total Sales,,₱${(analytics.totals.sales_cents / 100).toFixed(2)},\n`;
        csvContent += `EXPENSES,${analytics.date_range.label},,Total Expenses,,₱${(analytics.totals.expenses_cents / 100).toFixed(2)},\n`;
        
        analytics.revenue_by_payment.forEach((r) => {
          csvContent += `REVENUES,${analytics.date_range.label},,${r.method},${r.method},₱${(r.amount_cents / 100).toFixed(2)},\n`;
        });
        
        analytics.other_expenses.forEach((oe) => {
          const escapedName = oe.name.replace(/"/g, '""');
          const escapedNotes = (oe.notes || '').replace(/"/g, '""');
          csvContent += `OTHER_EXPENSES,${oe.date},${oe.id},"${escapedName}",,₱${(oe.amount_cents / 100).toFixed(2)},"${escapedNotes}"\n`;
        });
        
        csvContent += `SPLIT_70_30,${analytics.date_range.label},,Operation Manager (70%),,₱${(analytics.totals.manager_share_cents / 100).toFixed(2)},\n`;
        csvContent += `SPLIT_70_30,${analytics.date_range.label},,General Manager (30%),,₱${(analytics.totals.owner_share_cents / 100).toFixed(2)},\n`;
      } else {
        csvContent += `NO_DATA,${analytics.date_range.label},,No entries found for this period,,,\n`;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      updateProgressStep(6, 'done');

      const filename = `foodcartops_export_all_${format(analytics.date_range.start, 'yyyy-MM-dd')}_to_${format(analytics.date_range.end, 'yyyy-MM-dd')}.csv`;
      const file = new File(Paths.cache, filename);
      file.write(csvContent);

      if (!file.exists || file.size === 0) {
        throw new Error('File write failed or file is empty');
      }

      console.log(`[Export All CSV] File created: ${file.uri}, size: ${file.size} bytes`);

      await new Promise((resolve) => setTimeout(resolve, 100));
      updateProgressStep(7, 'done');

      const canEmail = await MailComposer.isAvailableAsync();
      if (!canEmail) {
        throw new Error('MAIL_COMPOSER_UNAVAILABLE');
      }

      const emailResult = await MailComposer.composeAsync({
        subject: `FoodCartOps Export All - ${analytics.date_range.label}`,
        body: `Please find attached the complete export for the period ${analytics.date_range.label}.\n\nGenerated on ${format(new Date(), 'MMM d, yyyy h:mm a')}.`,
        attachments: [file.uri],
      });

      if (emailResult.status === 'cancelled') {
        setExportStatus('idle');
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'export',
          entity_id: `calendar_export_all_cancelled_${format(anchorDate, 'yyyy-MM-dd')}`,
          action: 'calendar_export_all_csv_cancelled',
          new_data: {
            period_type: periodType,
            period_start: format(analytics.date_range.start, 'yyyy-MM-dd'),
            period_end: format(analytics.date_range.end, 'yyyy-MM-dd'),
            role: user.role,
          },
        });
        return;
      }

      setExportStatus('success');
      
      await auditRepo.log({
        user_id: user.id,
        entity_type: 'export',
        entity_id: `calendar_export_all_success_${format(anchorDate, 'yyyy-MM-dd')}`,
        action: 'calendar_export_all_csv_success',
        new_data: {
          period_type: periodType,
          period_start: format(analytics.date_range.start, 'yyyy-MM-dd'),
          period_end: format(analytics.date_range.end, 'yyyy-MM-dd'),
          role: user.role,
          file_size: file.size,
        },
      });

      setTimeout(() => {
        Alert.alert(
          'Export Complete',
          'Export All CSV is ready and attached to your email.',
          [{ text: 'OK', onPress: () => setProgressModalVisible(false) }]
        );
      }, 500);
    } catch (error: any) {
      console.error('[Export All CSV] Error:', error);

      const errorIndex = progressSteps.findIndex((step) => step.state === 'pending');
      if (errorIndex !== -1) {
        updateProgressStep(errorIndex, 'error');
      }

      setExportStatus('failed');

      let errorCode = 'UNKNOWN_ERROR';
      let errorMessage = String(error?.message || error || 'Unknown error');

      if (errorMessage.includes('MAIL_COMPOSER_UNAVAILABLE')) {
        errorCode = 'MAIL_COMPOSER_UNAVAILABLE';
      } else if (errorMessage.includes('File write failed')) {
        errorCode = 'FILE_WRITE_ERROR';
      }

      await auditRepo.log({
        user_id: user.id,
        entity_type: 'export',
        entity_id: `calendar_export_all_failed_${format(anchorDate, 'yyyy-MM-dd')}`,
        action: 'calendar_export_all_csv_failed',
        new_data: {
          period_type: periodType,
          period_start: format(analytics.date_range.start, 'yyyy-MM-dd'),
          period_end: format(analytics.date_range.end, 'yyyy-MM-dd'),
          role: user.role,
          error_code: errorCode,
        },
      });

      setTimeout(() => {
        Alert.alert(
          'Failed',
          `Report to Developer.\n\nError: ${errorCode}`,
          [{ text: 'OK', onPress: () => setProgressModalVisible(false) }]
        );
      }, 500);
    }
  };



  const handleExportPDF = async () => {
    if (!analytics) return;

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f4f4f4; }
            .total { font-weight: bold; background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <h1>Calendar Analytics Report</h1>
          <p><strong>Period:</strong> ${analytics.date_range.label}</p>
          <p><strong>Generated:</strong> ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
          
          <h2>Financial Summary</h2>
          <table>
            <tr><th>Metric</th><th>Amount</th></tr>
            <tr><td>Total Sales</td><td>₱${(analytics.totals.sales_cents / 100).toFixed(2)}</td></tr>
            <tr><td>Expenses</td><td>₱${(analytics.totals.expenses_cents / 100).toFixed(2)}</td></tr>
            <tr><td>Other Expenses</td><td>₱${(analytics.totals.other_expenses_cents / 100).toFixed(2)}</td></tr>
            <tr class="total"><td>Net Sales</td><td>₱${(analytics.totals.net_sales_cents / 100).toFixed(2)}</td></tr>
          </table>

          <h2>Net Sales Split (70/30)</h2>
          <table>
            <tr><th>Share</th><th>Amount</th></tr>
            <tr><td>Operation Manager (70%)</td><td>₱${(analytics.totals.manager_share_cents / 100).toFixed(2)}</td></tr>
            <tr><td>General Manager (30%)</td><td>₱${(analytics.totals.owner_share_cents / 100).toFixed(2)}</td></tr>
          </table>

          <h2>Payment Method Revenue</h2>
          <table>
            <tr><th>Method</th><th>Amount</th></tr>
            ${analytics.revenue_by_payment.map((r) => `<tr><td>${r.method}</td><td>₱${(r.amount_cents / 100).toFixed(2)}</td></tr>`).join('')}
          </table>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      const canEmail = await MailComposer.isAvailableAsync();
      if (canEmail) {
        await MailComposer.composeAsync({
          subject: `Calendar Report - ${analytics.date_range.label}`,
          body: 'Please find attached the calendar analytics report.',
          attachments: [uri],
        });
      } else {
        if (Platform.OS !== 'web') {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert('Export Ready', 'PDF created successfully');
        }
      }
    } catch (error) {
      Alert.alert('Error', `Failed to generate PDF: ${error}`);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const renderDonutChart = (data: { label: string; value: number; color: string }[], total: number) => {
    const size = 200;
    const strokeWidth = 40;
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;

    if (total === 0) {
      return (
        <View style={[styles.chartContainer, { height: size }]}>
          <Svg width={size} height={size}>
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={theme.border}
              strokeWidth={strokeWidth}
              fill="none"
            />
          </Svg>
          <View style={styles.chartCenterText}>
            <Text style={[styles.chartCenterValue, { color: theme.text }]}>₱0.00</Text>
          </View>
        </View>
      );
    }

    let currentAngle = -90;
    const segments = data.map((item) => {
      const percentage = item.value / total;
      const angle = percentage * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      ].join(' ');

      return { pathData, color: item.color, label: item.label, value: item.value, percentage };
    });

    return (
      <View style={styles.chartContainer}>
        <View style={{ position: 'relative' }}>
          <Svg width={size} height={size}>
            {segments.map((segment, index) => (
              <Path
                key={index}
                d={segment.pathData}
                stroke={segment.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
              />
            ))}
          </Svg>
          <View style={styles.chartCenterText}>
            <Text style={[styles.chartCenterValue, { color: theme.text }]}>₱{(total / 100).toFixed(2)}</Text>
          </View>
        </View>
        <View style={styles.chartLegend}>
          {data.map((item, index) => (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: item.color }]} />
              <Text style={[styles.legendText, { color: theme.text }]}>
                {item.label}: ₱{(item.value / 100).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.periodSelector, { borderBottomColor: theme.border }]}>
        <View style={styles.periodTypeRow}>
          {(['day', 'week', 'month', 'year'] as PeriodType[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.periodTypeButton,
                periodType === type && { backgroundColor: theme.primary },
              ]}
              onPress={() => {
                setPeriodType(type);
                setAnchorDate(new Date());
              }}
            >
              <Text
                style={[
                  styles.periodTypeText,
                  { color: periodType === type ? '#fff' : theme.text },
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dateNavRow}>
          <TouchableOpacity
            style={[styles.navButton, { backgroundColor: theme.card }]}
            onPress={() => navigatePeriod('prev')}
          >
            <ChevronLeft size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.dateLabel, { color: theme.text }]}>
            {analytics?.date_range.label}
          </Text>
          <TouchableOpacity
            style={[styles.navButton, { backgroundColor: theme.card }]}
            onPress={() => navigatePeriod('next')}
          >
            <ChevronRight size={20} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.subTabsContainer, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.subTab}
          onPress={() => setSelectedSubTab('numbers')}
        >
          <CalendarIcon size={16} color={selectedSubTab === 'numbers' ? theme.primary : theme.textSecondary} />
          <Text
            style={[
              styles.subTabText,
              { color: selectedSubTab === 'numbers' ? theme.primary : theme.textSecondary },
            ]}
          >
            NUMBERS
          </Text>
          {selectedSubTab === 'numbers' && (
            <View style={[styles.subTabUnderline, { backgroundColor: theme.primary }]} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.subTab}
          onPress={() => setSelectedSubTab('export')}
        >
          <Download size={16} color={selectedSubTab === 'export' ? theme.primary : theme.textSecondary} />
          <Text
            style={[
              styles.subTabText,
              { color: selectedSubTab === 'export' ? theme.primary : theme.textSecondary },
            ]}
          >
            EXPORT
          </Text>
          {selectedSubTab === 'export' && (
            <View style={[styles.subTabUnderline, { backgroundColor: theme.primary }]} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.subTab}
          onPress={() => setSelectedSubTab('charts')}
        >
          <BarChart3 size={16} color={selectedSubTab === 'charts' ? theme.primary : theme.textSecondary} />
          <Text
            style={[
              styles.subTabText,
              { color: selectedSubTab === 'charts' ? theme.primary : theme.textSecondary },
            ]}
          >
            CHARTS
          </Text>
          {selectedSubTab === 'charts' && (
            <View style={[styles.subTabUnderline, { backgroundColor: theme.primary }]} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {selectedSubTab === 'numbers' && analytics && (
          <>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Financial Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total Sales</Text>
                <Text style={[styles.summaryValue, { color: theme.primary }]}>
                  ₱{(analytics.totals.sales_cents / 100).toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Expenses</Text>
                <Text style={[styles.summaryValue, { color: theme.error }]}>
                  ₱{(analytics.totals.expenses_cents / 100).toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Other Expenses</Text>
                <Text style={[styles.summaryValue, { color: theme.error }]}>
                  ₱{(analytics.totals.other_expenses_cents / 100).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.summaryLabel, { color: theme.text, fontWeight: '600' }]}>Net Sales</Text>
                <Text style={[styles.summaryValue, { color: theme.success, fontWeight: '700', fontSize: 18 }]}>
                  ₱{(analytics.totals.net_sales_cents / 100).toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Net Sales Split (70/30)</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Operation Manager (70%)</Text>
                <Text style={[styles.summaryValue, { color: theme.success, fontWeight: '600' }]}>
                  ₱{(analytics.totals.manager_share_cents / 100).toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>General Manager (30%)</Text>
                <Text style={[styles.summaryValue, { color: theme.primary, fontWeight: '600' }]}>
                  ₱{(analytics.totals.owner_share_cents / 100).toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Revenue by Payment Method</Text>
              {analytics.revenue_by_payment.map((item, index) => (
                <View key={index} style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{item.method}</Text>
                  <Text style={[styles.summaryValue, { color: theme.text }]}>
                    ₱{(item.amount_cents / 100).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Other Expenses</Text>
                <View style={styles.cardHeaderActions}>
                  <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: theme.primary }]}
                    onPress={() => openOtherExpenseModal()}
                  >
                    <Plus size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              {analytics.other_expenses.length > 0 ? (
                analytics.other_expenses.map((oe) => (
                  <View key={oe.id} style={[styles.otherExpenseRow, { borderBottomColor: theme.border }]}>
                    <View style={styles.otherExpenseInfo}>
                      <Text style={[styles.otherExpenseName, { color: theme.text }]}>{oe.name}</Text>
                      <Text style={[styles.otherExpenseDate, { color: theme.textSecondary }]}>
                        {format(new Date(oe.date), 'MMM d, yyyy')}
                      </Text>
                      {oe.notes && (
                        <Text style={[styles.otherExpenseNotes, { color: theme.textSecondary }]} numberOfLines={2}>
                          {oe.notes}
                        </Text>
                      )}
                    </View>
                    <View style={styles.otherExpenseActions}>
                      <Text style={[styles.otherExpenseAmount, { color: theme.error }]}>
                        ₱{(oe.amount_cents / 100).toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: theme.error + '15' }]}
                        onPress={() => handleDeleteOtherExpense(oe.id, oe.name)}
                      >
                        <Trash2 size={16} color={theme.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No other expenses</Text>
              )}
            </View>

            {(user?.role === 'boss' || user?.role === 'boss2' || user?.role === 'developer') && periodType === 'day' && (
              <TouchableOpacity
                style={[styles.deleteDataButtonLarge, { backgroundColor: theme.error }]}
                onPress={handleDeleteDaySales}
                disabled={deleteDaySalesMutation.isPending}
              >
                {deleteDaySalesMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Trash2 size={20} color="#fff" />
                    <Text style={styles.deleteDataButtonLargeText}>Delete Data</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {selectedSubTab === 'export' && (
          <>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Export CSV</Text>
              {(['sales', 'expenses', 'revenues', 'other_expenses', 'split_70_30', 'export_all'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.exportButton, { backgroundColor: type === 'export_all' ? theme.success + '15' : theme.primary + '15' }]}
                  onPress={() => handleExportCSV(type)}
                >
                  <FileText size={20} color={type === 'export_all' ? theme.success : theme.primary} />
                  <Text style={[styles.exportButtonText, { color: type === 'export_all' ? theme.success : theme.primary }]}>
                    {type === 'export_all' ? 'Export All CSV' : type === 'split_70_30' ? 'Export 30/70 Split CSV' : `Export ${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} CSV`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Export PDF Summary</Text>
              <TouchableOpacity
                style={[styles.exportButton, { backgroundColor: theme.error + '15' }]}
                onPress={handleExportPDF}
              >
                <FileText size={20} color={theme.error} />
                <Text style={[styles.exportButtonText, { color: theme.error }]}>
                  Generate PDF Summary
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {selectedSubTab === 'charts' && analytics && (
          <>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Composition for Period</Text>
              {renderDonutChart(
                [
                  { label: 'Sales', value: analytics.totals.sales_cents, color: theme.primary },
                  { label: 'Expenses', value: analytics.totals.expenses_cents, color: theme.error },
                  { label: 'Other Expenses', value: analytics.totals.other_expenses_cents, color: theme.warning },
                ],
                analytics.totals.sales_cents + analytics.totals.expenses_cents + analytics.totals.other_expenses_cents
              )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Net Sales Split (70/30)</Text>
              {renderDonutChart(
                [
                  { label: 'Operation Manager (70%)', value: analytics.totals.manager_share_cents, color: theme.success },
                  { label: 'General Manager (30%)', value: analytics.totals.owner_share_cents, color: theme.primary },
                ],
                analytics.totals.manager_share_cents + analytics.totals.owner_share_cents
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={otherExpenseModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOtherExpenseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingOtherExpense ? 'Edit' : 'Add'} Other Expense
              </Text>
              <TouchableOpacity onPress={() => setOtherExpenseModalVisible(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={otherExpenseName}
                onChangeText={setOtherExpenseName}
                placeholder="Expense name"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Amount (₱) *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={otherExpenseAmount}
                onChangeText={setOtherExpenseAmount}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Date *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={otherExpenseDate}
                onChangeText={setOtherExpenseDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Notes</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={otherExpenseNotes}
                onChangeText={setOtherExpenseNotes}
                placeholder="Optional notes"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setOtherExpenseModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveOtherExpense}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={progressModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProgressModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.progressModalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Building report…</Text>
              <TouchableOpacity onPress={() => setProgressModalVisible(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.progressBody}>
              {progressSteps.map((step, index) => (
                <View key={index} style={styles.progressStep}>
                  <View
                    style={[
                      styles.progressStepIndicator,
                      {
                        backgroundColor:
                          step.state === 'done'
                            ? theme.success
                            : step.state === 'error'
                            ? theme.error
                            : theme.border,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.progressStepLabel,
                      {
                        color:
                          step.state === 'done'
                            ? theme.text
                            : step.state === 'error'
                            ? theme.error
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    {step.label}
                  </Text>
                  {step.state === 'done' && (
                    <Text style={[styles.progressStepStatus, { color: theme.success }]}>✓</Text>
                  )}
                  {step.state === 'error' && (
                    <Text style={[styles.progressStepStatus, { color: theme.error }]}>✗</Text>
                  )}
                  {step.state === 'pending' && exportStatus === 'running' && (
                    <ActivityIndicator size="small" color={theme.primary} />
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  periodSelector: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  periodTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  periodTypeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodTypeText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  subTabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  subTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 15,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  totalRow: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 16,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherExpenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  otherExpenseInfo: {
    flex: 1,
    marginRight: 12,
  },
  otherExpenseName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  otherExpenseDate: {
    fontSize: 13,
    marginBottom: 4,
  },
  otherExpenseNotes: {
    fontSize: 12,
    fontStyle: 'italic' as const,
  },
  otherExpenseActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  otherExpenseAmount: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  exportButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  chartContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  chartCenterText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartCenterValue: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  chartLegend: {
    marginTop: 20,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteDataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  deleteDataButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  deleteDataButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  deleteDataButtonLargeText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  progressModalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    overflow: 'hidden',
  },
  progressBody: {
    padding: 20,
    maxHeight: 400,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  progressStepIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressStepLabel: {
    flex: 1,
    fontSize: 14,
  },
  progressStepStatus: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
