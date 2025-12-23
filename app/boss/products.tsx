import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Package, Plus, Edit2, Trash2, X, Save, FolderOpen } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { ProductRepository, ProductCategoryRepository, InventoryItemRepository } from '@/lib/repositories';

export default function ProductsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const [categoryName, setCategoryName] = useState('');
  const [categorySortOrder, setCategorySortOrder] = useState('0');

  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCost, setProductCost] = useState('');
  const [productSku, setProductSku] = useState('');
  const [productInventoryItemId, setProductInventoryItemId] = useState('');
  const [productUnitsPerSale, setProductUnitsPerSale] = useState('1');
  const [productCategoryId, setProductCategoryId] = useState('');

  const categoryRepo = new ProductCategoryRepository();
  const productRepo = new ProductRepository();
  const inventoryItemRepo = new InventoryItemRepository();

  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => categoryRepo.listActive(),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => productRepo.findAll(),
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: async () => inventoryItemRepo.listActive(),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; sort_order: number }) => {
      if (editingCategory) {
        await categoryRepo.update(editingCategory.id, data, user?.id);
      } else {
        await categoryRepo.create(data, user?.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setCategoryModalVisible(false);
      Alert.alert('Success', editingCategory ? 'Category updated' : 'Category created');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to save category: ${error}`);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await categoryRepo.softDelete(id, user?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      Alert.alert('Success', 'Category deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete category: ${error}`);
    },
  });

  const saveProductMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      category_id?: string;
      description?: string;
      price: number;
      cost_cents?: number;
      sku?: string;
      inventory_item_id?: string;
      units_per_sale?: number;
    }) => {
      if (editingProduct) {
        await productRepo.update(editingProduct.id, { ...data, price_cents: Math.round(data.price * 100) }, user?.id);
      } else {
        await productRepo.create(data, user?.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setProductModalVisible(false);
      Alert.alert('Success', editingProduct ? 'Product updated' : 'Product created');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to save product: ${error}`);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      await productRepo.softDelete(id, user?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      Alert.alert('Success', 'Product deleted');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete product: ${error}`);
    },
  });

  const openCategoryModal = (category?: any) => {
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
      setCategorySortOrder(category.sort_order.toString());
    } else {
      setEditingCategory(null);
      setCategoryName('');
      setCategorySortOrder('0');
    }
    setCategoryModalVisible(true);
  };

  const openProductModal = (product?: any) => {
    if (product) {
      setEditingProduct(product);
      setProductName(product.name);
      setProductDescription(product.description || '');
      setProductPrice((product.price || 0).toString());
      setProductCost(product.cost_cents ? (product.cost_cents / 100).toString() : '');
      setProductSku(product.sku || '');
      setProductCategoryId(product.category_id || '');
      setProductInventoryItemId(product.inventory_item_id || '');
      setProductUnitsPerSale((product.units_per_sale || 1).toString());
    } else {
      setEditingProduct(null);
      setProductName('');
      setProductDescription('');
      setProductPrice('');
      setProductCost('');
      setProductSku('');
      setProductCategoryId('');
      setProductInventoryItemId('');
      setProductUnitsPerSale('1');
    }
    setProductModalVisible(true);
  };

  const handleSaveCategory = () => {
    if (!categoryName.trim()) {
      Alert.alert('Error', 'Category name is required');
      return;
    }

    saveCategoryMutation.mutate({
      name: categoryName,
      sort_order: parseInt(categorySortOrder) || 0,
    });
  };

  const handleSaveProduct = () => {
    if (!productName.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }
    if (!productPrice.trim()) {
      Alert.alert('Error', 'Product price is required');
      return;
    }

    const price = parseFloat(productPrice);
    if (isNaN(price) || price < 0) {
      Alert.alert('Error', 'Invalid price');
      return;
    }

    const costCents = productCost.trim() ? Math.round(parseFloat(productCost) * 100) : undefined;
    const unitsPerSale = parseFloat(productUnitsPerSale);

    if (isNaN(unitsPerSale) || unitsPerSale <= 0) {
      Alert.alert('Error', 'Units per sale must be greater than 0');
      return;
    }

    saveProductMutation.mutate({
      name: productName,
      category_id: productCategoryId || undefined,
      description: productDescription || undefined,
      price,
      cost_cents: costCents,
      sku: productSku || undefined,
      inventory_item_id: productInventoryItemId || undefined,
      units_per_sale: unitsPerSale,
    });
  };

  const handleDeleteCategory = (id: string, name: string) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteCategoryMutation.mutate(id),
        },
      ]
    );
  };

  const handleDeleteProduct = (id: string, name: string) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteProductMutation.mutate(id),
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Categories</Text>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                onPress={() => openCategoryModal()}
              >
                <Plus size={18} color="#FFF" />
                <Text style={styles.addButtonText}>Add Category</Text>
              </TouchableOpacity>
            </View>

            {categories && categories.length > 0 ? (
              categories.map((category) => (
                <View key={category.id} style={[styles.itemCard, { backgroundColor: theme.card }]}>
                  <View style={styles.itemContent}>
                    <View style={[styles.itemIcon, { backgroundColor: theme.primary + '20' }]}>
                      <FolderOpen size={20} color={theme.primary} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, { color: theme.text }]}>{category.name}</Text>
                      <Text style={[styles.itemDetail, { color: theme.textSecondary }]}>
                        Sort: {category.sort_order}
                      </Text>
                    </View>
                    <View style={styles.itemActions}>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: theme.primary + '15' }]}
                        onPress={() => openCategoryModal(category)}
                      >
                        <Edit2 size={16} color={theme.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: theme.error + '15' }]}
                        onPress={() => handleDeleteCategory(category.id, category.name)}
                      >
                        <Trash2 size={16} color={theme.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <FolderOpen size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No categories yet
                </Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Products</Text>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                onPress={() => openProductModal()}
              >
                <Plus size={18} color="#FFF" />
                <Text style={styles.addButtonText}>Add Product</Text>
              </TouchableOpacity>
            </View>

            {products && products.length > 0 ? (
              products.map((product) => (
                <View key={product.id} style={[styles.itemCard, { backgroundColor: theme.card }]}>
                  <View style={styles.itemContent}>
                    <View style={[styles.itemIcon, { backgroundColor: theme.success + '20' }]}>
                      <Package size={20} color={theme.success} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, { color: theme.text }]}>{product.name}</Text>
                      <Text style={[styles.itemDetail, { color: theme.textSecondary }]}>
                        ₱{product.price.toFixed(2)}
                        {product.sku && ` • SKU: ${product.sku}`}
                      </Text>
                    </View>
                    <View style={styles.itemActions}>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: theme.primary + '15' }]}
                        onPress={() => openProductModal(product)}
                      >
                        <Edit2 size={16} color={theme.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: theme.error + '15' }]}
                        onPress={() => handleDeleteProduct(product.id, product.name)}
                      >
                        <Trash2 size={16} color={theme.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Package size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No products yet
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={categoryName}
                onChangeText={setCategoryName}
                placeholder="Category name"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Sort Order</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={categorySortOrder}
                onChangeText={setCategorySortOrder}
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setCategoryModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveCategory}
              >
                <Save size={18} color="#fff" />
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={productModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProductModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity onPress={() => setProductModalVisible(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={productName}
                onChangeText={setProductName}
                placeholder="Product name"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Category</Text>
              <View style={[styles.picker, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryPicker}>
                  <TouchableOpacity
                    style={[
                      styles.categoryChip,
                      !productCategoryId && { backgroundColor: theme.primary },
                      productCategoryId && { borderColor: theme.border, borderWidth: 1 }
                    ]}
                    onPress={() => setProductCategoryId('')}
                  >
                    <Text style={[styles.categoryChipText, { color: !productCategoryId ? '#fff' : theme.text }]}>
                      Uncategorized
                    </Text>
                  </TouchableOpacity>
                  {categories?.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        productCategoryId === cat.id && { backgroundColor: theme.primary },
                        productCategoryId !== cat.id && { borderColor: theme.border, borderWidth: 1 }
                      ]}
                      onPress={() => setProductCategoryId(cat.id)}
                    >
                      <Text style={[styles.categoryChipText, { color: productCategoryId === cat.id ? '#fff' : theme.text }]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Price *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={productPrice}
                onChangeText={setProductPrice}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Cost (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={productCost}
                onChangeText={setProductCost}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>SKU (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={productSku}
                onChangeText={setProductSku}
                placeholder="SKU"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Description (optional)</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={productDescription}
                onChangeText={setProductDescription}
                placeholder="Product description"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Linked Inventory Item (optional)</Text>
              <View style={[styles.picker, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryPicker}>
                  <TouchableOpacity
                    style={[
                      styles.categoryChip,
                      !productInventoryItemId && { backgroundColor: theme.primary },
                      productInventoryItemId && { borderColor: theme.border, borderWidth: 1 }
                    ]}
                    onPress={() => setProductInventoryItemId('')}
                  >
                    <Text style={[styles.categoryChipText, { color: !productInventoryItemId ? '#fff' : theme.text }]}>
                      None
                    </Text>
                  </TouchableOpacity>
                  {inventoryItems?.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.categoryChip,
                        productInventoryItemId === item.id && { backgroundColor: theme.primary },
                        productInventoryItemId !== item.id && { borderColor: theme.border, borderWidth: 1 }
                      ]}
                      onPress={() => setProductInventoryItemId(item.id)}
                    >
                      <Text style={[styles.categoryChipText, { color: productInventoryItemId === item.id ? '#fff' : theme.text }]}>
                        {item.name} ({item.unit})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Units per Sale</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={productUnitsPerSale}
                onChangeText={setProductUnitsPerSale}
                placeholder="1"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.background }]}
                onPress={() => setProductModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveProduct}
              >
                <Save size={18} color="#fff" />
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Save</Text>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  itemCard: {
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemDetail: {
    fontSize: 13,
  },
  itemActions: {
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
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
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  picker: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  categoryPicker: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipText: {
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
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 6,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
