import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Database, RefreshCw, ChevronRight, ChevronDown, Trash2, HardDrive, Table, Columns, Key } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { DatabaseRepository } from '@/lib/repositories/database.repository';
import { format } from 'date-fns';

export default function DatabaseScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const dbRepo = new DatabaseRepository();

  const { data: dbInfo, isLoading: isLoadingInfo, refetch: refetchInfo } = useQuery({
    queryKey: ['database-info'],
    queryFn: () => dbRepo.getDatabaseInfo(),
  });

  const { data: tableSchemas, isLoading: isLoadingSchemas, refetch: refetchSchemas } = useQuery({
    queryKey: ['table-schemas'],
    queryFn: () => dbRepo.getAllTableSchemas(),
  });

  const { data: changeLog, isLoading: isLoadingChanges, refetch: refetchChanges } = useQuery({
    queryKey: ['db-change-log'],
    queryFn: () => dbRepo.getChangeLog(),
  });

  const { data: fileSizes, isLoading: isLoadingSizes, refetch: refetchSizes } = useQuery({
    queryKey: ['file-sizes'],
    queryFn: () => dbRepo.getFileSizes(),
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (logId: string) => {
      if (!user?.id) throw new Error('No user');
      await dbRepo.deleteChangeLogEntry(logId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['db-change-log'] });
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete log: ${error}`);
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('No user');
      await dbRepo.clearAllChangeLog(user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['db-change-log'] });
      Alert.alert('Success', 'All change logs cleared');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to clear logs: ${error}`);
    },
  });

  const handleRefreshAll = async () => {
    await Promise.all([
      refetchInfo(),
      refetchSchemas(),
      refetchChanges(),
      refetchSizes(),
    ]);
  };

  const toggleTable = (tableName: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  const handleDeleteLog = (logId: string) => {
    Alert.alert(
      'Delete Change Log',
      'Remove this log entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteLogMutation.mutate(logId),
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Logs',
      'Remove all change log entries? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => clearAllMutation.mutate(),
        },
      ]
    );
  };

  const isLoading = isLoadingInfo || isLoadingSchemas || isLoadingChanges || isLoadingSizes;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <Database size={24} color={theme.text} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Database</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: theme.primary + '15' }]}
          onPress={handleRefreshAll}
        >
          <RefreshCw size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Database Information</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Schema Version</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{dbInfo?.schemaVersion}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Database Path</Text>
            <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1} ellipsizeMode="middle">
              {dbInfo?.dbPath}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Table Count</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{dbInfo?.tableCount}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Last Refreshed</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {format(new Date(), 'MMM d, h:mm a')}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <HardDrive size={20} color={theme.text} />
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>File Sizes</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Database File</Text>
            <Text style={[styles.infoValue, { color: theme.primary, fontWeight: '600' }]}>
              {fileSizes?.dbSizeReadable}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Document Directory</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {fileSizes?.documentDirSizeReadable}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Cache Directory</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {fileSizes?.cacheDirSizeReadable}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Table size={20} color={theme.text} />
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Schema Tree</Text>
            </View>
          </View>
          {tableSchemas && tableSchemas.length > 0 ? (
            tableSchemas.map((schema) => (
              <View key={schema.name} style={[styles.tableItem, { borderBottomColor: theme.border }]}>
                <TouchableOpacity
                  style={styles.tableHeader}
                  onPress={() => toggleTable(schema.name)}
                >
                  <View style={styles.tableHeaderLeft}>
                    {expandedTables.has(schema.name) ? (
                      <ChevronDown size={18} color={theme.textSecondary} />
                    ) : (
                      <ChevronRight size={18} color={theme.textSecondary} />
                    )}
                    <Text style={[styles.tableName, { color: theme.text }]}>{schema.name}</Text>
                  </View>
                  <View style={styles.tableStats}>
                    <View style={[styles.statBadge, { backgroundColor: theme.primary + '15' }]}>
                      <Columns size={12} color={theme.primary} />
                      <Text style={[styles.statBadgeText, { color: theme.primary }]}>
                        {schema.columns.length}
                      </Text>
                    </View>
                    {schema.indexes.length > 0 && (
                      <View style={[styles.statBadge, { backgroundColor: theme.success + '15' }]}>
                        <Key size={12} color={theme.success} />
                        <Text style={[styles.statBadgeText, { color: theme.success }]}>
                          {schema.indexes.length}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                {expandedTables.has(schema.name) && (
                  <View style={[styles.tableDetails, { backgroundColor: theme.background }]}>
                    <Text style={[styles.subsectionTitle, { color: theme.text }]}>Columns</Text>
                    {schema.columns.map((col) => (
                      <View key={col.cid} style={styles.columnRow}>
                        <Text style={[styles.columnName, { color: theme.text }]}>
                          {col.name}
                          {col.pk === 1 && (
                            <Text style={[styles.columnBadge, { color: theme.warning }]}> PK</Text>
                          )}
                        </Text>
                        <Text style={[styles.columnType, { color: theme.textSecondary }]}>
                          {col.type}
                          {col.notnull === 1 && ' NOT NULL'}
                          {col.dflt_value && ` DEFAULT ${col.dflt_value}`}
                        </Text>
                      </View>
                    ))}

                    {schema.foreignKeys.length > 0 && (
                      <>
                        <Text style={[styles.subsectionTitle, { color: theme.text, marginTop: 12 }]}>
                          Foreign Keys
                        </Text>
                        {schema.foreignKeys.map((fk, idx) => (
                          <View key={idx} style={styles.fkRow}>
                            <Text style={[styles.fkText, { color: theme.textSecondary }]}>
                              {fk.from} → {fk.table}.{fk.to}
                            </Text>
                          </View>
                        ))}
                      </>
                    )}

                    {schema.indexes.length > 0 && (
                      <>
                        <Text style={[styles.subsectionTitle, { color: theme.text, marginTop: 12 }]}>
                          Indexes
                        </Text>
                        {schema.indexes.map((idx, i) => (
                          <View key={i} style={styles.indexRow}>
                            <Text style={[styles.indexName, { color: theme.text }]}>
                              {idx.name}
                              {idx.unique && (
                                <Text style={[styles.columnBadge, { color: theme.success }]}> UNIQUE</Text>
                              )}
                            </Text>
                            <Text style={[styles.indexColumns, { color: theme.textSecondary }]}>
                              ({idx.columns.join(', ')})
                            </Text>
                          </View>
                        ))}
                      </>
                    )}
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No tables found</Text>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                Change Log
              </Text>
            </View>
            {changeLog && changeLog.length > 0 && (
              <TouchableOpacity
                style={[styles.clearAllButton, { backgroundColor: theme.error + '15' }]}
                onPress={handleClearAll}
              >
                <Trash2 size={14} color={theme.error} />
                <Text style={[styles.clearAllText, { color: theme.error }]}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
          {changeLog && changeLog.length > 0 ? (
            changeLog.map((log) => (
              <View key={log.id} style={[styles.logRow, { borderBottomColor: theme.border }]}>
                <View style={styles.logInfo}>
                  <Text style={[styles.logMessage, { color: theme.text }]}>{log.message}</Text>
                  <Text style={[styles.logTime, { color: theme.textSecondary }]}>
                    {format(log.created_at, 'MMM d, yyyy • h:mm a')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.deleteLogButton, { backgroundColor: theme.error + '15' }]}
                  onPress={() => handleDeleteLog(log.id)}
                >
                  <Trash2 size={14} color={theme.error} />
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No change logs</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  tableItem: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tableHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  tableName: {
    fontSize: 15,
    fontWeight: '600',
  },
  tableStats: {
    flexDirection: 'row',
    gap: 6,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tableDetails: {
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  columnRow: {
    paddingVertical: 6,
  },
  columnName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  columnType: {
    fontSize: 12,
  },
  columnBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  fkRow: {
    paddingVertical: 4,
  },
  fkText: {
    fontSize: 12,
  },
  indexRow: {
    paddingVertical: 4,
  },
  indexName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  indexColumns: {
    fontSize: 12,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  logInfo: {
    flex: 1,
    marginRight: 12,
  },
  logMessage: {
    fontSize: 14,
    marginBottom: 4,
  },
  logTime: {
    fontSize: 11,
  },
  deleteLogButton: {
    padding: 8,
    borderRadius: 6,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
