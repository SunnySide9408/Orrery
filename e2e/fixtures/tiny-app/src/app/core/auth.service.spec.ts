import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('starts signed out', () => {
    expect(new AuthService().signedIn()).toBe(false);
  });
});
