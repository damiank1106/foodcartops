import { BaseRepository } from '../repositories/base';
import { StockMovementRepository } from '../repositories/stock-movement.repository';
import { StockBalanceRepository } from '../repositories/stock-balance.repository';
import { StockLocationRepository } from '../repositories/stock-location.repository';
import { InventoryItemRepository } from '../repositories/inventory-item.repository';

export class InventoryService extends BaseRepository {
  private movementRepo = new StockMovementRepository();
  private balanceRepo = new StockBalanceRepository();
  private locationRepo = new StockLocationRepository();
  private itemRepo = new InventoryItemRepository();

  async createMovement(data: {
    inventory_item_id: string;
    from_location_id?: string;
    to_location_id?: string;
    qty: number;
    reason: 'PURCHASE' | 'ISSUE_TO_CART' | 'RETURN_TO_WAREHOUSE' | 'WASTE' | 'ADJUSTMENT' | 'TRANSFER';
    cost_cents?: number;
    shift_id?: string;
    actor_user_id: string;
    notes?: string;
  }): Promise<void> {
    console.log('[InventoryService] Creating movement with validation');

    if (data.qty <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    const item = await this.itemRepo.getById(data.inventory_item_id);
    if (!item) {
      throw new Error('Inventory item not found');
    }

    if (data.from_location_id) {
      const fromLocation = await this.locationRepo.getById(data.from_location_id);
      if (!fromLocation || !fromLocation.is_active) {
        throw new Error('From location not found or inactive');
      }

      const currentBalance = await this.balanceRepo.getBalance(data.inventory_item_id, data.from_location_id);
      if (currentBalance < data.qty) {
        throw new Error(`Insufficient stock. Current balance: ${currentBalance} ${item.unit}, requested: ${data.qty} ${item.unit}`);
      }
    }

    if (data.to_location_id) {
      const toLocation = await this.locationRepo.getById(data.to_location_id);
      if (!toLocation || !toLocation.is_active) {
        throw new Error('To location not found or inactive');
      }
    }

    await this.validateMovementRules(data);

    await this.movementRepo.create(data);

    if (data.from_location_id) {
      await this.balanceRepo.updateBalance(data.inventory_item_id, data.from_location_id, -data.qty);
    }

    if (data.to_location_id) {
      await this.balanceRepo.updateBalance(data.inventory_item_id, data.to_location_id, data.qty);
    }

    console.log('[InventoryService] Movement created and balances updated');
  }

  private async validateMovementRules(data: {
    from_location_id?: string;
    to_location_id?: string;
    reason: string;
  }): Promise<void> {
    switch (data.reason) {
      case 'PURCHASE':
        if (data.from_location_id) {
          throw new Error('PURCHASE: from_location must be NULL (external source)');
        }
        if (!data.to_location_id) {
          throw new Error('PURCHASE: to_location must be Warehouse');
        }
        const toPurchaseLocation = await this.locationRepo.getById(data.to_location_id);
        if (toPurchaseLocation?.type !== 'WAREHOUSE') {
          throw new Error('PURCHASE: to_location must be Warehouse');
        }
        break;

      case 'ISSUE_TO_CART':
        if (!data.from_location_id) {
          throw new Error('ISSUE_TO_CART: from_location must be Warehouse');
        }
        const fromIssueLocation = await this.locationRepo.getById(data.from_location_id);
        if (fromIssueLocation?.type !== 'WAREHOUSE') {
          throw new Error('ISSUE_TO_CART: from_location must be Warehouse');
        }
        if (!data.to_location_id) {
          throw new Error('ISSUE_TO_CART: to_location must be a Cart');
        }
        const toIssueLocation = await this.locationRepo.getById(data.to_location_id);
        if (toIssueLocation?.type !== 'CART') {
          throw new Error('ISSUE_TO_CART: to_location must be a Cart');
        }
        break;

      case 'RETURN_TO_WAREHOUSE':
        if (!data.from_location_id) {
          throw new Error('RETURN_TO_WAREHOUSE: from_location must be a Cart');
        }
        const fromReturnLocation = await this.locationRepo.getById(data.from_location_id);
        if (fromReturnLocation?.type !== 'CART') {
          throw new Error('RETURN_TO_WAREHOUSE: from_location must be a Cart');
        }
        if (!data.to_location_id) {
          throw new Error('RETURN_TO_WAREHOUSE: to_location must be Warehouse');
        }
        const toReturnLocation = await this.locationRepo.getById(data.to_location_id);
        if (toReturnLocation?.type !== 'WAREHOUSE') {
          throw new Error('RETURN_TO_WAREHOUSE: to_location must be Warehouse');
        }
        break;

      case 'WASTE':
        if (!data.from_location_id) {
          throw new Error('WASTE: from_location is required');
        }
        if (data.to_location_id) {
          throw new Error('WASTE: to_location must be NULL (disposed)');
        }
        break;

      case 'ADJUSTMENT':
        if (!data.from_location_id && !data.to_location_id) {
          throw new Error('ADJUSTMENT: either from_location or to_location must be specified');
        }
        break;

      case 'TRANSFER':
        if (!data.from_location_id || !data.to_location_id) {
          throw new Error('TRANSFER: both from_location and to_location are required');
        }
        if (data.from_location_id === data.to_location_id) {
          throw new Error('TRANSFER: from_location and to_location must be different');
        }
        break;

      default:
        throw new Error(`Unknown movement reason: ${data.reason}`);
    }
  }

  async purchaseToWarehouse(data: {
    inventory_item_id: string;
    qty: number;
    cost_cents?: number;
    actor_user_id: string;
    notes?: string;
  }): Promise<void> {
    console.log('[InventoryService] Purchase to warehouse');
    const warehouse = await this.locationRepo.ensureWarehouse(data.actor_user_id);

    await this.createMovement({
      inventory_item_id: data.inventory_item_id,
      to_location_id: warehouse.id,
      qty: data.qty,
      reason: 'PURCHASE',
      cost_cents: data.cost_cents,
      actor_user_id: data.actor_user_id,
      notes: data.notes,
    });
  }

  async issueToCart(data: {
    inventory_item_id: string;
    cart_id: string;
    qty: number;
    shift_id?: string;
    actor_user_id: string;
    notes?: string;
  }): Promise<void> {
    console.log('[InventoryService] Issue to cart');
    const warehouse = await this.locationRepo.ensureWarehouse(data.actor_user_id);
    const cartLocation = await this.locationRepo.getCartLocation(data.cart_id);

    if (!cartLocation) {
      throw new Error('Cart location not found. Please ensure cart locations are initialized.');
    }

    await this.createMovement({
      inventory_item_id: data.inventory_item_id,
      from_location_id: warehouse.id,
      to_location_id: cartLocation.id,
      qty: data.qty,
      reason: 'ISSUE_TO_CART',
      shift_id: data.shift_id,
      actor_user_id: data.actor_user_id,
      notes: data.notes,
    });
  }

  async returnToWarehouse(data: {
    inventory_item_id: string;
    cart_id: string;
    qty: number;
    shift_id?: string;
    actor_user_id: string;
    notes?: string;
  }): Promise<void> {
    console.log('[InventoryService] Return to warehouse');
    const warehouse = await this.locationRepo.ensureWarehouse(data.actor_user_id);
    const cartLocation = await this.locationRepo.getCartLocation(data.cart_id);

    if (!cartLocation) {
      throw new Error('Cart location not found');
    }

    await this.createMovement({
      inventory_item_id: data.inventory_item_id,
      from_location_id: cartLocation.id,
      to_location_id: warehouse.id,
      qty: data.qty,
      reason: 'RETURN_TO_WAREHOUSE',
      shift_id: data.shift_id,
      actor_user_id: data.actor_user_id,
      notes: data.notes,
    });
  }

  async recordWaste(data: {
    inventory_item_id: string;
    location_id: string;
    qty: number;
    shift_id?: string;
    actor_user_id: string;
    notes?: string;
  }): Promise<void> {
    console.log('[InventoryService] Record waste');

    await this.createMovement({
      inventory_item_id: data.inventory_item_id,
      from_location_id: data.location_id,
      qty: data.qty,
      reason: 'WASTE',
      shift_id: data.shift_id,
      actor_user_id: data.actor_user_id,
      notes: data.notes,
    });
  }
}

export const inventoryService = new InventoryService();
