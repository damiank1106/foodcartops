import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Minus, ShoppingCart, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { ProductRepository, SaleRepository, CartRepository } from '@/lib/repositories';
import { Product, PaymentMethod } from '@/lib/types';

export default function ManagerSaleScreen() {
  const { theme } = useTheme();
  const { user, selectedCartId, activeShiftId, canAccessCart } = useAuth();
  const [cart, setCart] = useState<Map<string, { product: Product; quantity: number }>>(new Map());
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('CASH');

  const queryClient = useQueryClient();
  const productRepo = new ProductRepository();
  const saleRepo = new SaleRepository();
  const cartRepo = new CartRepository();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productRepo.findAll(),
  });

  const { data: cartInfo } = useQuery({
    queryKey: ['cart', selectedCartId],
    queryFn: () => (selectedCartId ? cartRepo.findById(selectedCartId) : null),
    enabled: !!selectedCartId,
  });

  const createSaleMutation = useMutation({
    mutationFn: async (data: {
      items: { product_id: string; quantity: number; unit_price_cents: number }[];
      total_cents: number;
    }) => {
      if (!user || !selectedCartId) throw new Error('Missing user or cart');
      if (!activeShiftId) throw new Error('No active shift');
      if (!canAccessCart(selectedCartId)) throw new Error('No access to this cart');

      return saleRepo.create({
        cart_id: selectedCartId,
        worker_id: user.id,
        items: data.items,
        payments: [{ method: selectedPayment, amount_cents: data.total_cents }],
        shift_id: activeShiftId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['shift-sales'] });
      queryClient.invalidateQueries({ queryKey: ['shift-timeline'] });
      setCart(new Map());
      Alert.alert('Success', 'Sale completed successfully!');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create sale');
    },
  });

  if (!activeShiftId) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.emptyState}>
          <AlertCircle size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Active Shift</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Please clock in from the Shift tab to start selling
          </Text>
        </View>
      </View>
    );
  }

  const addToCart = (product: Product) => {
    const newCart = new Map(cart);
    const existing = newCart.get(product.id);
    if (existing) {
      newCart.set(product.id, { product, quantity: existing.quantity + 1 });
    } else {
      newCart.set(product.id, { product, quantity: 1 });
    }
    setCart(newCart);
  };

  const removeFromCart = (productId: string) => {
    const newCart = new Map(cart);
    const existing = newCart.get(productId);
    if (existing && existing.quantity > 1) {
      newCart.set(productId, { product: existing.product, quantity: existing.quantity - 1 });
    } else {
      newCart.delete(productId);
    }
    setCart(newCart);
  };

  const getTotalCents = () => {
    let total = 0;
    cart.forEach((item) => {
      total += item.product.price_cents * item.quantity;
    });
    return total;
  };

  const handleCompleteSale = () => {
    if (cart.size === 0) {
      Alert.alert('Empty Cart', 'Please add items to the cart');
      return;
    }

    const items = Array.from(cart.values()).map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price_cents: item.product.price_cents,
    }));

    createSaleMutation.mutate({
      items,
      total_cents: getTotalCents(),
    });
  };

  const paymentMethods: PaymentMethod[] = ['CASH', 'GCASH', 'CARD', 'OTHER'];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {cartInfo?.name || 'No Cart Selected'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Products</Text>
          {products?.map((product) => (
            <View key={product.id} style={[styles.productCard, { backgroundColor: theme.card }]}>
              <View style={styles.productInfo}>
                <Text style={[styles.productName, { color: theme.text }]}>{product.name}</Text>
                <Text style={[styles.productPrice, { color: theme.primary }]}>
                  ₱{(product.price_cents / 100).toFixed(2)}
                </Text>
              </View>
              <View style={styles.productActions}>
                {cart.has(product.id) ? (
                  <>
                    <TouchableOpacity
                      style={[styles.quantityButton, { backgroundColor: theme.primary }]}
                      onPress={() => removeFromCart(product.id)}
                    >
                      <Minus size={20} color="#fff" />
                    </TouchableOpacity>
                    <Text style={[styles.quantity, { color: theme.text }]}>
                      {cart.get(product.id)?.quantity}
                    </Text>
                    <TouchableOpacity
                      style={[styles.quantityButton, { backgroundColor: theme.primary }]}
                      onPress={() => addToCart(product)}
                    >
                      <Plus size={20} color="#fff" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: theme.primary }]}
                    onPress={() => addToCart(product)}
                  >
                    <Plus size={20} color="#fff" />
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        {cart.size > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              {paymentMethods.map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.paymentMethod,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    selectedPayment === method && {
                      backgroundColor: theme.primary + '20',
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() => setSelectedPayment(method)}
                >
                  <Text
                    style={[
                      styles.paymentMethodText,
                      { color: theme.text },
                      selectedPayment === method && { color: theme.primary },
                    ]}
                  >
                    {method}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {cart.size > 0 && (
        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={styles.totalSection}>
            <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total</Text>
            <Text style={[styles.totalAmount, { color: theme.text }]}>
              ₱{(getTotalCents() / 100).toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.completeButton,
              { backgroundColor: theme.primary },
              createSaleMutation.isPending && styles.completeButtonDisabled,
            ]}
            onPress={handleCompleteSale}
            disabled={createSaleMutation.isPending}
          >
            {createSaleMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <ShoppingCart size={20} color="#fff" />
                <Text style={styles.completeButtonText}>Complete Sale</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  productActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantity: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentMethod: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  completeButtonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
