import { Component, inject } from '@angular/core';
import { AuthService } from '@core/auth.service';

@Component({ selector: 'app-admin-page', template: `<h1>Admin</h1>` })
export class AdminPageComponent {
  protected readonly auth = inject(AuthService);
}
