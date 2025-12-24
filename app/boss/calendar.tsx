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
import { Svg, Rect, Line, Text as SvgText } from 'react-native-svg';

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

  const handleExportCSV = async (type: 'sales' | 'expenses' | 'settlements' | 'revenues' | 'other_expenses') => {
    if (!analytics) return;

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
    }

    try {
      const file = new File(Paths.cache, filename);
      file.write(csvContent);
      const fileUri = file.uri;

      const canEmail = await MailComposer.isAvailableAsync();
      if (canEmail) {
        await MailComposer.composeAsync({
          subject: `${type.toUpperCase()} Export - ${analytics.date_range.label}`,
          body: `Please find attached the ${type} export.`,
          attachments: [fileUri],
        });
      } else {
        if (Platform.OS !== 'web') {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Export Ready', 'CSV file created in cache directory');
        }
      }
    } catch (error) {
      Alert.alert('Error', `Failed to export: ${error}`);
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
            <tr><td>Owner (30%)</td><td>₱${(analytics.totals.owner_share_cents / 100).toFixed(2)}</td></tr>
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

  const renderChart = () => {
    if (!analytics) {
      return (
        <View style={styles.emptyChart}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      );
    }

    const maxValue = Math.max(
      1,
      ...analytics.breakdown.map((b) => b.sales_cents + b.expenses_cents + b.other_expenses_cents)
    );

    const chartWidth = 320;
    const chartHeight = 200;
    const padding = 40;
    const barWidth = analytics.breakdown.length > 0 ? (chartWidth - padding * 2) / analytics.breakdown.length / 3 : 20;

    const effectiveBreakdown = analytics.breakdown.length > 0 ? analytics.breakdown : [
      {
        label: analytics.date_range.label,
        date: anchorDate,
        sales_cents: analytics.totals.sales_cents,
        expenses_cents: analytics.totals.expenses_cents,
        other_expenses_cents: analytics.totals.other_expenses_cents,
      },
    ];

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={Math.max(chartWidth, effectiveBreakdown.length * 80)} height={chartHeight + 40}>
          <Line
            x1={padding}
            y1={chartHeight - padding}
            x2={chartWidth - padding}
            y2={chartHeight - padding}
            stroke={theme.border}
            strokeWidth={1}
          />
          {effectiveBreakdown.map((item, index) => {
            const x = padding + index * ((chartWidth - padding * 2) / effectiveBreakdown.length);
            const salesHeight = ((item.sales_cents / maxValue) * (chartHeight - padding * 2)) || 1;
            const expensesHeight = ((item.expenses_cents / maxValue) * (chartHeight - padding * 2)) || 1;
            const otherExpensesHeight = ((item.other_expenses_cents / maxValue) * (chartHeight - padding * 2)) || 1;

            return (
              <React.Fragment key={index}>
                <Rect
                  x={x}
                  y={chartHeight - padding - salesHeight}
                  width={barWidth}
                  height={salesHeight}
                  fill={theme.primary}
                />
                <Rect
                  x={x + barWidth + 2}
                  y={chartHeight - padding - expensesHeight}
                  width={barWidth}
                  height={expensesHeight}
                  fill={theme.error}
                />
                <Rect
                  x={x + barWidth * 2 + 4}
                  y={chartHeight - padding - otherExpensesHeight}
                  width={barWidth}
                  height={otherExpensesHeight}
                  fill={theme.warning}
                />
                <SvgText
                  x={x + barWidth}
                  y={chartHeight - padding + 20}
                  fontSize={10}
                  fill={theme.text}
                  textAnchor="middle"
                >
                  {item.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: theme.primary }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Sales</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: theme.error }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Expenses</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: theme.warning }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Other Expenses</Text>
          </View>
        </View>
      </ScrollView>
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
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Owner (30%)</Text>
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
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: theme.primary }]}
                  onPress={() => openOtherExpenseModal()}
                >
                  <Plus size={18} color="#fff" />
                </TouchableOpacity>
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
          </>
        )}

        {selectedSubTab === 'export' && (
          <>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Export CSV</Text>
              {(['sales', 'expenses', 'revenues', 'other_expenses'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.exportButton, { backgroundColor: theme.primary + '15' }]}
                  onPress={() => handleExportCSV(type)}
                >
                  <FileText size={20} color={theme.primary} />
                  <Text style={[styles.exportButtonText, { color: theme.primary }]}>
                    Export {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} CSV
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

        {selectedSubTab === 'charts' && (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Sales vs Expenses</Text>
            {renderChart()}
          </View>
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
  emptyChart: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
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
});
