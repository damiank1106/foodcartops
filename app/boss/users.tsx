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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Key, UserX, UserCheck, X, Trash2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { UserRepository } from '@/lib/repositories';
import { UserCartAssignmentRepository } from '@/lib/repositories/user-cart-assignment.repository';
import { User, UserRole } from '@/lib/types';
import { getRoleLabel } from '@/lib/utils/role-labels';
import { useFocusEffect } from 'expo-router';
import { onSyncComplete } from '@/lib/services/sync.service';
import { canManageUsers } from '@/lib/utils/rbac';

type ModalMode = 'create' | 'edit' | 'pin' | null;

export default function UsersScreen() {
  const { theme } = useTheme();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
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
    queryFn: async () => {
      const allUsers = await userRepo.getAllWithCartCounts();
      return allUsers.filter(u => u.is_active === 1 && !u.deleted_at);
    },
  });

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['users-with-carts'] });
    }, [queryClient])
  );

  React.useEffect(() => {
    const unsubscribe = onSyncComplete(() => {
      console.log('[Users] Sync completed, refreshing users data');
      queryClient.invalidateQueries({ queryKey: ['users-with-carts'] });
    });
    return unsubscribe;
  }, [queryClient]);



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
        currentUser.id,
        currentUser.role
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
        await userRepo.updateWithAudit(data.userId, { name: data.updates.name }, currentUser.id, currentUser.role);
      }

      if (data.updates.role !== oldUser.role) {
        await userRepo.updateRole(data.userId, data.updates.role, currentUser.id, currentUser.role);
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

      await userRepo.resetPin(data.userId, data.newPin, currentUser.id, currentUser.role);
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
        await userRepo.deactivateWithAudit(user.id, currentUser.id, currentUser.role);
      } else {
        await userRepo.activateWithAudit(user.id, currentUser.id, currentUser.role);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-carts'] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!currentUser) throw new Error('Not authenticated');
      await userRepo.deleteWithAudit(userId, currentUser.id, currentUser.role);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-carts'] });
      queryClient.refetchQueries({ queryKey: ['users-with-carts'] });
      Alert.alert('Success', 'User deleted successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const handleDeleteUser = (user: User) => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${user.name}? This will deactivate their account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteUserMutation.mutate(user.id),
        },
      ]
    );
  };

  const resetForm = () => {
    setFormData({
      name: '',
      role: 'operation_manager',
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
      role: 'operation_manager',
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
    if (role === 'general_manager') return theme.error;
    return theme.success;
  };

  const shouldShowRoles = currentUser?.role === 'general_manager' || currentUser?.role === 'developer';

  if (!currentUser || !canManageUsers(currentUser.role)) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.unauthorizedContainer}>
          <Text style={[styles.unauthorizedText, { color: theme.text }]}>
            Only General Manager and Developer can access this page
          </Text>
        </View>
      </View>
    );
  }

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
                <Text style={[styles.userName, { color: theme.text }]}>{user.name || 'USER'}</Text>
                <View style={styles.badges}>
                  {shouldShowRoles && (
                    <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(user.role) + '20' }]}>
                      <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(user.role) }]}>
                        {getRoleLabel(user.role).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  {user.is_active === 0 && (
                    <View style={[styles.inactiveBadge, { backgroundColor: theme.error + '20' }]}>
                      <Text style={[styles.inactiveBadgeText, { color: theme.error }]}>INACTIVE</Text>
                    </View>
                  )}
                </View>
                <View style={styles.pinStatus}>
                  {user.pin ? (
                    <View style={styles.pinStatusRow}>
                      <CheckCircle size={14} color={theme.success} />
                      <Text style={[styles.pinStatusText, { color: theme.success }]}>PIN Set</Text>
                    </View>
                  ) : (
                    <View style={styles.pinStatusRow}>
                      <AlertCircle size={14} color={theme.error} />
                      <Text style={[styles.pinStatusText, { color: theme.error }]}>PIN Missing</Text>
                    </View>
                  )}
                  {user.updated_at_iso && (
                    <Text style={[styles.pinStatusDate, { color: theme.textSecondary }]}>
                      Last updated: {new Date(user.updated_at_iso).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
              {user.role !== 'general_manager' && user.role !== 'developer' && (
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
                  {(user.role === 'operation_manager' || user.role === 'inventory_clerk') && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: theme.error + '20' }]}
                      onPress={() => handleDeleteUser(user)}
                      disabled={deleteUserMutation.isPending}
                    >
                      <Trash2 size={18} color={theme.error} />
                    </TouchableOpacity>
                  )}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
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

            <ScrollView 
              style={styles.modalBody} 
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
            >
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

                  <Text style={[styles.label, { color: theme.text }]}>Role</Text>
                  <View style={styles.roleButtons}>
                    <TouchableOpacity
                      style={[
                        styles.roleButton,
                        { borderColor: theme.border },
                        formData.role === 'operation_manager' && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                      ]}
                      onPress={() => setFormData((prev) => ({ ...prev, role: 'operation_manager' }))}
                    >
                      <Text
                        style={[
                          styles.roleButtonText,
                          { color: theme.text },
                          formData.role === 'operation_manager' && { color: theme.primary, fontWeight: '700' as const },
                        ]}
                      >
                        {getRoleLabel('operation_manager')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.roleButton,
                        { borderColor: theme.border },
                        formData.role === 'inventory_clerk' && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                      ]}
                      onPress={() => setFormData((prev) => ({ ...prev, role: 'inventory_clerk' }))}
                    >
                      <Text
                        style={[
                          styles.roleButtonText,
                          { color: theme.text },
                          formData.role === 'inventory_clerk' && { color: theme.primary, fontWeight: '700' as const },
                        ]}
                      >
                        {getRoleLabel('inventory_clerk')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {(modalMode === 'create' || modalMode === 'pin') && (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>PIN (4-8 digits) *</Text>
                  <View style={styles.pinInputRow}>
                    <TextInput
                      style={[styles.input, styles.pinInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      value={formData.pin}
                      onChangeText={(text) => setFormData((prev) => ({ ...prev, pin: text }))}
                      placeholder="Enter PIN"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      maxLength={8}
                      secureTextEntry={!showPin}
                    />
                    <TouchableOpacity
                      style={[styles.eyeButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                      onPress={() => setShowPin(!showPin)}
                    >
                      {showPin ? <EyeOff size={20} color={theme.textSecondary} /> : <Eye size={20} color={theme.textSecondary} />}
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.label, { color: theme.text }]}>Confirm PIN *</Text>
                  <View style={styles.pinInputRow}>
                    <TextInput
                      style={[styles.input, styles.pinInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                      value={formData.confirmPin}
                      onChangeText={(text) => setFormData((prev) => ({ ...prev, confirmPin: text }))}
                      placeholder="Confirm PIN"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      maxLength={8}
                      secureTextEntry={!showConfirmPin}
                    />
                    <TouchableOpacity
                      style={[styles.eyeButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                      onPress={() => setShowConfirmPin(!showConfirmPin)}
                    >
                      {showConfirmPin ? <EyeOff size={20} color={theme.textSecondary} /> : <Eye size={20} color={theme.textSecondary} />}
                    </TouchableOpacity>
                  </View>
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
        </KeyboardAvoidingView>
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
    flexGrow: 1,
  },
  modalBodyContent: {
    paddingBottom: 120,
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
    flexWrap: 'wrap',
    gap: 12,
  },
  roleButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    minWidth: 100,
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
  pinStatus: {
    marginTop: 8,
    gap: 4,
  },
  pinStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pinStatusDate: {
    fontSize: 11,
    marginTop: 2,
  },
  pinInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  pinInput: {
    flex: 1,
  },
  eyeButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  unauthorizedText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
