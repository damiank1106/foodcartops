import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { 
  Bookmark, 
  AlertTriangle, 
  FileText, 
  CheckCircle2, 
  Filter,
  Edit,
  Trash2,
  ExternalLink,
  X,
} from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { BossSavedItemsRepository } from '@/lib/repositories/boss-saved-items.repository';
import { 
  BossSavedItemWithDetails, 
  BossSavedItemType, 
  BossSavedItemStatus, 
  BossSavedItemSeverity 
} from '@/lib/types';

export default function BossSavedScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<BossSavedItemWithDetails[]>([]);
  const [filteredItems, setFilteredItems] = useState<BossSavedItemWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<BossSavedItemStatus | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<BossSavedItemType | 'ALL'>('ALL');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BossSavedItemWithDetails | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSeverity, setEditSeverity] = useState<BossSavedItemSeverity>('MEDIUM');
  const [editStatus, setEditStatus] = useState<BossSavedItemStatus>('OPEN');

  const loadItems = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const repo = new BossSavedItemsRepository();
      const allItems = await repo.findAllWithDetails();
      setItems(allItems);
    } catch (error) {
      console.error('[BossSaved] Failed to load items:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    let filtered = [...items];

    if (filterStatus !== 'ALL') {
      filtered = filtered.filter(item => item.status === filterStatus);
    }

    if (filterType !== 'ALL') {
      filtered = filtered.filter(item => item.type === filterType);
    }

    setFilteredItems(filtered);
  }, [items, filterStatus, filterType]);

  const handleDelete = useCallback(async (item: BossSavedItemWithDetails) => {
    if (!user) return;

    Alert.alert(
      'Delete Saved Item',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const repo = new BossSavedItemsRepository();
              await repo.delete(item.id, user.id);
              await loadItems();
            } catch (error) {
              console.error('[BossSaved] Failed to delete item:', error);
              Alert.alert('Error', 'Failed to delete item');
            }
          },
        },
      ]
    );
  }, [user, loadItems]);

  const handleEdit = useCallback((item: BossSavedItemWithDetails) => {
    setSelectedItem(item);
    setEditTitle(item.title);
    setEditNotes(item.notes || '');
    setEditSeverity(item.severity);
    setEditStatus(item.status);
    setShowEditModal(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!user || !selectedItem) return;

    try {
      const repo = new BossSavedItemsRepository();
      await repo.update(
        selectedItem.id,
        {
          title: editTitle,
          notes: editNotes || undefined,
          severity: editSeverity,
          status: editStatus,
        },
        user.id
      );
      setShowEditModal(false);
      setSelectedItem(null);
      await loadItems();
    } catch (error) {
      console.error('[BossSaved] Failed to update item:', error);
      Alert.alert('Error', 'Failed to update item');
    }
  }, [user, selectedItem, editTitle, editNotes, editSeverity, editStatus, loadItems]);

  const handleOpenLinkedEntity = useCallback((item: BossSavedItemWithDetails) => {
    if (!item.linked_entity_type || !item.linked_entity_id) return;

    switch (item.linked_entity_type) {
      case 'shift':
        router.push(`/settlement/${item.linked_entity_id}` as any);
        break;
      case 'settlement':
        router.push(`/settlement/${item.linked_entity_id}` as any);
        break;
      case 'expense':
        router.push('/boss/expenses' as any);
        break;
      default:
        Alert.alert('Info', 'Entity details not implemented yet');
    }
  }, [router]);

  const getTypeIcon = (type: BossSavedItemType) => {
    switch (type) {
      case 'EXCEPTION':
        return <AlertTriangle size={20} color={theme.warning} />;
      case 'ALERT':
        return <AlertTriangle size={20} color={theme.error} />;
      case 'DRAFT':
        return <FileText size={20} color={theme.textSecondary} />;
      case 'SETTLEMENT':
        return <CheckCircle2 size={20} color={theme.success} />;
      default:
        return <Bookmark size={20} color={theme.textSecondary} />;
    }
  };

  const getSeverityColor = (severity: BossSavedItemSeverity) => {
    switch (severity) {
      case 'HIGH':
        return theme.error;
      case 'MEDIUM':
        return theme.warning;
      case 'LOW':
        return theme.textSecondary;
      default:
        return theme.textSecondary;
    }
  };

  const openCount = items.filter(item => item.status === 'OPEN').length;
  const resolvedCount = items.filter(item => item.status === 'RESOLVED').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{openCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Open</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{resolvedCount}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Resolved</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{items.length}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: theme.card }]}
          onPress={() => setShowFilterModal(true)}
        >
          <Filter size={20} color={theme.primary} />
          <Text style={[styles.filterButtonText, { color: theme.text }]}>Filters</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadItems} colors={[theme.primary]} />
        }
      >
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Bookmark size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {items.length === 0 ? 'No saved items yet' : 'No items match your filters'}
            </Text>
          </View>
        ) : (
          filteredItems.map(item => (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: theme.card }]}>
              <View style={styles.itemHeader}>
                <View style={styles.itemHeaderLeft}>
                  {getTypeIcon(item.type)}
                  <Text style={[styles.itemType, { color: theme.textSecondary }]}>
                    {item.type}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: item.status === 'OPEN' ? theme.warning + '20' : theme.success + '20' }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: item.status === 'OPEN' ? theme.warning : theme.success }
                  ]}>
                    {item.status}
                  </Text>
                </View>
              </View>

              <Text style={[styles.itemTitle, { color: theme.text }]}>{item.title}</Text>

              {item.notes && (
                <Text style={[styles.itemNotes, { color: theme.textSecondary }]} numberOfLines={2}>
                  {item.notes}
                </Text>
              )}

              <View style={styles.itemMeta}>
                <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(item.severity) + '20' }]}>
                  <Text style={[styles.severityText, { color: getSeverityColor(item.severity) }]}>
                    {item.severity}
                  </Text>
                </View>
                <Text style={[styles.itemDate, { color: theme.textSecondary }]}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>

              <View style={styles.itemActions}>
                {item.linked_entity_id && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.primary + '20' }]}
                    onPress={() => handleOpenLinkedEntity(item)}
                  >
                    <ExternalLink size={16} color={theme.primary} />
                    <Text style={[styles.actionButtonText, { color: theme.primary }]}>Open</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: theme.primary + '20' }]}
                  onPress={() => handleEdit(item)}
                >
                  <Edit size={16} color={theme.primary} />
                  <Text style={[styles.actionButtonText, { color: theme.primary }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: theme.error + '20' }]}
                  onPress={() => handleDelete(item)}
                >
                  <Trash2 size={16} color={theme.error} />
                  <Text style={[styles.actionButtonText, { color: theme.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={showFilterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Status</Text>
            <View style={styles.filterChips}>
              {(['ALL', 'OPEN', 'RESOLVED'] as const).map(status => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterChip,
                    { backgroundColor: filterStatus === status ? theme.primary : theme.background },
                  ]}
                  onPress={() => setFilterStatus(status)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: filterStatus === status ? '#FFF' : theme.text },
                    ]}
                  >
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterLabel, { color: theme.textSecondary, marginTop: 16 }]}>Type</Text>
            <View style={styles.filterChips}>
              {(['ALL', 'EXCEPTION', 'ALERT', 'DRAFT', 'SETTLEMENT'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.filterChip,
                    { backgroundColor: filterType === type ? theme.primary : theme.background },
                  ]}
                  onPress={() => setFilterType(type)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: filterType === type ? '#FFF' : theme.text },
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: theme.primary }]}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Saved Item</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editForm}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Enter title"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Notes</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, color: theme.text }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Enter notes (optional)"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Severity</Text>
              <View style={styles.filterChips}>
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map(severity => (
                  <TouchableOpacity
                    key={severity}
                    style={[
                      styles.filterChip,
                      { backgroundColor: editSeverity === severity ? theme.primary : theme.background },
                    ]}
                    onPress={() => setEditSeverity(severity)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: editSeverity === severity ? '#FFF' : theme.text },
                      ]}
                    >
                      {severity}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Status</Text>
              <View style={styles.filterChips}>
                {(['OPEN', 'RESOLVED'] as const).map(status => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.filterChip,
                      { backgroundColor: editStatus === status ? theme.primary : theme.background },
                    ]}
                    onPress={() => setEditStatus(status)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: editStatus === status ? '#FFF' : theme.text },
                      ]}
                    >
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveEdit}
              >
                <Text style={[styles.modalButtonText, { color: '#FFF' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  scrollView: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 100,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  itemCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemType: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  itemNotes: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  itemDate: {
    fontSize: 12,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  applyButton: {
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  editForm: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  textArea: {
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
