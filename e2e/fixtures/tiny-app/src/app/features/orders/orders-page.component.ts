import { Component, inject } from '@angular/core';
import { AuthService } from '@core/auth.service';
import { formatMoney } from '../../missing/thing';
import { OrderTotalPipe } from './order-total.pipe';

@Component({
  selector: 'app-orders-page',
  imports: [OrderTotalPipe],
  template: `<p>{{ format([1, 2] | orderTotal) }}</p>`,
})
export class OrdersPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly format = formatMoney;
}
