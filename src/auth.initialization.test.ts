import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it('can discover production sign-in providers before a runtime database is available', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/not-connected');
  vi.stubEnv('AUTH_EMAIL_SERVER', 'smtp://127.0.0.1:2525');
  vi.stubEnv('AUTH_EMAIL_FROM', 'signin@example.test');
  vi.stubEnv('AUTH_DEV_LOGIN', '1');
  const { providers } = await import('./auth.ts');
  expect(
    providers().map((provider) => (typeof provider === 'function' ? '' : provider.id)),
  ).toEqual(['nodemailer']);
});
