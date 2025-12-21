import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Trash2, X, User, MapPin } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { ShiftRepository, UserRepository, CartRepository, AuditRepository } from '@/lib/repositories';
import { useAuth } from '@/lib/contexts/auth.context';
import type { WorkerShift } from '@/lib/types';
import { format } from 'date-fns';

export default function BossShiftsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<WorkerShift | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [selectedCartId, setSelectedCartId] = useState<string>('');
  const [startingCash, setStartingCash] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [newCartName, setNewCartName] = useState<string>('');
  const [showNewCartInput, setShowNewCartInput] = useState<boolean>(false);

  const shiftRepo = new ShiftRepository();
  const userRepo = new UserRepository();
  const cartRepo = new CartRepository();
  const auditRepo = new AuditRepository();

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['boss-shifts'],
    queryFn: async () => {
      const allShifts = await shiftRepo.getShifts();
      return allShifts.filter(shift => shift.status === 'active');
    },
  });

  const { data: workers } = useQuery({
    queryKey: ['shift-eligible-workers'],
    queryFn: () => userRepo.getShiftEligibleWorkers(),
  });

  const { data: carts } = useQuery({
    queryKey: ['carts'],
    queryFn: () => cartRepo.findAll(),
  });

  const { data: workerMap } = useQuery({
    queryKey: ['shift-eligible-worker-map'],
    queryFn: async () => {
      const allWorkers = await userRepo.getShiftEligibleWorkers();
      return Object.fromEntries(allWorkers.map((w) => [w.id, w.name]));
    },
  });

  const { data: cartMap } = useQuery({
    queryKey: ['cart-map'],
    queryFn: async () => {
      const allCarts = await cartRepo.findAll();
      return Object.fromEntries(allCarts.map((c) => [c.id, c.name]));
    },
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: { worker_id: string; cart_id: string; starting_cash_cents: number; notes?: string }) => {
      const shift = await shiftRepo.startShift(
        data.worker_id,
        data.cart_id,
        data.starting_cash_cents,
        data.notes
      );

      if (user) {
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'shift',
          entity_id: shift.id,
          action: 'create',
          new_data: JSON.stringify(shift),
        });
      }

      return shift;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowModal(false);
      resetForm();
      Alert.alert('Success', 'Shift created successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create shift');
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      if (user) {
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'shift',
          entity_id: shiftId,
          action: 'delete',
          old_data: JSON.stringify({ id: shiftId }),
        });
      }

      await shiftRepo.deleteShift(shiftId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      Alert.alert('Success', 'Shift deleted successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to delete shift');
    },
  });

  const endShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      await shiftRepo.endShift(shiftId);

      if (user) {
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'shift',
          entity_id: shiftId,
          action: 'end',
          new_data: JSON.stringify({ status: 'ended' }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boss-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      Alert.alert('Success', 'Shift ended successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to end shift');
    },
  });

  const openAddModal = () => {
    setEditingShift(null);
    resetForm();
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedWorkerId('');
    setSelectedCartId('');
    setStartingCash('');
    setNotes('');
    setNewCartName('');
    setShowNewCartInput(false);
  };

  const handleSubmit = async () => {
    if (!selectedWorkerId) {
      Alert.alert('Error', 'Please select a worker');
      return;
    }

    let cartId = selectedCartId;

    if (showNewCartInput && newCartName.trim()) {
      try {
        const newCart = await cartRepo.create({ name: newCartName.trim() });
        cartId = newCart.id;
        queryClient.invalidateQueries({ queryKey: ['carts'] });
        queryClient.invalidateQueries({ queryKey: ['cart-map'] });
      } catch {
        Alert.alert('Error', 'Failed to create new cart');
        return;
      }
    }

    if (!cartId) {
      Alert.alert('Error', 'Please select a cart or create a new one');
      return;
    }

    let cents = 0;
    if (startingCash && startingCash.trim() !== '') {
      if (isNaN(parseFloat(startingCash))) {
        Alert.alert('Error', 'Please enter a valid starting cash amount');
        return;
      }

      if (parseFloat(startingCash) < 0) {
        Alert.alert('Error', 'Starting cash cannot be negative');
        return;
      }

      cents = Math.round(parseFloat(startingCash) * 100);
    }

    createShiftMutation.mutate({
      worker_id: selectedWorkerId,
      cart_id: cartId,
      starting_cash_cents: cents,
      notes: notes || undefined,
    });
  };

  const handleDelete = (shift: WorkerShift) => {
    Alert.alert('Delete Shift', 'Are you sure you want to delete this shift? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteShiftMutation.mutate(shift.id),
      },
    ]);
  };

  const handleEndShift = (shift: WorkerShift) => {
    if (shift.status !== 'active') return;

    Alert.alert('End Shift', 'Are you sure you want to end this shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Shift',
        style: 'default',
        onPress: () => endShiftMutation.mutate(shift.id),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Manage Shifts</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={openAddModal}
        >
          <Plus size={20} color="#FFF" />
          <Text style={styles.addButtonText}>Add Shift</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {shifts && shifts.length > 0 ? (
            shifts.map((shift) => {
              const duration = shift.clock_out
                ? Math.floor((shift.clock_out - shift.clock_in) / 1000 / 60)
                : Math.floor((Date.now() - shift.clock_in) / 1000 / 60);
              const hours = Math.floor(duration / 60);
              const minutes = duration % 60;

              return (
                <View key={shift.id} style={[styles.shiftCard, { backgroundColor: theme.card }]}>
                  <View style={styles.shiftHeader}>
                    <View style={styles.shiftLeft}>
                      <View style={[styles.workerBadge, { backgroundColor: theme.primary + '20' }]}>
                        <User size={14} color={theme.primary} />
                        <Text style={[styles.workerName, { color: theme.primary }]}>
                          {workerMap?.[shift.worker_id] || 'Unknown'}
                        </Text>
                      </View>
                      <View style={styles.cartRow}>
                        <MapPin size={14} color={theme.textSecondary} />
                        <Text style={[styles.cartName, { color: theme.textSecondary }]}>
                          {cartMap?.[shift.cart_id] || 'Unknown Cart'}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            shift.status === 'active' ? theme.success + '20' : theme.textSecondary + '20',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: shift.status === 'active' ? theme.success : theme.textSecondary },
                        ]}
                      >
                        {shift.status === 'active' ? 'Active' : 'Ended'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.shiftDetails}>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Clock In:</Text>
                      <Text style={[styles.detailValue, { color: theme.text }]}>
                        {format(new Date(shift.clock_in), 'MMM d, h:mm a')}
                      </Text>
                    </View>
                    {shift.clock_out && (
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Clock Out:</Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                          {format(new Date(shift.clock_out), 'MMM d, h:mm a')}
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Duration:</Text>
                      <Text style={[styles.detailValue, { color: theme.primary }]}>
                        {hours}h {minutes}m
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Starting Cash:</Text>
                      <Text style={[styles.detailValue, { color: theme.text }]}>
                        ₱{((shift.starting_cash_cents || 0) / 100).toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.shiftActions}>
                    {shift.status === 'active' && (
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: theme.warning || '#F59E0B' }]}
                        onPress={() => handleEndShift(shift)}
                      >
                        <Clock size={16} color="#FFF" />
                        <Text style={[styles.actionButtonText, { color: '#FFF' }]}>End</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: theme.error }]}
                      onPress={() => handleDelete(shift)}
                      disabled={deleteShiftMutation.isPending}
                    >
                      <Trash2 size={16} color="#FFF" />
                      <Text style={[styles.actionButtonText, { color: '#FFF' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Clock size={64} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No shifts yet</Text>
              <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
                Tap &ldquo;Add Shift&rdquo; to create a shift for a worker
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingShift ? 'Edit Shift' : 'Add New Shift'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeButton}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={[styles.label, { color: theme.text }]}>Worker</Text>
              <View style={styles.selectGrid}>
                {workers?.map((worker) => (
                  <TouchableOpacity
                    key={worker.id}
                    style={[
                      styles.selectOption,
                      { backgroundColor: theme.background },
                      selectedWorkerId === worker.id && {
                        backgroundColor: theme.primary + '20',
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => setSelectedWorkerId(worker.id)}
                  >
                    <Text
                      style={[
                        styles.selectOptionText,
                        { color: theme.text },
                        selectedWorkerId === worker.id && { color: theme.primary, fontWeight: '600' as const },
                      ]}
                    >
                      {worker.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: theme.text }]}>Cart</Text>
              <View style={styles.selectGrid}>
                {carts?.map((cart) => (
                  <TouchableOpacity
                    key={cart.id}
                    style={[
                      styles.selectOption,
                      { backgroundColor: theme.background },
                      selectedCartId === cart.id && !showNewCartInput && {
                        backgroundColor: theme.primary + '20',
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => {
                      setSelectedCartId(cart.id);
                      setShowNewCartInput(false);
                      setNewCartName('');
                    }}
                  >
                    <Text
                      style={[
                        styles.selectOptionText,
                        { color: theme.text },
                        selectedCartId === cart.id && !showNewCartInput && { color: theme.primary, fontWeight: '600' as const },
                      ]}
                    >
                      {cart.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.selectOption,
                    { backgroundColor: theme.background },
                    showNewCartInput && {
                      backgroundColor: theme.primary + '20',
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => {
                    setShowNewCartInput(true);
                    setSelectedCartId('');
                  }}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      { color: theme.text },
                      showNewCartInput && { color: theme.primary, fontWeight: '600' as const },
                    ]}
                  >
                    + New Cart
                  </Text>
                </TouchableOpacity>
              </View>

              {showNewCartInput && (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>New Cart Name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                    value={newCartName}
                    onChangeText={setNewCartName}
                    placeholder="Enter cart name"
                    placeholderTextColor={theme.textSecondary}
                  />
                </>
              )}

              <Text style={[styles.label, { color: theme.text }]}>Starting Cash (Optional)</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.background }]}>
                <Text style={[styles.currencySymbol, { color: theme.textSecondary }]}>₱</Text>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={startingCash}
                  onChangeText={setStartingCash}
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>

              <Text style={[styles.label, { color: theme.text }]}>Notes (Optional)</Text>
              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                ]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.footerButton, { backgroundColor: theme.background }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[styles.footerButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerButton, styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleSubmit}
                disabled={createShiftMutation.isPending}
              >
                {createShiftMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.footerButtonText, { color: '#FFF' }]}>
                    {editingShift ? 'Save' : 'Create'}
                  </Text>
                )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 0,
  },
  shiftCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  shiftLeft: {
    flex: 1,
  },
  workerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginBottom: 8,
  },
  workerName: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartName: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  shiftDetails: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  shiftActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
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
  closeButton: {
    padding: 4,
  },
  modalScroll: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginTop: 16,
  },
  selectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectOptionText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  textArea: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
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
  footerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
