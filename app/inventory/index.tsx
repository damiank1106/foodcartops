import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, ActionSheetIOS } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { Package, Plus, Edit2, Trash2, Minus, Save, Check, X } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { InventoryItemRepository } from '@/lib/repositories/inventory-item.repository';
import { InventoryStorageGroupRepository } from '@/lib/repositories/inventory-storage-group.repository';
import type { InventoryItem, InventoryUnit, InventoryStorageGroup } from '@/lib/types';
import { onSyncComplete } from '@/lib/services/sync.service';
import { usePreserveScrollOnDataRefresh } from '@/lib/utils/usePreserveScrollOnDataRefresh';

export default function InventoryScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [storageGroups, setStorageGroups] = useState<InventoryStorageGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'ALL'>('ALL');

  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [itemName, setItemName] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<InventoryUnit>('pcs');
  const [itemReorder, setItemReorder] = useState<string>('0');
  const [itemGroupId, setItemGroupId] = useState<string | null>(null);
  const [itemPrice, setItemPrice] = useState<string>('0');
  const [itemCurrentQty, setItemCurrentQty] = useState<string>('0');

  const [showCreateGroupInModal, setShowCreateGroupInModal] = useState<boolean>(false);
  const [newGroupNameInModal, setNewGroupNameInModal] = useState<string>('');
  const [isSavingGroup, setIsSavingGroup] = useState<boolean>(false);

  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
  const [renamingGroup, setRenamingGroup] = useState<InventoryStorageGroup | null>(null);
  const [renameGroupName, setRenameGroupName] = useState<string>('');
  const [isRenamingGroup, setIsRenamingGroup] = useState<boolean>(false);

  const [editingQuantities, setEditingQuantities] = useState<Record<string, number>>({});

  const itemRepo = useMemo(() => new InventoryItemRepository(), []);
  const groupRepo = useMemo(() => new InventoryStorageGroupRepository(), []);

  const isAnyModalOpen = showItemModal || showRenameModal;
  const { scrollViewRef, handleScroll, wrapDataLoader } = usePreserveScrollOnDataRefresh(isAnyModalOpen);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      await wrapDataLoader(async () => {
        const [itemsData, groupsData] = await Promise.all([
          itemRepo.listActive(),
          groupRepo.listActive(),
        ]);
        setItems(itemsData);
        setStorageGroups(groupsData);
      });
    } catch (error) {
      console.error('[Inventory] Load error:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [itemRepo, groupRepo, wrapDataLoader]);

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

  useEffect(() => {
    const unsubscribe = onSyncComplete(() => {
      console.log('[Inventory] Sync completed, refreshing data');
      loadData();
    });
    return unsubscribe;
  }, [loadData]);

  const handleCreateGroupInModal = async () => {
    if (!newGroupNameInModal.trim() || !user?.id || isSavingGroup) return;

    try {
      setIsSavingGroup(true);
      const result = await groupRepo.create({
        name: newGroupNameInModal.trim(),
        user_id: user.id,
      });
      
      if ((result as any).existing) {
        const existingGroup = (result as any).group;
        await loadData();
        setItemGroupId(existingGroup.id);
        setNewGroupNameInModal('');
        setShowCreateGroupInModal(false);
        Alert.alert('Group already exists', `Selected existing group: "${existingGroup.name}"`);
      } else {
        await loadData();
        setItemGroupId((result as any).id);
        setNewGroupNameInModal('');
        setShowCreateGroupInModal(false);
        Alert.alert('Success', 'Storage group created');
      }
    } catch (error: any) {
      console.error('[Inventory] Create group error:', error);
      Alert.alert('Error', error.message || 'Failed to create group');
    } finally {
      setIsSavingGroup(false);
    }
  };



  const openRenameModal = (group: InventoryStorageGroup) => {
    setRenamingGroup(group);
    setRenameGroupName(group.name);
    setShowRenameModal(true);
  };

  const handleRenameGroup = async () => {
    if (!renameGroupName.trim() || !renamingGroup || !user?.id || isRenamingGroup) return;

    try {
      setIsRenamingGroup(true);
      const result = await groupRepo.rename({
        id: renamingGroup.id,
        name: renameGroupName.trim(),
        user_id: user.id,
      });
      
      if ((result as any).error) {
        await loadData();
        setShowRenameModal(false);
        setRenamingGroup(null);
        setRenameGroupName('');
        Alert.alert('Group already exists', (result as any).error);
      } else {
        await loadData();
        setShowRenameModal(false);
        setRenamingGroup(null);
        setRenameGroupName('');
        Alert.alert('Success', 'Group renamed');
      }
    } catch (error: any) {
      console.error('[Inventory] Rename error:', error);
      Alert.alert('Error', error.message || 'Failed to rename group');
    } finally {
      setIsRenamingGroup(false);
    }
  };

  const handleLongPressGroup = (group: InventoryStorageGroup) => {
    if (!user?.id) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Rename', 'Delete'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) {
            openRenameModal(group);
          } else if (buttonIndex === 2) {
            Alert.alert(
              'Delete Group',
              `Delete "${group.name}"? Items in this group will move to "All".`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await groupRepo.deactivate({ id: group.id, user_id: user.id });
                      if (selectedGroupId === group.id) {
                        setSelectedGroupId('ALL');
                      }
                      await loadData();
                      Alert.alert('Success', 'Group deleted');
                    } catch (error: any) {
                      Alert.alert('Error', error.message || 'Failed to delete group');
                    }
                  },
                },
              ]
            );
          }
        }
      );
    } else {
      Alert.alert('Group Actions', `Manage "${group.name}"`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: () => openRenameModal(group),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Group',
              `Delete "${group.name}"? Items in this group will move to "All".`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await groupRepo.deactivate({ id: group.id, user_id: user.id });
                      if (selectedGroupId === group.id) {
                        setSelectedGroupId('ALL');
                      }
                      await loadData();
                      Alert.alert('Success', 'Group deleted');
                    } catch (error: any) {
                      Alert.alert('Error', error.message || 'Failed to delete group');
                    }
                  },
                },
              ]
            );
          },
        },
      ]);
    }
  };

  const openItemModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setItemName(item.name);
      setItemUnit(item.unit);
      setItemReorder(item.reorder_level_qty.toString());
      setItemGroupId(item.storage_group_id || null);
      setItemPrice((item.price_cents / 100).toFixed(2));
      setItemCurrentQty(item.current_qty.toString());
    } else {
      setEditingItem(null);
      setItemName('');
      setItemUnit('pcs');
      setItemReorder('0');
      setItemGroupId(selectedGroupId !== 'ALL' ? selectedGroupId : null);
      setItemPrice('0');
      setItemCurrentQty('0');
    }
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!itemName.trim()) {
      Alert.alert('Error', 'Item name is required');
      return;
    }
    if (!user?.id) return;

    const priceCents = Math.round((parseFloat(itemPrice) || 0) * 100);
    const currentQty = parseFloat(itemCurrentQty) || 0;

    try {
      if (editingItem) {
        await itemRepo.update({
          id: editingItem.id,
          name: itemName.trim(),
          unit: itemUnit,
          current_qty: currentQty,
          reorder_level_qty: parseFloat(itemReorder) || 0,
          storage_group_id: itemGroupId,
          price_cents: priceCents,
          user_id: user.id,
        });
        Alert.alert('Success', 'Item updated');
      } else {
        await itemRepo.create({
          name: itemName.trim(),
          unit: itemUnit,
          current_qty: currentQty,
          reorder_level_qty: parseFloat(itemReorder) || 0,
          storage_group_id: itemGroupId || undefined,
          price_cents: priceCents,
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

  const handleQuantityChange = (itemId: string, delta: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const currentEditQty = editingQuantities[itemId] ?? item.current_qty;
    const newQty = Math.max(0, currentEditQty + delta);
    setEditingQuantities(prev => ({ ...prev, [itemId]: newQty }));
  };

  const handleSaveQuantity = async (itemId: string) => {
    if (!user?.id) return;
    const newQty = editingQuantities[itemId];
    if (newQty === undefined) return;

    try {
      await itemRepo.updateQuantity({
        id: itemId,
        current_qty: newQty,
        user_id: user.id,
      });
      setEditingQuantities(prev => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });
      Alert.alert('Success', 'Inventory updated');
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update quantity');
    }
  };

  const filteredItems = useMemo(() => {
    if (selectedGroupId === 'ALL') return items;
    return items.filter(item => item.storage_group_id === selectedGroupId);
  }, [items, selectedGroupId]);

  const renderGroupFilter = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.groupFilter, { backgroundColor: theme.card }]}
      contentContainerStyle={styles.groupFilterContent}
    >
      <TouchableOpacity
        style={[styles.groupButton, selectedGroupId === 'ALL' && { backgroundColor: theme.primary }]}
        onPress={() => setSelectedGroupId('ALL')}
      >
        <Text style={[styles.groupButtonText, { color: selectedGroupId === 'ALL' ? '#fff' : theme.text }]}>
          All
        </Text>
      </TouchableOpacity>
      {storageGroups.map((group) => (
        <TouchableOpacity
          key={group.id}
          style={[styles.groupButton, selectedGroupId === group.id && { backgroundColor: theme.primary }]}
          onPress={() => setSelectedGroupId(group.id)}
          onLongPress={() => handleLongPressGroup(group)}
          delayLongPress={400}
        >
          <Text style={[styles.groupButtonText, { color: selectedGroupId === group.id ? '#fff' : theme.text }]}>
            {group.name}
          </Text>
        </TouchableOpacity>
      ))}
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
        filteredItems.map((item) => {
          const isEditing = editingQuantities[item.id] !== undefined;
          const displayQty = isEditing ? editingQuantities[item.id] : item.current_qty;
          const totalPrice = (item.price_cents / 100) * displayQty;
          const itemGroup = storageGroups.find(g => g.id === item.storage_group_id);

          return (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: theme.card }]}>
              <View style={styles.itemContent}>
                <TouchableOpacity
                  style={styles.itemLeft}
                  onPress={() => openItemModal(item)}
                >
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
                    {itemGroup && (
                      <View style={[styles.groupBadge, { backgroundColor: theme.primary + '20' }]}>
                        <Text style={[styles.groupBadgeText, { color: theme.primary }]}>
                          {itemGroup.name}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.itemUnit, { color: theme.textSecondary }]}>{item.unit}</Text>
                  <View style={styles.qtyRow}>
                    <Text style={[styles.itemQty, { color: theme.text, fontWeight: '600' as const }]}>
                      Qty: {displayQty} {item.unit}
                    </Text>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={[styles.qtyButton, { backgroundColor: theme.error + '20' }]}
                        onPress={() => handleQuantityChange(item.id, -1)}
                        disabled={displayQty === 0}
                      >
                        <Minus size={18} color={displayQty === 0 ? theme.textSecondary : theme.error} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.qtyButton, { backgroundColor: theme.success + '20' }]}
                        onPress={() => handleQuantityChange(item.id, 1)}
                      >
                        <Plus size={18} color={theme.success} />
                      </TouchableOpacity>
                      {isEditing && (
                        <TouchableOpacity
                          style={[styles.qtyButton, { backgroundColor: theme.primary }]}
                          onPress={() => handleSaveQuantity(item.id)}
                        >
                          <Save size={18} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.itemPrice, { color: theme.success, fontWeight: '600' as const }]}>
                    Price: ₱{totalPrice.toFixed(2)}
                  </Text>
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
          );
        })
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderGroupFilter()}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
        ) : (
          renderItemsList()
        )}
      </ScrollView>

      <Modal visible={showItemModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <ScrollView 
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
              </Text>
              
              <Text style={[styles.label, { color: theme.text }]}>Storage Group:</Text>
              <View style={styles.groupSelectorRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupScroll}>
                  <TouchableOpacity
                    style={[styles.groupSelectChip, { backgroundColor: itemGroupId === null ? theme.primary : theme.background }]}
                    onPress={() => setItemGroupId(null)}
                  >
                    <Text style={[styles.groupSelectChipText, { color: itemGroupId === null ? '#fff' : theme.text }]}>None</Text>
                  </TouchableOpacity>
                  {storageGroups.map((group) => (
                    <TouchableOpacity
                      key={group.id}
                      style={[styles.groupSelectChip, { backgroundColor: itemGroupId === group.id ? theme.primary : theme.background }]}
                      onPress={() => setItemGroupId(group.id)}
                    >
                      <Text style={[styles.groupSelectChipText, { color: itemGroupId === group.id ? '#fff' : theme.text }]}>
                        {group.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.addGroupButton, { backgroundColor: theme.primary }]}
                  onPress={() => setShowCreateGroupInModal(true)}
                >
                  <Plus size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              {showCreateGroupInModal && (
                <View style={[styles.createGroupInline, { backgroundColor: theme.background }]}>
                  <TextInput
                    style={[styles.createGroupInput, { color: theme.text }]}
                    placeholder="New group name"
                    placeholderTextColor={theme.textSecondary}
                    value={newGroupNameInModal}
                    onChangeText={setNewGroupNameInModal}
                    editable={!isSavingGroup}
                  />
                  <TouchableOpacity
                    style={[styles.createGroupCheckButton, { backgroundColor: isSavingGroup ? theme.textSecondary : theme.success }]}
                    onPress={handleCreateGroupInModal}
                    disabled={isSavingGroup || !newGroupNameInModal.trim()}
                  >
                    {isSavingGroup ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Check size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createGroupCancelButton, { backgroundColor: theme.error }]}
                    onPress={() => {
                      if (!isSavingGroup) {
                        setShowCreateGroupInModal(false);
                        setNewGroupNameInModal('');
                      }
                    }}
                    disabled={isSavingGroup}
                  >
                    <X size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

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
              <View style={styles.unitRow}>
                {(['bundle', 'pack'] as InventoryUnit[]).map((u) => (
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
              <Text style={[styles.label, { color: theme.text }]}>Price (₱):</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Price in pesos"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                value={itemPrice}
                onChangeText={setItemPrice}
              />
              <Text style={[styles.label, { color: theme.text }]}>Current Quantity:</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Current quantity"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={itemCurrentQty}
                onChangeText={setItemCurrentQty}
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showRenameModal} animationType="fade" transparent>
        <View style={styles.renameModalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.renameModalContent, { backgroundColor: theme.card }]}>
              <Text style={[styles.renameModalTitle, { color: theme.text }]}>Rename Group</Text>
              <Text style={[styles.renameModalLabel, { color: theme.textSecondary }]}>Enter new name:</Text>
              <TextInput
                style={[styles.renameModalInput, { backgroundColor: theme.background, color: theme.text }]}
                placeholder="Group name"
                placeholderTextColor={theme.textSecondary}
                value={renameGroupName}
                onChangeText={setRenameGroupName}
                autoFocus
                editable={!isRenamingGroup}
              />
              <View style={styles.renameModalButtons}>
                <TouchableOpacity
                  style={[styles.renameModalButton, { backgroundColor: theme.background }]}
                  onPress={() => {
                    if (!isRenamingGroup) {
                      setShowRenameModal(false);
                      setRenamingGroup(null);
                      setRenameGroupName('');
                    }
                  }}
                  disabled={isRenamingGroup}
                >
                  <Text style={[styles.renameModalButtonText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameModalButton, { backgroundColor: isRenamingGroup ? theme.textSecondary : theme.primary }]}
                  onPress={handleRenameGroup}
                  disabled={isRenamingGroup || !renameGroupName.trim()}
                >
                  {isRenamingGroup ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.renameModalButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  itemPrice: {
    fontSize: 15,
    marginBottom: 2,
  },
  itemReorder: {
    fontSize: 12,
  },
  itemQty: {
    fontSize: 14,
    marginBottom: 2,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  qtyControls: {
    flexDirection: 'row',
    gap: 6,
  },
  qtyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingBottom: 200,
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
  groupSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  groupScroll: {
    flex: 1,
  },
  groupSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  groupSelectChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  addGroupButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createGroupInline: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  createGroupInput: {
    flex: 1,
    padding: 8,
    fontSize: 14,
  },
  createGroupCheckButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createGroupCancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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

  renameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  renameModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    padding: 24,
  },
  renameModalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  renameModalLabel: {
    fontSize: 14,
    marginBottom: 12,
  },
  renameModalInput: {
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 16,
  },
  renameModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  renameModalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  renameModalButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
});
