import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator, RefreshControl } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { Package, Plus, Edit2, Snowflake, ShoppingCart, Trash2, Box, UtensilsCrossed } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { InventoryItemRepository } from '@/lib/repositories/inventory-item.repository';
import type { InventoryItem, InventoryUnit } from '@/lib/types';

type StorageGroup = 'FREEZER' | 'CART' | 'PACKAGING_SUPPLY' | 'CONDIMENTS';

export default function InventoryScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StorageGroup | 'ALL'>('ALL');

  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [itemName, setItemName] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<InventoryUnit>('pcs');
  const [itemReorder, setItemReorder] = useState<string>('0');
  const [itemGroup, setItemGroup] = useState<StorageGroup>('FREEZER');

  const itemRepo = useMemo(() => new InventoryItemRepository(), []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const itemsData = await itemRepo.listActive();
      setItems(itemsData);
    } catch (error) {
      console.error('[Inventory] Load error:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [itemRepo]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const openItemModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setItemName(item.name);
      setItemUnit(item.unit);
      setItemReorder(item.reorder_level_qty.toString());
      setItemGroup((item as any).storage_group || 'FREEZER');
    } else {
      setEditingItem(null);
      setItemName('');
      setItemUnit('pcs');
      setItemReorder('0');
      setItemGroup('FREEZER');
    }
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!itemName.trim()) {
      Alert.alert('Error', 'Item name is required');
      return;
    }
    if (!user?.id) return;

    try {
      if (editingItem) {
        await itemRepo.update({
          id: editingItem.id,
          name: itemName.trim(),
          unit: itemUnit,
          reorder_level_qty: parseFloat(itemReorder) || 0,
          storage_group: itemGroup,
          user_id: user.id,
        });
        Alert.alert('Success', 'Item updated');
      } else {
        await itemRepo.create({
          name: itemName.trim(),
          unit: itemUnit,
          reorder_level_qty: parseFloat(itemReorder) || 0,
          storage_group: itemGroup,
          user_id: user.id,
        });
        Alert.alert('Success', 'Item created');
      }
      setShowItemModal(false);
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save item');
    }
  };

  const handleDeleteItem = (item: InventoryItem) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              await itemRepo.softDelete(item.id, user.id);
              Alert.alert('Success', 'Item deleted');
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  const filteredItems = useMemo(() => {
    if (selectedGroup === 'ALL') return items;
    return items.filter(item => (item as any).storage_group === selectedGroup);
  }, [items, selectedGroup]);

  const renderGroupFilter = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.groupFilter, { backgroundColor: theme.card }]}
      contentContainerStyle={styles.groupFilterContent}
    >
      <TouchableOpacity
        style={[styles.groupButton, selectedGroup === 'ALL' && { backgroundColor: theme.primary }]}
        onPress={() => setSelectedGroup('ALL')}
      >
        <Text style={[styles.groupButtonText, { color: selectedGroup === 'ALL' ? '#fff' : theme.text }]}>
          All
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.groupButton, selectedGroup === 'FREEZER' && { backgroundColor: theme.primary }]}
        onPress={() => setSelectedGroup('FREEZER')}
      >
        <Snowflake size={16} color={selectedGroup === 'FREEZER' ? '#fff' : theme.text} />
        <Text style={[styles.groupButtonText, { color: selectedGroup === 'FREEZER' ? '#fff' : theme.text }]}>
          Freezer
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.groupButton, selectedGroup === 'CART' && { backgroundColor: theme.primary }]}
        onPress={() => setSelectedGroup('CART')}
      >
        <ShoppingCart size={16} color={selectedGroup === 'CART' ? '#fff' : theme.text} />
        <Text style={[styles.groupButtonText, { color: selectedGroup === 'CART' ? '#fff' : theme.text }]}>
          Cart
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.groupButton, selectedGroup === 'PACKAGING_SUPPLY' && { backgroundColor: theme.primary }]}
        onPress={() => setSelectedGroup('PACKAGING_SUPPLY')}
      >
        <Box size={16} color={selectedGroup === 'PACKAGING_SUPPLY' ? '#fff' : theme.text} />
        <Text style={[styles.groupButtonText, { color: selectedGroup === 'PACKAGING_SUPPLY' ? '#fff' : theme.text }]}>
          Packaging Supply
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.groupButton, selectedGroup === 'CONDIMENTS' && { backgroundColor: theme.primary }]}
        onPress={() => setSelectedGroup('CONDIMENTS')}
      >
        <UtensilsCrossed size={16} color={selectedGroup === 'CONDIMENTS' ? '#fff' : theme.text} />
        <Text style={[styles.groupButtonText, { color: selectedGroup === 'CONDIMENTS' ? '#fff' : theme.text }]}>
          Condiments
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderItemsList = () => (
    <View style={styles.tabContent}>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }]}
        onPress={() => openItemModal()}
      >
        <Plus size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add Item</Text>
      </TouchableOpacity>
      {filteredItems.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.card }]}>
          <Package size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No items in this group</Text>
        </View>
      ) : (
        filteredItems.map((item) => (
          <View key={item.id} style={[styles.itemCard, { backgroundColor: theme.card }]}>
            <View style={styles.itemContent}>
              <TouchableOpacity
                style={styles.itemLeft}
                onPress={() => openItemModal(item)}
              >
                <View style={styles.itemHeader}>
                  <Text style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
                  <View style={[styles.groupBadge, { 
                    backgroundColor: 
                      (item as any).storage_group === 'FREEZER' ? theme.primary + '20' :
                      (item as any).storage_group === 'CART' ? theme.success + '20' :
                      (item as any).storage_group === 'PACKAGING_SUPPLY' ? '#FF6B35' + '20' :
                      '#F7931E' + '20'
                  }]}>
                    {(item as any).storage_group === 'FREEZER' ? (
                      <Snowflake size={12} color={theme.primary} />
                    ) : (item as any).storage_group === 'CART' ? (
                      <ShoppingCart size={12} color={theme.success} />
                    ) : (item as any).storage_group === 'PACKAGING_SUPPLY' ? (
                      <Box size={12} color="#FF6B35" />
                    ) : (
                      <UtensilsCrossed size={12} color="#F7931E" />
                    )}
                    <Text style={[styles.groupBadgeText, { 
                      color: 
                        (item as any).storage_group === 'FREEZER' ? theme.primary :
                        (item as any).storage_group === 'CART' ? theme.success :
                        (item as any).storage_group === 'PACKAGING_SUPPLY' ? '#FF6B35' :
                        '#F7931E'
                    }]}>
                      {(item as any).storage_group || 'FREEZER'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.itemUnit, { color: theme.textSecondary }]}>{item.unit}</Text>
                <Text style={[styles.itemReorder, { color: theme.textSecondary }]}>
                  Reorder: {item.reorder_level_qty} {item.unit}
                </Text>
              </TouchableOpacity>
              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={[styles.actionIcon, { backgroundColor: theme.primary + '20' }]}
                  onPress={() => openItemModal(item)}
                >
                  <Edit2 size={18} color={theme.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionIcon, { backgroundColor: theme.error + '20' }]}
                  onPress={() => handleDeleteItem(item)}
                >
                  <Trash2 size={18} color={theme.error} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );



  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderGroupFilter()}
      <ScrollView
        style={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
        ) : (
          renderItemsList()
        )}
      </ScrollView>

      <Modal visible={showItemModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
              </Text>
              
              <Text style={[styles.label, { color: theme.text }]}>Storage Group:</Text>
              <View style={styles.groupRow}>
                <TouchableOpacity
                  style={[styles.groupSelectButton, { backgroundColor: itemGroup === 'FREEZER' ? theme.primary : theme.background }]}
                  onPress={() => setItemGroup('FREEZER')}
                >
                  <Snowflake size={18} color={itemGroup === 'FREEZER' ? '#fff' : theme.text} />
                  <Text style={[styles.groupSelectText, { color: itemGroup === 'FREEZER' ? '#fff' : theme.text }]}>Freezer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.groupSelectButton, { backgroundColor: itemGroup === 'CART' ? theme.primary : theme.background }]}
                  onPress={() => setItemGroup('CART')}
                >
                  <ShoppingCart size={18} color={itemGroup === 'CART' ? '#fff' : theme.text} />
                  <Text style={[styles.groupSelectText, { color: itemGroup === 'CART' ? '#fff' : theme.text }]}>Cart</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.groupRow}>
                <TouchableOpacity
                  style={[styles.groupSelectButton, { backgroundColor: itemGroup === 'PACKAGING_SUPPLY' ? theme.primary : theme.background }]}
                  onPress={() => setItemGroup('PACKAGING_SUPPLY')}
                >
                  <Box size={18} color={itemGroup === 'PACKAGING_SUPPLY' ? '#fff' : theme.text} />
                  <Text style={[styles.groupSelectText, { color: itemGroup === 'PACKAGING_SUPPLY' ? '#fff' : theme.text }]}>Packaging</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.groupSelectButton, { backgroundColor: itemGroup === 'CONDIMENTS' ? theme.primary : theme.background }]}
                  onPress={() => setItemGroup('CONDIMENTS')}
                >
                  <UtensilsCrossed size={18} color={itemGroup === 'CONDIMENTS' ? '#fff' : theme.text} />
                  <Text style={[styles.groupSelectText, { color: itemGroup === 'CONDIMENTS' ? '#fff' : theme.text }]}>Condiments</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Item name"
                placeholderTextColor={theme.textSecondary}
                value={itemName}
                onChangeText={setItemName}
              />
              <Text style={[styles.label, { color: theme.text }]}>Unit:</Text>
              <View style={styles.unitRow}>
                {(['pcs', 'kg', 'g', 'L', 'mL'] as InventoryUnit[]).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitButton, { backgroundColor: itemUnit === u ? theme.primary : theme.background }]}
                    onPress={() => setItemUnit(u)}
                  >
                    <Text style={[styles.unitButtonText, { color: itemUnit === u ? '#fff' : theme.text }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Reorder level"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={itemReorder}
                onChangeText={setItemReorder}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: theme.background }]}
                  onPress={() => setShowItemModal(false)}
                >
                  <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.primary }]} onPress={handleSaveItem}>
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>{editingItem ? 'Update' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  groupFilter: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  groupFilterContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  groupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  groupButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  scrollContent: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
    gap: 12,
  },
  loader: {
    marginTop: 40,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    borderRadius: 12,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
  itemCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLeft: {
    flex: 1,
    marginRight: 8,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  groupBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  itemUnit: {
    fontSize: 14,
    marginBottom: 2,
  },
  itemReorder: {
    fontSize: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    borderRadius: 12,
    maxHeight: '80%',
  },
  modalScrollContent: {
    padding: 24,
    paddingBottom: 150,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 12,
  },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  unitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unitButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  groupRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  groupSelectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  groupSelectText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },

  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
