import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Key, UserX, UserCheck, X } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { UserRepository } from '@/lib/repositories';
import { UserCartAssignmentRepository } from '@/lib/repositories/user-cart-assignment.repository';
import { User, UserRole } from '@/lib/types';

type ModalMode = 'create' | 'edit' | 'pin' | null;

export default function UsersScreen() {
  const { theme } = useTheme();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    role: 'worker' as UserRole,
    pin: '',
    confirmPin: '',
    assignedCartIds: [] as string[],
  });

  const userRepo = new UserRepository();
  const assignmentRepo = new UserCartAssignmentRepository();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users-with-carts'],
    queryFn: () => userRepo.getAllWithCartCounts(),
  });



  useQuery({
    queryKey: ['user-assignments', selectedUser?.id, modalMode, selectedUser],
    queryFn: () => selectedUser ? assignmentRepo.getAssignmentsByUserId(selectedUser.id) : Promise.resolve([]),
    enabled: !!selectedUser && modalMode === 'edit',
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentUser) throw new Error('Not authenticated');
      if (data.name.length < 2) throw new Error('Name must be at least 2 characters');
      if (data.pin.length < 4 || data.pin.length > 8) throw new Error('PIN must be 4-8 digits');
      if (data.pin !== data.confirmPin) throw new Error('PINs do not match');
      if (!/^\d+$/.test(data.pin)) throw new Error('PIN must contain only digits');

      const user = await userRepo.createWithAudit(
        {
          name: data.name,
          role: data.role,
          pin: data.pin,
        },
        currentUser.id
      );



      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-carts'] });
      queryClient.invalidateQueries({ queryKey: ['shift-eligible-workers'] });
      queryClient.invalidateQueries({ queryKey: ['shift-eligible-worker-map'] });
      setModalMode(null);
      resetForm();
      Alert.alert('Success', 'User created successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { userId: string; updates: typeof formData }) => {
      if (!currentUser) throw new Error('Not authenticated');
      if (data.updates.name.length < 2) throw new Error('Name must be at least 2 characters');

      const oldUser = await userRepo.findById(data.userId);
      if (!oldUser) throw new Error('User not found');

      if (data.updates.name !== oldUser.name) {
        await userRepo.updateWithAudit(data.userId, { name: data.updates.name }, currentUser.id);
      }

      if (data.updates.role !== oldUser.role) {
        await userRepo.updateRole(data.userId, data.updates.role, currentUser.id);
      }


    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-carts'] });
      queryClient.invalidateQueries({ queryKey: ['user-assignments'] });
      setModalMode(null);
      resetForm();
      setSelectedUser(null);
      Alert.alert('Success', 'User updated successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const resetPinMutation = useMutation({
    mutationFn: async (data: { userId: string; newPin: string; confirmPin: string }) => {
      if (!currentUser) throw new Error('Not authenticated');
      if (data.newPin.length < 4 || data.newPin.length > 8) throw new Error('PIN must be 4-8 digits');
      if (data.newPin !== data.confirmPin) throw new Error('PINs do not match');
      if (!/^\d+$/.test(data.newPin)) throw new Error('PIN must contain only digits');

      await userRepo.resetPin(data.userId, data.newPin, currentUser.id);
    },
    onSuccess: () => {
      setModalMode(null);
      resetForm();
      setSelectedUser(null);
      Alert.alert('Success', 'PIN reset successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (user: User) => {
      if (!currentUser) throw new Error('Not authenticated');
      if (user.is_active === 1) {
        await userRepo.deactivateWithAudit(user.id, currentUser.id);
      } else {
        await userRepo.activateWithAudit(user.id, currentUser.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-carts'] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      role: 'worker',
      pin: '',
      confirmPin: '',
      assignedCartIds: [],
    });
  };

  const openEditModal = async (user: User) => {
    setSelectedUser(user);
    const assignments = await assignmentRepo.getAssignmentsByUserId(user.id);
    setFormData({
      name: user.name,
      role: user.role,
      pin: '',
      confirmPin: '',
      assignedCartIds: assignments.map((a) => a.cart_id),
    });
    setModalMode('edit');
  };

  const openPinModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      name: '',
      role: 'worker',
      pin: '',
      confirmPin: '',
      assignedCartIds: [],
    });
    setModalMode('pin');
  };

  const handleSubmit = () => {
    if (modalMode === 'create') {
      createUserMutation.mutate(formData);
    } else if (modalMode === 'edit' && selectedUser) {
      updateUserMutation.mutate({ userId: selectedUser.id, updates: formData });
    } else if (modalMode === 'pin' && selectedUser) {
      resetPinMutation.mutate({
        userId: selectedUser.id,
        newPin: formData.pin,
        confirmPin: formData.confirmPin,
      });
    }
  };



  const getRoleBadgeColor = (role: UserRole) => {
    if (role === 'boss') return theme.error;
    return theme.success;
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
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            resetForm();
            setSelectedUser(null);
            setModalMode('create');
          }}
        >
          <Plus size={20} color="#fff" />
          <Text style={styles.addButtonText}>Add User</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {users?.map((user) => (
          <View key={user.id} style={[styles.userCard, { backgroundColor: theme.card }]}>
            <View style={styles.userHeader}>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>{user.name}</Text>
                <View style={styles.badges}>
                  <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(user.role) + '20' }]}>
                    <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(user.role) }]}>
                      {user.role.toUpperCase()}
                    </Text>
                  </View>

                  {user.is_active === 0 && (
                    <View style={[styles.inactiveBadge, { backgroundColor: theme.error + '20' }]}>
                      <Text style={[styles.inactiveBadgeText, { color: theme.error }]}>INACTIVE</Text>
                    </View>
                  )}
                </View>
              </View>
              {user.role !== 'boss' && (
                <View style={styles.userActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.primary + '20' }]}
                    onPress={() => openEditModal(user)}
                  >
                    <Edit2 size={18} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.warning + '20' }]}
                    onPress={() => openPinModal(user)}
                  >
                    <Key size={18} color={theme.warning} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: (user.is_active === 1 ? theme.error : theme.success) + '20' }]}
                    onPress={() => toggleActiveMutation.mutate(user)}
                    disabled={toggleActiveMutation.isPending}
                  >
                    {user.is_active === 1 ? (
                      <UserX size={18} color={theme.error} />
                    ) : (
                      <UserCheck size={18} color={theme.success} />
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modalMode !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {modalMode === 'create' && 'Add New User'}
                {modalMode === 'edit' && 'Edit User'}
                {modalMode === 'pin' && 'Reset PIN'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setModalMode(null);
                  resetForm();
                  setSelectedUser(null);
                }}
              >
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {modalMode !== 'pin' && (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Name *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    value={formData.name}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                    placeholder="Enter name"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <Text style={[styles.label, { color: theme.text }]}>Role: Worker</Text>
                  <Text style={[styles.roleInfo, { color: theme.textSecondary }]}>All users are created as Workers</Text>
                </>
              )}

              {(modalMode === 'create' || modalMode === 'pin') && (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>PIN (4-8 digits) *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    value={formData.pin}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, pin: text }))}
                    placeholder="Enter PIN"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    maxLength={8}
                    secureTextEntry
                  />

                  <Text style={[styles.label, { color: theme.text }]}>Confirm PIN *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    value={formData.confirmPin}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, confirmPin: text }))}
                    placeholder="Confirm PIN"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    maxLength={8}
                    secureTextEntry
                  />
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: theme.background }]}
                onPress={() => {
                  setModalMode(null);
                  resetForm();
                  setSelectedUser(null);
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleSubmit}
                disabled={createUserMutation.isPending || updateUserMutation.isPending || resetPinMutation.isPending}
              >
                {(createUserMutation.isPending || updateUserMutation.isPending || resetPinMutation.isPending) ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {modalMode === 'create' && 'Create User'}
                    {modalMode === 'edit' && 'Save Changes'}
                    {modalMode === 'pin' && 'Reset PIN'}
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cartBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cartBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inactiveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
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
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cartList: {
    gap: 8,
  },
  cartItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  cartItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  roleInfo: {
    fontSize: 12,
    marginTop: 4,
  },
});
