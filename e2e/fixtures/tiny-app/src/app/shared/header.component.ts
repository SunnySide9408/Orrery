import { Component, inject } from '@angular/core';
import { AuthService } from '@core/auth.service';

@Component({
  selector: 'app-header',
  template: `<header>{{ auth.signedIn() ? 'Welcome back' : 'Sign in' }}</header>`,
})
export class HeaderComponent {
  protected readonly auth = inject(AuthService);
}
