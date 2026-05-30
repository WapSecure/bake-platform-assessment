import { Injectable } from '@nestjs/common';

@Injectable()
export class ConflictResolutionService {
  wouldCauseNegativeStock(currentStock: number, requestedChange: number): boolean {
    return currentStock + requestedChange < 0;
  }

  normalizeQuantity(type: string, quantity: number): number {
    switch (type) {
      case 'SALE':
      case 'WASTE':
        return -Math.abs(quantity);
      case 'RESTOCK':
        return Math.abs(quantity);
      case 'ADJUSTMENT':
        return quantity;
      default:
        return quantity;
    }
  }

  validateQuantity(type: string, quantity: number): { valid: boolean; message?: string } {
    switch (type) {
      case 'SALE':
      case 'WASTE':
        if (quantity <= 0) {
          return { valid: false, message: `${type} quantity must be positive` };
        }
        break;
      case 'RESTOCK':
        if (quantity <= 0) {
          return { valid: false, message: 'RESTOCK quantity must be positive' };
        }
        break;
      case 'ADJUSTMENT':
        if (quantity === 0) {
          return { valid: true, message: 'Zero adjustment has no effect' };
        }
        break;
      default:
        return { valid: false, message: `Unknown operation type: ${type}` };
    }
    return { valid: true };
  }
}