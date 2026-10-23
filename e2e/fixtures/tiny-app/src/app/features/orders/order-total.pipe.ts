import { Pipe, type PipeTransform } from '@angular/core';

@Pipe({ name: 'orderTotal' })
export class OrderTotalPipe implements PipeTransform {
  transform(prices: readonly number[]): number {
    return prices.reduce((sum, price) => sum + price, 0);
  }
}
