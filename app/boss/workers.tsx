import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Clock, CheckCircle, Plus, Edit, Trash2, X } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { UserRepository, ShiftRepository, AuditRepository } from '@/lib/repositories';

export default function WorkersScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingWorker, setEditingWorker] = useState<any>(null);
  const [workerName, setWorkerName] = useState<string>('');
  const [workerPin, setWorkerPin] = useState<string>('');

  const userRepo = new UserRepository();
  const shiftRepo = new ShiftRepository();
  const auditRepo = new AuditRepository();

  const { data: workers, isLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: async () => {
      const allWorkers = await userRepo.getActiveWorkers();
      const workersWithShifts = await Promise.all(
        allWorkers.map(async (worker) => {
          const activeShift = await shiftRepo.getActiveShift(worker.id);
          return { ...worker, activeShift };
        })
      );
      return workersWithShifts;
    },
  });

  const createWorkerMutation = useMutation({
    mutationFn: async (data: { name: string; pin: string }) => {
      const newWorker = await userRepo.create({
        name: data.name,
        role: 'operation_manager',
        pin: data.pin,
      });

      if (user) {
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'user',
          entity_id: newWorker.id,
          action: 'create',
          new_data: JSON.stringify({ name: data.name, role: 'operation_manager' }),
        });
      }

      return newWorker;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setShowModal(false);
      resetForm();
      Alert.alert('Success', 'Worker created successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create worker');
    },
  });

  const updateWorkerMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; pin?: string }) => {
      const updateData: any = { name: data.name };
      if (data.pin) {
        const { hashPin } = await import('@/lib/utils/crypto');
        updateData.pin = await hashPin(data.pin);
      }

      await userRepo.update(data.id, updateData);

      if (user) {
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'user',
          entity_id: data.id,
          action: 'update',
          new_data: JSON.stringify(updateData),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setShowModal(false);
      resetForm();
      Alert.alert('Success', 'Worker updated successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update worker');
    },
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: async (workerId: string) => {
      await userRepo.deactivate(workerId);

      if (user) {
        await auditRepo.log({
          user_id: user.id,
          entity_type: 'user',
          entity_id: workerId,
          action: 'delete',
          old_data: JSON.stringify({ id: workerId }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      Alert.alert('Success', 'Worker deleted successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to delete worker');
    },
  });

  const openAddModal = () => {
    setEditingWorker(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (worker: any) => {
    setEditingWorker(worker);
    setWorkerName(worker.name);
    setWorkerPin('');
    setShowModal(true);
  };

  const resetForm = () => {
    setWorkerName('');
    setWorkerPin('');
    setEditingWorker(null);
  };

  const handleSubmit = () => {
    if (!workerName.trim()) {
      Alert.alert('Error', 'Please enter worker name');
      return;
    }

    if (!editingWorker && !workerPin.trim()) {
      Alert.alert('Error', 'Please enter worker PIN');
      return;
    }

    if (workerPin && (workerPin.length < 4 || workerPin.length > 8)) {
      Alert.alert('Error', 'PIN must be between 4 and 8 digits');
      return;
    }

    if (workerPin && !/^\d+$/.test(workerPin)) {
      Alert.alert('Error', 'PIN must contain only numbers');
      return;
    }

    if (editingWorker) {
      updateWorkerMutation.mutate({
        id: editingWorker.id,
        name: workerName.trim(),
        pin: workerPin.trim() || undefined,
      });
    } else {
      createWorkerMutation.mutate({
        name: workerName.trim(),
        pin: workerPin.trim(),
      });
    }
  };

  const handleDelete = (worker: any) => {
    Alert.alert(
      'Delete Worker',
      `Are you sure you want to delete ${worker.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteWorkerMutation.mutate(worker.id),
        },
      ]
    );
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
        <Text style={[styles.title, { color: theme.text }]}>Manage Workers</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={openAddModal}
        >
          <Plus size={20} color="#FFF" />
          <Text style={styles.addButtonText}>Add Worker</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {workers?.map((worker) => (
            <View key={worker.id} style={[styles.workerCard, { backgroundColor: theme.card }]}>
              <View style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}>
                <User size={24} color={theme.primary} />
              </View>
              <View style={styles.workerInfo}>
                <Text style={[styles.workerName, { color: theme.text }]}>{worker.name}</Text>
                <View style={styles.status}>
                  {worker.activeShift ? (
                    <View style={[styles.statusBadge, { backgroundColor: theme.success + '20' }]}>
                      <CheckCircle size={12} color={theme.success} />
                      <Text style={[styles.statusText, { color: theme.success }]}>Active</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, { backgroundColor: theme.textSecondary + '20' }]}>
                      <Clock size={12} color={theme.textSecondary} />
                      <Text style={[styles.statusText, { color: theme.textSecondary }]}>Off</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: theme.primary + '20' }]}
                  onPress={() => openEditModal(worker)}
                >
                  <Edit size={16} color={theme.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: theme.error + '20' }]}
                  onPress={() => handleDelete(worker)}
                  disabled={deleteWorkerMutation.isPending}
                >
                  <Trash2 size={16} color={theme.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingWorker ? 'Edit Worker' : 'Add New Worker'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeButton}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={[styles.label, { color: theme.text }]}>Worker Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                value={workerName}
                onChangeText={setWorkerName}
                placeholder="Enter worker name"
                placeholderTextColor={theme.textSecondary}
                autoFocus
              />

              <Text style={[styles.label, { color: theme.text }]}>
                {editingWorker ? 'New PIN (leave blank to keep current)' : 'PIN (4-8 digits)'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                value={workerPin}
                onChangeText={setWorkerPin}
                placeholder={editingWorker ? 'Enter new PIN (4-8 digits)' : 'Enter 4-8 digit PIN'}
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
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
                disabled={createWorkerMutation.isPending || updateWorkerMutation.isPending}
              >
                {createWorkerMutation.isPending || updateWorkerMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.footerButtonText, { color: '#FFF' }]}>
                    {editingWorker ? 'Save' : 'Create'}
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
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 6,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
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
    maxHeight: '70%',
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
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
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
