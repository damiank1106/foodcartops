import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator, RefreshControl } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { Package, TrendingDown, ArrowUpDown, Plus, AlertCircle, Warehouse, ShoppingCart } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { InventoryItemRepository } from '@/lib/repositories/inventory-item.repository';
import { StockLocationRepository } from '@/lib/repositories/stock-location.repository';
import { StockMovementRepository } from '@/lib/repositories/stock-movement.repository';
import { StockBalanceRepository } from '@/lib/repositories/stock-balance.repository';
import { inventoryService } from '@/lib/services/inventory.service';
import type { InventoryItem, StockLocation, StockBalance, StockMovementWithDetails, InventoryUnit, StockMovementReason } from '@/lib/types';

type TabType = 'items' | 'balances' | 'movements';

export default function BossInventoryScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('items');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [movements, setMovements] = useState<StockMovementWithDetails[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');

  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);
  const [showMovementModal, setShowMovementModal] = useState<boolean>(false);

  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemUnit, setNewItemUnit] = useState<InventoryUnit>('pcs');
  const [newItemReorder, setNewItemReorder] = useState<string>('0');

  const [movementItemId, setMovementItemId] = useState<string>('');
  const [movementReason, setMovementReason] = useState<StockMovementReason>('PURCHASE');
  const [movementQty, setMovementQty] = useState<string>('');
  const [movementFromId, setMovementFromId] = useState<string>('');
  const [movementToId, setMovementToId] = useState<string>('');
  const [movementNotes, setMovementNotes] = useState<string>('');

  const itemRepo = useMemo(() => new InventoryItemRepository(), []);
  const locationRepo = useMemo(() => new StockLocationRepository(), []);
  const balanceRepo = useMemo(() => new StockBalanceRepository(), []);
  const movementRepo = useMemo(() => new StockMovementRepository(), []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [itemsData, locationsData] = await Promise.all([
        itemRepo.listActive(),
        locationRepo.listActive(),
      ]);
      setItems(itemsData);
      setLocations(locationsData);

      if (locationsData.length > 0 && !selectedLocationId) {
        const warehouse = locationsData.find(l => l.type === 'WAREHOUSE');
        setSelectedLocationId(warehouse?.id || locationsData[0].id);
      }
    } catch (error) {
      console.error('[Inventory] Load error:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocationId, itemRepo, locationRepo]);

  const loadBalances = useCallback(async () => {
    if (!selectedLocationId) return;
    try {
      const data = await balanceRepo.getBalancesForLocation(selectedLocationId);
      setBalances(data);
    } catch (error) {
      console.error('[Inventory] Load balances error:', error);
    }
  }, [selectedLocationId, balanceRepo]);

  const loadMovements = useCallback(async () => {
    try {
      const data = await movementRepo.listRecent(50);
      setMovements(data);
    } catch (error) {
      console.error('[Inventory] Load movements error:', error);
    }
  }, [movementRepo]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    if (activeTab === 'balances') await loadBalances();
    if (activeTab === 'movements') await loadMovements();
    setRefreshing(false);
  }, [activeTab, loadData, loadBalances, loadMovements]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'balances') loadBalances();
      if (activeTab === 'movements') loadMovements();
    }, [activeTab, loadBalances, loadMovements])
  );

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Error', 'Item name is required');
      return;
    }
    if (!user?.id) return;

    try {
      await itemRepo.create({
        name: newItemName.trim(),
        unit: newItemUnit,
        reorder_level_qty: parseFloat(newItemReorder) || 0,
        user_id: user.id,
      });
      setShowAddItemModal(false);
      setNewItemName('');
      setNewItemUnit('pcs');
      setNewItemReorder('0');
      await loadData();
      Alert.alert('Success', 'Item created');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create item');
    }
  };

  const handleCreateMovement = async () => {
    if (!movementItemId) {
      Alert.alert('Error', 'Select an item');
      return;
    }
    const qty = parseFloat(movementQty);
    if (!qty || qty <= 0) {
      Alert.alert('Error', 'Enter valid quantity');
      return;
    }
    if (!user?.id) return;

    try {
      await inventoryService.createMovement({
        inventory_item_id: movementItemId,
        from_location_id: movementFromId || undefined,
        to_location_id: movementToId || undefined,
        qty,
        reason: movementReason,
        actor_user_id: user.id,
        notes: movementNotes || undefined,
      });
      setShowMovementModal(false);
      setMovementItemId('');
      setMovementReason('PURCHASE');
      setMovementQty('');
      setMovementFromId('');
      setMovementToId('');
      setMovementNotes('');
      await loadBalances();
      await loadMovements();
      Alert.alert('Success', 'Movement recorded');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create movement');
    }
  };

  const renderTabBar = () => (
    <View style={[styles.tabBar, { backgroundColor: theme.card }]}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'items' && { borderBottomColor: theme.primary }]}
        onPress={() => setActiveTab('items')}
      >
        <Package size={20} color={activeTab === 'items' ? theme.primary : theme.textSecondary} />
        <Text style={[styles.tabText, { color: activeTab === 'items' ? theme.primary : theme.textSecondary }]}>
          Items
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'balances' && { borderBottomColor: theme.primary }]}
        onPress={() => setActiveTab('balances')}
      >
        <TrendingDown size={20} color={activeTab === 'balances' ? theme.primary : theme.textSecondary} />
        <Text style={[styles.tabText, { color: activeTab === 'balances' ? theme.primary : theme.textSecondary }]}>
          Balances
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'movements' && { borderBottomColor: theme.primary }]}
        onPress={() => setActiveTab('movements')}
      >
        <ArrowUpDown size={20} color={activeTab === 'movements' ? theme.primary : theme.textSecondary} />
        <Text style={[styles.tabText, { color: activeTab === 'movements' ? theme.primary : theme.textSecondary }]}>
          Movements
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderItemsTab = () => (
    <View style={styles.tabContent}>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }]}
        onPress={() => setShowAddItemModal(true)}
      >
        <Plus size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add Item</Text>
      </TouchableOpacity>
      {items.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.card }]}>
          <Package size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No items yet</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={[styles.itemCard, { backgroundColor: theme.card }]}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
              <Text style={[styles.itemUnit, { color: theme.textSecondary }]}>{item.unit}</Text>
            </View>
            <Text style={[styles.itemReorder, { color: theme.textSecondary }]}>
              Reorder level: {item.reorder_level_qty} {item.unit}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  const renderBalancesTab = () => (
    <View style={styles.tabContent}>
      <View style={[styles.locationPicker, { backgroundColor: theme.card }]}>
        <Text style={[styles.locationLabel, { color: theme.text }]}>Location:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locationScroll}>
          {locations.map((loc) => (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.locationChip,
                { backgroundColor: selectedLocationId === loc.id ? theme.primary : theme.background },
              ]}
              onPress={() => setSelectedLocationId(loc.id)}
            >
              {loc.type === 'WAREHOUSE' ? (
                <Warehouse size={16} color={selectedLocationId === loc.id ? '#fff' : theme.text} />
              ) : (
                <ShoppingCart size={16} color={selectedLocationId === loc.id ? '#fff' : theme.text} />
              )}
              <Text
                style={[
                  styles.locationChipText,
                  { color: selectedLocationId === loc.id ? '#fff' : theme.text },
                ]}
              >
                {loc.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {balances.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.card }]}>
          <TrendingDown size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No stock at this location</Text>
        </View>
      ) : (
        balances.map((bal) => (
          <View key={`${bal.inventory_item_id}-${bal.stock_location_id}`} style={[styles.balanceCard, { backgroundColor: theme.card }]}>
            <View style={styles.balanceHeader}>
              <Text style={[styles.balanceName, { color: theme.text }]}>{bal.inventory_item_name}</Text>
              {bal.is_low_stock ? (
                <View style={[styles.lowStockBadge, { backgroundColor: theme.warning + '20' }]}>
                  <AlertCircle size={14} color={theme.warning} />
                  <Text style={[styles.lowStockText, { color: theme.warning }]}>Low</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.balanceQty, { color: theme.primary }]}>
              {bal.qty} {bal.unit}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  const renderMovementsTab = () => (
    <View style={styles.tabContent}>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }]}
        onPress={() => setShowMovementModal(true)}
      >
        <Plus size={20} color="#fff" />
        <Text style={styles.addButtonText}>Create Movement</Text>
      </TouchableOpacity>
      {movements.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.card }]}>
          <ArrowUpDown size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No movements yet</Text>
        </View>
      ) : (
        movements.map((mov) => (
          <View key={mov.id} style={[styles.movementCard, { backgroundColor: theme.card }]}>
            <View style={styles.movementHeader}>
              <Text style={[styles.movementItem, { color: theme.text }]}>{mov.inventory_item_name}</Text>
              <Text style={[styles.movementReason, { color: theme.primary }]}>{mov.reason}</Text>
            </View>
            <View style={styles.movementDetails}>
              <Text style={[styles.movementLocation, { color: theme.textSecondary }]}>
                {mov.from_location_name || 'External'} → {mov.to_location_name || 'External'}
              </Text>
              <Text style={[styles.movementQty, { color: theme.text }]}>{mov.qty}</Text>
            </View>
            <Text style={[styles.movementActor, { color: theme.textSecondary }]}>
              By {mov.actor_name} • {new Date(mov.created_at).toLocaleDateString()}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderTabBar()}
      <ScrollView
        style={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
        ) : (
          <>
            {activeTab === 'items' && renderItemsTab()}
            {activeTab === 'balances' && renderBalancesTab()}
            {activeTab === 'movements' && renderMovementsTab()}
          </>
        )}
      </ScrollView>

      <Modal visible={showAddItemModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Inventory Item</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              placeholder="Item name"
              placeholderTextColor={theme.textSecondary}
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <Text style={[styles.label, { color: theme.text }]}>Unit:</Text>
            <View style={styles.unitRow}>
              {(['pcs', 'kg', 'g', 'L', 'mL'] as InventoryUnit[]).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitButton, { backgroundColor: newItemUnit === u ? theme.primary : theme.background }]}
                  onPress={() => setNewItemUnit(u)}
                >
                  <Text style={[styles.unitButtonText, { color: newItemUnit === u ? '#fff' : theme.text }]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              placeholder="Reorder level"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              value={newItemReorder}
              onChangeText={setNewItemReorder}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setShowAddItemModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.primary }]} onPress={handleAddItem}>
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showMovementModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Create Movement</Text>
            <Text style={[styles.label, { color: theme.text }]}>Item:</Text>
            <View style={styles.pickerContainer}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.pickerItem,
                    { backgroundColor: movementItemId === item.id ? theme.primary : theme.background },
                  ]}
                  onPress={() => setMovementItemId(item.id)}
                >
                  <Text style={[styles.pickerText, { color: movementItemId === item.id ? '#fff' : theme.text }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { color: theme.text }]}>Reason:</Text>
            <View style={styles.pickerContainer}>
              {(['PURCHASE', 'ISSUE_TO_CART', 'RETURN_TO_WAREHOUSE', 'WASTE', 'ADJUSTMENT', 'TRANSFER'] as StockMovementReason[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.pickerItem,
                    { backgroundColor: movementReason === r ? theme.primary : theme.background },
                  ]}
                  onPress={() => setMovementReason(r)}
                >
                  <Text style={[styles.pickerText, { color: movementReason === r ? '#fff' : theme.text }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              placeholder="Quantity"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              value={movementQty}
              onChangeText={setMovementQty}
            />
            {movementReason !== 'PURCHASE' && (
              <>
                <Text style={[styles.label, { color: theme.text }]}>From Location:</Text>
                <View style={styles.pickerContainer}>
                  {locations.map((loc) => (
                    <TouchableOpacity
                      key={loc.id}
                      style={[
                        styles.pickerItem,
                        { backgroundColor: movementFromId === loc.id ? theme.primary : theme.background },
                      ]}
                      onPress={() => setMovementFromId(loc.id)}
                    >
                      <Text style={[styles.pickerText, { color: movementFromId === loc.id ? '#fff' : theme.text }]}>
                        {loc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            {movementReason !== 'WASTE' && (
              <>
                <Text style={[styles.label, { color: theme.text }]}>To Location:</Text>
                <View style={styles.pickerContainer}>
                  {locations.map((loc) => (
                    <TouchableOpacity
                      key={loc.id}
                      style={[
                        styles.pickerItem,
                        { backgroundColor: movementToId === loc.id ? theme.primary : theme.background },
                      ]}
                      onPress={() => setMovementToId(loc.id)}
                    >
                      <Text style={[styles.pickerText, { color: movementToId === loc.id ? '#fff' : theme.text }]}>
                        {loc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
              placeholder="Notes (optional)"
              placeholderTextColor={theme.textSecondary}
              value={movementNotes}
              onChangeText={setMovementNotes}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setShowMovementModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleCreateMovement}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
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
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  itemUnit: {
    fontSize: 14,
  },
  itemReorder: {
    fontSize: 14,
  },
  locationPicker: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  locationScroll: {
    flexDirection: 'row',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    gap: 6,
  },
  locationChipText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  balanceCard: {
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceName: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  lowStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  lowStockText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  balanceQty: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  movementCard: {
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  movementItem: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  movementReason: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  movementDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  movementLocation: {
    fontSize: 14,
  },
  movementQty: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  movementActor: {
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
    padding: 24,
    maxHeight: '80%',
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
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pickerItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '500' as const,
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
