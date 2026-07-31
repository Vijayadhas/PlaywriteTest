import type { Locator } from '@playwright/test';
import { QuantityHandler } from './quantity-handler';

export class AutomaticDependencyHandler {
  constructor(private readonly quantities: QuantityHandler) {}

  async verify(row: Locator, productNumber: string, expectedQuantity: number): Promise<void> {
    await this.quantities.verify(row, productNumber, expectedQuantity);
  }
}
