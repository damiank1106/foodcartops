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

export default function WorkerSaleScreen() {
  const { theme } = useTheme();
  const { user, selectedCartId, activeShiftId } = useAuth();
  const [cart, setCart] = useState<Map<string, { product: Product; quantity: number }>>(new Map());
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');

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
      items: { product_id: string; quantity: number; unit_price: number }[];
      total: number;
    }) => {
      if (!user || !selectedCartId) throw new Error('Missing user or cart');

      return saleRepo.create({
        cart_id: selectedCartId,
        worker_id: user.id,
        total_amount: data.total,
        payment_method: selectedPayment,
        items: data.items,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
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

  const getCartTotal = () => {
    let total = 0;
    cart.forEach((item) => {
      total += item.product.price * item.quantity;
    });
    return total;
  };

  const handleCompleteSale = () => {
    if (cart.size === 0) {
      Alert.alert('Error', 'Cart is empty');
      return;
    }

    const items = Array.from(cart.values()).map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.product.price,
    }));

    createSaleMutation.mutate({
      items,
      total: getCartTotal(),
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const categories = Array.from(new Set(products?.map((p) => p.category).filter(Boolean)));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.cartName, { color: theme.text }]}>{cartInfo?.name || 'Cart'}</Text>
          <Text style={[styles.workerName, { color: theme.textSecondary }]}>{user?.name}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {categories.map((category) => (
          <View key={category} style={styles.categorySection}>
            <Text style={[styles.categoryTitle, { color: theme.text }]}>{category}</Text>
            <View style={styles.productsGrid}>
              {products
                ?.filter((p) => p.category === category)
                .map((product) => {
                  const inCart = cart.get(product.id);
                  return (
                    <TouchableOpacity
                      key={product.id}
                      style={[
                        styles.productCard,
                        { backgroundColor: theme.card },
                        inCart && { borderColor: theme.primary, borderWidth: 2 },
                      ]}
                      onPress={() => addToCart(product)}
                    >
                      <Text style={[styles.productName, { color: theme.text }]}>
                        {product.name}
                      </Text>
                      <Text style={[styles.productPrice, { color: theme.primary }]}>
                        ${product.price.toFixed(2)}
                      </Text>
                      {inCart && (
                        <View style={[styles.quantityBadge, { backgroundColor: theme.primary }]}>
                          <Text style={styles.quantityText}>{inCart.quantity}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        ))}
      </ScrollView>

      {cart.size > 0 && (
        <View style={[styles.cartSummary, { backgroundColor: theme.card }]}>
          <ScrollView style={styles.cartItems} showsVerticalScrollIndicator={false}>
            {Array.from(cart.values()).map((item) => (
              <View key={item.product.id} style={styles.cartItem}>
                <View style={styles.cartItemInfo}>
                  <Text style={[styles.cartItemName, { color: theme.text }]}>
                    {item.product.name}
                  </Text>
                  <Text style={[styles.cartItemPrice, { color: theme.textSecondary }]}>
                    ${item.product.price.toFixed(2)} × {item.quantity}
                  </Text>
                </View>
                <View style={styles.cartItemActions}>
                  <TouchableOpacity
                    style={[styles.quantityButton, { backgroundColor: theme.background }]}
                    onPress={() => removeFromCart(item.product.id)}
                  >
                    <Minus size={16} color={theme.text} />
                  </TouchableOpacity>
                  <Text style={[styles.cartItemQuantity, { color: theme.text }]}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    style={[styles.quantityButton, { backgroundColor: theme.background }]}
                    onPress={() => addToCart(item.product)}
                  >
                    <Plus size={16} color={theme.text} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.paymentMethods}>
            {(['cash', 'card', 'digital'] as PaymentMethod[]).map((method) => (
              <TouchableOpacity
                key={method}
                style={[
                  styles.paymentButton,
                  { borderColor: theme.border },
                  selectedPayment === method && { backgroundColor: theme.primary },
                ]}
                onPress={() => setSelectedPayment(method)}
              >
                <Text
                  style={[
                    styles.paymentText,
                    { color: theme.text },
                    selectedPayment === method && { color: '#FFF' },
                  ]}
                >
                  {method.charAt(0).toUpperCase() + method.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.checkoutButton, { backgroundColor: theme.primary }]}
            onPress={handleCompleteSale}
            disabled={createSaleMutation.isPending}
          >
            {createSaleMutation.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <ShoppingCart size={20} color="#FFF" />
                <Text style={styles.checkoutText}>Complete Sale - ${getCartTotal().toFixed(2)}</Text>
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
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  cartName: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  workerName: {
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  quantityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  cartSummary: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  cartItems: {
    maxHeight: 150,
    marginBottom: 16,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 12,
  },
  cartItemActions: {
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
  cartItemQuantity: {
    fontSize: 16,
    fontWeight: '600' as const,
    minWidth: 24,
    textAlign: 'center',
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  paymentButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  paymentText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 12,
  },
  checkoutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
